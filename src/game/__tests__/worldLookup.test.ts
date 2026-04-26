import { beforeEach, describe, expect, it } from 'vitest'
import type { Area } from '../../areas'
import { getWorldContent, type WorldContent } from '../../worlds'
import { __metrics, findArea, getArea, getItem, getMob } from '../worldLookup'

const world = getWorldContent('fantasy')!

beforeEach(() => {
  __metrics.resetForTests()
})

describe('worldLookup.getArea', () => {
  it('returns the same Area for every authored id', () => {
    expect(world.areas).toBeDefined()
    for (const a of world.areas ?? []) {
      expect(getArea(world, a.id)).toBe(a)
    }
  })

  it('returns startingArea when the id is unknown', () => {
    expect(getArea(world, 'never-defined-area-id')).toBe(world.startingArea)
  })

  it('returns startingArea when the id matches the starting area', () => {
    expect(getArea(world, world.startingArea.id)).toBe(world.startingArea)
  })

  // Regression test: buildIndex explicitly inserts startingArea into
  // the areas map even when it isn't in the `areas` array. Without
  // that explicit insert, `getArea(world, world.startingArea.id)`
  // would fall through to the unknown-id path and STILL return
  // startingArea by accident — the bug would only surface on a world
  // that has a non-startingArea id that happens to match the lookup.
  // Constructing a synthetic world makes the invariant testable.
  it('returns startingArea when startingArea.id is NOT in world.areas', () => {
    const isolatedStart: Area = {
      ...world.startingArea,
      id: 'isolated-only-as-starting',
    }
    const otherArea: Area = {
      ...world.startingArea,
      id: 'some-other-area',
    }
    const synthetic: WorldContent = {
      ...world,
      startingArea: isolatedStart,
      areas: [otherArea], // does NOT include startingArea
    }
    expect(getArea(synthetic, 'isolated-only-as-starting')).toBe(isolatedStart)
    // Sanity: the other area is reachable, the start is reachable,
    // and an unknown id falls back to the start.
    expect(getArea(synthetic, 'some-other-area')).toBe(otherArea)
    expect(getArea(synthetic, 'never-defined')).toBe(isolatedStart)
  })
})

describe('worldLookup.findArea', () => {
  it('returns the matching Area for known ids', () => {
    for (const a of world.areas ?? []) {
      expect(findArea(world, a.id)).toBe(a)
    }
  })

  it('returns undefined for unknown ids (NO startingArea fallback)', () => {
    // Deliberate distinction from getArea: callers like generatingArea
    // mutate the matched room (skipGeneration = true), so falling back
    // to startingArea would silently target the wrong area.
    expect(findArea(world, 'never-defined-area-id')).toBeUndefined()
  })
})

describe('worldLookup.getItem', () => {
  it('returns the same ItemDef for every id', () => {
    for (const i of world.items) {
      expect(getItem(world, i.id)).toBe(i)
    }
  })

  it('returns undefined for unknown ids', () => {
    expect(getItem(world, 'never-defined-item-id')).toBeUndefined()
  })

  it('returns undefined for empty / nullish id', () => {
    expect(getItem(world, undefined)).toBeUndefined()
    expect(getItem(world, '')).toBeUndefined()
  })
})

describe('worldLookup.getMob', () => {
  it('returns the same MobTemplate for every id', () => {
    for (const m of world.mobs) {
      expect(getMob(world, m.id)).toBe(m)
    }
  })

  it('returns undefined for unknown ids', () => {
    expect(getMob(world, 'never-defined-mob-id')).toBeUndefined()
  })
})

describe('worldLookup — caching (instrumented, not timed)', () => {
  // Tests use a fresh WorldContent identity each run so they aren't
  // affected by earlier tests that already primed the module-level
  // cache for the shared `world` reference.
  it('builds the index exactly once per world', () => {
    const w: WorldContent = { ...world } // fresh ref → cold cache
    // First call builds; subsequent calls reuse. We don't time
    // anything — the metric tells us directly whether the cache hit.
    getArea(w, w.startingArea.id)
    expect(__metrics.buildIndexCalls).toBe(1)
    getArea(w, w.startingArea.id)
    getItem(w, w.items[0].id)
    getMob(w, w.mobs[0].id)
    findArea(w, 'whatever')
    // All four subsequent lookups reuse the same WorldIndex.
    expect(__metrics.buildIndexCalls).toBe(1)
    // 5 calls total (one prior, four after).
    expect(__metrics.indexLookups).toBe(5)
  })

  it('builds a separate index for a different world reference', () => {
    const w1: WorldContent = { ...world }
    const w2: WorldContent = { ...world }
    getArea(w1, w1.startingArea.id) // first build
    expect(__metrics.buildIndexCalls).toBe(1)
    getArea(w2, w2.startingArea.id) // different identity → second build
    expect(__metrics.buildIndexCalls).toBe(2)
  })
})
