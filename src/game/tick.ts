import {
  roomKey,
  visitedKey,
} from '../areas'
import { Rng } from '../rng'
import type { Character } from '../character'
import { formatActorName } from '../character'
import { tickConditions } from '../conditions'
import type { LogEntry } from '../log'
import type { Mob } from '../mobs'
import { getWorldManifest, type WorldContent } from '../worlds'
import {
  DRIVE_THRESHOLD,
  grow,
  satisfy,
  topDrive,
  type Drive,
  type Drives,
} from './drives'
import { maybeAutoConsume } from './consume'
import { driveShiftLine } from './driveFlavor'
import {
  bumpNPCInteractionCount,
  findFrontierStateForRoom,
  pickNPCLine,
} from './npcDialogue'
import { deriveJournalEntries } from './journal'
import {
  TIER_ACKNOWLEDGEMENT_CHANCE,
  pickTierAcknowledgement,
  stampPiety,
  tickBlessing,
} from './favor'
import type { GameState } from './state'
import type { TickSpeedId } from '../themes/types'
import {
  ENCOUNTER_CHANCE,
  rollEncounterFor,
  spawnCuratedEncounter,
  tickLockedChest,
} from './encounter'
import { fight, resolveMobDefeat, rollAmbush } from './fightTick'
import { append, trim } from './logCap'
import {
  directionName,
  exploreGrowthFor,
  moveByGoal,
  stampWeight,
} from './navigation'
import {
  maybeEnterRestOrMeditate,
  meditate,
  rest,
} from './restMeditate'
import { handleSacrifice, handleSell } from './shop'
import { findArea, getArea } from './worldLookup'

export { rollAmbush } from './fightTick'

export { predictNextStep } from './navigation'


/** How many ticks the character waits in the `generating-area` state
 *  before giving up and bouncing back to exploring with a "not yet taken
 *  shape" message. Generating-area ticks every 2s (TICK_MS), so 120 ticks
 *  ≈ 4 minutes — generous enough to cover slow local models and cold
 *  cloud starts. If the LLM responds sooner the .then() callback in
 *  App.tsx transitions out immediately regardless of ticksLeft, so this
 *  is purely a network-failure bail-out. */
export const AREA_GEN_TIMEOUT_TICKS = 120
export interface Playing {
  character: Character
  log: LogEntry[]
  state: GameState
}

function mod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}



function explore(p: Playing, world: WorldContent, rng: Rng): Playing {
  const cond = tickConditions(p.character, world, rng)
  let log = p.log
  for (const e of cond.entries) log = append(log, e)
  if (cond.skipTurn) {
    log = append(log, {
      kind: 'narrative',
      text: `${formatActorName(cond.character, 'log')} cannot move.`,
      meta: { name: formatActorName(cond.character, 'log') },
    })
    return { character: cond.character, log, state: p.state }
  }

  // Tick the rest/meditate cooldown down each explore step. The cooldown
  // forces at least one wandering step between recoveries so the character
  // doesn't pop out of meditation and immediately sit back down to rest.
  const cooldown = cond.character.restCooldown ?? 0
  const stepped: Character = cooldown > 0
    ? { ...cond.character, restCooldown: cooldown - 1 }
    : cond.character

  const consumed = maybeAutoConsume(stepped, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: p.state,
    }
  }

  const c = stepped
  // Multi-area support landed upstream — look up the current area by the
  // character's position rather than always using world.startingArea, so
  // exploration past a portal still reads from the right room map.
  const area = getArea(world, c.position.areaId)
  // Rest / meditate decision — delegated. Returns a transition when the
  // character should sit down, null otherwise. The helper early-returns
  // on the cooldown and safe-family checks so most ticks pay almost
  // nothing for this dispatch.
  const restTransition = maybeEnterRestOrMeditate({ c, area, log }, rng)
  if (restTransition) return restTransition

  // Hunger slow from equipped buff items (Pendant of the Sated Wanderer,
  // NutriChip Implant, Ration Synth Module). The buff-scaled growth is
  // computed by `exploreGrowthFor` so `predictNextStep` can mirror it; if
  // the two ever diverge the map arrow lands on a different goal than the
  // live tick.
  const grownDrives = stampPiety(
    stampWeight(
      grow(c.drives, exploreGrowthFor(c, world)),
      c,
      world,
    ),
    c,
  )
  const goal = topDrive(grownDrives)
  // Emit a flavor line when the character's primary drive shifts.
  // Fires on null → drive and on drive-A → drive-B transitions (the
  // interesting ones — the character changed what they're chasing).
  // Not on drive → null (that's just satisfaction, already narrated).
  if (goal !== null && goal !== c.lastTopDrive) {
    const line = driveShiftLine(goal, formatActorName(c, 'log'), rng)
    if (line) {
      // Drive-shift reads as the character's interior life pivoting —
      // a thought, not an action. Renders as italic + soft accent +
      // leading glyph in LogPanel so it stands apart from the
      // surrounding action stream without dominating it.
      log = append(log, {
        kind: 'thought',
        text: line,
        meta: { name: formatActorName(c, 'log') },
      })
    }
  }
  const next = moveByGoal(area, { ...c, drives: grownDrives }, rng, goal, world)

  if (!next) {
    return {
      character: { ...c, drives: grownDrives },
      log,
      state: p.state,
    }
  }

  const vk = visitedKey(next.areaId, next.x, next.y, next.z)
  const wasVisited = c.visitedRooms.includes(vk)
  const visitedRooms = wasVisited ? c.visitedRooms : [...c.visitedRooms, vk]
  const room = area.rooms[roomKey(next.x, next.y, next.z)]
  const dir = directionName(next.x - c.position.x, next.y - c.position.y)

  const moveText = room
    ? wasVisited
      ? `${formatActorName(c, 'log')} heads ${dir} to the ${room.name}.`
      : `${formatActorName(c, 'log')} explores ${dir} to the ${room.name}. ${room.description}`
    : null
  const moveMeta = room
    ? {
        name: formatActorName(c, 'log'),
        direction: dir,
        areaId: next.areaId,
        roomKey: roomKey(room.x, room.y, room.z),
        roomName: room.name,
      }
    : undefined
  if (moveText) log = append(log, { kind: 'narrative', text: moveText, meta: moveMeta })

  // Move + satisfy are split across two ticks. If the new room would ease a
  // drive that's at threshold AND the room has flavor text for it, we land
  // in the room this tick (move narrative only) and transition to
  // `using-room` so the next tick can run the "drink at the fountain" beat
  // as its own action. Drives we can't narrate (no satisfyText, or below
  // threshold) still fall silently to keep the gauge honest.
  let drives = grownDrives
  const satisfied: Drive[] = []
  if (!wasVisited) satisfied.push('curiosity')
  if (room?.satisfies) satisfied.push(...room.satisfies)

  // Weight satisfaction uses the 'sell' action rather than the generic
  // 'satisfy' flow, so separate it from the normal narratable set.
  const wantsSell =
    satisfied.includes('weight') && grownDrives.weight >= DRIVE_THRESHOLD
  // Sacrifice is the genuine fallback weight offload — fires anywhere
  // when the character is overweight AND not already busy selling at a
  // shop, satisfying a drive at the current room, etc. Greed gates it
  // off: a sufficiently greedy character refuses to part with loot
  // even when overloaded. The priority ordering below (sell → narratable
  // → sacrifice) means sacrifice never steals from a shop visit or a
  // rest-at-inn beat.
  const wantsSacrifice =
    !wantsSell &&
    grownDrives.weight >= DRIVE_THRESHOLD &&
    grownDrives.greed < DRIVE_THRESHOLD
  const narratable = satisfied.filter(
    (d) => d !== 'weight' && grownDrives[d] >= DRIVE_THRESHOLD && !!room?.satisfyText?.[d],
  )
  const silent = satisfied.filter(
    (d) => d !== 'weight' && !narratable.includes(d),
  )
  if (silent.length > 0) drives = satisfy(drives, silent)

  let lastSafePosition = c.lastSafePosition
  // Inns and shrines count as safe respawn anchors too — they're narratively
  // sheltered, and 'safe' is now just one variant of a safe-room family.
  if (room && (room.type === 'safe' || room.type === 'inn' || room.type === 'shrine')) {
    lastSafePosition = next
  }

  // Fixed-NPC greeting: passive on room entry, no tick cost, no state
  // change. Picks a line by visit count + frontier proximity, emits a
  // `dialogue` log entry, and bumps the per-NPC counter so the next
  // visit rotates through `regular`. NPCs only appear in welcoming
  // room types (the area-gen install pass already enforces that).
  let npcInteractionCounts = c.npcInteractionCounts
  if (room?.npc) {
    const frontier = findFrontierStateForRoom(area, room, world)
    const bumped = bumpNPCInteractionCount(
      npcInteractionCounts,
      next.areaId,
      room.npc.id,
    )
    const baseText = pickNPCLine({
      npc: room.npc,
      visitCount: bumped.visitCount,
      characterClassId: c.classId,
      characterSpeciesId: c.speciesId,
      frontier,
    })
    // Some NPCs notice your standing with the gods. With ~35% chance
    // (and only when the character is at tier 1+), pull a tier-keyed
    // acknowledgement from the manifest pool and prepend it. The
    // existing NPC content still plays — the prefix is a flavor wrap.
    const manifest = getWorldManifest(c.worldId)
    const ack = rng.chance(TIER_ACKNOWLEDGEMENT_CHANCE)
      ? pickTierAcknowledgement(c, manifest, rng)
      : null
    const text = ack ? `${ack} ${baseText}` : baseText
    log = append(log, {
      kind: 'dialogue',
      speaker: room.npc.name,
      text,
    })
    npcInteractionCounts = bumped.counts
  }

  let character: Character = {
    ...c,
    position: next,
    visitedRooms,
    drives,
    lastSafePosition,
    lastTopDrive: goal,
    ...(npcInteractionCounts !== c.npcInteractionCounts
      ? { npcInteractionCounts }
      : {}),
  }

  // Gateways (portals, wired exits, pending exits) only auto-traverse once
  // the character has mapped every other room in the current area. This
  // matches the exploration policy — finish the area in front of you before
  // stepping through to the next one. If there's still something unvisited,
  // the character just stands on the gateway tile this tick and the
  // curiosity goal will pull them elsewhere next tick.
  const isGatewayRoom = room?.type === 'portal' || room?.type === 'exit'
  const areaFullyExplored = (() => {
    if (!isGatewayRoom) return false
    for (const key in area.rooms) {
      const r = area.rooms[key]
      const vk = visitedKey(area.id, r.x, r.y, r.z)
      if (!visitedRooms.includes(vk)) return false
    }
    return true
  })()

  // Portal Hub takes priority over the type-based dispatch so it can render
  // as a `type: 'portal'` tile on the map while still gating the action
  // behind the multi-destination selection dialog (forge a new path or
  // travel to a previously generated world).
  if (room?.portalHub && areaFullyExplored) {
    const rk = roomKey(next.x, next.y, next.z)

    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'portal-hub-select', roomKey: rk } },
    }
  }

  if (room?.type === 'portal' && room.destination && areaFullyExplored) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'traverse-portal', destination: room.destination } },
    }
  }

  // Exit rooms at the edge of the known world. If the exit already has a
  // wired destination (set by the LLM area generation callback), traverse
  // like a portal. If flagged skipGeneration, treat as a dead end. If
  // pending and LLM is available, transition to 'generating-area'.
  //
  // Permanent frontiers always re-trigger generation regardless of whether
  // a destination was previously wired — each visit rolls a fresh area so
  // the player has an escape hatch when the last generation was too hard.
  if (room?.type === 'exit' && areaFullyExplored) {
    if (room.permanentFrontier) {
      const rk = roomKey(next.x, next.y, next.z)

      return {
        character,
        log,
        state: { kind: 'generating-area', exitRoomKey: `${area.id}::${rk}`, ticksLeft: AREA_GEN_TIMEOUT_TICKS },
      }
    }
    if (room.destination) {
      return {
        character,
        log,
        state: { kind: 'using-room', action: { kind: 'traverse-portal', destination: room.destination } },
      }
    }
    // Tile previously flagged to skip generation (player chose "continue
    // without generation" or generation timed out). No dialog, no fight,
    // just stay exploring — the exit is a dead end.
    if (room.skipGeneration) {
      return { character, log, state: p.state }
    }
    if (room.pendingAreaGeneration) {
      const rk = roomKey(next.x, next.y, next.z)
      return {
        character,
        log,
        state: { kind: 'generating-area', exitRoomKey: `${area.id}::${rk}`, ticksLeft: AREA_GEN_TIMEOUT_TICKS },
      }
    }
    // Exit with no destination and not pending — impassable.
    return {
      character,
      log: append(log, {
        kind: 'narrative',
        text: `${formatActorName(c, 'log')} senses the path ahead has not yet taken shape.`,
        meta: { name: formatActorName(c, 'log') },
      }),
      state: p.state,
    }
  }

  if (room && room.type !== 'safe') {
    // Three-way spawn decision:
    //  1. Curated firstOnly encounter, not yet defeated → guaranteed
    //     spawn (boss rooms should always deliver the boss on first
    //     entry so players don't have to kite the random roll).
    //  2. Curated ambient encounter (firstOnly false/absent) or
    //     curated-defeated + random-pool fallback → roll
    //     ENCOUNTER_CHANCE as normal. The curated mob is picked when
    //     set; otherwise the pool.
    //  3. No curated entry → existing random-pool behavior.
    const rKey = visitedKey(area.id, character.position.x, character.position.y, character.position.z)
    const defeatedHere = (character.defeatedRooms ?? []).includes(rKey)
    const curated = room.encounter
    const curatedActive = curated && !(curated.firstOnly && defeatedHere)

    let mob: Mob | null = null
    if (curatedActive && curated && curated.firstOnly) {
      mob = spawnCuratedEncounter(world, curated.mobId, curated.rarity, area.level ?? 1)
    } else if (rng.chance(ENCOUNTER_CHANCE)) {
      if (curatedActive && curated) {
        mob = spawnCuratedEncounter(world, curated.mobId, curated.rarity, area.level ?? 1)
      }
      // Fallback: curated mob missing from the pool (stale gen, renamed
      // mob) or no curated entry at all — use the normal random roll so
      // the room isn't silently empty just because a curated id went bad.
      if (!mob) mob = rollEncounterFor(world, room.type, area.level ?? 1, rng)
    }

    // Ranger trap-laying: when no encounter fires and no trap is already
    // set, a small chance the ranger plants one. Damage scales with level
    // so traps stay relevant in late game. One trap at a time; it primes
    // the next mob on entry in this or a later room.
    // TODO: bind traps to a specific roomKey so a trap set in room A
    //       doesn't fire on an encounter rolled in room B. For now the
    //       trap lives on the character and fires on the next encounter
    //       anywhere — good enough for the feature to exist, needs
    //       tightening before 1.0.
    if (!mob && character.classId === 'ranger' && !character.trap && rng.chance(0.15)) {
      const dmg = 3 + Math.floor(character.level / 2) + mod(character.stats.dexterity)
      character = { ...character, trap: { damage: Math.max(2, dmg) } }
      log = append(log, {
        kind: 'narrative',
        text: `${formatActorName(character, 'log')} lays a trap in the ${room.name}.`,
        meta: { name: formatActorName(character, 'log'), roomName: room.name, trap: true },
      })
    }

    if (mob) {
      // Organic encounter setup. We don't reuse `beginFight` here
      // because this path also fires the ranger-trap (consumes
      // `character.trap`) and emits stealth-flavor narrative on a
      // class-driven ambush — both behaviors that dev-spawned fights
      // (which call `beginFight` directly) intentionally skip.
      log = append(log, {
        kind: 'narrative',
        text: `A ${mob.name} bars the way. ${mob.description}`,
        meta: { mobName: mob.name },
      })
      // Ranger trap: if the character has laid a trap, it fires on the
      // mob's entry. Consumes the trap. Can outright defeat weaker mobs.
      let activeChar: Character = character
      let activeMob: Mob = mob
      if (activeChar.trap && activeChar.trap.damage > 0) {
        const trapDmg = activeChar.trap.damage
        const hpAfter = Math.max(0, activeMob.hp - trapDmg)
        const dealt = activeMob.hp - hpAfter
        log = append(log, {
          kind: 'damage',
          text: `The ${activeMob.name} springs ${formatActorName(activeChar, 'log')}'s trap! (−${dealt} HP)`,
          amount: dealt,
          meta: { name: formatActorName(activeChar, 'log'), mobName: activeMob.name, trap: true },
        })
        activeMob = { ...activeMob, hp: hpAfter }
        activeChar = { ...activeChar, trap: undefined }
        if (hpAfter === 0) {
          return resolveMobDefeat(activeChar, activeMob, world, log, undefined, undefined, rng)
        }
      }
      const ambush = rollAmbush(activeChar, activeMob.level, rng) ?? undefined
      if (ambush) {
        const greetingName = formatActorName(activeChar, 'npc-greeting')
        const attackerName = ambush.side === 'character' ? greetingName : `the ${activeMob.name}`
        const flavor =
          ambush.reason === 'reversed'
            ? `${greetingName} senses the ${activeMob.name} closing in and turns the ambush around! (Reversal — 3× damage)`
            : ambush.reason === 'stealth'
              ? `${greetingName} slips from shadow and strikes the ${activeMob.name} first! (Stealth — 3× damage)`
              : `${capitalize(attackerName)} catches ${ambush.side === 'character' ? `the ${activeMob.name}` : greetingName} off guard! (Ambush — 2× damage)`
        log = append(log, {
          kind: 'narrative',
          text: flavor,
          meta: {
            name: formatActorName(activeChar, 'log'),
            mobName: activeMob.name,
            stealth: ambush.reason === 'stealth' || ambush.reason === 'reversed' ? true : undefined,
          },
        })
      }
      return { character: activeChar, log, state: { kind: 'fighting', mob: activeMob, ambush } }
    }
  }

  // Sell action takes priority when weight is above threshold at a shop.
  if (wantsSell) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'sell' } },
    }
  }

  // Drive satisfactions at the current room (rest at inn, drink at water,
  // etc.) win over sacrifice — sacrifice is the fallback when nothing
  // else here is worth the beat.
  if (narratable.length > 0) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'satisfy', drives: narratable } },
    }
  }

  // Sacrifice — fires anywhere when overweight + not greedy + nothing
  // else above is keeping the character busy. The greed gate in
  // wantsSacrifice ensures a hoarder character keeps their loot.
  if (wantsSacrifice) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'sacrifice' } },
    }
  }

  return { character, log, state: p.state }
}

// One tick of the `using-room` state — 'satisfy' drains drives from the
// current room's amenities; 'traverse-portal' moves the character to a linked area.
function handleRoomAction(p: Playing, world: WorldContent, rng: Rng): Playing {
  if (p.state.kind !== 'using-room') return p
  const action = p.state.action
  const c = p.character
  let log = p.log

  // Portal Hub selection is handled entirely by the App-level dialog —
  // the tick loop just holds the state until the player makes a choice.
  if (action.kind === 'portal-hub-select') {
    return p
  }

  if (action.kind === 'traverse-portal') {
    const dest = action.destination
    const destArea = getArea(world, dest.areaId)
    const destRoom = destArea.rooms[roomKey(dest.x, dest.y, dest.z)]
    const vk = visitedKey(dest.areaId, dest.x, dest.y, dest.z)
    const visitedRooms = c.visitedRooms.includes(vk) ? c.visitedRooms : [...c.visitedRooms, vk]
    const isNewArea = !c.visitedRooms.some((k) => k.startsWith(`${dest.areaId}:`))
    if (isNewArea) {
      log = append(log, {
        kind: 'area',
        text: destArea.name,
        rarity: destArea.rarity,
        // areaId threaded so journal derivation can scope the
        // area-discovered entry without re-deriving from visitedRooms.
        areaId: destArea.id,
      })
    }
    if (destRoom) {
      log = append(log, {
        kind: 'narrative',
        text: `${formatActorName(c, 'log')} steps through and emerges in the ${destRoom.name}. ${destRoom.description}`,
        meta: {
          name: formatActorName(c, 'log'),
          areaId: dest.areaId,
          roomKey: roomKey(dest.x, dest.y, dest.z),
          roomName: destRoom.name,
        },
      })
    }
    return {
      character: { ...c, position: dest, visitedRooms },
      log,
      state: { kind: 'exploring' },
    }
  }

  const area = getArea(world, c.position.areaId)
  const rk = roomKey(c.position.x, c.position.y, c.position.z)
  const room = area.rooms[rk]
  let drives: Drives = c.drives

  switch (action.kind) {
    case 'satisfy': {
      for (const d of action.drives) {
        const tmpl = room?.satisfyText?.[d]
        if (!tmpl) continue
        log = append(log, {
          kind: 'narrative',
          text: tmpl.replace('{name}', formatActorName(c, 'log')),
          meta: {
            name: formatActorName(c, 'log'),
            areaId: area.id,
            roomKey: rk,
            roomName: room?.name,
          },
        })
      }
      drives = satisfy(drives, action.drives)
      break
    }
    case 'sell': {
      const sold = handleSell(p, world, rng)
      if (sold) return sold
      break
    }
    case 'sacrifice': {
      const sacrificed = handleSacrifice(p, world)
      if (sacrificed) return sacrificed
      break
    }
  }

  return {
    character: { ...c, drives },
    log,
    state: { kind: 'exploring' },
  }
}



/**
 * Auto-ramp schedule for new characters' tick speed. Each entry is `[ticks,
 * fromSpeed, toSpeed]`. Bumps fire only when the character is still on
 * `fromSpeed` and `tickSpeedAuto` is true — so a manual pick from the
 * topbar (which flips `tickSpeedAuto` off) will never be overridden, and a
 * user who already moved past `fromSpeed` skips that step.
 *
 * Tick budget rationale: with the exploring cadence around 2.4 s, 50 ticks
 * is ~2 minutes and 150 ticks is ~6 minutes. That gives the player a
 * gentle on-ramp before the world clicks into its full pace.
 */
const TICK_SPEED_RAMP: Array<[number, TickSpeedId, TickSpeedId]> = [
  [50, '50', '75'],
  [150, '75', '100'],
]

function maybeRampTickSpeed(p: Playing): Playing {
  if (!p.character.tickSpeedAuto) return p
  const ticks = p.character.ticks ?? 0
  const current = p.character.tickSpeed
  for (const [threshold, from, to] of TICK_SPEED_RAMP) {
    if (ticks < threshold) continue
    if (current !== from) continue
    return {
      ...p,
      character: { ...p.character, tickSpeed: to },
      log: append(p.log, {
        kind: 'meta',
        // Speed-ramp note is world-flavor with no character-name slot —
        // leave meta.name unset so the LogPanel highlight pass doesn't
        // try to match a name that isn't in the text.
        text: `The world seems to move by faster now…`,
      }),
    }
  }
  return p
}

function generatingArea(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'generating-area') return p
  const ticksLeft = p.state.ticksLeft - 1
  if (ticksLeft > 0) {
    return {
      ...p,
      state: { ...p.state, ticksLeft },
    }
  }
  // Timer expired — flag the exit tile as skipGeneration so future
  // visits don't re-attempt, emit a meta log entry, and bail to
  // exploring. The primary timeout path is FindingPathOverlay in
  // App.tsx (120s real-time); this tick-based fallback is the safety
  // net for edge cases where the overlay isn't rendered.
  const [srcAreaId, coords] = p.state.exitRoomKey.split('::')
  if (srcAreaId && coords) {
    const srcArea = findArea(world, srcAreaId)
    if (srcArea) {
      const exitRoom = srcArea.rooms[coords]
      if (exitRoom) {
        exitRoom.skipGeneration = true
      }
    }
  }

  return {
    ...p,
    log: append(p.log, {
      kind: 'meta',
      text: 'The path ahead did not take shape. Perhaps another time.',
    }),
    state: { kind: 'exploring' },
  }
}

export function runTick(p: Playing, world: WorldContent): Playing {
  // Restore per-character PRNG. All game-state randomness draws from
  // this stream so (character state, seed, tick sequence) replays
  // identically. The state is stamped back onto the character after
  // the tick completes.
  const rng = Rng.fromState(p.character.rngState)

  // Bump the character's lifetime tick counter at the top of every tick so
  // every downstream update (and the roster card) sees the fresh value.
  // Also tick down any active divine blessing — its duration is global to
  // the tick loop, not scoped to one state, so a blessing applied at a
  // shrine keeps counting down through fights and travel until it expires.
  // tickBlessing early-returns its input when no blessing is active, so the
  // common case is a single spread.
  const ticks = (p.character.ticks ?? 0) + 1
  const bumpedChar = tickBlessing({ ...p.character, ticks })
  // maybeRampTickSpeed early-returns the same Playing when tickSpeedAuto is
  // false or no threshold crossed, so the spread for the bumpedChar is the
  // only unconditional allocation in the prologue.
  const withTick = maybeRampTickSpeed({ ...p, character: bumpedChar })
  // Locked-chest countdown ticks down here, before the state handler
  // dispatches, so the chest is wall-clock-driven regardless of which
  // state the character is in. An unlock fires its own log + auto-equip
  // lines into the running `log` array via `tickLockedChest`; the state
  // handler then runs against the post-unlock character so any new gear
  // shows up in the same tick's combat / explore math.
  const chested = tickLockedChest(withTick, world, rng)
  const after: Playing = (() => {
    switch (chested.state.kind) {
      case 'exploring':
        return explore(chested, world, rng)
      case 'resting':
        return rest(chested, world, rng)
      case 'meditating':
        return meditate(chested, world, rng)
      case 'fighting':
        return fight(chested, world, rng)
      case 'using-room':
        return handleRoomAction(chested, world, rng)
      case 'generating-area':
        return generatingArea(chested, world)
    }
  })()
  // Journal derivation — single chokepoint, mirrors the effects
  // pipeline. Compares pre-tick state to post-tick state + the new log
  // entries and emits journal entries for milestones. Writes land on
  // the returned character so every tick transition is fully captured
  // without threading journal state through every sub-handler.
  //
  // Hot-path early return: when no log entries were appended this tick
  // (the state handler returned the same array reference) AND the
  // character snapshot diffs nothing journal-worthy (level, deaths,
  // saved, visitedRooms, spells), we can skip both the Set construction
  // and the deriveJournalEntries call entirely. Most exploring ticks
  // append at least one log entry, but resting/meditating filler ticks
  // and the cadenced "moves silently" exploration ticks return p
  // untouched and benefit here.
  let journalAdds: ReturnType<typeof deriveJournalEntries> = []
  if (after.log !== withTick.log || after.character !== withTick.character) {
    // `newLogEntries` is computed by Set-identity difference rather than
    // a length-based slice. Length diff breaks once the log hits cap:
    // every append past cap evicts an old entry, so
    // `after.log.length === withTick.log.length` even though new entries
    // were added. Identity diff is robust to that eviction — we only
    // look for entries present in `after` but not in `withTick`.
    //
    // Runs BEFORE stamping rngState so any rng draws made here (e.g. the
    // death-clause picker for journal entries without a cached cause) are
    // captured in the persisted state — keeping the next tick deterministic.
    const beforeSet = new Set(withTick.log)
    const newLogEntries = after.log.filter((e) => !beforeSet.has(e))
    journalAdds = deriveJournalEntries(
      withTick.character,
      after.character,
      newLogEntries,
      world,
      rng,
    )
  }

  // Stamp the post-tick PRNG state back onto the character so the next
  // tick resumes from the same stream position. Also trim the log to
  // the observable cap — `append()` allows growth up to LOG_CAP_SOFT
  // (2× cap) so per-append cost stays O(1); the single bulk slice
  // happens here, once per tick.
  const trimmedLog = trim(after.log)
  const stamped: Playing = {
    ...after,
    log: trimmedLog,
    character: { ...after.character, rngState: rng.save() },
  }
  if (journalAdds.length === 0) return stamped
  return {
    ...stamped,
    character: {
      ...stamped.character,
      journal: [...(stamped.character.journal ?? []), ...journalAdds],
    },
  }
}

export function seedLog(
  character: Character,
  world: WorldContent,
  options: { discovery?: boolean } = {},
): LogEntry[] {
  const area = getArea(world, character.position.areaId)
  const room = area.rooms[roomKey(character.position.x, character.position.y, character.position.z)]
  // The area banner + fullscreen "New Area" reveal should fire on actual
  // first discovery, not on every reload of an existing save. Callers
  // pass `discovery: true` only when the character is being freshly
  // created; load paths leave it off so the banner doesn't re-fire.
  const entries: LogEntry[] = [
    { kind: 'chapter', text: `${formatActorName(character, 'log')} stirs.`, meta: { name: formatActorName(character, 'log') } },
  ]
  // Intro line — only on true character creation, not save reloads. Ties
  // the player's chosen name to the world's birth title, so the reader
  // learns who's behind "the Wayfarer" / "the Nobody" / "the Cadet"
  // before the routine log spends the first tier in title-only mode.
  if (options.discovery) {
    const manifest = getWorldManifest(character.worldId)
    const introTemplate = manifest?.birthIntro
    if (introTemplate) {
      entries.push({
        kind: 'narrative',
        text: introTemplate.replace('{name}', character.name),
        // Birth-intro template substitutes the bare {name}, so the
        // highlight target is the bare name (not the title-aware form).
        meta: { name: character.name },
      })
    }
    entries.push({ kind: 'area', text: area.name, rarity: area.rarity, areaId: area.id })
  }
  if (room) {
    entries.push({
      kind: 'narrative',
      text: `${formatActorName(character, 'log')} stands in the ${room.name}. ${room.description}`,
      meta: {
        name: formatActorName(character, 'log'),
        areaId: area.id,
        roomKey: roomKey(room.x, room.y, room.z),
        roomName: room.name,
      },
    })
  }
  return entries
}
