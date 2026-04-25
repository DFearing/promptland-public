import {
  manhattan,
  neighborsOf,
  randomStep,
  roomKey,
  stepTowards,
  visitedKey,
  type Area,
  type Position,
} from '../areas'
import type { Character, DeathRecord, LevelSegment, LevelUpRecord } from '../character'
import { resolveTitle, titleIndexForLevel, xpToNextLevel } from '../character'
import { damageVerb } from '../combat'
import { applyCondition, clearConditions, tickConditions } from '../conditions'
import { RARITIES, rollMobRarity, type Rarity } from '../items'
import type { LogEntry } from '../log'
import { spawn, type Mob } from '../mobs'
import { castSpell, getSpell } from '../spells'
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
import { applyDeathPenalty } from './death'
import { applyAutoEquip, combatBonuses, equipLogEntry } from './equip'
import { applyDrops, rollLoot, type Drops } from './loot'
import { pickItemsToSell } from './sell'
import type { GameState } from './state'
import type { TickSpeedId } from '../themes/types'
import { weightDriveValue } from './weight'

const LOG_CAP = 200

function getArea(world: WorldContent, areaId: string): Area {
  return world.areas?.find((a) => a.id === areaId) ?? world.startingArea
}

// Randomized verbs for the level-up chapter entry — keeps the log from reading
// like a template every single time. Emoji is appended by applyXp.
const LEVEL_UP_VERBS = [
  'rises',
  'ascends',
  'climbs',
  'levels up',
  'steps up',
  'advances',
  'elevates',
  'strides forward',
  'soars',
  'breaks through',
]

function pickLevelUpVerb(): string {
  return LEVEL_UP_VERBS[Math.floor(Math.random() * LEVEL_UP_VERBS.length)]
}

function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r)
}

function trackBaddest(
  character: Character,
  mob: Mob,
): Character {
  const candidate = {
    name: mob.name,
    rarity: mob.rarity,
    xpReward: mob.xpReward,
  }
  const segment: LevelSegment = character.segment ?? {
    startedAt: character.createdAt,
    startGold: character.gold,
  }
  const existing = segment.baddestEnemy
  const better = (() => {
    if (!existing) return candidate
    const candRank = rarityRank(candidate.rarity)
    const currRank = rarityRank(existing.rarity)
    if (candRank > currRank) return candidate
    if (candRank < currRank) return existing
    return candidate.xpReward > existing.xpReward ? candidate : existing
  })()
  return { ...character, segment: { ...segment, baddestEnemy: better } }
}
const REST_CHANCE = 0.12
const REST_DURATION = 6
const REST_HEAL = 2
const REST_FATIGUE_RELIEF = 15
const ENCOUNTER_CHANCE = 0.18
/** Minimum INT *or* WIS the character needs before they're willing to sit
 *  and meditate. Keeps the behaviour plausible for spellcasters and wise
 *  classes, without accidentally gating fighter-type characters. */
const MEDITATE_STAT_MIN = 12
const MEDITATE_CHANCE = 0.12
const MEDITATE_DURATION = 6
const MEDITATE_MP = 3
const MEDITATE_HP = 1
/** HP / MP ratios that flip rest / meditate from a coin-flip into an
 *  inevitability — the character actively decides to recover instead of
 *  waiting for a lucky roll. Tuned so hovering near full just rolls the old
 *  base chance, while dropping below half guarantees a sit-down on the next
 *  safe-room tick. */
const REST_FORCE_HP_RATIO = 0.5
const MEDITATE_FORCE_MP_RATIO = 0.5
/** Ticks the character refuses to re-enter rest / meditate after exiting one
 *  of them. Stops the meditate → rest chain in the same room and forces them
 *  to take at least one exploration tick before sitting back down. */
const REST_COOLDOWN_TICKS = 3
/** Per-tick chance a resting/meditating character gets ambushed instead of
 *  peacefully continuing. Scales down with room safety: inns and shrines
 *  are safer than the open road. Value is the base chance on a non-safe
 *  tile; safe-family rooms halve it. */
const REST_AMBUSH_CHANCE = 0.04

const EXPLORE_GROWTH: Partial<Drives> = {
  hunger: 3,
  fatigue: 3,
  greed: 2,
  curiosity: 4,
}

// Resting and meditating pause hunger intentionally — the character is
// sitting/eating/praying, not actively burning through food.
const REST_GROWTH: Partial<Drives> = {
  greed: 1,
  curiosity: 1,
}

function stampWeight(drives: Drives, character: Character, world: WorldContent): Drives {
  return { ...drives, weight: weightDriveValue(character, world.items) }
}

export interface Playing {
  character: Character
  log: LogEntry[]
  state: GameState
}

function append(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry].slice(-LOG_CAP)
}

function rand(max: number): number {
  return Math.floor(Math.random() * max)
}
function roll(sides: number): number {
  return 1 + rand(sides)
}
function mod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Determines whether a fresh encounter starts with an ambush.
 *   - |level delta| ≥ 5 → the higher-level side auto-ambushes for 2 rounds.
 *   - Smaller gaps roll a flat 15 % chance of an ambush, with the advantaged
 *     side biased toward being the ambusher.
 */
function rollAmbush(
  charLevel: number,
  mobLevel: number,
): { side: 'character' | 'mob'; ticksLeft: number } | null {
  const delta = charLevel - mobLevel
  if (delta >= 5) return { side: 'character', ticksLeft: 2 }
  if (delta <= -5) return { side: 'mob', ticksLeft: 2 }
  if (Math.random() < 0.15) {
    // Coin flip, weighted toward the higher-level side.
    const charFavor = 0.5 + 0.05 * delta
    const side: 'character' | 'mob' = Math.random() < charFavor ? 'character' : 'mob'
    return { side, ticksLeft: 2 }
  }
  return null
}

/**
 * XP multiplier based on (mob level − character level). A mob at-level pays
 * its base xpReward; a tougher mob pays more, a weaker mob pays less. Caps
 * at +200 % / −90 % so farming green-con mobs is still possible (just slow)
 * and red-con kills feel genuinely rewarding.
 */
function xpScaleByDelta(delta: number): number {
  const clamped = Math.max(-10, Math.min(10, delta))
  if (clamped >= 0) return 1 + clamped * 0.2
  return Math.max(0.1, 1 + clamped * 0.12)
}

/**
 * Damage-out multiplier based on (player level − mob level). Each level of
 * advantage adds ~15 % damage; disadvantage subtracts the same. Saturates
 * so a 10-level gap maxes at +150 % / −75 %: fights stay decisive at
 * extremes but neither side one-shots in a single roll.
 */
function levelScaleOutgoing(delta: number): number {
  const clamped = Math.max(-10, Math.min(10, delta))
  if (clamped >= 0) return 1 + clamped * 0.15
  // Negative delta: shrinks damage dealt, floor at 25 %.
  return Math.max(0.25, 1 + clamped * 0.075)
}

/**
 * Damage-in multiplier from the defender's perspective. Mirror image of
 * `levelScaleOutgoing`: a higher-level attacker hits harder, a lower-level
 * one bounces off.
 */
function levelScaleIncoming(delta: number): number {
  return levelScaleOutgoing(-delta)
}

function rollEncounterFor(world: WorldContent, type: string): Mob | null {
  const ids = world.encounters[type as keyof WorldContent['encounters']]
  if (!ids || ids.length === 0) return null
  const id = ids[rand(ids.length)]
  const template = world.mobs.find((m) => m.id === id)
  if (!template) return null
  return spawn(template, rollMobRarity())
}

function appendDropLogs(
  log: LogEntry[],
  character: Character,
  world: WorldContent,
  drops: Drops,
  mobRarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = 'common',
): LogEntry[] {
  let out = log
  if (drops.gold > 0) {
    const manifest = getWorldManifest(character.worldId)
    const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
    const goldText = `${drops.gold} ${currency}`
    out = append(out, {
      kind: 'loot',
      text: `${character.name} pockets ${goldText}.`,
      meta: { name: character.name, goldAmount: drops.gold, goldText },
    })
  }
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    // Mirror loot.ts: rolls the same rarity distribution so the log colors
    // the item by the tier that will actually land in the inventory.
    // Non-equipment/scroll types always log as common.
    const rarity =
      def.kind === 'equipment' || def.kind === 'scroll'
        ? // Best-effort snapshot: the actual roll happens inside applyDrops,
          // so we can't promise a match. Keep log coloring simple: mob's
          // rarity as a proxy — stronger mobs tend to drop rarer gear.
          mobRarity
        : 'common'
    const qtySuffix = drop.qty > 1 ? ` ×${drop.qty}` : ''
    out = append(out, {
      kind: 'loot',
      text: `${character.name} gathers ${def.name}${qtySuffix}.`,
      meta: {
        name: character.name,
        itemId: def.id,
        itemName: def.name,
        itemRarity: rarity,
      },
    })
  }
  return out
}

function directionName(dx: number, dy: number): string {
  const vx = Math.sign(dx)
  const vy = Math.sign(dy)
  if (vx === 0 && vy < 0) return 'north'
  if (vx > 0 && vy < 0) return 'northeast'
  if (vx > 0 && vy === 0) return 'east'
  if (vx > 0 && vy > 0) return 'southeast'
  if (vx === 0 && vy > 0) return 'south'
  if (vx < 0 && vy > 0) return 'southwest'
  if (vx < 0 && vy === 0) return 'west'
  if (vx < 0 && vy < 0) return 'northwest'
  return 'somewhere'
}

function bfsNearestUnvisited(area: Area, start: Position, visitedRooms: string[]): Position | null {
  const seen = new Set<string>([`${start.x},${start.y},${start.z}`])
  const queue: Position[] = [start]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const vk = visitedKey(cur.areaId, cur.x, cur.y, cur.z)
    if (!visitedRooms.includes(vk)) return cur
    for (const n of neighborsOf(area, cur)) {
      const k = `${n.x},${n.y},${n.z}`
      if (!seen.has(k)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  return null
}

function nearestRoomSatisfying(area: Area, from: Position, drive: Drive): Position | null {
  let best: Position | null = null
  let bestDist = Infinity
  for (const key in area.rooms) {
    const r = area.rooms[key]
    if (!r.satisfies?.includes(drive)) continue
    const pos: Position = { areaId: area.id, x: r.x, y: r.y, z: r.z }
    const d = manhattan(from, pos)
    if (d < bestDist) {
      bestDist = d
      best = pos
    }
  }
  return best
}

function findPortalToExplore(area: Area, character: Character, world: WorldContent): Position | null {
  const visited = new Set(character.visitedRooms)
  type Candidate = { pos: Position; fresh: boolean }
  const candidates: Candidate[] = []
  for (const key in area.rooms) {
    const r = area.rooms[key]
    if (r.type !== 'portal' || !r.destination) continue
    const pos: Position = { areaId: area.id, x: r.x, y: r.y, z: r.z }
    const destArea = world.areas?.find((a) => a.id === r.destination!.areaId)
    let fresh = false
    if (destArea) {
      for (const dk in destArea.rooms) {
        const dr = destArea.rooms[dk]
        if (!visited.has(visitedKey(destArea.id, dr.x, dr.y, dr.z))) {
          fresh = true
          break
        }
      }
    } else {
      fresh = !visited.has(
        visitedKey(r.destination.areaId, r.destination.x, r.destination.y, r.destination.z),
      )
    }
    candidates.push({ pos, fresh })
  }
  if (candidates.length === 0) return null
  const preferred = candidates.filter((c) => c.fresh)
  const pool = preferred.length > 0 ? preferred : candidates
  let best: Position | null = null
  let bestDist = Infinity
  for (const c of pool) {
    const d = manhattan(character.position, c.pos)
    if (d < bestDist) {
      bestDist = d
      best = c.pos
    }
  }
  return best
}

function moveByGoal(
  area: Area,
  character: Character,
  goal: Drive | null,
  world: WorldContent,
): Position | null {
  const pos = character.position
  if (!goal) return randomStep(area, pos)

  if (goal === 'curiosity') {
    const options = neighborsOf(area, pos)
    const unvisited = options.filter(
      (o) => !character.visitedRooms.includes(visitedKey(o.areaId, o.x, o.y, o.z)),
    )
    if (unvisited.length > 0) return unvisited[rand(unvisited.length)]
    const target = bfsNearestUnvisited(area, pos, character.visitedRooms)
    if (target) return stepTowards(area, pos, target)
    // Area fully mapped — push outward to a portal, preferring destinations
    // with unvisited rooms.
    const portal = findPortalToExplore(area, character, world)
    if (portal) {
      if (portal.x === pos.x && portal.y === pos.y && portal.z === pos.z) {
        return randomStep(area, pos)
      }
      return stepTowards(area, pos, portal)
    }
    return randomStep(area, pos)
  }

  if (goal === 'greed') {
    const options = neighborsOf(area, pos)
    const dangerous = options.filter((o) => {
      const r = area.rooms[roomKey(o.x, o.y, o.z)]
      return r && r.type !== 'safe'
    })
    if (dangerous.length > 0) return dangerous[rand(dangerous.length)]
    return randomStep(area, pos)
  }

  // hunger, fatigue, weight all navigate to the nearest room whose
  // `satisfies` array includes the drive.
  const target = nearestRoomSatisfying(area, pos, goal)
  if (!target) return randomStep(area, pos)
  if (target.x === pos.x && target.y === pos.y && target.z === pos.z) {
    return randomStep(area, pos)
  }
  return stepTowards(area, pos, target)
}

function explore(p: Playing, world: WorldContent): Playing {
  const cond = tickConditions(p.character, world)
  let log = p.log
  for (const e of cond.entries) log = append(log, e)
  if (cond.skipTurn) {
    log = append(log, {
      kind: 'narrative',
      text: `${cond.character.name} cannot move.`,
      meta: { name: cond.character.name },
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
  const currentRoom = area.rooms[roomKey(c.position.x, c.position.y, c.position.z)]
  const isSafeFamily =
    currentRoom?.type === 'safe' ||
    currentRoom?.type === 'inn' ||
    currentRoom?.type === 'shrine'
  const restAllowed = (c.restCooldown ?? 0) <= 0
  const hpRatio = c.maxHp > 0 ? c.hp / c.maxHp : 1
  const mpRatio = c.maxMagic > 0 ? c.magic / c.maxMagic : 1
  const wounded = c.hp < c.maxHp
  // Rest only triggers in a safe-family room so the "cannot rest near a
  // hostile mob" rule is satisfied structurally — encounters roll outside
  // those room types, so the player can't sit down somewhere dangerous.
  // The base coin-flip is upgraded to a guaranteed sit-down once HP falls
  // below the force-rest ratio so a wounded character actually recovers
  // instead of bleeding out across the floor.
  const wantsRest =
    wounded &&
    isSafeFamily &&
    restAllowed &&
    (hpRatio < REST_FORCE_HP_RATIO || Math.random() < REST_CHANCE)
  if (wantsRest) {
    const text = currentRoom
      ? `${c.name} pauses to catch their breath in the ${currentRoom.name}.`
      : `${c.name} pauses to rest.`
    return {
      character: c,
      log: append(log, {
        kind: 'narrative',
        text,
        meta: {
          name: c.name,
          areaId: area.id,
          roomKey: currentRoom ? roomKey(currentRoom.x, currentRoom.y, currentRoom.z) : undefined,
          roomName: currentRoom?.name,
        },
      }),
      state: { kind: 'resting', ticksLeft: REST_DURATION },
    }
  }

  // Meditate — MP-focused alternative. Available to characters with real
  // INT or WIS; fighters without the mind for it stick to rest. Safe-family
  // rooms only, for the same reason. Critically low MP forces the sit-down,
  // matching the rest path's behaviour for low HP.
  const minded =
    Math.max(c.stats.intelligence, c.stats.wisdom) >= MEDITATE_STAT_MIN
  const lowMagic = c.maxMagic > 0 && c.magic < c.maxMagic * 0.6
  const wantsMeditate =
    lowMagic &&
    minded &&
    isSafeFamily &&
    restAllowed &&
    (mpRatio < MEDITATE_FORCE_MP_RATIO || Math.random() < MEDITATE_CHANCE)
  if (wantsMeditate) {
    const text = currentRoom
      ? `${c.name} settles into meditation in the ${currentRoom.name}.`
      : `${c.name} settles into meditation.`
    return {
      character: c,
      log: append(log, {
        kind: 'narrative',
        text,
        meta: {
          name: c.name,
          areaId: area.id,
          roomKey: currentRoom ? roomKey(currentRoom.x, currentRoom.y, currentRoom.z) : undefined,
          roomName: currentRoom?.name,
        },
      }),
      state: { kind: 'meditating', ticksLeft: MEDITATE_DURATION },
    }
  }

  const grownDrives = stampWeight(grow(c.drives, EXPLORE_GROWTH), c, world)
  const goal = topDrive(grownDrives)
  const next = moveByGoal(area, { ...c, drives: grownDrives }, goal, world)

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
      ? `${c.name} heads ${dir} to the ${room.name}.`
      : `${c.name} explores ${dir} to the ${room.name}. ${room.description}`
    : null
  const moveMeta = room
    ? {
        name: c.name,
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

  const character: Character = {
    ...c,
    position: next,
    visitedRooms,
    drives,
    lastSafePosition,
  }

  // Portal rooms immediately queue a traversal — no encounters, no drive satisfaction.
  if (room?.type === 'portal' && room.destination) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'traverse-portal', destination: room.destination } },
    }
  }

  if (room && room.type !== 'safe' && Math.random() < ENCOUNTER_CHANCE) {
    const mob = rollEncounterFor(world, room.type)
    if (mob) {
      log = append(log, {
        kind: 'narrative',
        text: `A ${mob.name} bars the way. ${mob.description}`,
        meta: { mobName: mob.name },
      })
      const ambush = rollAmbush(character.level, mob.level) ?? undefined
      if (ambush) {
        const attackerName = ambush.side === 'character' ? character.name : `the ${mob.name}`
        log = append(log, {
          kind: 'narrative',
          text: `${capitalize(attackerName)} catches ${ambush.side === 'character' ? `the ${mob.name}` : character.name} off guard! (Ambush — 2 attacks)`,
          meta: { name: character.name, mobName: mob.name },
        })
      }
      return { character, log, state: { kind: 'fighting', mob, ambush } }
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

  if (narratable.length > 0) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'satisfy', drives: narratable } },
    }
  }

  return { character, log, state: p.state }
}

// One tick of the `using-room` state — 'satisfy' drains drives from the
// current room's amenities; 'traverse-portal' moves the character to a linked area.
function useRoom(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'using-room') return p
  const action = p.state.action
  const c = p.character
  let log = p.log

  if (action.kind === 'traverse-portal') {
    const dest = action.destination
    const destArea = getArea(world, dest.areaId)
    const destRoom = destArea.rooms[roomKey(dest.x, dest.y, dest.z)]
    const vk = visitedKey(dest.areaId, dest.x, dest.y, dest.z)
    const visitedRooms = c.visitedRooms.includes(vk) ? c.visitedRooms : [...c.visitedRooms, vk]
    const isNewArea = !c.visitedRooms.some((k) => k.startsWith(`${dest.areaId}:`))
    if (isNewArea) log = append(log, { kind: 'area', text: destArea.name })
    if (destRoom) {
      log = append(log, {
        kind: 'narrative',
        text: `${c.name} steps through and emerges in the ${destRoom.name}. ${destRoom.description}`,
        meta: {
          name: c.name,
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
          text: tmpl.replace('{name}', c.name),
          meta: {
            name: c.name,
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
      const result = pickItemsToSell(c, world.items)
      if (result.sold.length === 0) break
      const manifest = getWorldManifest(c.worldId)
      const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
      const roomName = room?.name ?? 'the shop'
      const itemCount = result.sold.reduce(
        (n, s) => n + (s.item.quantity ?? 1),
        0,
      )
      log = append(log, {
        kind: 'loot',
        text: `${c.name} sells ${itemCount} item${itemCount !== 1 ? 's' : ''} for ${result.totalGold} ${currency}.`,
        meta: {
          name: c.name,
          goldAmount: result.totalGold,
          goldText: `${result.totalGold} ${currency}`,
        },
      })
      log = append(log, {
        kind: 'narrative',
        text: `${c.name} offloads ${itemCount} item${itemCount !== 1 ? 's' : ''} at ${roomName} for ${result.totalGold} ${currency}.`,
        meta: {
          name: c.name,
          areaId: area.id,
          roomKey: rk,
          roomName: room?.name,
        },
      })
      const afterSell: Character = {
        ...c,
        inventory: result.remainingInventory,
        gold: c.gold + result.totalGold,
      }
      drives = stampWeight(satisfy(c.drives, ['weight']), afterSell, world)
      return {
        character: { ...afterSell, drives },
        log,
        state: { kind: 'exploring' },
      }
    }
  }

  return {
    character: { ...c, drives },
    log,
    state: { kind: 'exploring' },
  }
}

/**
 * Per-tick HP gain while resting. Scales with level (a veteran recovers
 * faster) and CON mod (a tougher body does too). Minimum 1.
 */
function restHealAmount(c: Character): number {
  const conMod = Math.max(0, Math.floor((c.stats.constitution - 10) / 2))
  return Math.max(1, REST_HEAL + conMod + Math.floor(c.level / 3))
}

/**
 * Per-tick MP gain while meditating. Scales with level and whichever of
 * INT/WIS is higher. Minimum 1.
 */
function meditateMpAmount(c: Character): number {
  const mindMod = Math.max(
    0,
    Math.floor(
      (Math.max(c.stats.intelligence, c.stats.wisdom) - 10) / 2,
    ),
  )
  return Math.max(1, MEDITATE_MP + mindMod + Math.floor(c.level / 3))
}

/** Meditating recovers some HP too — roughly half the flat rest rate,
 *  with no CON bonus (this is a mind discipline, not a body one). */
function meditateHpAmount(c: Character): number {
  return Math.max(1, MEDITATE_HP + Math.floor(c.level / 4))
}

/**
 * Rolls whether a resting/meditating character is ambushed this tick. Safe
 * rooms cut the chance in half; returns a spawned mob ready to drop into a
 * fighting-state with `ambush.side='mob'` or null if nothing happens.
 */
function tryRestAmbush(
  p: Playing,
  world: WorldContent,
): Mob | null {
  const area = getArea(world, p.character.position.areaId)
  const room = area.rooms[roomKey(p.character.position.x, p.character.position.y, p.character.position.z)]
  const safeFamily = room && (room.type === 'safe' || room.type === 'inn' || room.type === 'shrine')
  const chance = safeFamily ? REST_AMBUSH_CHANCE / 2 : REST_AMBUSH_CHANCE
  if (Math.random() >= chance) return null
  const type = room?.type ?? 'corridor'
  return rollEncounterFor(world, type)
}

function rest(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'resting') return p
  // Ambush roll first — if interrupted, transition to fighting with
  // mob-side ambush regardless of level.
  const ambushMob = tryRestAmbush(p, world)
  if (ambushMob) {
    const log = append(p.log, {
      kind: 'narrative',
      text: `${p.character.name}'s rest is shattered — a ${ambushMob.name} is on them!`,
      meta: { name: p.character.name, mobName: ambushMob.name },
    })
    return {
      character: p.character,
      log,
      state: {
        kind: 'fighting',
        mob: ambushMob,
        ambush: { side: 'mob', ticksLeft: 2 },
      },
    }
  }

  const healAmount = restHealAmount(p.character)
  const healed = Math.min(p.character.maxHp, p.character.hp + healAmount)
  const actualHeal = healed - p.character.hp
  const ticksLeft = p.state.ticksLeft - 1
  const done = healed >= p.character.maxHp || ticksLeft <= 0

  const grownDrives = stampWeight(grow(p.character.drives, REST_GROWTH), p.character, world)
  const newFatigue = Math.max(0, grownDrives.fatigue - REST_FATIGUE_RELIEF)
  const drives: Drives = { ...grownDrives, fatigue: newFatigue }

  let log = p.log
  if (actualHeal > 0) {
    log = append(log, {
      kind: 'heal',
      text: `${p.character.name} catches their breath.`,
      amount: actualHeal,
      meta: { name: p.character.name },
    })
  }
  if (done) {
    log = append(log, {
      kind: 'narrative',
      text: `${p.character.name} rises, ready to press on.`,
      meta: { name: p.character.name },
    })
    const cleared = clearConditions({
      ...p.character,
      hp: healed,
      drives,
      restCooldown: REST_COOLDOWN_TICKS,
    })
    if (cleared.entry) log = append(log, cleared.entry)
    return {
      character: cleared.character,
      log,
      state: { kind: 'exploring' },
    }
  }
  return {
    character: { ...p.character, hp: healed, drives },
    log,
    state: { kind: 'resting', ticksLeft },
  }
}

function meditate(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'meditating') return p
  const ambushMob = tryRestAmbush(p, world)
  if (ambushMob) {
    const log = append(p.log, {
      kind: 'narrative',
      text: `${p.character.name}'s meditation breaks — a ${ambushMob.name} strikes!`,
      meta: { name: p.character.name, mobName: ambushMob.name },
    })
    return {
      character: p.character,
      log,
      state: {
        kind: 'fighting',
        mob: ambushMob,
        ambush: { side: 'mob', ticksLeft: 2 },
      },
    }
  }

  const mpGain = meditateMpAmount(p.character)
  const hpGain = meditateHpAmount(p.character)
  const newMagic = Math.min(p.character.maxMagic, p.character.magic + mpGain)
  const newHp = Math.min(p.character.maxHp, p.character.hp + hpGain)
  const actualMp = newMagic - p.character.magic
  const actualHp = newHp - p.character.hp
  const ticksLeft = p.state.ticksLeft - 1
  const done =
    (newMagic >= p.character.maxMagic && newHp >= p.character.maxHp) ||
    ticksLeft <= 0

  const grownDrives = stampWeight(grow(p.character.drives, REST_GROWTH), p.character, world)
  const newFatigue = Math.max(0, grownDrives.fatigue - Math.round(REST_FATIGUE_RELIEF / 2))
  const drives: Drives = { ...grownDrives, fatigue: newFatigue }

  let log = p.log
  if (actualMp > 0 || actualHp > 0) {
    const parts: string[] = []
    if (actualMp > 0) parts.push(`+${actualMp} MP`)
    if (actualHp > 0) parts.push(`+${actualHp} HP`)
    log = append(log, {
      kind: 'heal',
      text: `${p.character.name} centers their breathing. (${parts.join(' · ')})`,
      meta: { name: p.character.name },
    })
  }
  if (done) {
    log = append(log, {
      kind: 'narrative',
      text: `${p.character.name} opens their eyes, clear-headed.`,
      meta: { name: p.character.name },
    })
    return {
      character: {
        ...p.character,
        hp: newHp,
        magic: newMagic,
        drives,
        restCooldown: REST_COOLDOWN_TICKS,
      },
      log,
      state: { kind: 'exploring' },
    }
  }
  return {
    character: { ...p.character, hp: newHp, magic: newMagic, drives },
    log,
    state: { kind: 'meditating', ticksLeft },
  }
}

export interface ApplyOneLevelOptions {
  /** XP cost recorded in the LevelUpRecord. Defaults to `xpToNextLevel(from)`
   *  so the dialog's "XP gained" column stays coherent when the helper is
   *  invoked outside the combat grind (e.g. the dev panel). */
  xpGained?: number
  /** Prepended to the chapter + narrative log lines. Dev-triggered level-ups
   *  use `[dev] ` so the log makes the synthetic origin obvious. */
  logPrefix?: string
  /** Clock injection for determinism in tests. */
  now?: number
}

/** Applies a single level-up's worth of gains (HP, MP, periodic stat bumps)
 *  plus the matching LevelUpRecord and narration. Shared between the combat
 *  XP flow (`applyXp`) and dev-panel handlers so both paths grow the
 *  character identically. */
export function applyOneLevel(
  character: Character,
  options: ApplyOneLevelOptions = {},
): { character: Character; logEntries: LogEntry[] } {
  const now = options.now ?? Date.now()
  const from = character.level
  const to = from + 1
  const gains = levelGainsFor(character, character.stats, to)
  const segment = character.segment ?? {
    startedAt: character.createdAt,
    startGold: character.gold,
  }
  const record: LevelUpRecord = {
    at: now,
    from,
    to,
    goldAtLevelUp: character.gold,
    xpGained: options.xpGained ?? xpToNextLevel(from),
    bestItem: segment.bestItem
      ? { name: segment.bestItem.name, rarity: segment.bestItem.rarity }
      : undefined,
    baddestEnemy: segment.baddestEnemy,
    gains: { hp: gains.hp, mp: gains.mp, statText: gains.statText },
  }
  const updated: Character = {
    ...character,
    level: to,
    maxHp: character.maxHp + gains.hp,
    hp: character.hp + gains.hp,
    maxMagic: character.maxMagic + gains.mp,
    magic: character.magic + gains.mp,
    stats: gains.nextStats,
    levelUps: [...character.levelUps, record],
    segment: { startedAt: now, startGold: character.gold },
  }
  const prefix = options.logPrefix ?? ''
  const verb = pickLevelUpVerb()
  const logEntries: LogEntry[] = [
    {
      kind: 'chapter',
      text: `${prefix}🎉✨⭐ ${character.name} ${verb} to level ${to}! ⭐✨🎉`,
      meta: { name: character.name, levelTo: to },
    },
  ]
  const parts: string[] = []
  if (gains.hp > 0) parts.push(`+${gains.hp} HP`)
  if (gains.mp > 0) parts.push(`+${gains.mp} MP`)
  if (gains.statText) parts.push(gains.statText)
  if (parts.length > 0) {
    logEntries.push({
      kind: 'narrative',
      text: `${prefix}${character.name} feels stronger. (${parts.join(' · ')})`,
      meta: { name: character.name },
    })
  }
  return { character: updated, logEntries }
}

function applyXp(
  character: Character,
  gained: number,
  log: LogEntry[],
): { character: Character; log: LogEntry[] } {
  let working = { ...character, xp: character.xp + gained }
  let updatedLog = log
  while (working.xp >= xpToNextLevel(working.level)) {
    const needed = xpToNextLevel(working.level)
    const { character: leveled, logEntries } = applyOneLevel(working, {
      xpGained: needed,
    })
    working = { ...leveled, xp: working.xp - needed }
    for (const entry of logEntries) updatedLog = append(updatedLog, entry)
    // Does this new level grant a new title? `applyOneLevel` has already
    // bumped `working.level`, so the earned index reads straight off the
    // post-bump character without needing a projection.
    const titleIdx = titleIndexForLevel(working.level)
    if (titleIdx != null) {
      const earned = resolveTitle(working, titleIdx)
      if (earned.text) {
        updatedLog = append(updatedLog, {
          kind: 'narrative',
          text: `${character.name} is now known as the ${earned.text}.`,
          meta: { name: character.name },
        })
      }
    }
  }
  return { character: working, log: updatedLog }
}

interface LevelGain {
  hp: number
  mp: number
  nextStats: Character['stats']
  /** Pretty "+1 STR / +1 CON" summary, or empty string for non-bump levels. */
  statText: string
}

/**
 * Per-level gains from a character's species + class. HP/MP are flat bumps
 * augmented by the CON / max(INT, WIS) stat mod — tougher bodies heal more,
 * sharper minds recover more magic. Stat bumps fire only at levels that are
 * multiples of the class's `statBumpInterval`.
 */
function levelGainsFor(
  character: Character,
  currentStats: Character['stats'],
  newLevel: number,
): LevelGain {
  const manifest = getWorldManifest(character.worldId)
  const species = manifest?.species.find((s) => s.id === character.speciesId)
  const klass = manifest?.classes.find((c) => c.id === character.classId)
  const classGrowth = klass?.growth ?? {}
  const speciesGrowth = species?.growth ?? {}

  const conMod = Math.max(0, Math.floor((currentStats.constitution - 10) / 2))
  const mindMod = Math.max(
    0,
    Math.floor(
      (Math.max(currentStats.intelligence, currentStats.wisdom) - 10) / 2,
    ),
  )
  const hp =
    (classGrowth.hpPerLevel ?? 0) + (speciesGrowth.hpPerLevel ?? 0) + conMod
  const mp =
    (classGrowth.mpPerLevel ?? 0) + (speciesGrowth.mpPerLevel ?? 0) + mindMod

  const interval = classGrowth.statBumpInterval ?? speciesGrowth.statBumpInterval ?? 0
  const bumpFires = interval > 0 && newLevel % interval === 0
  let nextStats = currentStats
  const bumpLabels: string[] = []
  if (bumpFires) {
    const combined: Partial<Character['stats']> = {}
    for (const key of Object.keys({
      ...(classGrowth.statBumps ?? {}),
      ...(speciesGrowth.statBumps ?? {}),
    }) as Array<keyof Character['stats']>) {
      const sum =
        (classGrowth.statBumps?.[key] ?? 0) +
        (speciesGrowth.statBumps?.[key] ?? 0)
      if (sum !== 0) combined[key] = sum
    }
    const bumped = { ...currentStats }
    for (const [k, v] of Object.entries(combined) as Array<[
      keyof Character['stats'],
      number,
    ]>) {
      bumped[k] = bumped[k] + v
      const abbr =
        k === 'strength'
          ? 'STR'
          : k === 'dexterity'
            ? 'DEX'
            : k === 'constitution'
              ? 'CON'
              : k === 'intelligence'
                ? 'INT'
                : k === 'wisdom'
                  ? 'WIS'
                  : 'CHA'
      bumpLabels.push(`+${v} ${abbr}`)
    }
    nextStats = bumped
  }
  return {
    hp,
    mp,
    nextStats,
    statText: bumpLabels.join(' '),
  }
}

interface MobTickResult {
  mob: Mob
  entries: LogEntry[]
}

// Mirrors tickConditions() for characters: applies DoT damage to a mob (capped
// so it can never reduce hp below 0) and decrements per-condition duration.
// stat-mod conditions don't currently alter mob combat stats — future work.
function tickMobConditions(mob: Mob, world: WorldContent): MobTickResult {
  if (!mob.conditions || mob.conditions.length === 0) {
    return { mob, entries: [] }
  }
  const defs = new Map(world.conditions.map((d) => [d.id, d]))
  const entries: LogEntry[] = []
  let hp = mob.hp
  const next: typeof mob.conditions = []

  for (const active of mob.conditions) {
    const def = defs.get(active.id)
    if (!def) continue

    if (def.kind === 'dot') {
      const dmg = def.params.damagePerTick ?? 0
      if (dmg > 0 && hp > 0) {
        const taken = Math.min(dmg, hp)
        hp -= taken
        entries.push({
          kind: 'condition-tick',
          text: `The ${mob.name} suffers from ${def.name}.`,
          amount: taken,
          conditionId: def.id,
          meta: {
            mobName: mob.name,
            conditionName: def.name,
            element: def.element,
          },
        })
      }
    }

    const remaining = active.remainingTicks - 1
    if (remaining > 0) {
      next.push({ ...active, remainingTicks: remaining })
    } else {
      entries.push({
        kind: 'condition-end',
        text: `The ${mob.name} shakes off ${def.name}.`,
        conditionId: def.id,
        meta: { mobName: mob.name, conditionName: def.name },
      })
    }
  }

  return { mob: { ...mob, hp, conditions: next }, entries }
}

type AttackDecision =
  | { kind: 'melee' }
  | { kind: 'spell'; spellId: string }
  | { kind: 'scroll'; inventoryIdx: number; spellId: string }

/** A character is a "magic user" for combat-AI purposes when they know at
 *  least one damage spell. We don't gate on class label because some hybrid
 *  classes (Spellblade, Tech-Mage) carry both spells and good melee — the
 *  spell list itself is the truest signal of intent. */
function knowsAnyDamageSpell(character: Character): boolean {
  for (const id of character.spells ?? []) {
    const s = getSpell(character.worldId, id)
    if (
      s &&
      (s.effect.kind === 'damage' || s.effect.kind === 'damage-over-time')
    ) {
      return true
    }
  }
  return false
}

function chooseCharacterAction(
  character: Character,
  mob: Mob,
  world: WorldContent,
): AttackDecision {
  const hpRatio = character.maxHp > 0 ? character.hp / character.maxHp : 1

  // Desperate: teleport out if available and HP critical.
  if (hpRatio < 0.2) {
    for (const id of character.spells ?? []) {
      const s = getSpell(character.worldId, id)
      if (s && s.effect.kind === 'teleport-safe' && character.magic >= s.magicCost) {
        return { kind: 'spell', spellId: s.id }
      }
    }
    // Or an escape scroll.
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = world.items.find((d) => d.id === item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        spell.effect.kind === 'teleport-safe' &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  // Wounded: heal if we have a heal spell with mana.
  if (hpRatio < 0.5) {
    for (const id of character.spells ?? []) {
      const s = getSpell(character.worldId, id)
      if (s && s.effect.kind === 'heal' && character.magic >= s.magicCost) {
        return { kind: 'spell', spellId: s.id }
      }
    }
    // Or a healing scroll — requires intelligence.
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = world.items.find((d) => d.id === item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        spell.effect.kind === 'heal' &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  // Magic users prefer spells over melee at every opportunity. Only fall
  // through to a swung weapon when out of MP for every damage spell — and
  // even then the explorer-tick consumes an MP potion first when one is
  // available, so reaching melee here means "truly out of options."
  const isMagicUser = knowsAnyDamageSpell(character)
  const damageSpells = (character.spells ?? [])
    .map((id) => getSpell(character.worldId, id))
    .filter((s): s is NonNullable<typeof s> =>
      !!s &&
      (s.effect.kind === 'damage' || s.effect.kind === 'damage-over-time') &&
      character.magic >= s.magicCost,
    )
  // Magic users always cast when castable; non-magic-users keep the old
  // ~40% spell preference to add flavor without making fighters look like
  // wizards.
  const casterPrefers = isMagicUser ? damageSpells.length > 0 : Math.random() < 0.4
  if (casterPrefers && damageSpells.length > 0) {
    const chosen = damageSpells[rand(damageSpells.length)]
    return { kind: 'spell', spellId: chosen.id }
  }

  // Magic user with no MP for any spell: try a damage scroll before resorting
  // to melee. Scrolls cost no MP — perfect last-ditch caster move.
  if (isMagicUser) {
    for (let i = 0; i < character.inventory.length; i++) {
      const item = character.inventory[i]
      if (!item.archetypeId) continue
      const def = world.items.find((d) => d.id === item.archetypeId)
      if (!def || def.kind !== 'scroll') continue
      const spell = getSpell(character.worldId, def.spellId)
      if (
        spell &&
        (spell.effect.kind === 'damage' || spell.effect.kind === 'damage-over-time') &&
        character.stats.intelligence >= spell.scrollIntRequirement
      ) {
        return { kind: 'scroll', inventoryIdx: i, spellId: spell.id }
      }
    }
  }

  void mob
  return { kind: 'melee' }
}

function removeInventoryEntry(
  character: Character,
  inventoryIdx: number,
): Character {
  const item = character.inventory[inventoryIdx]
  if (!item) return character
  const qty = item.quantity ?? 1
  if (qty > 1) {
    return {
      ...character,
      inventory: character.inventory.map((v, i) =>
        i === inventoryIdx ? { ...v, quantity: qty - 1 } : v,
      ),
    }
  }
  return {
    ...character,
    inventory: character.inventory.filter((_, i) => i !== inventoryIdx),
  }
}

function fight(p: Playing, world: WorldContent): Playing {
  if (p.state.kind !== 'fighting') return p
  let ambush = p.state.ambush
  const condResult = tickConditions(p.character, world)
  let log = p.log
  for (const e of condResult.entries) log = append(log, e)

  // Apply any DoTs on the mob (e.g. poison spell last turn).
  let mob = p.state.mob
  const mobCond = tickMobConditions(mob, world)
  mob = mobCond.mob
  for (const e of mobCond.entries) log = append(log, e)

  // If DoT finished the mob, award XP and exit.
  if (mob.hp === 0) {
    const awardedXp = Math.max(
      1,
      Math.round(mob.xpReward * xpScaleByDelta(mob.level - condResult.character.level)),
    )
    log = append(log, {
      kind: 'loot',
      text: `The ${mob.name} falls. (+${awardedXp} XP)`,
      meta: { mobName: mob.name, xpText: `+${awardedXp} XP`, mobDefeat: true },
    })
    const drops = rollLoot(mob)
    log = appendDropLogs(log, condResult.character, world, drops, mob.rarity)
    const greedEased = satisfy(condResult.character.drives, ['greed'])
    const trackedForBaddest = trackBaddest(
      { ...condResult.character, drives: greedEased },
      mob,
    )
    const dropArea = getArea(world, condResult.character.position.areaId)
    const dropRoom =
      dropArea.rooms[
        roomKey(
          condResult.character.position.x,
          condResult.character.position.y,
          condResult.character.position.z,
        )
      ]
    const looted = applyDrops(trackedForBaddest, world, drops, mob, {
      areaId: dropArea.id,
      roomName: dropRoom?.name,
    })
    const equipResult = applyAutoEquip(looted, world)
    for (const ev of equipResult.events) {
      log = append(log, equipLogEntry(equipResult.character, ev))
    }
    const postLoot = {
      ...equipResult.character,
      drives: stampWeight(equipResult.character.drives, equipResult.character, world),
    }
    const xpResult = applyXp(postLoot, awardedXp, log)
    return { character: xpResult.character, log: xpResult.log, state: { kind: 'exploring' } }
  }

  const consumed = maybeAutoConsume(condResult.character, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: { kind: 'fighting', mob, ambush },
    }
  }

  const area = getArea(world, condResult.character.position.areaId)
  let character = condResult.character
  const skipAttack = condResult.skipTurn

  // Ambush routing: while `ambush.ticksLeft > 0`, only the ambusher acts. If
  // the character is the ambusher we fall through to the normal char-attack
  // path and skip the mob's retaliation. If the mob is the ambusher we
  // short-circuit to a mob-only attack below. Either way, decrement at the
  // end of the tick.
  const charAmbushing = ambush?.side === 'character'
  const mobAmbushing = ambush?.side === 'mob'

  const bonuses = combatBonuses(character, world)
  const attackBonus = bonuses.attack ?? 0
  const defenseBonus = bonuses.defense ?? 0

  // Mob ambushing: skip character attack entirely, run mob attack with no
  // retaliation window. We still check mob-self-heal first because the mob
  // may be damaged enough to heal instead of strike.
  if (mobAmbushing) {
    const mobAttackResult = runMobAttack(
      character,
      mob,
      area,
      world,
      defenseBonus,
      log,
    )
    if (mobAttackResult.kind === 'died') {
      return mobAttackResult.playing
    }
    const nextAmbush = ambush
      ? ambush.ticksLeft > 1
        ? { ...ambush, ticksLeft: ambush.ticksLeft - 1 }
        : undefined
      : undefined
    return {
      character: mobAttackResult.character,
      log: mobAttackResult.log,
      state: { kind: 'fighting', mob: mobAttackResult.mob, ambush: nextAmbush },
    }
  }

  // Decide: melee, cast spell, or read a scroll?
  const decision: AttackDecision = skipAttack ? { kind: 'melee' } : chooseCharacterAction(character, mob, world)

  let mobHpAfter = mob.hp

  if (skipAttack) {
    log = append(log, {
      kind: 'narrative',
      text: `${character.name} cannot strike.`,
      meta: { name: character.name, mobName: mob.name },
    })
  } else if (decision.kind === 'spell' || decision.kind === 'scroll') {
    const spell = getSpell(character.worldId, decision.spellId)!
    let workingChar = character
    if (decision.kind === 'scroll') {
      workingChar = removeInventoryEntry(character, decision.inventoryIdx)
    }
    const result = castSpell({
      character: workingChar,
      mob,
      world,
      spell,
      free: decision.kind === 'scroll',
      source: decision.kind === 'scroll' ? 'scroll' : 'cast',
    })
    for (const e of result.entries) log = append(log, e)
    character = result.character
    if (result.mob) mob = result.mob
    mobHpAfter = mob.hp

    // Teleport escape exits combat.
    if (result.teleported) {
      return { character, log, state: { kind: 'exploring' } }
    }
  } else {
    // Level-delta bias. Tuned so a 5-level gap roughly doubles damage dealt
    // and halves damage taken in the favoured direction, with the effect
    // saturating beyond ±5 so blue- and red-con fights stay decisive but
    // never turn into one-shots at extreme mismatches.
    const levelDelta = character.level - mob.level
    const outgoingMult = levelScaleOutgoing(levelDelta)
    const baseCharDmg = roll(4) + mod(character.stats.strength) + attackBonus - mob.defense
    const charDmg = Math.max(1, Math.round(baseCharDmg * outgoingMult))
    mobHpAfter = Math.max(0, mob.hp - charDmg)
    const { severity, verb } = damageVerb(charDmg, mob.maxHp, character.worldId)
    const weaponName = character.equipped.weapon?.name
    const withSuffix = weaponName
      ? `${character.name} ${verb} the ${mob.name} with ${weaponName}.`
      : `${character.name} ${verb} the ${mob.name}.`
    log = append(log, {
      kind: 'damage',
      text: withSuffix,
      amount: charDmg,
      severity,
      meta: {
        name: character.name,
        mobName: mob.name,
        verb,
        severity,
        itemName: weaponName,
      },
    })
  }

  if (mobHpAfter === 0) {
    const awardedXp = Math.max(
      1,
      Math.round(mob.xpReward * xpScaleByDelta(mob.level - character.level)),
    )
    log = append(log, {
      kind: 'loot',
      text: `The ${mob.name} falls. (+${awardedXp} XP)`,
      meta: { mobName: mob.name, xpText: `+${awardedXp} XP`, mobDefeat: true },
    })
    const drops = rollLoot(mob)
    log = appendDropLogs(log, character, world, drops, mob.rarity)
    const greedEased = satisfy(character.drives, ['greed'])
    const trackedForBaddest = trackBaddest(
      { ...character, drives: greedEased },
      mob,
    )
    const dropRoom =
      area.rooms[
        roomKey(character.position.x, character.position.y, character.position.z)
      ]
    const looted = applyDrops(trackedForBaddest, world, drops, mob, {
      areaId: area.id,
      roomName: dropRoom?.name,
    })
    const equipResult = applyAutoEquip(looted, world)
    for (const ev of equipResult.events) {
      log = append(log, equipLogEntry(equipResult.character, ev))
    }
    const postLoot = {
      ...equipResult.character,
      drives: stampWeight(equipResult.character.drives, equipResult.character, world),
    }
    const xpResult = applyXp(postLoot, awardedXp, log)
    return {
      character: xpResult.character,
      log: xpResult.log,
      state: { kind: 'exploring' },
    }
  }

  // Character-ambush active → mob doesn't retaliate this tick. Decrement and
  // keep the fight going.
  if (charAmbushing) {
    const nextAmbush = ambush && ambush.ticksLeft > 1
      ? { ...ambush, ticksLeft: ambush.ticksLeft - 1 }
      : undefined
    return {
      character,
      log,
      state: {
        kind: 'fighting',
        mob: { ...mob, hp: mobHpAfter },
        ambush: nextAmbush,
      },
    }
  }

  // Mob self-heal: instead of attacking, burn a charge if hurt badly enough.
  // Fires ahead of the retaliation so the heal is visible even when the mob
  // would otherwise have been one-shot by the player this round.
  const mobWorking: Mob = { ...mob, hp: mobHpAfter }
  if (
    mobWorking.hp > 0 &&
    mobWorking.hp < mobWorking.maxHp * 0.35 &&
    mobWorking.healChargesLeft > 0
  ) {
    const heal = mobWorking.healAmount ?? Math.max(3, Math.round(mobWorking.maxHp * 0.35))
    const healed = Math.min(mobWorking.maxHp, mobWorking.hp + heal)
    const actual = healed - mobWorking.hp
    log = append(log, {
      kind: 'heal',
      text: `The ${mobWorking.name} patches itself up.`,
      amount: actual,
      meta: { mobName: mobWorking.name },
    })
    const healedMob: Mob = {
      ...mobWorking,
      hp: healed,
      healChargesLeft: mobWorking.healChargesLeft - 1,
    }
    return {
      character,
      log,
      state: { kind: 'fighting', mob: healedMob, ambush },
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const baseMobDmg = mob.attack + roll(3) - 2 - mod(character.stats.dexterity) - defenseBonus
  const mobDmg = Math.max(1, Math.round(baseMobDmg * incomingMult))
  const charHpAfter = Math.max(0, character.hp - mobDmg)
  const mobAttack = damageVerb(mobDmg, character.maxHp, character.worldId)

  log = append(log, {
    kind: 'damage',
    text: `The ${mob.name} ${mobAttack.verb} ${character.name}.`,
    amount: mobDmg,
    severity: mobAttack.severity,
    meta: {
      name: character.name,
      mobName: mob.name,
      verb: mobAttack.verb,
      severity: mobAttack.severity,
    },
  })

  let postHitChar = character
  if (charHpAfter > 0 && mob.applyOnHit && Math.random() < mob.applyOnHit.chance) {
    const applied = applyCondition(
      postHitChar,
      world,
      mob.applyOnHit.conditionId,
      `the ${mob.name}`,
    )
    postHitChar = applied.character
    if (applied.entry) log = append(log, applied.entry)
  }

  if (charHpAfter === 0) {
    const rk = roomKey(character.position.x, character.position.y, character.position.z)
    const room = area.rooms[rk]
    const record: DeathRecord = {
      at: Date.now(),
      cause: `Fell to the ${mob.name}`,
      areaId: area.id,
      roomName: room?.name,
      roomKey: rk,
      mobName: mob.name,
    }
    const respawn: Position = character.lastSafePosition ?? {
      areaId: area.id,
      x: area.startX,
      y: area.startY,
      z: area.startZ,
    }
    const respawnArea = getArea(world, respawn.areaId)
    const respawnRoom = respawnArea.rooms[roomKey(respawn.x, respawn.y, respawn.z)]
    const respawnText = respawnRoom
      ? `They wake again in the ${respawnRoom.name}.`
      : "They wake again where it's safe."
    log = append(log, {
      kind: 'narrative',
      text: `${character.name} falls to the ${mob.name}. ${respawnText}`,
      meta: {
        name: character.name,
        mobName: mob.name,
        areaId: area.id,
        roomKey: roomKey(respawn.x, respawn.y, respawn.z),
        roomName: respawnRoom?.name,
      },
    })
    const penalty = applyDeathPenalty(character)
    for (const entry of penalty.entries) log = append(log, entry)
    return {
      character: {
        ...penalty.character,
        hp: penalty.character.maxHp,
        position: respawn,
        deaths: [...penalty.character.deaths, record],
        conditions: [],
      },
      log,
      state: { kind: 'exploring' },
    }
  }

  // Ambush counter was only consumed by the char-only / mob-only branches
  // above; reaching this line means neither fired, so either ambush is
  // already cleared or it wasn't set.
  return {
    character: { ...postHitChar, hp: charHpAfter },
    log,
    state: { kind: 'fighting', mob: { ...mob, hp: mobHpAfter }, ambush },
  }
}

/**
 * Runs a single mob→character attack round (no character action). Used by
 * the mob-ambush path where the character doesn't strike back. Returns the
 * same `died` sentinel shape that the full fight function uses so the caller
 * can propagate a respawn. Mob-heal fires ahead of the strike if applicable.
 */
type MobAttackOutcome =
  | { kind: 'alive'; character: Character; mob: Mob; log: LogEntry[] }
  | { kind: 'died'; playing: Playing }

function runMobAttack(
  character: Character,
  mob: Mob,
  area: Area,
  world: WorldContent,
  defenseBonus: number,
  log: LogEntry[],
): MobAttackOutcome {
  // Self-heal first — an ambushing mob that's somehow already hurt still
  // prefers survival over damage.
  if (mob.hp < mob.maxHp * 0.35 && mob.healChargesLeft > 0) {
    const heal = mob.healAmount ?? Math.max(3, Math.round(mob.maxHp * 0.35))
    const healed = Math.min(mob.maxHp, mob.hp + heal)
    log = append(log, {
      kind: 'heal',
      text: `The ${mob.name} patches itself up.`,
      amount: healed - mob.hp,
      meta: { mobName: mob.name },
    })
    return {
      kind: 'alive',
      character,
      mob: { ...mob, hp: healed, healChargesLeft: mob.healChargesLeft - 1 },
      log,
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const base = mob.attack + roll(3) - 2 - mod(character.stats.dexterity) - defenseBonus
  const dmg = Math.max(1, Math.round(base * incomingMult))
  const hpAfter = Math.max(0, character.hp - dmg)
  const verb = damageVerb(dmg, character.maxHp, character.worldId)
  log = append(log, {
    kind: 'damage',
    text: `The ${mob.name} ${verb.verb} ${character.name}.`,
    amount: dmg,
    severity: verb.severity,
    meta: {
      name: character.name,
      mobName: mob.name,
      verb: verb.verb,
      severity: verb.severity,
    },
  })

  if (hpAfter === 0) {
    const rk = roomKey(character.position.x, character.position.y, character.position.z)
    const room = area.rooms[rk]
    const record: DeathRecord = {
      at: Date.now(),
      cause: `Fell to the ${mob.name}`,
      areaId: area.id,
      roomName: room?.name,
      roomKey: rk,
      mobName: mob.name,
    }
    const respawn: Position = character.lastSafePosition ?? {
      areaId: area.id,
      x: area.startX,
      y: area.startY,
      z: area.startZ,
    }
    const respawnArea = getArea(world, respawn.areaId)
    const respawnRoom = respawnArea.rooms[roomKey(respawn.x, respawn.y, respawn.z)]
    const respawnText = respawnRoom
      ? `They wake again in the ${respawnRoom.name}.`
      : "They wake again where it's safe."
    log = append(log, {
      kind: 'narrative',
      text: `${character.name} falls to the ${mob.name}. ${respawnText}`,
      meta: {
        name: character.name,
        mobName: mob.name,
        areaId: area.id,
        roomKey: roomKey(respawn.x, respawn.y, respawn.z),
        roomName: respawnRoom?.name,
      },
    })
    const penalty = applyDeathPenalty(character)
    for (const entry of penalty.entries) log = append(log, entry)
    return {
      kind: 'died',
      playing: {
        character: {
          ...penalty.character,
          hp: penalty.character.maxHp,
          position: respawn,
          deaths: [...penalty.character.deaths, record],
          conditions: [],
        },
        log,
        state: { kind: 'exploring' },
      },
    }
  }

  return { kind: 'alive', character: { ...character, hp: hpAfter }, mob, log }
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
        kind: 'narrative',
        text: `The world seems to move by faster now…`,
        meta: { name: p.character.name },
      }),
    }
  }
  return p
}

export function runTick(p: Playing, world: WorldContent): Playing {
  // Bump the character's lifetime tick counter at the top of every tick so
  // every downstream update (and the roster card) sees the fresh value.
  const bumped: Playing = {
    ...p,
    character: { ...p.character, ticks: (p.character.ticks ?? 0) + 1 },
  }
  // Then check whether the freshly-bumped tick count crosses an auto-ramp
  // milestone. The narrative log entry it appends carries the speed-up
  // beat so the player notices the cadence change.
  const withTick = maybeRampTickSpeed(bumped)
  switch (withTick.state.kind) {
    case 'exploring':
      return explore(withTick, world)
    case 'resting':
      return rest(withTick, world)
    case 'meditating':
      return meditate(withTick, world)
    case 'fighting':
      return fight(withTick, world)
    case 'using-room':
      return useRoom(withTick, world)
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
    { kind: 'chapter', text: `${character.name} stirs.`, meta: { name: character.name } },
  ]
  if (options.discovery) {
    entries.push({ kind: 'area', text: area.name })
  }
  if (room) {
    entries.push({
      kind: 'narrative',
      text: `${character.name} stands in the ${room.name}. ${room.description}`,
      meta: {
        name: character.name,
        areaId: area.id,
        roomKey: roomKey(room.x, room.y, room.z),
        roomName: room.name,
      },
    })
  }
  return entries
}
