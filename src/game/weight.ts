import type { Character, InventoryItem } from '../character'
import type { WorldContent } from '../worlds'
import { DRIVE_MAX } from './drives'
import { getItem } from './worldLookup'

const BASE_CAPACITY = 20

export function weightCapacity(character: Character): number {
  const strMod = Math.floor((character.stats.strength - 10) / 2)
  return BASE_CAPACITY + strMod
}

// =============================================================================
// Cache instrumentation — exposed for tests so we can assert "this call
// was a cache miss" without relying on wall-clock timing. Production code
// MUST NOT branch on these counters; they're observability only.
// =============================================================================

export const __metrics = {
  weightCacheHits: 0,
  weightCacheMisses: 0,
  inventoryWeightHits: 0,
  inventoryWeightMisses: 0,
  resetForTests(): void {
    this.weightCacheHits = 0
    this.weightCacheMisses = 0
    this.inventoryWeightHits = 0
    this.inventoryWeightMisses = 0
  },
}

// =============================================================================
// computeInventoryWeight — sums archetype weights across the character's
// inventory. Used by both weightDriveValue and the loot drop-bias logic
// (loot.ts) to project pre-drop carry weight without committing items.
//
// Cached by (inventory ref, world ref) tuple. The two callers either pass
// the live character.inventory (always identity-stable across ticks until
// equip/loot/sell mutates it) or a synthesized array (loot.ts builds
// `existingInventory` once per drop resolution). The cache helps the live
// path; the synthesized path naturally gets a unique key and pays one
// recompute, which is appropriate.
// =============================================================================

interface InventoryWeightCacheEntry {
  weight: number
  world: WorldContent
}
const inventoryWeightCache = new WeakMap<readonly InventoryItem[], InventoryWeightCacheEntry>()

export function computeInventoryWeight(
  character: Character,
  world: WorldContent,
): number {
  const cached = inventoryWeightCache.get(character.inventory)
  if (cached && cached.world === world) {
    __metrics.inventoryWeightHits++
    return cached.weight
  }
  __metrics.inventoryWeightMisses++
  let total = 0
  for (const item of character.inventory) {
    const def = getItem(world, item.archetypeId)
    const w = def?.weight ?? 1
    total += w * (item.quantity ?? 1)
  }
  // INVARIANT: the cache key is `character.inventory` (the array
  // reference). Throughout the codebase, inventory mutations go through
  // immutable spreads — `inventory: [...c.inventory, item]`, never
  // `c.inventory.push(...)` — so the array reference changes whenever
  // the contents do. If anyone ever introduces an in-place mutation
  // (push/splice/pop/shift/sort/reverse/unshift) on a character's
  // inventory, this cache will silently return stale values. The same
  // invariant guards `weightCache` below.
  inventoryWeightCache.set(character.inventory, { weight: total, world })
  return total
}

// =============================================================================
// weightDriveValue — normalized 0..DRIVE_MAX representation of how
// loaded the character is, given their STR-derived capacity. Stamped
// every explore tick; this cache is the highest-leverage tick-loop win.
//
// Cached by (inventory ref, strength, world ref). Strength is captured
// because level-ups bump capacity. World is captured because different
// worlds can have different weight definitions for the same archetype id.
// =============================================================================

interface WeightCacheEntry {
  weight: number
  strength: number
  world: WorldContent
}
const weightCache = new WeakMap<readonly InventoryItem[], WeightCacheEntry>()

/** Computed-not-grown weight drive value. Sums archetype weights across
 *  the inventory, normalizes against the character's STR-derived
 *  capacity. Result is cached on `character.inventory` (array
 *  reference); subsequent calls with the same inventory + strength +
 *  world skip the recompute. See INVARIANT in `computeInventoryWeight`. */
export function weightDriveValue(
  character: Character,
  world: WorldContent,
): number {
  const cached = weightCache.get(character.inventory)
  if (
    cached &&
    cached.strength === character.stats.strength &&
    cached.world === world
  ) {
    __metrics.weightCacheHits++
    return cached.weight
  }
  __metrics.weightCacheMisses++
  const cap = weightCapacity(character)
  let value: number
  if (cap <= 0) {
    value = DRIVE_MAX
  } else {
    const total = computeInventoryWeight(character, world)
    value = Math.min(DRIVE_MAX, Math.max(0, Math.round((total / cap) * DRIVE_MAX)))
  }
  weightCache.set(character.inventory, {
    weight: value,
    strength: character.stats.strength,
    world,
  })
  return value
}
