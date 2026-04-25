import type { Drive } from '../game/drives'
import type { Rarity } from '../items/rarity'

export type RoomType =
  | 'safe'
  | 'corridor'
  | 'chamber'
  | 'crypt'
  | 'storage'
  /** Hearthside safe room — satisfies hunger and fatigue, no encounters. */
  | 'inn'
  /** Drinkable water or a fountain — satisfies hunger, low encounter chance. */
  | 'water'
  /** Two-way link to another area (teleporter, gate, elevator). */
  | 'portal'
  /** Marks where a dungeon / danger zone begins. */
  | 'entrance'
  /** Merchant or vending presence — future home of shopping. */
  | 'shop'
  /** Small consecrated / revered room; respawn anchor candidate. */
  | 'shrine'

// Canonical area kinds. Cross-world: a "settlement" means the same structural
// thing in fantasy (village), cyberpunk (district), and sci-fi (station hab).
// Per-world flavor lives in the world's context module.
export type AreaKind = 'settlement' | 'wilderness' | 'dungeon' | 'ruin'

export const AREA_KINDS: readonly AreaKind[] = [
  'settlement',
  'wilderness',
  'dungeon',
  'ruin',
] as const

export interface Position {
  areaId: string
  x: number
  y: number
  z: number
}

// Mechanics of a room: position, type, drives it can satisfy.
export interface RoomArchetype {
  x: number
  y: number
  z: number
  type: RoomType
  satisfies?: Drive[]
  /** Only on 'portal' rooms. Defines the area and entry position this portal leads to. */
  destination?: Position
}

// Flavor of a room: name, description, and per-drive action narration.
export interface RoomFlavor {
  name: string
  description: string
  /** Narrative shown when a listed drive is satisfied here. Keyed by drive. */
  satisfyText?: Partial<Record<Drive, string>>
}

export type Room = RoomArchetype & RoomFlavor

export interface Area {
  id: string
  name: string
  /** Optional rarity — drives the area-name color in the map header.
   *  Absent = treat as common for display purposes. */
  rarity?: Rarity
  startX: number
  startY: number
  startZ: number
  rooms: Record<string, Room>
}

// Flavor of an area — the unit above Room. Not yet merged into Area itself
// (that's a later refactor); for now it exists so the LLM pipeline can
// generate an area's theme first and have roomFlavor stay consistent with it.
export interface AreaFlavor {
  name: string
  description: string
  /** Short keyword(s) downstream room generation keys on, e.g. "moldering crypt". */
  theme: string
}

export function roomKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

export function visitedKey(areaId: string, x: number, y: number, z: number): string {
  return `${areaId}:${x},${y},${z}`
}
