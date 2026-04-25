import {
  manhattan,
  neighborsOf,
  roomKey,
  stepTowards,
  visitedKey,
  type Area,
  type Position,
} from '../areas'
import { Rng } from '../rng'
import type { Character, DeathRecord, LevelSegment, LevelUpRecord } from '../character'
import { formatActorName, resolveTitle, titleIndexForLevel, xpToNextLevel } from '../character'
import {
  damageVerb,
  deathClause,
  deathSentence,
  formatAttackLog,
  levelScaleIncoming,
  levelScaleOutgoing,
  type DamageFamily,
} from '../combat'
import { applyCondition, applyMobCondition, clearConditions, tickConditions } from '../conditions'
import { RARITIES, rollMobRarity, type Rarity, type ScrollLevel } from '../items'
import type { DamageSeverity, LogEntry } from '../log'
import { mobResistMultiplier, spawn, type Mob } from '../mobs'
import {
  castSpell,
  getSpell,
  registerGeneratedSpell,
  spellUnlocksAt,
  type SpellDef,
} from '../spells'
import { getWorldManifest, type WorldContent, type WorldManifest } from '../worlds'
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
import { deriveJournalEntries } from './journal'
import { applyDeathPenalty } from './death'
import {
  applyAutoEquip,
  buffMultipliers,
  combatBonuses,
  equipLogEntry,
  isRedundantEquip,
} from './equip'
import {
  formatCombinedKillLog,
  formatGoldPickupLog,
  formatMeditateSummaryLog,
  formatMobDefeatLog,
  formatMobSelfHealLog,
  formatRestSummaryLog,
} from './logLines'
import {
  applyChestEntries,
  applyDrops,
  combatRewardMult,
  resolveChestDrops,
  rollCuratedLoot,
  rollDropRarity,
  rollLoot,
  type Drops,
  type RewardContext,
} from './loot'
import { pickItemsToSacrifice } from './sacrifice'
import { pickItemsToSell } from './sell'
import type { GameState } from './state'
import type { TickSpeedId } from '../themes/types'
import { weightDriveValue } from './weight'

export const LOG_CAP = 200

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

function pickLevelUpVerb(rng: Rng): string {
  return rng.pick(LEVEL_UP_VERBS)
}

// Funny rotations for the title-earned chapter line. All take bare name
// + bare title text — the line announces a fresh title, so it shouldn't
// route through formatActorName (which would try to pre-apply that very
// title). Tone is wry / understated, matching the dry game voice.
const TITLE_EARNED_LINES: Array<(name: string, title: string) => string> = [
  (n, t) => `Now everyone's gotta call ${n} the ${t}.`,
  (n, t) => `${n}'s a ${t} now, apparently.`,
  (n, t) => `Word's getting around. They're calling ${n} the ${t}.`,
  (n, t) => `The archive scratches in another line: ${n}, the ${t}.`,
  (n, t) => `Add another line to the books — ${n}, the ${t}.`,
  (n, t) => `${n} has earned a new title: ${t}. Whether ${n} wanted one or not.`,
]

function pickTitleEarnedLine(name: string, title: string, rng: Rng): string {
  const fn = rng.pick(TITLE_EARNED_LINES)
  return fn(name, title)
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
const ENCOUNTER_CHANCE = 0.30
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
/** How many ticks the character waits in the `generating-area` state
 *  before giving up and bouncing back to exploring with a "not yet taken
 *  shape" message. Generating-area ticks every 2s (TICK_MS), so 120 ticks
 *  ≈ 4 minutes — generous enough to cover slow local models and cold
 *  cloud starts. If the LLM responds sooner the .then() callback in
 *  App.tsx transitions out immediately regardless of ticksLeft, so this
 *  is purely a network-failure bail-out. */
export const AREA_GEN_TIMEOUT_TICKS = 120
/** Locked-chest pacing constants. Drops accumulate in `character.lockedChest`
 *  for `BASE + items.length × PER_ITEM` ticks (capped at MAX) before the
 *  chest unlatches and the items merge into inventory. The wait is the
 *  diegetic surface that hides any post-combat asynchrony — issue #75
 *  per-descriptor sprite generation runs invisibly inside this window
 *  when that lands. Values tuned so a typical kill (1–2 items) waits ~6–10s
 *  at 1× tick speed (TICK_MS.exploring = 2s) — long enough for the player
 *  to register the chest, short enough to avoid feeling padded. */
const CHEST_BASE_TICKS = 3
const CHEST_PER_ITEM_TICKS = 1
const CHEST_MAX_TICKS = 12
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

function mod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Class ids that open combat with a stealth check — rogues and rangers
 *  (and world equivalents) get the first-round advantage if the roll hits.
 *  Keyed by class id so any world whose class shares an id benefits. */
const STEALTH_CLASS_IDS: readonly string[] = ['rogue', 'ranger']

/**
 * Rolls a DEX-based stealth check for rogue/ranger classes. Returns true
 * when the character surprises the mob, which callers fold into a
 * character-side ambush (first round free + bonus damage).
 *
 *   success_chance = 0.25 + (DEX - 10) * 0.05, clamped to [0.1, 0.8]
 *
 * So a mid-game DEX 14 rogue ambushes ~45 % of the time, a DEX 18 endgame
 * rogue creeps up to ~65 %, and a low-DEX character bottoms out at 10 %.
 */
function rollStealthCheck(character: Character, rng: Rng): boolean {
  if (!STEALTH_CLASS_IDS.includes(character.classId)) return false
  const dex = character.stats.dexterity
  const chance = Math.max(0.1, Math.min(0.8, 0.25 + (dex - 10) * 0.05))
  return rng.chance(chance)
}

/**
 * Determines whether a fresh encounter starts with an ambush.
 *   - |level delta| ≥ 5 → the higher-level side auto-ambushes.
 *   - Rogue/ranger classes roll a DEX stealth check that can force a
 *     character-side ambush regardless of level delta.
 *   - Smaller gaps roll a flat 15 % chance of an ambush, with the advantaged
 *     side biased toward being the ambusher.
 *
 * An ambush is a single tick where only the ambusher acts and their strike
 * deals 2× damage (stealth-class openers add an extra 1.5× on top). The
 * `ticksLeft: 1` budget reflects "one free strike" — after this tick
 * fades, the fight resumes normal turn-taking.
 */
export function rollAmbush(
  character: Character,
  mobLevel: number,
  rng: Rng,
): { side: 'character' | 'mob'; ticksLeft: number; reason?: 'stealth' } | null {
  const delta = character.level - mobLevel
  if (delta >= 5) return { side: 'character', ticksLeft: 1 }
  if (delta <= -5) return { side: 'mob', ticksLeft: 1 }
  // Stealth classes get the first-round jump if their DEX roll lands.
  // Checked before the generic 15 % roll so the stealth narrative wins.
  if (rollStealthCheck(character, rng)) {
    return { side: 'character', ticksLeft: 1, reason: 'stealth' }
  }
  const ambushRoll = rng.chance(0.15)
  if (ambushRoll) {
    // Coin flip, weighted toward the higher-level side.
    const charFavor = 0.5 + 0.05 * delta
    const charSide = rng.chance(charFavor)
    const side: 'character' | 'mob' = charSide ? 'character' : 'mob'
    return { side, ticksLeft: 1 }
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

function rollEncounterFor(
  world: WorldContent,
  type: string,
  areaLevel: number = 1,
  rng: Rng,
): Mob | null {
  const ids = world.encounters[type as keyof WorldContent['encounters']]
  if (!ids || ids.length === 0) return null
  const id = rng.pick(ids)
  const template = world.mobs.find((m) => m.id === id)
  if (!template) return null
  // Rarity roll is biased toward rare+ in higher-level areas, which
  // feeds both loot quality and (via the rarity bump in `mobLevel`)
  // additional combat level for the spawned mob.
  const mob = spawn(template, rollMobRarity(areaLevel, rng))
  // Flat level offset from the area itself — stats stay at template ×
  // rarity, but the bumped `level` feeds the combat level-delta math
  // (higher mob level → bigger outgoing damage, smaller incoming,
  // bigger XP reward). Zero offset at area level 1 preserves baseline.
  const offset = Math.max(0, areaLevel - 1)
  return offset > 0 ? { ...mob, level: mob.level + offset } : mob
}

// Spawns a specific mob id at a specific rarity — the curated-encounter
// path. Same area-level offset as `rollEncounterFor` so a curated mob in
// a level-N room reads at the same relative threat as a pool roll.
// Returns null when the mob id isn't in the world pool (stale generation
// referencing a removed mob, typo in an authored area, etc.) so callers
// can graceful-fallback to the random pool.
function spawnCuratedEncounter(
  world: WorldContent,
  mobId: string,
  rarity: Rarity,
  areaLevel: number = 1,
): Mob | null {
  const template = world.mobs.find((m) => m.id === mobId)
  if (!template) return null
  const mob = spawn(template, rarity)
  const offset = Math.max(0, areaLevel - 1)
  const leveled = offset > 0 ? { ...mob, level: mob.level + offset } : mob
  return { ...leveled, curated: true }
}

function appendDropLogs(
  log: LogEntry[],
  character: Character,
  world: WorldContent,
  drops: Drops,
  rng: Rng,
): LogEntry[] {
  let out = log
  if (drops.gold > 0) {
    const manifest = getWorldManifest(character.worldId)
    const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
    out = append(out, formatGoldPickupLog(formatActorName(character, 'log'), drops.gold, currency, rng))
  }
  // Batch all item pickups from this drop event into one line. Resolves
  // each drop against the world item catalog, picks a display rarity,
  // and emits a single "X picks up A, B, and C" entry with an `items`
  // payload so LogPanel can render each name as a clickable [Bracket]
  // and journal derivation can still gate first-finds per-item.
  type Resolved = {
    id: string
    name: string
    qty: number
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  }
  const resolved: Resolved[] = []
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    // Rarity is pre-rolled in the caller (see the loop right before
    // `appendDropLogs` in `resolveMobDefeat`) so the log and the
    // inventory agree on tier. Curated drops also carry rarity. Non-
    // equipment / scroll drops have no rarity and log as common.
    // Curated items pin to `'legendary'` regardless of pre-roll so the
    // rare+ discovery banner fires reliably on first drop.
    const rarity: Rarity = def.curated ? 'legendary' : drop.rarity ?? 'common'
    resolved.push({ id: def.id, name: def.name, qty: drop.qty, rarity })
  }
  if (resolved.length === 0) return out
  const phrases = resolved.map((r) => (r.qty > 1 ? `${r.qty}× ${r.name}` : r.name))
  const list = joinList(phrases)
  // First item's fields double as the top-level fallback so legacy
  // readers (anything that hasn't learned about `items[]` yet) still
  // see one item. journal.ts iterates `items` when present.
  const first = resolved[0]
  out = append(out, {
    kind: 'loot',
    text: `${formatActorName(character, 'log')} picks up ${list}.`,
    meta: {
      name: formatActorName(character, 'log'),
      itemId: first.id,
      itemName: first.name,
      itemRarity: first.rarity,
      items: resolved.map((r) => ({
        id: r.id,
        name: r.name,
        rarity: r.rarity,
        qty: r.qty,
      })),
      // areaId threaded so journal derivation can scope first-find
      // entries without reading the character's post-tick position
      // (which is correct here but brittle for future refactors).
      areaId: character.position.areaId,
    },
  })
  return out
}

// Oxford-comma list join: ["A"] → "A", ["A","B"] → "A and B",
// ["A","B","C"] → "A, B, and C". Used by the batched pickup line so a
// single drop reads as one readable sentence instead of N bullet lines.
function joinList(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** Decrements the locked chest's countdown and, when it hits zero,
 *  unlatches: items merge into inventory, gold credits, auto-equip
 *  fires, and a `kind: 'loot'` line emits with the items[] payload so
 *  journal first-find lights up at the moment the player actually
 *  sees the items. Called at the top of every `runTick` regardless of
 *  state — the chest is wall-clock, not state-bound, so a long fight
 *  can't pin it shut. No-op when no chest is set. */
function tickLockedChest(p: Playing, world: WorldContent, rng: Rng): Playing {
  const chest = p.character.lockedChest
  if (!chest) return p
  if (chest.ticksLeft > 1) {
    return {
      ...p,
      character: {
        ...p.character,
        lockedChest: { ...chest, ticksLeft: chest.ticksLeft - 1 },
      },
    }
  }
  // Unlock now. Build the reveal log first so it appears before any
  // auto-equip lines that follow.
  let log = p.log
  let character = p.character
  if (chest.gold > 0) {
    const manifest = getWorldManifest(character.worldId)
    const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
    log = append(
      log,
      formatGoldPickupLog(formatActorName(character, 'log'), chest.gold, currency, rng),
    )
  }
  if (chest.items.length > 0) {
    const phrases = chest.items.map((it) => {
      const qty = it.quantity ?? 1
      return qty > 1 ? `${qty}× ${it.name}` : it.name
    })
    const list = joinList(phrases)
    const first = chest.items[0]
    log = append(log, {
      kind: 'loot',
      text: `The chest unlatches — ${formatActorName(character, 'log')} takes ${list}.`,
      meta: {
        name: character.name,
        // Top-level item fields mirror the first item for legacy
        // readers; `items[]` is the canonical batched payload.
        itemId: first.archetypeId,
        itemName: first.name,
        itemRarity: first.rarity ?? 'common',
        items: chest.items.map((it) => ({
          id: it.archetypeId ?? '',
          name: it.name,
          rarity: it.rarity ?? 'common',
          qty: it.quantity ?? 1,
        })),
        // areaId from the source meta — falls back to the character's
        // current area if the chest predates this field on a save.
        areaId: chest.source?.areaId ?? character.position.areaId,
      },
    })
  }
  const withItems = applyChestEntries(character, world, chest.items)
  const withGold: Character = { ...withItems, gold: withItems.gold + chest.gold }
  const equipResult = applyAutoEquip(withGold, world)
  for (const ev of equipResult.events) {
    if (isRedundantEquip(ev)) continue
    log = append(log, equipLogEntry(equipResult.character, ev))
  }
  character = {
    ...equipResult.character,
    drives: stampWeight(equipResult.character.drives, equipResult.character, world),
    lockedChest: undefined,
  }
  return { ...p, log, character }
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

function bfsNearestUnvisited(
  area: Area,
  start: Position,
  visitedRooms: Set<string>,
  opts: { skipGateways?: boolean } = {},
): Position | null {
  const seen = new Set<string>([`${start.x},${start.y},${start.z}`])
  const queue: Position[] = [start]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const vk = visitedKey(cur.areaId, cur.x, cur.y, cur.z)
    if (!visitedRooms.has(vk)) {
      if (!opts.skipGateways) return cur
      const room = area.rooms[roomKey(cur.x, cur.y, cur.z)]
      if (room?.type !== 'portal' && room?.type !== 'exit') return cur
    }
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
    // Exit rooms are always interesting — they lead to unknown lands.
    if (r.type === 'exit') {
      const pos: Position = { areaId: area.id, x: r.x, y: r.y, z: r.z }
      candidates.push({ pos, fresh: true })
      continue
    }
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
  rng: Rng,
  goal: Drive | null,
  world: WorldContent,
): Position | null {
  const pos = character.position
  const rngStep = (): Position | null => {
    const options = neighborsOf(area, pos)
    if (options.length === 0) return null
    return rng.pick(options)
  }
  if (!goal) return rngStep()

  if (goal === 'curiosity') {
    const visited = new Set(character.visitedRooms)
    const options = neighborsOf(area, pos)
    const isGateway = (p: Position): boolean => {
      const r = area.rooms[roomKey(p.x, p.y, p.z)]
      return r?.type === 'portal' || r?.type === 'exit'
    }
    const unvisited = options.filter(
      (o) => !visited.has(visitedKey(o.areaId, o.x, o.y, o.z)),
    )
    // Finish the current area before stepping through any gateway. Exit
    // and portal tiles stay off the preferred list until nothing else is
    // unvisited — prevents the character from bouncing out of a new area
    // the moment they see a door.
    const unvisitedNonGateway = unvisited.filter((o) => !isGateway(o))
    if (unvisitedNonGateway.length > 0) {
      return rng.pick(unvisitedNonGateway)
    }
    const target = bfsNearestUnvisited(area, pos, visited, { skipGateways: true })
    if (target) return stepTowards(area, pos, target)
    // Only unvisited rooms left are gateways — take the adjacent one if any,
    // otherwise BFS for the nearest gateway tile.
    if (unvisited.length > 0) return rng.pick(unvisited)
    const gateway = bfsNearestUnvisited(area, pos, visited)
    if (gateway) return stepTowards(area, pos, gateway)
    // Area fully mapped — push outward to a portal, preferring destinations
    // with unvisited rooms.
    const portal = findPortalToExplore(area, character, world)
    if (portal) {
      if (portal.x === pos.x && portal.y === pos.y && portal.z === pos.z) {
        return rngStep()
      }
      return stepTowards(area, pos, portal)
    }
    return rngStep()
  }

  if (goal === 'greed') {
    const options = neighborsOf(area, pos)
    const dangerous = options.filter((o) => {
      const r = area.rooms[roomKey(o.x, o.y, o.z)]
      return r && r.type !== 'safe'
    })
    if (dangerous.length > 0) return rng.pick(dangerous)
    return rngStep()
  }

  // hunger, fatigue, weight all navigate to the nearest room whose
  // `satisfies` array includes the drive.
  const target = nearestRoomSatisfying(area, pos, goal)
  if (!target) return rngStep()
  if (target.x === pos.x && target.y === pos.y && target.z === pos.z) {
    return rngStep()
  }
  return stepTowards(area, pos, target)
}

// Buff-aware variant of EXPLORE_GROWTH used by the explore tick. Pulled out
// of explore() so `predictNextStep` can mirror it without duplicating the
// hunger-slow conditional — divergence here would let the prediction land on
// a different goal than the live tick once the character equips a slow item.
function exploreGrowthFor(c: Character, world: WorldContent): Partial<Drives> {
  const buffs = buffMultipliers(c, world)
  return buffs.hungerSlow > 0
    ? {
        ...EXPLORE_GROWTH,
        hunger: Math.round((EXPLORE_GROWTH.hunger ?? 0) * (1 - buffs.hungerSlow)),
      }
    : EXPLORE_GROWTH
}

/**
 * Best-guess "where will the character step next?" — runs the same
 * `moveByGoal` projection used by the live tick, but as a pure function
 * callers can use to render a directional indicator on the map. Returns
 * the next neighbor position the character would walk to, or null if
 * there's nothing to project (no drive, no reachable neighbor).
 *
 * Does **not** advance drives or simulate satisfaction — it's a snapshot,
 * not a partial tick. Used read-only by MapPanel for follow-cam hints.
 *
 * Clones the character's rng state so the prediction draws from the same
 * stream the live tick will — without consuming the real state. Can still
 * disagree when auto-consume or conditions fire first (they burn rng draws
 * before movement), but that's a known limitation.
 */
export function predictNextStep(
  character: Character,
  world: WorldContent,
): Position | null {
  const area = getArea(world, character.position.areaId)
  const predRng = Rng.fromState(character.rngState).clone()
  const grownDrives = stampWeight(
    grow(character.drives, exploreGrowthFor(character, world)),
    character,
    world,
  )
  const goal = topDrive(grownDrives)
  return moveByGoal(area, { ...character, drives: grownDrives }, predRng, goal, world)
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
    (hpRatio < REST_FORCE_HP_RATIO || rng.chance(REST_CHANCE))
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

  // Hunger slow from equipped buff items (Pendant of the Sated Wanderer,
  // NutriChip Implant, Ration Synth Module). The buff-scaled growth is
  // computed by `exploreGrowthFor` so `predictNextStep` can mirror it; if
  // the two ever diverge the map arrow lands on a different goal than the
  // live tick.
  const grownDrives = stampWeight(
    grow(c.drives, exploreGrowthFor(c, world)),
    c,
    world,
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
  // Sacrifice at a shrine is the fallback offload for overloaded
  // characters who haven't reached a shop. Fires only at shrine rooms
  // (narrative fit) when weight is above threshold. Shops always win
  // priority via wantsSell, so this never steals from a shop visit.
  const wantsSacrifice =
    !wantsSell &&
    room?.type === 'shrine' &&
    grownDrives.weight >= DRIVE_THRESHOLD
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

  let character: Character = {
    ...c,
    position: next,
    visitedRooms,
    drives,
    lastSafePosition,
    lastTopDrive: goal,
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
          ambush.reason === 'stealth'
            ? `${greetingName} slips from shadow and strikes the ${activeMob.name} first! (Stealth — 3× damage)`
            : `${capitalize(attackerName)} catches ${ambush.side === 'character' ? `the ${activeMob.name}` : greetingName} off guard! (Ambush — 2× damage)`
        log = append(log, {
          kind: 'narrative',
          text: flavor,
          meta: {
            name: formatActorName(activeChar, 'log'),
            mobName: activeMob.name,
            stealth: ambush.reason === 'stealth' ? true : undefined,
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

  // Shrine sacrifice — fallback weight offload when no shop's available.
  if (wantsSacrifice) {
    return {
      character,
      log,
      state: { kind: 'using-room', action: { kind: 'sacrifice' } },
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

// After selling, try to auto-purchase consumables from the shop's inventory.
// Only buys healing potions when HP < 50% and mana potions when magic < 50%.
// Caps at 3 of any given consumable already in inventory.
const SHOP_CARRY_LIMIT = 3

function tryShopPurchase(
  character: Character,
  world: WorldContent,
  manifest: WorldManifest | undefined,
  rng: Rng,
): { character: Character; log: LogEntry[] } | null {
  const stock = world.shopInventory
  if (!stock || stock.length === 0) return null

  const defs = new Map(world.items.map((d) => [d.id, d]))
  const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
  let c = character
  const entries: LogEntry[] = []

  for (const slot of stock) {
    const def = defs.get(slot.itemId)
    if (!def || def.kind !== 'consumable') continue

    // Check if character needs this consumable.
    const effect = def.effect
    if (effect.kind === 'heal' && c.hp >= c.maxHp * 0.5) continue
    if (effect.kind === 'restore-magic') {
      if (c.maxMagic === 0) continue
      if (c.magic >= c.maxMagic * 0.5) continue
    }

    // Count how many of this item the character already carries.
    const owned = c.inventory.reduce((n, inv) => {
      if (inv.archetypeId === slot.itemId) return n + (inv.quantity ?? 1)
      return n
    }, 0)
    if (owned >= SHOP_CARRY_LIMIT) continue

    // Can the character afford it?
    if (c.gold < slot.price) continue

    // Purchase one.
    const newItem = {
      id: `shop-${slot.itemId}-${Date.now()}-${rng.next().toString(36).slice(2, 7)}`,
      archetypeId: slot.itemId,
      name: def.name,
      quantity: 1,
    }
    c = {
      ...c,
      gold: c.gold - slot.price,
      inventory: [...c.inventory, newItem],
    }
    entries.push({
      kind: 'loot',
      text: `${formatActorName(c, 'log')} buys a ${def.name} for ${slot.price} ${currency}.`,
      meta: {
        name: formatActorName(c, 'log'),
        itemId: slot.itemId,
        itemName: def.name,
        // Paint bought potions in their HP/MP color. Non-consumables
        // fall back to the default token styling.
        potionEffect: def.kind === 'consumable' ? def.effect.kind : undefined,
        goldAmount: -slot.price,
        goldText: `${slot.price} ${currency}`,
      },
    })
  }

  if (entries.length === 0) return null
  return { character: c, log: entries }
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
        text: `${formatActorName(c, 'log')} sells ${itemCount} item${itemCount !== 1 ? 's' : ''} for ${result.totalGold} ${currency}.`,
        meta: {
          name: formatActorName(c, 'log'),
          goldAmount: result.totalGold,
          goldText: `${result.totalGold} ${currency}`,
        },
      })
      log = append(log, {
        kind: 'narrative',
        text: `${formatActorName(c, 'log')} offloads ${itemCount} item${itemCount !== 1 ? 's' : ''} at ${roomName} for ${result.totalGold} ${currency}.`,
        meta: {
          name: formatActorName(c, 'log'),
          areaId: area.id,
          roomKey: rk,
          roomName: room?.name,
        },
      })
      let afterSell: Character = {
        ...c,
        inventory: result.remainingInventory,
        gold: c.gold + result.totalGold,
      }
      // Auto-purchase consumables from shop inventory after selling.
      const purchased = tryShopPurchase(afterSell, world, manifest, rng)
      if (purchased) {
        afterSell = purchased.character
        log = purchased.log.reduce<LogEntry[]>((l, e) => append(l, e), log)
      }
      drives = stampWeight(satisfy(c.drives, ['weight']), afterSell, world)
      return {
        character: { ...afterSell, drives },
        log,
        state: { kind: 'exploring' },
      }
    }
    case 'sacrifice': {
      const result = pickItemsToSacrifice(c, world.items)
      if (result.sacrificed.length === 0) break
      const manifest = getWorldManifest(c.worldId)
      const currency = (manifest?.currencyName ?? 'gold').toLowerCase()
      const phrase = manifest?.sacrificePhrase ?? 'offers up'
      const roomName = room?.name ?? 'the shrine'
      const itemCount = result.sacrificed.reduce(
        (n, s) => n + (s.item.quantity ?? 1),
        0,
      )
      log = append(log, {
        kind: 'loot',
        text: `${phrase} ${result.totalGold} ${currency}.`,
        meta: {
          name: formatActorName(c, 'log'),
          goldAmount: result.totalGold,
          goldText: `${result.totalGold} ${currency}`,
        },
      })
      log = append(log, {
        kind: 'narrative',
        text: `${formatActorName(c, 'log')} sacrifices ${itemCount} item${itemCount !== 1 ? 's' : ''} at ${roomName}.`,
        meta: {
          name: formatActorName(c, 'log'),
          areaId: area.id,
          roomKey: rk,
          roomName: room?.name,
        },
      })
      const afterSacrifice: Character = {
        ...c,
        inventory: result.remainingInventory,
        gold: c.gold + result.totalGold,
      }
      drives = stampWeight(satisfy(c.drives, ['weight']), afterSacrifice, world)
      return {
        character: { ...afterSacrifice, drives },
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
 * faster) and CON mod (a tougher body does too). Minimum 1. Equipped
 * rest-boost items (Stone of Deep Rest, Neural Relaxant Dose, Circadian
 * Regulator) multiply the final number by (1 + restBoost).
 */
function restHealAmount(c: Character, world: WorldContent): number {
  const conMod = Math.max(0, Math.floor((c.stats.constitution - 10) / 2))
  const base = Math.max(1, REST_HEAL + conMod + Math.floor(c.level / 3))
  const boost = buffMultipliers(c, world).restBoost
  return Math.max(1, Math.round(base * (1 + boost)))
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

function rest(p: Playing, world: WorldContent, rng: Rng): Playing {
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
    return {
      character: cleared.character,
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

function meditate(p: Playing, world: WorldContent, rng: Rng): Playing {
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
  /** Per-character PRNG for deterministic verb/title picks. */
  rng: Rng
}

/** Applies a single level-up's worth of gains (HP, MP, periodic stat bumps)
 *  plus the matching LevelUpRecord and narration. Shared between the combat
 *  XP flow (`applyXp`) and dev-panel handlers so both paths grow the
 *  character identically. */
export function applyOneLevel(
  character: Character,
  options: ApplyOneLevelOptions,
): { character: Character; logEntries: LogEntry[] } {
  const now = options.now ?? Date.now()
  const from = character.level
  const to = from + 1
  const gains = levelGainsFor(character, character.stats, to)
  const segment = character.segment ?? {
    startedAt: character.createdAt,
    startGold: character.gold,
  }
  // Deaths this segment = death timestamps after the segment started.
  // Falls back to the previous level-up time (or createdAt) for characters
  // saved before `segment` was tracked, so old saves still get a sensible
  // count on their next level-up.
  const previousLevelUpAt =
    character.levelUps[character.levelUps.length - 1]?.at ?? character.createdAt
  const segmentStart = character.segment?.startedAt ?? previousLevelUpAt
  const deathsThisLevel = character.deaths.filter((d) => d.at > segmentStart).length
  // Resolve spell unlocks before constructing the record so the record
  // can snapshot them. `spellUnlocksAt` only reads `character.spells` and
  // `character.worldId`, so passing the pre-level-up character (with the
  // post-level number as the second arg) gives the same result as the
  // previous `baseUpdated`-based call.
  const unlockResult = spellUnlocksAt(character, to)
  const spellsKnown = new Set(character.spells ?? [])
  const learnedSpells: SpellDef[] = []
  for (const spell of unlockResult.unlocked) {
    if (spellsKnown.has(spell.id)) continue
    spellsKnown.add(spell.id)
    learnedSpells.push(spell)
    if (unlockResult.includesGenerated) {
      // Only generated entries need runtime registration; curated ones are
      // already in WORLD_SPELLS.
      registerGeneratedSpell(spell)
    }
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
    deathsThisLevel,
    learnedSpells: learnedSpells.length > 0
      ? learnedSpells.map((s) => ({ id: s.id, name: s.name, level: s.level }))
      : undefined,
  }
  const baseUpdated: Character = {
    ...character,
    level: to,
    maxHp: character.maxHp + gains.hp,
    hp: character.hp + gains.hp,
    maxMagic: character.maxMagic + gains.mp,
    magic: character.magic + gains.mp,
    stats: gains.nextStats,
    spells: learnedSpells.length > 0
      ? [...(character.spells ?? []), ...learnedSpells.map((s) => s.id)]
      : character.spells,
    levelUps: [...character.levelUps, record],
    segment: { startedAt: now, startGold: character.gold },
  }
  const prefix = options.logPrefix ?? ''
  const verb = pickLevelUpVerb(options.rng)
  const logEntries: LogEntry[] = [
    {
      kind: 'chapter',
      text: `${prefix}🎉✨⭐ ${formatActorName(character, 'log-milestone')} ${verb} to level ${to}! ⭐✨🎉`,
      meta: { name: formatActorName(character, 'log-milestone'), levelTo: to },
    },
  ]
  const parts: string[] = []
  if (gains.hp > 0) parts.push(`+${gains.hp} HP`)
  if (gains.mp > 0) parts.push(`+${gains.mp} MP`)
  if (gains.statText) parts.push(gains.statText)
  if (parts.length > 0) {
    logEntries.push({
      kind: 'narrative',
      text: `${prefix}${formatActorName(character, 'log-milestone')} feels stronger. (${parts.join(' · ')})`,
      meta: { name: formatActorName(character, 'log-milestone') },
    })
  }

  for (const spell of learnedSpells) {
    logEntries.push({
      kind: 'chapter',
      text: `${prefix}${formatActorName(character, 'log-milestone')} unlocks a new spell: ${spell.name}!`,
      meta: { name: formatActorName(character, 'log-milestone'), spellName: spell.name },
    })
    if (spell.description) {
      logEntries.push({
        kind: 'narrative',
        text: `${prefix}${spell.description}`,
        meta: { name: formatActorName(character, 'log-milestone'), spellName: spell.name },
      })
    }
  }

  return { character: baseUpdated, logEntries }
}

function applyXp(
  character: Character,
  gained: number,
  log: LogEntry[],
  rng: Rng,
): { character: Character; log: LogEntry[] } {
  let working = { ...character, xp: character.xp + gained }
  let updatedLog = log
  while (working.xp >= xpToNextLevel(working.level)) {
    const needed = xpToNextLevel(working.level)
    const { character: leveled, logEntries } = applyOneLevel(working, {
      xpGained: needed,
      rng,
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
          kind: 'chapter',
          text: `🎉✨⭐ ${pickTitleEarnedLine(character.name, earned.text, rng)} ⭐✨🎉`,
          meta: {
            name: character.name,
            titleEarned: true,
            titleText: earned.text,
          },
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
  /** Family of the DoT that landed the final tick before hp hit 0 —
   *  used by resolveMobDefeat to pick a flavored "X is reduced to ash"
   *  line instead of the generic "X falls". Undefined when no DoT
   *  killed the mob (either no DoTs fired this tick or none zeroed hp). */
  killFamily?: DamageFamily | 'poison'
}

// Mirrors tickConditions() for characters: applies DoT damage to a mob (capped
// so it can never reduce hp below 0) and decrements per-condition duration.
// stat-mod conditions don't currently alter mob combat stats — future work.
function tickMobConditions(
  mob: Mob,
  world: WorldContent,
  worldId: string,
  rng: Rng,
): MobTickResult {
  if (!mob.conditions || mob.conditions.length === 0) {
    return { mob, entries: [] }
  }
  const defs = new Map(world.conditions.map((d) => [d.id, d]))
  const entries: LogEntry[] = []
  let hp = mob.hp
  let killFamily: DamageFamily | 'poison' | undefined
  const next: typeof mob.conditions = []

  for (const active of mob.conditions) {
    const def = defs.get(active.id)
    if (!def) continue

    if (def.kind === 'dot') {
      // Snapshot override (set at application by a high-INT caster) wins
      // over the condition def's base — same rule as the character-side
      // tickConditions in conditions/engine.ts.
      const baseTickDmg = active.damagePerTickOverride ?? def.params.damagePerTick ?? 0
      // Element resist applies per tick — a fire elemental's resist makes
      // burning ticks fizzle even though the condition snapshot doesn't
      // know about the target. Floor at 1 when the base damage was
      // non-zero so a "barely resisted" tick still pings instead of
      // silently no-op'ing — matches how a fully-blocked physical hit
      // still draws the 1-DMG floor.
      const resistMult = mobResistMultiplier(mob, def.element)
      const scaled = Math.round(baseTickDmg * resistMult)
      const dmg = baseTickDmg > 0 && resistMult > 0 ? Math.max(1, scaled) : scaled
      if (dmg > 0 && hp > 0) {
        const taken = Math.min(dmg, hp)
        hp -= taken
        // Condition element (fire / ice / electric / earth / hack)
        // maps 1:1 to a damage family — a burning condition "scorches",
        // a freezing one "chills". Fall back to the world verb set
        // for conditions without an element (generic poison, bleed).
        const { verb } = damageVerb(taken, mob.maxHp, worldId, def.element, rng)
        const noun = def.noun ?? def.name.toLowerCase()
        const capNoun = noun.charAt(0).toUpperCase() + noun.slice(1)
        entries.push({
          kind: 'condition-tick',
          text: `${capNoun} ${verb} the ${mob.name}.`,
          amount: taken,
          conditionId: def.id,
          meta: {
            mobName: mob.name,
            mobRarity: mob.rarity,
            conditionName: def.name,
            element: def.element,
          },
        })
        // Track the kill family so resolveMobDefeat can flavor the
        // defeat line. "poison" gets its own flavor pool; anything
        // else routes by condition element (fire/ice/electric/…).
        // Poison conditions typically lack an element — use the
        // condition id as a last-resort signal.
        if (hp === 0) {
          if (def.element) {
            killFamily = def.element
          } else if (def.id.includes('poison') || def.id.includes('bleed')) {
            killFamily = 'poison'
          }
        }
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
        meta: { mobName: mob.name, mobRarity: mob.rarity, conditionName: def.name },
      })
    }
  }

  return { mob: { ...mob, hp, conditions: next }, entries, killFamily }
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
  world: WorldContent,
  rng: Rng,
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
  const casterPrefers = isMagicUser ? damageSpells.length > 0 : rng.chance(0.4)
  if (casterPrefers && damageSpells.length > 0) {
    const chosen = rng.pick(damageSpells)
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

// Unified mob-defeat handling: award XP, log the kill, roll loot, satisfy
// greed, auto-equip, re-stamp weight, return to exploring. Called from both
// DoT-kill and melee-kill paths in fight(). The optional `killFamily`
// tunes the defeat flavor — a sword kill reads "is cleaved in two", a
// fireball kill reads "is reduced to ash", etc. — via the shared
// death-phrase rotation. Roughly 50% of the time we still print the
// compact "The X falls." line so the log isn't uniformly florid.
//
// `gatewayExitKey`: when present, this was a gateway-guardian fight
// masking LLM area generation. On defeat, we check whether the target
// exit room now has a destination (gen completed). If so, explore
// normally; if not, transition to 'generating-area' so the finding-path
// countdown can take over.
/** When the killing strike was severe / critical AND came from a real
 *  attack path (melee swing, damage spell), the caller fills in this
 *  context so `resolveMobDefeat` emits a single combined kill line
 *  ("Hiro cleaves the Goblin in half. (+12 XP)") instead of the
 *  standard separate damage + defeat pair. DoT / condition kill paths
 *  leave it undefined and keep the standard "The X falls." line. */
interface CombinedKillOption {
  severity: DamageSeverity
  attackPower?: number
  defense?: number
  scaleMult?: number
  weaponName?: string
}

function resolveMobDefeat(
  character: Character,
  mob: Mob,
  world: WorldContent,
  log: LogEntry[],
  killFamily: DamageFamily | 'poison' | undefined,
  gatewayExitKey: string | undefined,
  rng: Rng,
  combinedKill?: CombinedKillOption,
): Playing {
  const awardedXp = Math.max(
    1,
    Math.round(mob.xpReward * xpScaleByDelta(mob.level - character.level)),
  )
  const area = getArea(world, character.position.areaId)
  const dropRoom =
    area.rooms[
      roomKey(character.position.x, character.position.y, character.position.z)
    ]
  let out = append(
    log,
    combinedKill
      ? formatCombinedKillLog({
          characterName: character.name,
          mob,
          awardedXp,
          // 'poison' isn't a kill-line family — falls back to generic.
          killFamily: killFamily === 'poison' ? 'generic' : killFamily,
          severity: combinedKill.severity,
          attackPower: combinedKill.attackPower,
          defense: combinedKill.defense,
          scaleMult: combinedKill.scaleMult,
          weaponName: combinedKill.weaponName,
          areaId: area.id,
          roomName: dropRoom?.name,
        })
      : formatMobDefeatLog({
          mob,
          awardedXp,
          killFamily,
          areaId: area.id,
          roomName: dropRoom?.name,
          rng,
        }),
  )
  const rewardCtx: RewardContext = {
    mobRarity: mob.rarity,
    mobLevel: mob.level,
    roomType: dropRoom?.type,
    areaRarity: area.rarity,
  }
  // Curated loot override: fires only when the defeated mob was actually
  // spawned from the room's curated encounter (mob.curated === true).
  // A random-pool spawn of the same mob id does NOT trigger the override,
  // so post-firstOnly-defeat pool kills keep using the archetype loot.
  // Reward context threads through so Phase 4 scaling (gold mult, level
  // floor bump, extreme-mult rarity nudge) applies to curated drops too
  // — a rare amulet in a level-7 epic area is meaningfully beefier than
  // the same curated entry in a level-1 area.
  const curatedLoot =
    mob.curated && dropRoom?.encounter?.loot ? dropRoom.encounter.loot : null
  // Drop-bias context — lets `rollLoot` swap ordinary equipment/scroll
  // drops for class- or room-appropriate alternatives. Curated loot is
  // authored intent and bypasses the bias entirely (see rollCuratedLoot).
  const biasCtx = {
    classId: character.classId,
    roomName: dropRoom?.name,
    roomType: dropRoom?.type,
    worldItems: world.items,
  }
  const drops = curatedLoot
    ? rollCuratedLoot(curatedLoot, rewardCtx, rng)
    : rollLoot(mob, rewardCtx, biasCtx, world, rng)
  // Pre-roll the rarity for each non-curated drop so the log line and
  // the inventory stay in lockstep. Curated drops already carry
  // `rarity` on the drop entry. Plain drops are normally rolled inside
  // `applyDrops`, which fires AFTER this log; stamping the value here
  // means the log paints the token with the actual drop tier instead
  // of falling back to mob-rarity-as-proxy (which made rare drops from
  // common mobs render gray).
  const rewardMult = rewardCtx ? combatRewardMult(rewardCtx) : 1
  for (const drop of drops.items) {
    if (drop.rarity != null) continue
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    drop.rarity = rollDropRarity(def, mob.rarity, rewardMult, rng)
  }
  // Items go into a locked chest; pure gold drops bypass the chest and
  // credit immediately so a mob that drops only coin stays a clean
  // one-line beat. Auto-equip is deferred to chest-unlock so the player
  // sees new gear get picked up and equipped together at the reveal.
  const greedEased = satisfy(character.drives, ['greed'])
  const trackedForBaddest = trackBaddest(
    { ...character, drives: greedEased },
    mob,
  )
  // Resolve drops to chest-ready entries up-front. When every item is
  // abandoned (encumbrance overflow), `entries` is empty and there's no
  // chest to create — gold from the same kill still credits via the
  // gold-only path below. When the character already has a chest, fresh
  // items merge in and gold rides along into the existing chest.
  const resolved = drops.items.length > 0
    ? resolveChestDrops(
        trackedForBaddest,
        world,
        drops.items,
        mob,
        { areaId: area.id, roomName: dropRoom?.name },
        rewardCtx,
        rng,
      )
    : { entries: [], abandoned: [] }
  if (resolved.abandoned.length > 0) {
    const names = resolved.abandoned.map((d) => d.name)
    const count = names.length
    const listText = names.join(', ')
    out = append(out, {
      kind: 'narrative',
      text: `${formatActorName(trackedForBaddest, 'log')} sacrifices ${count} item${count !== 1 ? 's' : ''} — ${listText} — to the weight of the road.`,
      meta: {
        name: formatActorName(trackedForBaddest, 'log'),
        // No itemId / itemName on the summary — it references
        // multiple items, and the bracketed popover pattern assumes a
        // single subject. Surface only the character name so the
        // journal / log coloring still picks up the actor.
      },
    })
  }
  const existingChest = trackedForBaddest.lockedChest
  let postLoot: Character
  if (resolved.entries.length > 0 || existingChest) {
    // Chest path — either creating a new chest with these entries, or
    // merging into an existing chest (even if the merge is gold-only,
    // because the player should see the running coin tally on the
    // chest UI rather than getting it credited mid-cycle).
    const mergedItems = existingChest
      ? [...existingChest.items, ...resolved.entries]
      : resolved.entries
    const mergedGold = (existingChest?.gold ?? 0) + drops.gold
    const targetTicks = Math.min(
      CHEST_MAX_TICKS,
      CHEST_BASE_TICKS + mergedItems.length * CHEST_PER_ITEM_TICKS,
    )
    // Subsequent kills extend the timer to the new target if it's
    // longer than the remaining countdown — never shortens, so a chest
    // about to open doesn't stall on a fresh kill.
    const ticksLeft = existingChest
      ? Math.max(existingChest.ticksLeft, targetTicks)
      : targetTicks
    // The "stows the spoils" line fires only on the kill that *opens*
    // a fresh chest. Subsequent merges happen quietly — the chest UI
    // surfaces the running count, and a per-kill log line would just
    // be noise during a combat streak.
    if (!existingChest) {
      out = append(out, {
        kind: 'narrative',
        text: `${formatActorName(trackedForBaddest, 'log')} stows the spoils in a strange chest. It clicks shut.`,
        meta: { name: trackedForBaddest.name },
      })
    }
    const withChest: Character = {
      ...trackedForBaddest,
      lockedChest: {
        items: mergedItems,
        gold: mergedGold,
        ticksLeft,
        source: {
          mobName: mob.name,
          areaId: area.id,
          roomName: dropRoom?.name,
        },
      },
    }
    postLoot = {
      ...withChest,
      drives: stampWeight(withChest.drives, withChest, world),
    }
  } else if (drops.gold > 0) {
    // No items locked in (or every drop was abandoned with no existing
    // chest to absorb them), but gold still drops — credit it via the
    // legacy path so the gold pickup line and currency name come from
    // the same helpers that all other gold credits use.
    out = appendDropLogs(out, trackedForBaddest, world, drops, rng)
    const goldOnly = applyDrops(
      trackedForBaddest,
      world,
      drops,
      mob,
      { areaId: area.id, roomName: dropRoom?.name },
      rewardCtx,
      rng,
    )
    postLoot = {
      ...goldOnly.character,
      drives: stampWeight(goldOnly.character.drives, goldOnly.character, world),
    }
  } else {
    // Nothing dropped (or all drops were abandoned and the kill yielded
    // no gold) — re-stamp drives in case greed satisfaction shifted
    // anything, otherwise leave the character unchanged.
    postLoot = {
      ...trackedForBaddest,
      drives: stampWeight(trackedForBaddest.drives, trackedForBaddest, world),
    }
  }
  const xpResult = applyXp(postLoot, awardedXp, out, rng)
  // firstOnly curated encounter defeated? Stamp the room key so the
  // spawn logic on subsequent entries skips the curated encounter and
  // falls back to the random pool. Only fires when the defeat happened
  // in a room with a firstOnly encounter — ambient curated fights and
  // random-pool fights don't populate this list.
  const finalCharacter =
    dropRoom?.encounter?.firstOnly
      ? recordFirstOnlyDefeat(xpResult.character, area.id, dropRoom.x, dropRoom.y, dropRoom.z)
      : xpResult.character

  // Gateway-guardian fight: check whether LLM gen finished during combat.
  // If the exit room now has a destination, gen completed — just explore.
  // Otherwise, transition to 'generating-area' so the finding-path
  // countdown takes over.
  if (gatewayExitKey) {
    const [srcAreaId, coords] = gatewayExitKey.split('::')
    const srcArea = srcAreaId
      ? world.areas?.find((a) => a.id === srcAreaId)
      : undefined
    const exitRoom = srcArea && coords ? srcArea.rooms[coords] : undefined
    if (!exitRoom?.destination) {
      return {
        character: finalCharacter,
        log: xpResult.log,
        state: {
          kind: 'generating-area',
          exitRoomKey: gatewayExitKey,
          ticksLeft: AREA_GEN_TIMEOUT_TICKS,
        },
      }
    }
  }

  return { character: finalCharacter, log: xpResult.log, state: { kind: 'exploring' } }
}

function recordFirstOnlyDefeat(
  character: Character,
  areaId: string,
  x: number,
  y: number,
  z: number,
): Character {
  const key = visitedKey(areaId, x, y, z)
  const defeated = character.defeatedRooms ?? []
  if (defeated.includes(key)) return character
  return { ...character, defeatedRooms: [...defeated, key] }
}

// Unified character-death handling: record the death, log it, apply the
// configured death penalty, respawn at the last safe position. Shared by the
// main fight path and the mob-ambush path.
function resolveCharacterDeath(
  character: Character,
  mob: Mob,
  world: WorldContent,
  log: LogEntry[],
  rng: Rng,
): Playing {
  const area = getArea(world, character.position.areaId)
  const rk = roomKey(character.position.x, character.position.y, character.position.z)
  const room = area.rooms[rk]
  // Rotating death verb — "falls to", "is slain by", "is cut down by",
  // etc. — so a character with a long death log doesn't read like the
  // same tragedy on repeat. When the mob has an `attackFamily` (fire,
  // slash, pierce, …) we pass it through so the rotation can pick a
  // family-flavored framing ("is reduced to ash", "is cleaved in two",
  // "shatters before …") ~60% of the time. The record's `cause`
  // field stores the predicate form ("Cut down by the X") suitable
  // for stamping into the death log display directly.
  const deathFamily = mob.attackFamily
  const causeClause = deathClause(mob.name, deathFamily, rng)
  const narrativeLine = deathSentence(formatActorName(character, 'log-milestone'), mob.name, deathFamily, rng)
  const record: DeathRecord = {
    at: Date.now(),
    cause: capitalize(causeClause),
    areaId: area.id,
    roomName: room?.name,
    roomKey: rk,
    mobName: mob.name,
    mobRemainingHp: mob.hp,
    mobMaxHp: mob.maxHp,
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
  let out = append(log, {
    kind: 'narrative',
    text: `${narrativeLine}. ${respawnText}`,
    meta: {
      name: formatActorName(character, 'log-milestone'),
      mobName: mob.name,
      mobRarity: mob.rarity,
      areaId: area.id,
      roomKey: roomKey(respawn.x, respawn.y, respawn.z),
      roomName: respawnRoom?.name,
      isDeath: true,
    },
  })
  const penalty = applyDeathPenalty(character, rng)
  for (const entry of penalty.entries) out = append(out, entry)
  return {
    character: {
      ...penalty.character,
      hp: penalty.character.maxHp,
      position: respawn,
      deaths: [...penalty.character.deaths, record],
      conditions: [],
    },
    log: out,
    state: { kind: 'exploring' },
  }
}

function fight(p: Playing, world: WorldContent, rng: Rng): Playing {
  if (p.state.kind !== 'fighting') return p
  const ambush = p.state.ambush
  const gatewayExitKey = p.state.gatewayExitKey
  const condResult = tickConditions(p.character, world, rng)
  let log = p.log
  for (const e of condResult.entries) log = append(log, e)

  // Apply any DoTs on the mob (e.g. poison spell last turn).
  let mob = p.state.mob
  const mobCond = tickMobConditions(mob, world, p.character.worldId, rng)
  mob = mobCond.mob
  for (const e of mobCond.entries) log = append(log, e)

  // If DoT finished the mob, award XP and exit. Thread through the
  // killing DoT's element (fire → "is reduced to ash", poison →
  // "chokes and collapses", …) so the defeat flavor matches what
  // actually landed the final tick.
  if (mob.hp === 0) {
    return resolveMobDefeat(condResult.character, mob, world, log, mobCond.killFamily, gatewayExitKey, rng)
  }

  const consumed = maybeAutoConsume(condResult.character, world)
  if (consumed) {
    return {
      character: consumed.character,
      log: append(log, consumed.entry),
      state: { kind: 'fighting', mob, ambush, gatewayExitKey },
    }
  }

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
    // Mob ambush: single tick at 2× damage. Pass the multiplier
    // through so runMobAttack picks it up after its own level-delta
    // scaling — same shape as the character-side ambush above.
    const mobAttackResult = runMobAttack(
      character,
      mob,
      world,
      defenseBonus,
      log,
      rng,
      2,
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
      state: { kind: 'fighting', mob: mobAttackResult.mob, ambush: nextAmbush, gatewayExitKey },
    }
  }

  // Decide: melee, cast spell, or read a scroll?
  const decision: AttackDecision = skipAttack ? { kind: 'melee' } : chooseCharacterAction(character, world, rng)

  let mobHpAfter = mob.hp
  // Track the damage family of the strike that lands this tick so that
  // if it zeros the mob, resolveMobDefeat can flavor the defeat line
  // ("The Goblin is reduced to ash." on a fireball kill). Stays
  // undefined on skipped turns — falls through to the generic
  // "X falls." line then.
  let killFamily: DamageFamily | 'poison' | undefined
  // When the killing strike is severe / critical the standard
  // damage-line + defeat-line pair gets replaced by a single combined
  // entry. Filled in by the melee / spell branches below; passed into
  // `resolveMobDefeat` which consumes it instead of the standard
  // defeat line.
  let combinedKill: CombinedKillOption | undefined

  if (skipAttack) {
    log = append(log, {
      kind: 'narrative',
      text: `${formatActorName(character, 'log')} cannot strike.`,
      meta: { name: formatActorName(character, 'log'), mobName: mob.name, mobRarity: mob.rarity },
    })
  } else if (decision.kind === 'spell' || decision.kind === 'scroll') {
    const spell = getSpell(character.worldId, decision.spellId)!
    let workingChar = character
    let scrollLevel: ScrollLevel | undefined
    if (decision.kind === 'scroll') {
      // Capture the scroll's level BEFORE consuming it so castSpell can
      // scale the spell amount. Falls back to Level I when the archetype
      // somehow lacks a level (legacy data); the multiplier becomes 1×
      // and behavior matches the pre-feature baseline.
      const scrollItem = character.inventory[decision.inventoryIdx]
      const scrollDef = scrollItem?.archetypeId
        ? world.items.find((d) => d.id === scrollItem.archetypeId)
        : undefined
      if (scrollDef && scrollDef.kind === 'scroll') {
        scrollLevel = scrollDef.level
      }
      workingChar = removeInventoryEntry(character, decision.inventoryIdx)
    }
    const result = castSpell({
      character: workingChar,
      mob,
      world,
      spell,
      free: decision.kind === 'scroll',
      source: decision.kind === 'scroll' ? 'scroll' : 'cast',
      scrollLevel,
      rng,
    })
    for (const e of result.entries) log = append(log, e)
    character = result.character
    if (result.mob) mob = result.mob
    mobHpAfter = mob.hp
    // Spell element is the DamageFamily (fire/ice/electric/…) — used
    // only when THIS spell lands the kill. Cases without an element
    // (heal / buff spells) leave killFamily undefined.
    if (spell.element) killFamily = spell.element
    // Severe / critical kill from a damage spell: castSpell suppressed
    // its standard damage entry and handed back the strike's
    // breakdown so resolveMobDefeat can emit one combined kill line.
    if (result.combinedKillCandidate) {
      combinedKill = result.combinedKillCandidate
    }

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
    const attackRoll = rng.roll(4) + mod(character.stats.strength) + attackBonus
    const baseCharDmg = attackRoll - mob.defense
    // Pull the weapon's damage family (slash/crush/pierce) up front so
    // it can feed both the log verb and the mob resist lookup. Falls
    // through to the world's generic verb set / no resist when unarmed.
    const weaponArchetype = character.equipped.weapon?.archetypeId
      ? (world.items.find((i) => i.id === character.equipped.weapon!.archetypeId) ??
          null)
      : null
    const weaponFamily =
      weaponArchetype && weaponArchetype.kind === 'equipment'
        ? weaponArchetype.damageFamily
        : undefined
    killFamily = weaponFamily
    // Element / family resist applies after the level scale so an iron
    // golem ('crush' resistant) shrugs off a sword swing the same way a
    // fire elemental shrugs off a fireball. No family on a fist-fight
    // → multiplier of 1.
    const resistMult = mobResistMultiplier(mob, weaponFamily)
    // Ambush strike: a single tick where the ambusher's blow lands
    // for 2× damage. Stealth (rogue/ranger opener) stacks an extra
    // 1.5× on top — 3× total — so class-driven ambushes still hit
    // harder than a generic level-delta auto-ambush.
    const charAmbushHit = ambush?.side === 'character' && ambush.ticksLeft === 1
    const ambushMult = charAmbushHit ? 2 : 1
    const stealthMult = charAmbushHit && ambush.reason === 'stealth' ? 1.5 : 1
    const stealthFirstHit = charAmbushHit && ambush.reason === 'stealth'
    const charDmg = Math.max(
      1,
      Math.round(baseCharDmg * outgoingMult * ambushMult * stealthMult * resistMult),
    )
    mobHpAfter = Math.max(0, mob.hp - charDmg)
    const { severity, verb } = damageVerb(
      charDmg,
      mob.maxHp,
      character.worldId,
      weaponFamily,
      rng,
    )
    const weaponName = character.equipped.weapon?.name
    // Stealth-opener prefix and meta flag are PR-side additions; main's
    // formatAttackLog helper doesn't carry them, so this site stays
    // inline. `scaleMult` is threaded through to keep the swing tag
    // working alongside the stealth flavor.
    const stealthPrefix = stealthFirstHit ? 'From the shadows, ' : ''
    const withSuffix = weaponName
      ? `${stealthPrefix}${formatActorName(character, 'log')} ${verb} the ${mob.name} with ${weaponName}.`
      : `${stealthPrefix}${formatActorName(character, 'log')} ${verb} the ${mob.name}.`
    // Severe / critical kills collapse into a single combined entry
    // emitted by `resolveMobDefeat`. Skip the standard damage line
    // here so the log doesn't read "Hiro slashes the Goblin." then
    // "Hiro cleaves the Goblin in half." back-to-back. Lighter-tier
    // kills keep the original two-line cadence.
    const kills = mobHpAfter === 0
    const isFinisher = kills && (severity === 'severe' || severity === 'critical')
    if (isFinisher) {
      combinedKill = {
        severity,
        attackPower: attackRoll,
        defense: mob.defense,
        scaleMult: outgoingMult,
        weaponName,
      }
    } else {
      log = append(log, {
        kind: 'damage',
        text: withSuffix,
        amount: charDmg,
        severity,
        meta: {
          name: formatActorName(character, 'log'),
          mobName: mob.name,
          verb,
          severity,
          itemName: weaponName,
          attackPower: attackRoll,
          defense: mob.defense,
          scaleMult: outgoingMult,
          mobRarity: mob.rarity,
          stealth: stealthFirstHit ? true : undefined,
        },
      })
    }

    // Rogue signature: stealth-opener hits always coat the blade. Silently
    // no-ops when the world doesn't define a 'poisoned' condition — other
    // worlds can add their own rogue-equivalent DoT under that id.
    if (stealthFirstHit && character.classId === 'rogue' && mobHpAfter > 0) {
      const applied = applyMobCondition(mob, world, 'poisoned', {
        name: character.name,
        weaponName: character.equipped.weapon?.name,
      })
      mob = applied.mob
      if (applied.entry) log = append(log, applied.entry)
    }
  }

  if (mobHpAfter === 0) {
    // Pass through the killing family so the defeat line can flavor
    // by kill type: spell → spell.element, melee → weaponFamily (or
    // unarmed claw). Sits at local scope so both branches fill it
    // before reaching this check. `combinedKill`, when set, swaps the
    // standard "X falls." defeat line for a single combined entry that
    // already encodes the killing strike.
    return resolveMobDefeat(
      character,
      mob,
      world,
      log,
      killFamily,
      gatewayExitKey,
      rng,
      combinedKill,
    )
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
        gatewayExitKey,
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
    log = append(log, formatMobSelfHealLog(mobWorking.name, actual, mobWorking.rarity))
    const healedMob: Mob = {
      ...mobWorking,
      hp: healed,
      healChargesLeft: mobWorking.healChargesLeft - 1,
    }
    return {
      character,
      log,
      state: { kind: 'fighting', mob: healedMob, ambush, gatewayExitKey },
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const mobAttackRoll = mob.attack + rng.roll(3) - 2
  const totalDefense = mod(character.stats.dexterity) + defenseBonus
  const baseMobDmg = mobAttackRoll - totalDefense
  const mobDmg = Math.max(1, Math.round(baseMobDmg * incomingMult))
  const charHpAfter = Math.max(0, character.hp - mobDmg)
  // Mob's natural-weapon family — beasts claw, constructs crush, etc.
  // Default 'claw' reads as a generic animal-style attack.
  const mobAttack = damageVerb(
    mobDmg,
    character.maxHp,
    character.worldId,
    mob.attackFamily ?? 'claw',
    rng,
  )

  log = append(log, formatAttackLog({
    direction: 'mob-to-char',
    characterName: formatActorName(character, 'log'),
    mobName: mob.name,
    verb: mobAttack.verb,
    severity: mobAttack.severity,
    amount: mobDmg,
    attackPower: mobAttackRoll,
    defense: totalDefense,
    scaleMult: incomingMult,
    mobRarity: mob.rarity,
  }))

  let postHitChar = character
  if (charHpAfter > 0 && mob.applyOnHit && rng.chance(mob.applyOnHit.chance)) {
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
    return resolveCharacterDeath(character, mob, world, log, rng)
  }

  // Ambush counter was only consumed by the char-only / mob-only branches
  // above; reaching this line means neither fired, so either ambush is
  // already cleared or it wasn't set.
  return {
    character: { ...postHitChar, hp: charHpAfter },
    log,
    state: { kind: 'fighting', mob: { ...mob, hp: mobHpAfter }, ambush, gatewayExitKey },
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
  world: WorldContent,
  defenseBonus: number,
  log: LogEntry[],
  rng: Rng,
  damageMult: number = 1,
): MobAttackOutcome {
  // Self-heal first — an ambushing mob that's somehow already hurt still
  // prefers survival over damage.
  if (mob.hp < mob.maxHp * 0.35 && mob.healChargesLeft > 0) {
    const heal = mob.healAmount ?? Math.max(3, Math.round(mob.maxHp * 0.35))
    const healed = Math.min(mob.maxHp, mob.hp + heal)
    log = append(log, formatMobSelfHealLog(mob.name, healed - mob.hp, mob.rarity))
    return {
      kind: 'alive',
      character,
      mob: { ...mob, hp: healed, healChargesLeft: mob.healChargesLeft - 1 },
      log,
    }
  }

  const levelDelta = character.level - mob.level
  const incomingMult = levelScaleIncoming(levelDelta)
  const mobAttackRoll = mob.attack + rng.roll(3) - 2
  const totalDefense = mod(character.stats.dexterity) + defenseBonus
  const base = mobAttackRoll - totalDefense
  const dmg = Math.max(1, Math.round(base * incomingMult * damageMult))
  const hpAfter = Math.max(0, character.hp - dmg)
  const verb = damageVerb(dmg, character.maxHp, character.worldId, mob.attackFamily ?? 'claw', rng)
  log = append(log, formatAttackLog({
    direction: 'mob-to-char',
    characterName: formatActorName(character, 'log'),
    mobName: mob.name,
    verb: verb.verb,
    severity: verb.severity,
    amount: dmg,
    attackPower: mobAttackRoll,
    defense: totalDefense,
    scaleMult: incomingMult,
    mobRarity: mob.rarity,
  }))

  if (hpAfter === 0) {
    return { kind: 'died', playing: resolveCharacterDeath(character, mob, world, log, rng) }
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
        kind: 'meta',
        text: `The world seems to move by faster now…`,
        meta: { name: p.character.name },
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
    const srcArea = world.areas?.find((a) => a.id === srcAreaId)
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
  const bumped: Playing = {
    ...p,
    character: { ...p.character, ticks: (p.character.ticks ?? 0) + 1 },
  }
  // Then check whether the freshly-bumped tick count crosses an auto-ramp
  // milestone. The narrative log entry it appends carries the speed-up
  // beat so the player notices the cadence change.
  const withTick = maybeRampTickSpeed(bumped)
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
  // Stamp the post-tick PRNG state back onto the character so the next
  // tick resumes from the same stream position.
  const stamped: Playing = {
    ...after,
    character: { ...after.character, rngState: rng.save() },
  }

  // Journal derivation — single chokepoint, mirrors the effects
  // pipeline. Compares pre-tick state to post-tick state + the new log
  // entries and emits journal entries for milestones. Writes land on
  // the returned character so every tick transition is fully captured
  // without threading journal state through every sub-handler.
  //
  // `newLogEntries` is computed by Set-identity difference rather than
  // a length-based slice. Length diff breaks once the log hits cap:
  // every append past cap evicts an old entry, so
  // `after.log.length === withTick.log.length` even though new entries
  // were added. Identity diff is robust to that eviction — we only
  // look for entries present in `after` but not in `withTick`.
  const beforeSet = new Set(withTick.log)
  const newLogEntries = stamped.log.filter((e) => !beforeSet.has(e))
  const journalAdds = deriveJournalEntries(
    withTick.character,
    stamped.character,
    newLogEntries,
    world,
  )
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
