import type { Area } from '../areas'
import type { ItemDef } from '../items'
import type { MobTemplate } from '../mobs'
import type { WorldContent } from '../worlds'

interface WorldIndex {
  areas: Map<string, Area>
  items: Map<string, ItemDef>
  mobs: Map<string, MobTemplate>
}

// Lazily-built indexes keyed by WorldContent identity. WeakMap so that
// when a world is replaced (multi-world play, world content swap during
// dev) the indexes get GC'd alongside.
const cache = new WeakMap<WorldContent, WorldIndex>()

// Hit/miss counters for tests. Tests can read `__metrics` to assert
// "this call was a cache miss" without relying on wall-clock timing
// (which is flaky on slow CI runners). Production code MUST NOT branch
// on these counters — they're observability only.
export const __metrics = {
  buildIndexCalls: 0,
  indexLookups: 0,
  resetForTests(): void {
    this.buildIndexCalls = 0
    this.indexLookups = 0
  },
}

function buildIndex(world: WorldContent): WorldIndex {
  __metrics.buildIndexCalls++
  const areas = new Map<string, Area>()
  // startingArea isn't always in the `areas` array — explicitly include
  // it so callers can look up the entry area without a fallback.
  areas.set(world.startingArea.id, world.startingArea)
  if (world.areas) {
    for (const a of world.areas) areas.set(a.id, a)
  }
  const items = new Map<string, ItemDef>()
  for (const i of world.items) items.set(i.id, i)
  const mobs = new Map<string, MobTemplate>()
  for (const m of world.mobs) mobs.set(m.id, m)
  return { areas, items, mobs }
}

function indexFor(world: WorldContent): WorldIndex {
  __metrics.indexLookups++
  let idx = cache.get(world)
  if (!idx) {
    idx = buildIndex(world)
    cache.set(world, idx)
  }
  return idx
}

/** O(1) area lookup. Returns world.startingArea when the id is unknown
 *  — same fallback the previous `getArea` helper used. Use `findArea`
 *  when you need the unknown-id case to return undefined instead. */
export function getArea(world: WorldContent, areaId: string): Area {
  return indexFor(world).areas.get(areaId) ?? world.startingArea
}

/** O(1) area lookup that returns undefined for unknown ids, in
 *  contrast to `getArea`'s startingArea fallback. Used by callers
 *  that mutate or write to a specific area — falling back to
 *  startingArea would silently target the wrong area. */
export function findArea(world: WorldContent, areaId: string): Area | undefined {
  return indexFor(world).areas.get(areaId)
}

/** O(1) item-archetype lookup. Returns undefined when the id isn't in
 *  the world pool — callers handle that path explicitly (graceful
 *  fallback for stale generation pointing at removed items). */
export function getItem(world: WorldContent, itemId: string | undefined): ItemDef | undefined {
  if (!itemId) return undefined
  return indexFor(world).items.get(itemId)
}

/** O(1) mob-template lookup. Returns undefined for unknown ids so
 *  callers can graceful-fallback to the random pool. */
export function getMob(world: WorldContent, mobId: string): MobTemplate | undefined {
  return indexFor(world).mobs.get(mobId)
}
