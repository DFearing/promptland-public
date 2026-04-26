import type { Character, LevelSegment } from '../character'
import { formatActorName } from '../character'
import { RARITIES, rollMobRarity, type Rarity } from '../items'
import type { LogEntry } from '../log'
import { spawn, type Mob } from '../mobs'
import type { Rng } from '../rng'
import { getWorldManifest, type WorldContent } from '../worlds'
import { applyAutoEquip, equipLogEntry, isRedundantEquip } from './equip'
import { formatGoldPickupLog } from './logLines'
import { append } from './logCap'
import { stampWeight } from './navigation'
import { applyChestEntries, type Drops } from './loot'
import { getItem, getMob } from './worldLookup'
import type { Playing } from './tick'

// =============================================================================
// Tunables
// =============================================================================

/** Per-tick chance an exploring character runs into a random encounter
 *  in a non-safe room. Tuned so a typical exploration tick reads as
 *  occasional combat punctuating walking, not constant fights. */
export const ENCOUNTER_CHANCE = 0.30

/** Locked-chest pacing constants. Drops accumulate in `character.lockedChest`
 *  for `BASE + items.length × PER_ITEM` ticks (capped at MAX) before the
 *  chest unlatches and the items merge into inventory. The wait is the
 *  diegetic surface that hides any post-combat asynchrony — issue #75
 *  per-descriptor sprite generation runs invisibly inside this window
 *  when that lands. Values tuned so a typical kill (1–2 items) waits ~6–10s
 *  at 1× tick speed (TICK_MS.exploring = 2s) — long enough for the player
 *  to register the chest, short enough to avoid feeling padded. */
export const CHEST_BASE_TICKS = 3
export const CHEST_PER_ITEM_TICKS = 1
export const CHEST_MAX_TICKS = 12

// =============================================================================
// Encounter spawning
// =============================================================================

/** Spawn a random encounter from the world's pool keyed off the room
 *  type. Returns null when the room type has no encounters or the
 *  rolled mob isn't in the world's mob list (stale generation). */
export function rollEncounterFor(
  world: WorldContent,
  type: string,
  areaLevel: number = 1,
  rng: Rng,
): Mob | null {
  const ids = world.encounters[type as keyof WorldContent['encounters']]
  if (!ids || ids.length === 0) return null
  const id = rng.pick(ids)
  const template = getMob(world, id)
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

/** Spawns a specific mob id at a specific rarity — the curated-encounter
 *  path. Same area-level offset as `rollEncounterFor` so a curated mob
 *  in a level-N room reads at the same relative threat as a pool roll.
 *  Returns null when the mob id isn't in the world pool (stale
 *  generation referencing a removed mob, typo in an authored area, etc.)
 *  so callers can graceful-fallback to the random pool. */
export function spawnCuratedEncounter(
  world: WorldContent,
  mobId: string,
  rarity: Rarity,
  areaLevel: number = 1,
): Mob | null {
  const template = getMob(world, mobId)
  if (!template) return null
  const mob = spawn(template, rarity)
  const offset = Math.max(0, areaLevel - 1)
  const leveled = offset > 0 ? { ...mob, level: mob.level + offset } : mob
  return { ...leveled, curated: true }
}

// =============================================================================
// Segment tracking
// =============================================================================

function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r)
}

/** Promote `mob` to the segment's "baddest enemy" record if it
 *  out-ranks the existing one (by rarity, then by xpReward). Pure;
 *  callers pipe this into the trackedForBaddest character that flows
 *  into the rest of resolveMobDefeat. Idempotent on a tied candidate. */
export function trackBaddest(character: Character, mob: Mob): Character {
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

// =============================================================================
// Drop log formatting
// =============================================================================

/** Oxford-comma list join: ["A"] → "A", ["A","B"] → "A and B",
 *  ["A","B","C"] → "A, B, and C". Used by the batched pickup line so a
 *  single drop reads as one readable sentence instead of N bullet lines. */
function joinList(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** Append gold-pickup and item-pickup log lines for a single drop event.
 *  Item pickups batch into one "X picks up A, B, and C" entry with an
 *  `items[]` payload so LogPanel renders each name as a clickable
 *  bracket and journal derivation gates first-finds per-item. Returns
 *  the original log unchanged when there's nothing to log. */
export function appendDropLogs(
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
    const def = getItem(world, drop.itemId)
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

// =============================================================================
// Locked chest tick
// =============================================================================

/** Decrements the locked chest's countdown and, when it hits zero,
 *  unlatches: items merge into inventory, gold credits, auto-equip
 *  fires, and a `kind: 'loot'` line emits with the items[] payload so
 *  journal first-find lights up at the moment the player actually
 *  sees the items. Called at the top of every `runTick` regardless of
 *  state — the chest is wall-clock, not state-bound, so a long fight
 *  can't pin it shut. No-op when no chest is set. */
export function tickLockedChest(p: Playing, world: WorldContent, rng: Rng): Playing {
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
    const charName = formatActorName(character, 'log')
    log = append(log, {
      kind: 'loot',
      text: `The chest unlatches — ${charName} takes ${list}.`,
      meta: {
        name: charName,
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
