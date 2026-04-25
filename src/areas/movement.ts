import type { Area, Position } from './types'
import { roomKey } from './types'

// 8-way horizontal neighbours (N, NE, E, SE, S, SW, W, NW). Up/down come later.
const DIRS_2D: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
]

export function neighborsOf(area: Area, position: Position): Position[] {
  if (position.areaId !== area.id) return []
  const out: Position[] = []
  for (const [dx, dy] of DIRS_2D) {
    const nx = position.x + dx
    const ny = position.y + dy
    if (area.rooms[roomKey(nx, ny, position.z)]) {
      out.push({ areaId: area.id, x: nx, y: ny, z: position.z })
    }
  }
  return out
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}

export function stepTowards(area: Area, from: Position, target: Position): Position | null {
  const options = neighborsOf(area, from)
  if (options.length === 0) return null
  let best: Position | null = null
  let bestDist = Infinity
  for (const opt of options) {
    const d = manhattan(opt, target)
    if (d < bestDist) {
      bestDist = d
      best = opt
    }
  }
  return best
}

// 10-way adjacency (8 compass + up + down). Used by connectivity checks —
// slightly more permissive than `neighborsOf`, which is 2D-only because
// auto-wander never crosses floors. Vertical connections still count as
// "connected" for purposes of pruning orphaned rooms, since the D-pad
// can traverse them manually.
const DIRS_3D: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0],
  [1, -1, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [-1, 1, 0],
  [-1, 0, 0],
  [-1, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** Default cap applied by `enforceAreaCaps` — tune here, not per caller,
 *  so authored and generated areas follow the same rule. 2 ladders /
 *  2 exits is the design target: 1 is the typical count, 2 leaves room
 *  for a branching area, beyond that the map clutters. */
export const AREA_LIMITS = { maxLadders: 2, maxExits: 2 } as const

function pairDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/** Picks up to `cap` entries from `candidates` that are maximally
 *  spread — start with the first as seed, then greedily pick the one
 *  farthest from every already-chosen entry. Used for both ladder and
 *  exit selection so "keep the two most-separated ones" stays
 *  consistent. Ordering of `candidates` only matters for the seed. */
function pickSpread(
  candidates: Array<{ xy: [number, number]; key: string }>,
  cap: number,
): Set<string> {
  const kept = new Set<string>()
  if (candidates.length === 0) return kept
  const chosen: Array<{ xy: [number, number]; key: string }> = []
  chosen.push(candidates[0])
  kept.add(candidates[0].key)
  while (chosen.length < cap && chosen.length < candidates.length) {
    let best = -1
    let bestDist = -1
    for (let i = 0; i < candidates.length; i++) {
      if (kept.has(candidates[i].key)) continue
      let minDist = Infinity
      for (const c of chosen) {
        const d = pairDistance(candidates[i].xy, c.xy)
        if (d < minDist) minDist = d
      }
      if (minDist > bestDist) {
        bestDist = minDist
        best = i
      }
    }
    if (best < 0) break
    chosen.push(candidates[best])
    kept.add(candidates[best].key)
  }
  return kept
}

/**
 * Returns an area with at most `maxLadders` vertical connections and at
 * most `maxExits` exit-type rooms. Excess ladders collapse by dropping
 * upper-floor rooms at over-budget (x,y) pairs; excess exits are
 * re-typed to `corridor` so the map still has a tile there, just not
 * another portal-to-unknown. Both selectors prefer the most-spread
 * placements via a greedy farthest-point pass so caps don't all end up
 * clustered.
 *
 * Idempotent. Keeps the original reference when no caps are exceeded.
 */
export function enforceAreaCaps(
  area: Area,
  limits: { maxLadders: number; maxExits: number } = AREA_LIMITS,
): Area {
  let rooms = area.rooms
  let changed = false

  // Ladders — group by (x,y); any pair with 2+ floors is one ladder.
  const zByXy = new Map<string, Set<number>>()
  for (const room of Object.values(rooms)) {
    const k = `${room.x},${room.y}`
    const zs = zByXy.get(k) ?? new Set<number>()
    zs.add(room.z)
    zByXy.set(k, zs)
  }
  const ladderCandidates: Array<{ xy: [number, number]; key: string }> = []
  for (const [k, zs] of zByXy) {
    if (zs.size > 1) {
      const [xs, ys] = k.split(',')
      ladderCandidates.push({ xy: [Number(xs), Number(ys)], key: k })
    }
  }
  if (ladderCandidates.length > limits.maxLadders) {
    // Seed the spread pick with the ladder closest to the start cell so
    // the "home staircase" is preserved.
    ladderCandidates.sort((a, b) => {
      const ad = pairDistance(a.xy, [area.startX, area.startY])
      const bd = pairDistance(b.xy, [area.startX, area.startY])
      return ad - bd
    })
    const kept = pickSpread(ladderCandidates, limits.maxLadders)
    const next: Record<string, (typeof rooms)[string]> = {}
    for (const [rk, room] of Object.entries(rooms)) {
      const xyKey = `${room.x},${room.y}`
      const isLadderCell = zByXy.get(xyKey)!.size > 1
      // Keep every room on the area's start floor regardless; drop the
      // upper-floor copies for over-cap (x,y) pairs so the excess
      // ladder goes away but the base room stays.
      if (isLadderCell && !kept.has(xyKey) && room.z !== area.startZ) {
        changed = true
        continue
      }
      next[rk] = room
    }
    rooms = next
  }

  // Exits — count rooms typed 'exit' and collapse extras to 'corridor'.
  const exitCandidates: Array<{ xy: [number, number]; key: string }> = []
  for (const [rk, room] of Object.entries(rooms)) {
    if (room.type === 'exit') {
      exitCandidates.push({ xy: [room.x, room.y], key: rk })
    }
  }
  if (exitCandidates.length > limits.maxExits) {
    // Seed with the exit farthest from the start so at least one "edge"
    // exit is preserved — exits usually sit on area borders.
    exitCandidates.sort((a, b) => {
      const ad = pairDistance(a.xy, [area.startX, area.startY])
      const bd = pairDistance(b.xy, [area.startX, area.startY])
      return bd - ad
    })
    const kept = pickSpread(exitCandidates, limits.maxExits)
    const next: Record<string, (typeof rooms)[string]> = { ...rooms }
    for (const { key } of exitCandidates) {
      if (kept.has(key)) continue
      const room = next[key]
      if (!room) continue
      // Strip exit wiring so the room doesn't dangle — the tick loop's
      // area-gen pipeline triggers on `pendingAreaGeneration` and on
      // `type === 'exit'`; resetting both avoids both triggers.
      next[key] = {
        ...room,
        type: 'corridor',
        destination: undefined,
        pendingAreaGeneration: false,
      }
      changed = true
    }
    rooms = next
  }

  return changed ? { ...area, rooms } : area
}

/**
 * Returns the area with rooms unreachable from its start cell removed.
 *
 * LLM area generation sometimes produces orphan rooms — islands of one or
 * two cells with no adjacent neighbour. They clutter the map with tiles
 * the character can never walk to. This BFS from (startX, startY, startZ)
 * across the 10-way grid (8 compass + up/down) keeps only reachable
 * rooms and drops the rest.
 *
 * Idempotent, returns the original reference when nothing needed dropping.
 */
export function pruneDisconnectedRooms(area: Area): Area {
  const startKey = roomKey(area.startX, area.startY, area.startZ)
  if (!area.rooms[startKey]) return area
  const reachable = new Set<string>([startKey])
  const queue: string[] = [startKey]
  while (queue.length > 0) {
    const key = queue.shift()!
    const room = area.rooms[key]
    if (!room) continue
    for (const [dx, dy, dz] of DIRS_3D) {
      const nKey = roomKey(room.x + dx, room.y + dy, room.z + dz)
      if (reachable.has(nKey) || !area.rooms[nKey]) continue
      reachable.add(nKey)
      queue.push(nKey)
    }
  }
  const keys = Object.keys(area.rooms)
  if (reachable.size === keys.length) return area
  const rooms: Record<string, Area['rooms'][string]> = {}
  for (const key of reachable) rooms[key] = area.rooms[key]
  return { ...area, rooms }
}
