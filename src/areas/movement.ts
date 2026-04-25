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

export function randomStep(area: Area, position: Position): Position | null {
  const options = neighborsOf(area, position)
  if (options.length === 0) return null
  return options[Math.floor(Math.random() * options.length)]
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
