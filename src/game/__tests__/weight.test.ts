import { beforeEach, describe, expect, it } from 'vitest'
import type { Character, InventoryItem } from '../../character'
import type { ItemDef } from '../../items'
import { getWorldContent, type WorldContent } from '../../worlds'
import {
  __metrics,
  computeInventoryWeight,
  weightCapacity,
  weightDriveValue,
} from '../weight'

const world = getWorldContent('fantasy')!

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test',
    name: 'Hiro',
    worldId: 'fantasy',
    worldVersion: '1',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: 0,
    level: 1,
    xp: 0,
    hp: 10,
    maxHp: 10,
    magic: 0,
    maxMagic: 0,
    gold: 0,
    stats: {
      strength: 14,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    inventory: [],
    equipped: {},
    position: { areaId: 'millhaven', x: 0, y: 0, z: 0 },
    visitedRooms: [],
    deaths: [],
    levelUps: [],
    drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: 0, piety: 0 },
    conditions: [],
    spells: [],
    rngState: 1,
    ...overrides,
  }
}

function makeItem(archetypeId: string, quantity: number = 1): InventoryItem {
  return {
    id: `inv-${archetypeId}-${quantity}`,
    archetypeId,
    name: archetypeId,
    quantity,
  }
}

beforeEach(() => {
  __metrics.resetForTests()
})

describe('weightDriveValue — pure correctness', () => {
  it('returns 0 for an empty inventory', () => {
    const c = makeCharacter()
    expect(weightDriveValue(c, world)).toBe(0)
  })

  it('grows with inventory size', () => {
    const c1 = makeCharacter({
      inventory: [makeItem(world.items[0].id, 1)],
    })
    const c2 = makeCharacter({
      inventory: [
        makeItem(world.items[0].id, 1),
        makeItem(world.items[1].id, 1),
        makeItem(world.items[2].id, 1),
      ],
    })
    expect(weightDriveValue(c2, world)).toBeGreaterThanOrEqual(
      weightDriveValue(c1, world),
    )
  })

  it('returns DRIVE_MAX when capacity is zero or negative', () => {
    const cWeak = makeCharacter()
    cWeak.stats.strength = -50 // capacity = 20 + (-30) = -10
    expect(weightCapacity(cWeak)).toBeLessThanOrEqual(0)
    // DRIVE_MAX is 100 (see drives.ts).
    expect(weightDriveValue(cWeak, world)).toBe(100)
  })
})

describe('weightDriveValue — cache hits (instrumented, not timed)', () => {
  it('returns the same value on repeated calls with the same inventory ref', () => {
    const c = makeCharacter({
      inventory: [makeItem(world.items[0].id, 1)],
    })
    const v1 = weightDriveValue(c, world)
    const v2 = weightDriveValue(c, world)
    const v3 = weightDriveValue(c, world)
    expect(v1).toBe(v2)
    expect(v2).toBe(v3)
    // First call is a miss; the next two MUST hit. This catches a
    // subtle regression — e.g. if anyone changes the cache key shape
    // without also updating the lookup, all calls become misses and
    // the test would catch it directly rather than via a flaky
    // wall-clock budget.
    expect(__metrics.weightCacheMisses).toBe(1)
    expect(__metrics.weightCacheHits).toBe(2)
  })

  it('100k repeated calls produce exactly 1 miss and 99,999 hits', () => {
    const inventory: InventoryItem[] = []
    for (let i = 0; i < world.items.length; i++) {
      inventory.push(makeItem(world.items[i].id, 1))
    }
    const c = makeCharacter({ inventory })
    for (let i = 0; i < 100_000; i++) {
      weightDriveValue(c, world)
    }
    // The first call lands one miss. Every subsequent call MUST hit.
    // If it doesn't, the cache key isn't stable across calls — which
    // is the actual regression we'd be chasing.
    expect(__metrics.weightCacheMisses).toBe(1)
    expect(__metrics.weightCacheHits).toBe(99_999)
  })
})

describe('weightDriveValue — cache invalidation', () => {
  it('recomputes when inventory array reference changes', () => {
    const inv1: InventoryItem[] = [makeItem(world.items[0].id, 1)]
    const c1 = makeCharacter({ inventory: inv1 })
    const v1 = weightDriveValue(c1, world)

    // New inventory array — heavier load.
    const inv2: InventoryItem[] = [
      makeItem(world.items[0].id, 1),
      makeItem(world.items[1].id, 1),
      makeItem(world.items[2].id, 1),
      makeItem(world.items[3].id, 1),
    ]
    const c2 = { ...c1, inventory: inv2 }
    const v2 = weightDriveValue(c2, world)

    expect(v2).toBeGreaterThanOrEqual(v1)
    // Original character cache still hits the original value.
    expect(weightDriveValue(c1, world)).toBe(v1)
    // Two distinct inventory refs ⇒ two misses + one hit (the c1
    // re-lookup at the end).
    expect(__metrics.weightCacheMisses).toBe(2)
    expect(__metrics.weightCacheHits).toBe(1)
  })

  it('recomputes when strength changes (capacity changes)', () => {
    const inventory: InventoryItem[] = [makeItem(world.items[0].id, 5)]
    const c1 = makeCharacter({
      inventory,
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    })
    const v1 = weightDriveValue(c1, world)

    // Same inventory ref, but stronger character ⇒ bigger capacity ⇒
    // smaller drive value.
    const c2: Character = {
      ...c1,
      stats: { ...c1.stats, strength: 20 },
    }
    const v2 = weightDriveValue(c2, world)
    expect(v2).toBeLessThanOrEqual(v1)
    // Both calls are misses — strength changed even though inventory
    // didn't.
    expect(__metrics.weightCacheMisses).toBe(2)
    expect(__metrics.weightCacheHits).toBe(0)
  })

  it('recomputes and returns DIFFERENT values when world changes the same archetype id weight', () => {
    // Construct a synthetic archetype that exists with two different
    // weights in two separate worlds. The cache MUST recompute when
    // the world ref changes, and the returned value MUST reflect the
    // new world's definition (not the cached one).
    const heavyItem: ItemDef = {
      id: 'synth-heavy',
      name: 'Synthetic Brick',
      description: 'A brick.',
      kind: 'junk',
      weight: 100, // very heavy
    }
    const lightItem: ItemDef = {
      id: 'synth-heavy', // same archetype id
      name: 'Synthetic Feather',
      description: 'A feather.',
      kind: 'junk',
      weight: 1, // very light
    }
    // Build two minimal WorldContent stubs with the same shape but
    // different item-def weight for the same id. Tests pass the world
    // reference through the cache key.
    const heavyWorld: WorldContent = { ...world, items: [heavyItem] }
    const lightWorld: WorldContent = { ...world, items: [lightItem] }

    const c = makeCharacter({
      inventory: [makeItem('synth-heavy', 1)],
      stats: {
        strength: 10, // capacity = 20
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    })

    const heavy = weightDriveValue(c, heavyWorld)
    const light = weightDriveValue(c, lightWorld)
    // Heavy 100 / capacity 20 saturates at DRIVE_MAX=100.
    // Light 1 / 20 = 5%.
    expect(heavy).toBe(100)
    expect(light).toBe(5)
    expect(heavy).not.toBe(light) // proves the cache didn't return stale value
    expect(__metrics.weightCacheMisses).toBe(2) // two distinct world keys
    expect(__metrics.weightCacheHits).toBe(0)
  })
})

describe('computeInventoryWeight — caching', () => {
  it('hits the cache on repeated calls with the same inventory + world', () => {
    const c = makeCharacter({
      inventory: [makeItem(world.items[0].id, 5)],
    })
    const w1 = computeInventoryWeight(c, world)
    const w2 = computeInventoryWeight(c, world)
    const w3 = computeInventoryWeight(c, world)
    expect(w1).toBe(w2)
    expect(w2).toBe(w3)
    expect(__metrics.inventoryWeightMisses).toBe(1)
    expect(__metrics.inventoryWeightHits).toBe(2)
  })

  it('weightDriveValue cache miss still hits the inventoryWeight cache when inventory ref is shared', () => {
    // weightDriveValue invalidates on strength change, but the
    // underlying inventoryWeight only depends on (inventory, world).
    // A strength-only change should miss weightCache but reuse the
    // already-computed inventory weight from the inner cache.
    const inventory: InventoryItem[] = [makeItem(world.items[0].id, 3)]
    const c1 = makeCharacter({
      inventory,
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    })
    weightDriveValue(c1, world) // primes both caches
    const c2: Character = {
      ...c1,
      stats: { ...c1.stats, strength: 20 },
    }
    weightDriveValue(c2, world) // weightCache miss, but inventoryWeight should hit
    expect(__metrics.weightCacheMisses).toBe(2)
    expect(__metrics.inventoryWeightMisses).toBe(1) // one cold call only
    expect(__metrics.inventoryWeightHits).toBe(1) // the second weightDriveValue reused it
  })
})
