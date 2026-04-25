import type { AreaKind, RoomType } from './types'

/**
 * A single cell in a pre-generated area shape. Position + mechanical room
 * type are fixed by the algorithm; `hint` is an optional short phrase the
 * LLM uses as thematic direction when naming / describing the room. Kept
 * off the core Room / RoomArchetype type because hints are transient
 * (only used during generation, never persisted on the final Area).
 */
export interface ShapeRoom {
  x: number
  y: number
  z: number
  type: RoomType
  hint?: string
}

function seedFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

// Mulberry32 — cheap, well-distributed, deterministic PRNG. Only used for
// small variants (which corner holds the shrine, which chamber branches
// off the spine) so the shape still feels custom across different
// seeds without straying from its silhouette.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

// Settlement — compact 3×3 town footprint with a safe-room plaza at the
// centre and merchant / rest rooms radiating on the cardinals. Corners
// stay as corridor so they read as "town edge streets" on the map.
function settlementShape(rand: () => number): ShapeRoom[] {
  const innShrine: readonly RoomType[] = ['inn', 'shrine']
  const shopWater: readonly RoomType[] = ['shop', 'water']
  const nType = pick(innShrine, rand)
  const sType = pick(innShrine, rand)
  const wType = pick(shopWater, rand)
  const eType = pick(shopWater, rand)
  return [
    { x: 0, y: 0, z: 0, type: 'corridor', hint: 'northwest corner street' },
    { x: 1, y: 0, z: 0, type: nType, hint: 'notable building on the north side of town' },
    { x: 2, y: 0, z: 0, type: 'corridor', hint: 'northeast corner street' },
    { x: 0, y: 1, z: 0, type: wType, hint: 'notable building on the west side of town' },
    { x: 1, y: 1, z: 0, type: 'safe', hint: 'central town plaza / meeting hub' },
    { x: 2, y: 1, z: 0, type: eType, hint: 'notable building on the east side of town' },
    { x: 0, y: 2, z: 0, type: 'corridor', hint: 'southwest corner street' },
    { x: 1, y: 2, z: 0, type: sType, hint: 'notable building on the south side of town' },
    { x: 2, y: 2, z: 0, type: 'corridor', hint: 'southeast corner street' },
  ]
}

// Wilderness — a single road spine running west-to-east at y=1, with two
// clearing chambers hanging off it. Empty (x, y) cells above and below
// are intentional — they read on the map as "road through nothing much."
function wildernessShape(rand: () => number): ShapeRoom[] {
  const road: ShapeRoom[] = []
  for (let x = 0; x <= 5; x++) {
    road.push({ x, y: 1, z: 0, type: 'corridor', hint: `road / trail segment ${x + 1}` })
  }
  const northX = 1 + Math.floor(rand() * 2) // 1 or 2
  const southX = 3 + Math.floor(rand() * 2) // 3 or 4
  return [
    ...road,
    {
      x: northX,
      y: 0,
      z: 0,
      type: 'chamber',
      hint: 'clearing or landmark off the north side of the road',
    },
    {
      x: southX,
      y: 2,
      z: 0,
      type: 'chamber',
      hint: 'clearing or landmark off the south side of the road',
    },
  ]
}

// Dungeon — a long corridor spine ending in a grand room. The boss
// chamber is one step off the chest antechamber so the last two rooms
// feel like a set piece: chest antechamber, then boss. One branch at
// mid-spine keeps the corridor from feeling like a rail.
function dungeonShape(rand: () => number): ShapeRoom[] {
  const spine: ShapeRoom[] = []
  for (let x = 0; x <= 3; x++) {
    spine.push({
      x,
      y: 1,
      z: 0,
      type: 'corridor',
      hint: x === 0 ? 'entry corridor' : 'descending corridor',
    })
  }
  const branchY = rand() < 0.5 ? 0 : 2
  const branchType: RoomType = rand() < 0.5 ? 'crypt' : 'storage'
  return [
    ...spine,
    {
      x: 2,
      y: branchY,
      z: 0,
      type: branchType,
      hint: 'side chamber branching off the main corridor',
    },
    {
      x: 4,
      y: 1,
      z: 0,
      type: 'storage',
      hint: 'treasure antechamber — chests, sarcophagi, chest room',
    },
    {
      x: 4,
      y: 0,
      z: 0,
      type: 'chamber',
      hint: 'grand terminal chamber — boss fight, throne, or ritual space',
    },
  ]
}

// Ruin — sparse scatter of chambers linked by short corridors, with
// gaps between rooms to read as collapsed / overgrown architecture.
function ruinShape(): ShapeRoom[] {
  return [
    { x: 0, y: 0, z: 0, type: 'crypt', hint: 'collapsed antechamber (entry)' },
    { x: 1, y: 0, z: 0, type: 'corridor', hint: 'broken passage north' },
    { x: 2, y: 1, z: 0, type: 'chamber', hint: 'central ruined hall' },
    { x: 1, y: 2, z: 0, type: 'corridor', hint: 'broken passage south' },
    { x: 0, y: 2, z: 0, type: 'crypt', hint: 'sealed or collapsed tomb' },
    { x: 3, y: 2, z: 0, type: 'chamber', hint: 'roofless outer court' },
  ]
}

/**
 * Deterministically generates a room shape for the given area kind. The
 * same `seed` always produces the same layout so repeated gens at the
 * same exit hit the cache. Callers then feed this shape to the LLM for
 * flavor (names, descriptions) only — layout, position, and type are
 * decided here and never moved.
 */
export function generateShape(kind: AreaKind, seed: string): ShapeRoom[] {
  const rand = mulberry32(seedFromString(seed))
  switch (kind) {
    case 'settlement':
      return settlementShape(rand)
    case 'wilderness':
      return wildernessShape(rand)
    case 'dungeon':
      return dungeonShape(rand)
    case 'ruin':
      return ruinShape()
  }
}
