import { roomKey, type Area } from '../areas'
import type { Character } from '../character'
import { formatActorName } from '../character'
import { clearConditions } from '../conditions'
import type { LogEntry } from '../log'
import { Rng } from '../rng'
import { getWorldManifest, type WorldContent } from '../worlds'
import { type Drives, grow } from './drives'
import { buffMultipliers } from './equip'
import {
  blessingFor,
  blessingRestMultiplier,
  deityWord as favorDeityWord,
  favorTier,
  favorTierName,
} from './favor'
import {
  formatMeditateSummaryLog,
  formatRestSummaryLog,
} from './logLines'
import { append } from './logCap'
import { stampWeight } from './navigation'
import type { GameState } from './state'
import { rollEncounterFor } from './encounter'
import type { Playing } from './tick'
import { getArea } from './worldLookup'
import type { Mob } from '../mobs'

// =============================================================================
// Tunables
// =============================================================================

const REST_CHANCE = 0.12
const REST_DURATION = 6
const REST_HEAL = 2
const REST_FATIGUE_RELIEF = 15

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

// Resting and meditating slow hunger relative to EXPLORE_GROWTH's rate
// (3/tick). Resting is an active-rest breather — the body still burns
// calories, just at 40%. Meditating is a mind discipline with almost no
// physical exertion — 25%. Fractional deltas are fine: `grow()` clamps
// to DRIVE_MAX and every UI readout rounds before display.
const REST_HUNGER_PER_TICK = 3 * 0.40
const MEDITATE_HUNGER_PER_TICK = 3 * 0.25

const REST_GROWTH: Partial<Drives> = {
  hunger: REST_HUNGER_PER_TICK,
  greed: 1,
  curiosity: 1,
}

const MEDITATE_GROWTH: Partial<Drives> = {
  hunger: MEDITATE_HUNGER_PER_TICK,
  greed: 1,
  curiosity: 1,
}

/** Rest / meditate restorative gains accelerate the longer the character
 *  stays in the state. Multiplier is `1 + STREAK_GROWTH_PER_TICK *
 *  ticksElapsed`, capped at STREAK_MAX_MULT. Tuned so a long sit-down in
 *  a safe room pays off roughly 2-3× the first tick's restore around
 *  the 15-tick mark, with diminishing returns beyond. */
const STREAK_GROWTH_PER_TICK = 0.05
const STREAK_MAX_MULT = 3

function streakMultiplier(ticksElapsed: number): number {
  return Math.min(STREAK_MAX_MULT, 1 + STREAK_GROWTH_PER_TICK * Math.max(0, ticksElapsed))
}

/** Filler lines used by the cadenced "nothing much happens" beat. Split
 *  by kind — rest gets physical filler, meditate gets mental filler —
 *  so the voice matches the action. "…" is a valid line; a silent beat
 *  reads as thinking / breathing without spelling it out. */
const REST_FILLER_LINES: readonly string[] = [
  '…',
  '{name} breathes steadily.',
  '{name} shifts position.',
  '{name} stretches, slowly.',
  'A moment passes.',
  'The room is still.',
  'Soft flicker of firelight.',
  "{name}'s pulse slows.",
]

const MEDITATE_FILLER_LINES: readonly string[] = [
  '…',
  '{name} breathes in, out.',
  'Meditation deepens.',
  '{name} follows a distant thought.',
  'A moment passes.',
  'The room is still.',
  "{name}'s thoughts quiet.",
  'Awareness drifts, then settles.',
]

function pickFillerLine(kind: 'resting' | 'meditating', name: string, rng: Rng): string {
  const pool = kind === 'resting' ? REST_FILLER_LINES : MEDITATE_FILLER_LINES
  const tmpl = rng.pick(pool)
  return tmpl.replace(/\{name\}/g, name)
}

/** Re-rolls the next-filler trigger tick. Filler lines fire every 3-5
 *  ticks (inclusive of both bounds). Offsets from the current elapsed
 *  count so each line is 3-5 ticks *after* the previous one. */
function rollNextFillerAt(ticksElapsed: number, rng: Rng): number {
  return ticksElapsed + 3 + rng.nextInt(3)
}

// =============================================================================
// Restorative-rate helpers
// =============================================================================

/**
 * Per-tick HP gain while resting. Scales with level (a veteran recovers
 * faster) and CON mod (a tougher body does too). Minimum 1. Equipped
 * rest-boost items (Stone of Deep Rest, Neural Relaxant Dose, Circadian
 * Regulator) multiply the final number by (1 + restBoost).
 */
function restHealAmount(c: Character, world: WorldContent): number {
  const conMod = Math.max(0, Math.floor((c.stats.constitution - 10) / 2))
  const base = Math.max(1, REST_HEAL + conMod + Math.floor(c.level / 3))
  const boost = buffMultipliers(c, world).restBoost
  // An active blessing (any tier) scales rest healing — gods help those
  // who help themselves to a chapel candle.
  const bless = blessingRestMultiplier(c)
  return Math.max(1, Math.round(base * (1 + boost) * bless))
}

/**
 * Per-tick MP gain while meditating. Scales with level and whichever of
 * INT/WIS is higher. Minimum 1. Rest-boost items multiply the result.
 */
function meditateMpAmount(c: Character, world: WorldContent): number {
  const mindMod = Math.max(
    0,
    Math.floor(
      (Math.max(c.stats.intelligence, c.stats.wisdom) - 10) / 2,
    ),
  )
  const base = Math.max(1, MEDITATE_MP + mindMod + Math.floor(c.level / 3))
  const boost = buffMultipliers(c, world).restBoost
  return Math.max(1, Math.round(base * (1 + boost)))
}

/** Meditating recovers some HP too — roughly half the flat rest rate,
 *  with no CON bonus (this is a mind discipline, not a body one). */
function meditateHpAmount(c: Character, world: WorldContent): number {
  const base = Math.max(1, MEDITATE_HP + Math.floor(c.level / 4))
  const boost = buffMultipliers(c, world).restBoost
  return Math.max(1, Math.round(base * (1 + boost)))
}

/**
 * Rolls whether a resting/meditating character is ambushed this tick. Safe
 * rooms cut the chance in half; returns a spawned mob ready to drop into a
 * fighting-state with `ambush.side='mob'` or null if nothing happens.
 */
function tryRestAmbush(
  p: Playing,
  world: WorldContent,
  rng: Rng,
): Mob | null {
  const area = getArea(world, p.character.position.areaId)
  const room = area.rooms[roomKey(p.character.position.x, p.character.position.y, p.character.position.z)]
  const safeFamily = room && (room.type === 'safe' || room.type === 'inn' || room.type === 'shrine')
  const chance = safeFamily ? REST_AMBUSH_CHANCE / 2 : REST_AMBUSH_CHANCE
  if (!rng.chance(chance)) return null
  const type = room?.type ?? 'corridor'
  return rollEncounterFor(world, type, area.level ?? 1, rng)
}

// =============================================================================
// State handlers
// =============================================================================

export function rest(p: Playing, world: WorldContent, rng: Rng): Playing {
  if (p.state.kind !== 'resting') return p
  // Ambush roll first — if interrupted, transition to fighting with
  // mob-side ambush regardless of level.
  const ambushMob = tryRestAmbush(p, world, rng)
  if (ambushMob) {
    const log = append(p.log, {
      kind: 'narrative',
      text: `${p.character.name}'s rest is shattered — a ${ambushMob.name} is on them!`,
      meta: { name: p.character.name, mobName: ambushMob.name, mobRarity: ambushMob.rarity },
    })
    return {
      character: p.character,
      log,
      state: {
        kind: 'fighting',
        mob: ambushMob,
        ambush: { side: 'mob', ticksLeft: 1 },
      },
    }
  }

  // Streak bookkeeping — scales restore up with consecutive ticks in the
  // same state and accumulates totals for the end-of-session summary.
  const ticksElapsed = p.state.ticksElapsed ?? 0
  const mult = streakMultiplier(ticksElapsed)
  const baseHeal = restHealAmount(p.character, world)
  const scaledHeal = Math.max(1, Math.round(baseHeal * mult))
  const healed = Math.min(p.character.maxHp, p.character.hp + scaledHeal)
  const actualHeal = healed - p.character.hp
  const ticksLeft = p.state.ticksLeft - 1
  const done = healed >= p.character.maxHp || ticksLeft <= 0

  const grownDrives = stampWeight(grow(p.character.drives, REST_GROWTH), p.character, world)
  const newFatigue = Math.max(0, grownDrives.fatigue - REST_FATIGUE_RELIEF)
  const drives: Drives = { ...grownDrives, fatigue: newFatigue }

  const totalHp = (p.state.hpRestored ?? 0) + actualHeal
  const nextTicksElapsed = ticksElapsed + 1
  let nextFillerAt = p.state.nextFillerAt ?? rollNextFillerAt(0, rng)

  let log = p.log
  // Cadenced filler replaces the old per-tick adverb line. Fires when the
  // streak crosses the pre-rolled trigger; re-rolls the trigger to keep
  // the cadence irregular (3-5 ticks between lines).
  if (!done && nextTicksElapsed >= nextFillerAt) {
    log = append(log, {
      kind: 'narrative',
      text: pickFillerLine('resting', p.character.name, rng),
      meta: { name: p.character.name },
    })
    nextFillerAt = rollNextFillerAt(nextTicksElapsed, rng)
  }

  if (done) {
    // End-of-session summary — qualitative adverb in the main text so
    // it reads cleanly with log numbers off, plus the hard count in a
    // trailing parenthetical that LogPanel strips via
    // INLINE_NUMERIC_PAREN when `logNumbers` is disabled. Tick count
    // is deliberately omitted — it's implementation detail.
    log = append(log, formatRestSummaryLog(formatActorName(p.character, 'log'), totalHp, p.character.maxHp))
    const cleared = clearConditions({
      ...p.character,
      hp: healed,
      drives,
      restCooldown: REST_COOLDOWN_TICKS,
    })
    if (cleared.entry) log = append(log, cleared.entry)
    // Shrine rest applies a blessing keyed off the character's current
    // favor tier. Tier 0 (Unseen) gets nothing — they haven't earned the
    // ear of the gods yet. Tier 3+ also tops up HP/MP on completion as
    // the proposed reward; tier 4 layers on the severity floor that
    // takes effect inside combat math.
    const area = getArea(world, cleared.character.position.areaId)
    const restingRoom = area.rooms[roomKey(
      cleared.character.position.x,
      cleared.character.position.y,
      cleared.character.position.z,
    )]
    let next: Character = cleared.character
    if (restingRoom?.type === 'shrine') {
      const tier = favorTier(next.favor)
      // Narrow tier 0 out so the LogMeta tier slot (1|2|3|4|undefined)
      // accepts the value below. The `>= 1` check already guarantees this
      // at runtime; the cast just makes the narrowing visible to TS,
      // since favorTier's return is a 0|1|2|3|4 numeric union.
      if (tier >= 1) {
        const activeTier = tier as 1 | 2 | 3 | 4
        const blessing = blessingFor(next)
        if (blessing) {
          const manifest = getWorldManifest(next.worldId)
          const tName = favorTierName(activeTier, manifest)
          const dWord = favorDeityWord(manifest)
          // Tier 3+ — full HP/MP top-up on completion. Tier 1/2 just
          // get the regen multiplier and combat boost respectively;
          // they don't fully heal.
          if (activeTier >= 3) {
            next = { ...next, hp: next.maxHp, magic: next.maxMagic }
          }
          next = { ...next, blessing }
          log = append(log, {
            kind: 'shrine-blessing',
            text: `The ${dWord} settle their gaze on ${formatActorName(next, 'log')} — Blessing of the ${tName} takes hold.`,
            meta: {
              name: formatActorName(next, 'log'),
              tierName: tName,
              tier: activeTier,
            },
          })
        }
      }
    }
    return {
      character: next,
      log,
      state: { kind: 'exploring' },
    }
  }
  return {
    character: { ...p.character, hp: healed, drives },
    log,
    state: {
      kind: 'resting',
      ticksLeft,
      ticksElapsed: nextTicksElapsed,
      hpRestored: totalHp,
      mpRestored: p.state.mpRestored ?? 0,
      nextFillerAt,
    },
  }
}

export function meditate(p: Playing, world: WorldContent, rng: Rng): Playing {
  if (p.state.kind !== 'meditating') return p
  const ambushMob = tryRestAmbush(p, world, rng)
  if (ambushMob) {
    const log = append(p.log, {
      kind: 'narrative',
      text: `${p.character.name}'s meditation breaks — a ${ambushMob.name} strikes!`,
      meta: { name: p.character.name, mobName: ambushMob.name, mobRarity: ambushMob.rarity },
    })
    return {
      character: p.character,
      log,
      state: {
        kind: 'fighting',
        mob: ambushMob,
        ambush: { side: 'mob', ticksLeft: 1 },
      },
    }
  }

  const ticksElapsed = p.state.ticksElapsed ?? 0
  const mult = streakMultiplier(ticksElapsed)
  const baseMp = meditateMpAmount(p.character, world)
  const baseHp = meditateHpAmount(p.character, world)
  const mpGain = Math.max(1, Math.round(baseMp * mult))
  const hpGain = Math.max(1, Math.round(baseHp * mult))
  const newMagic = Math.min(p.character.maxMagic, p.character.magic + mpGain)
  const newHp = Math.min(p.character.maxHp, p.character.hp + hpGain)
  const actualMp = newMagic - p.character.magic
  const actualHp = newHp - p.character.hp
  const ticksLeft = p.state.ticksLeft - 1
  const done =
    (newMagic >= p.character.maxMagic && newHp >= p.character.maxHp) ||
    ticksLeft <= 0

  const grownDrives = stampWeight(grow(p.character.drives, MEDITATE_GROWTH), p.character, world)
  const newFatigue = Math.max(0, grownDrives.fatigue - Math.round(REST_FATIGUE_RELIEF / 2))
  const drives: Drives = { ...grownDrives, fatigue: newFatigue }

  const totalHp = (p.state.hpRestored ?? 0) + actualHp
  const totalMp = (p.state.mpRestored ?? 0) + actualMp
  const nextTicksElapsed = ticksElapsed + 1
  let nextFillerAt = p.state.nextFillerAt ?? rollNextFillerAt(0, rng)

  let log = p.log
  if (!done && nextTicksElapsed >= nextFillerAt) {
    log = append(log, {
      kind: 'narrative',
      text: pickFillerLine('meditating', p.character.name, rng),
      meta: { name: p.character.name },
    })
    nextFillerAt = rollNextFillerAt(nextTicksElapsed, rng)
  }

  if (done) {
    // Qualitative adverb in the main clause, numeric totals in a
    // trailing parenthetical that LogPanel's INLINE_NUMERIC_PAREN
    // regex strips when log numbers are disabled. Tick count is
    // never surfaced — it's implementation detail. MP first when it
    // was the primary draw, HP second. Falls back to the
    // clear-headed line when nothing actually restored.
    log = append(
      log,
      formatMeditateSummaryLog(
        formatActorName(p.character, 'log'),
        totalMp,
        p.character.maxMagic,
        totalHp,
        p.character.maxHp,
      ),
    )
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
    state: {
      kind: 'meditating',
      ticksLeft,
      ticksElapsed: nextTicksElapsed,
      hpRestored: totalHp,
      mpRestored: totalMp,
      nextFillerAt,
    },
  }
}

// =============================================================================
// Coordinator: maybe-enter from explore()
//
// Encapsulates the rest-or-meditate decision that explore() makes after
// movement. Returns a new Playing transition when the character should sit
// down, or null when explore() should continue with movement / encounters.
// All early-returning — most ticks the character isn't in a safe-family
// room, isn't wounded, and doesn't want a blessing, so the predicate
// kicks out before computing anything expensive.
// =============================================================================

export interface MaybeEnterRestArgs {
  c: Character
  area: Area
  log: LogEntry[]
}

export function maybeEnterRestOrMeditate(
  args: MaybeEnterRestArgs,
  rng: Rng,
): { character: Character; log: LogEntry[]; state: GameState } | null {
  const { c, area, log } = args
  const restAllowed = (c.restCooldown ?? 0) <= 0
  if (!restAllowed) return null

  const currentRoom = area.rooms[roomKey(c.position.x, c.position.y, c.position.z)]
  const isSafeFamily =
    currentRoom?.type === 'safe' ||
    currentRoom?.type === 'inn' ||
    currentRoom?.type === 'shrine'
  if (!isSafeFamily) return null

  const hpRatio = c.maxHp > 0 ? c.hp / c.maxHp : 1
  const mpRatio = c.maxMagic > 0 ? c.magic / c.maxMagic : 1
  const wounded = c.hp < c.maxHp

  // Standing on a shrine with unspent favor and no active blessing — sit
  // down and pray. The deity-pull (`shrinePull`) routes the character here
  // when no body drive is more pressing; once they arrive the blessing
  // pickup goes through the same rest path so it composes with HP regen
  // and the existing ambush roll.
  const wantsBlessing =
    currentRoom?.type === 'shrine' &&
    !c.blessing &&
    favorTier(c.favor) >= 1

  // Rest only triggers in a safe-family room so the "cannot rest near a
  // hostile mob" rule is satisfied structurally — encounters roll outside
  // those room types, so the player can't sit down somewhere dangerous.
  // The base coin-flip is upgraded to a guaranteed sit-down once HP falls
  // below the force-rest ratio so a wounded character actually recovers
  // instead of bleeding out across the floor.
  const wantsRest =
    wantsBlessing ||
    (wounded && (hpRatio < REST_FORCE_HP_RATIO || rng.chance(REST_CHANCE)))
  if (wantsRest) {
    const text = currentRoom
      ? `${formatActorName(c, 'log')} pauses to catch their breath in the ${currentRoom.name}.`
      : `${formatActorName(c, 'log')} pauses to rest.`
    return {
      character: c,
      log: append(log, {
        kind: 'narrative',
        text,
        meta: {
          name: formatActorName(c, 'log'),
          areaId: area.id,
          roomKey: currentRoom ? roomKey(currentRoom.x, currentRoom.y, currentRoom.z) : undefined,
          roomName: currentRoom?.name,
        },
      }),
      state: { kind: 'resting', ticksLeft: REST_DURATION },
    }
  }

  // Meditate — MP-focused alternative. Available to characters with real
  // INT or WIS; fighters without the mind for it stick to rest. Critically
  // low MP forces the sit-down, matching the rest path's behaviour for
  // low HP.
  const minded =
    Math.max(c.stats.intelligence, c.stats.wisdom) >= MEDITATE_STAT_MIN
  const lowMagic = c.maxMagic > 0 && c.magic < c.maxMagic * 0.6
  const wantsMeditate =
    lowMagic &&
    minded &&
    (mpRatio < MEDITATE_FORCE_MP_RATIO || rng.chance(MEDITATE_CHANCE))
  if (wantsMeditate) {
    const text = currentRoom
      ? `${formatActorName(c, 'log')} settles into meditation in the ${currentRoom.name}.`
      : `${formatActorName(c, 'log')} settles into meditation.`
    return {
      character: c,
      log: append(log, {
        kind: 'narrative',
        text,
        meta: {
          name: formatActorName(c, 'log'),
          areaId: area.id,
          roomKey: currentRoom ? roomKey(currentRoom.x, currentRoom.y, currentRoom.z) : undefined,
          roomName: currentRoom?.name,
        },
      }),
      state: { kind: 'meditating', ticksLeft: MEDITATE_DURATION },
    }
  }

  return null
}

