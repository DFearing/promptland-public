import {
  manhattan,
  neighborsOf,
  roomKey,
  stepTowards,
  visitedKey,
  type Area,
  type Position,
} from '../areas'
import type { Character } from '../character'
import { Rng } from '../rng'
import type { WorldContent } from '../worlds'
import type { Drive, Drives } from './drives'
import { grow, topDrive } from './drives'
import { buffMultipliers } from './equip'
import { stampPiety } from './favor'
import { weightDriveValue } from './weight'
import { findArea, getArea } from './worldLookup'

/** Per-tick drive accrual the character feels while exploring. Tuned so a
 *  character that walks for a few minutes will hit the drive threshold and
 *  start routing toward a satisfying room. Hunger and fatigue lead the pack;
 *  curiosity rises fastest because it's the engine that pushes the
 *  character into unvisited rooms. Greed and weight are slower drips —
 *  meaningful, but not first-pass goals. */
const EXPLORE_GROWTH: Partial<Drives> = {
  hunger: 3,
  fatigue: 3,
  greed: 2,
  curiosity: 4,
}

/** Map a (dx, dy) step to a compass direction. Used for log flavor on
 *  movement lines ("walks east", "stumbles northwest"). Returns
 *  "somewhere" for a zero step — the caller shouldn't hit that, but the
 *  fallback keeps the log line readable rather than printing "undefined". */
export function directionName(dx: number, dy: number): string {
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

/** BFS from `start` looking for any room not in `visitedRooms`. With
 *  `skipGateways` set, portal/exit tiles are not considered targets — the
 *  curiosity-drive routing uses this so the character finishes the current
 *  area's interior before stepping through a door. Returns the first
 *  matching position or null when every reachable cell is already
 *  visited (or every unvisited cell is gated). */
export function bfsNearestUnvisited(
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

/** Closest (Manhattan) room whose `satisfies` array includes the given
 *  drive — used by `moveByGoal` to pick a goal tile when the character's
 *  top drive crosses the threshold. Linear scan over rooms; areas are
 *  small enough (<200 rooms) that this never shows up on a profile. */
export function nearestRoomSatisfying(
  area: Area,
  from: Position,
  drive: Drive,
): Position | null {
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

/** Closest shrine in the area — driven by the piety drive when no
 *  blessing is active. Distinct from `nearestRoomSatisfying('piety')`
 *  because shrines aren't tagged with a `satisfies` entry; they're a
 *  type-specific lookup. */
export function nearestShrine(area: Area, from: Position): Position | null {
  let best: Position | null = null
  let bestDist = Infinity
  for (const key in area.rooms) {
    const r = area.rooms[key]
    if (r.type !== 'shrine') continue
    const pos: Position = { areaId: area.id, x: r.x, y: r.y, z: r.z }
    const d = manhattan(from, pos)
    if (d < bestDist) {
      bestDist = d
      best = pos
    }
  }
  return best
}

/** Pick the next portal or exit to push outward to. Prefers gateways
 *  whose destination still has unvisited rooms ("fresh"); falls back to
 *  the closest gateway of any kind when nothing is fresh. Returns null
 *  if the area has neither portal nor exit rooms. */
export function findPortalToExplore(
  area: Area,
  character: Character,
  world: WorldContent,
): Position | null {
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
    const destArea = findArea(world, r.destination!.areaId)
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

/** Pick the next position the character should step to given their
 *  active drive goal. The branches mirror the drive vocabulary: piety
 *  walks to a shrine, curiosity to an unvisited tile (preferring the
 *  current area before stepping through a gateway), greed to any
 *  non-safe neighbor, and the rest (hunger / fatigue / weight) to the
 *  nearest `satisfies` room. A null `goal` means "nothing crossed
 *  threshold" and falls through to a random adjacent step. */
export function moveByGoal(
  area: Area,
  character: Character,
  rng: Rng,
  goal: Drive | null,
  world: WorldContent,
): Position | null {
  const pos = character.position
  if (!goal) return rngStep(area, pos, rng)

  if (goal === 'piety') {
    const target = nearestShrine(area, pos)
    if (!target) return rngStep(area, pos, rng)
    if (target.x === pos.x && target.y === pos.y && target.z === pos.z) {
      return rngStep(area, pos, rng)
    }
    return stepTowards(area, pos, target)
  }

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
        return rngStep(area, pos, rng)
      }
      return stepTowards(area, pos, portal)
    }
    return rngStep(area, pos, rng)
  }

  if (goal === 'greed') {
    const options = neighborsOf(area, pos)
    const dangerous = options.filter((o) => {
      const r = area.rooms[roomKey(o.x, o.y, o.z)]
      return r && r.type !== 'safe'
    })
    if (dangerous.length > 0) return rng.pick(dangerous)
    return rngStep(area, pos, rng)
  }

  // hunger, fatigue, weight all navigate to the nearest room whose
  // `satisfies` array includes the drive.
  const target = nearestRoomSatisfying(area, pos, goal)
  if (!target) return rngStep(area, pos, rng)
  if (target.x === pos.x && target.y === pos.y && target.z === pos.z) {
    return rngStep(area, pos, rng)
  }
  return stepTowards(area, pos, target)
}

function rngStep(area: Area, pos: Position, rng: Rng): Position | null {
  const options = neighborsOf(area, pos)
  if (options.length === 0) return null
  return rng.pick(options)
}

/** Buff-aware variant of EXPLORE_GROWTH used by the explore tick. Lifted
 *  here so `predictNextStep` can mirror it without duplicating the
 *  hunger-slow conditional — divergence here would let the prediction
 *  land on a different goal than the live tick once the character
 *  equips a slow item. */
export function exploreGrowthFor(c: Character, world: WorldContent): Partial<Drives> {
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
  const grownDrives = stampPiety(
    stampWeight(
      grow(character.drives, exploreGrowthFor(character, world)),
      character,
      world,
    ),
    character,
  )
  const goal = topDrive(grownDrives)
  return moveByGoal(area, { ...character, drives: grownDrives }, predRng, goal, world)
}

// Inlined helper — `stampWeight` lived in tick.ts as a one-liner. Pulling
// it here lets `predictNextStep` mirror tick exactly without an extra
// cross-module dependency. The same one-liner is shared by tick.ts via
// the export below.
export function stampWeight(
  drives: Drives,
  character: Character,
  world: WorldContent,
): Drives {
  return { ...drives, weight: weightDriveValue(character, world) }
}
