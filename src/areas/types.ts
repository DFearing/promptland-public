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
  /** Edge-of-area exit that connects to a generated or existing area. */
  | 'exit'

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
  /** Only on 'exit' rooms. True when no generated area has been linked yet. */
  pendingAreaGeneration?: boolean
}

// Flavor of a room: name, description, and per-drive action narration.
export interface RoomFlavor {
  name: string
  description: string
  /** Narrative shown when a listed drive is satisfied here. Keyed by drive. */
  satisfyText?: Partial<Record<Drive, string>>
  /** Curated encounter override for this room. When set, the room's
   *  spawn roll picks this specific mob id from the world pool at the
   *  configured rarity instead of a random pool draw. firstOnly flags a
   *  one-shot spawn — once defeated, the curated entry drops out and
   *  the room reverts to the random pool. */
  encounter?: RoomEncounter
}

export interface RoomEncounter {
  /** Mob id from the world's `mobs` pool. */
  mobId: string
  /** Rarity to spawn at. Overrides the level-based random rarity roll. */
  rarity: Rarity
  /** When true, defeating this curated encounter writes the room's
   *  visitedKey into `character.defeatedRooms` and the encounter will
   *  not respawn — the room falls back to the random pool. When false
   *  or absent the curated encounter is a permanent ambient fixture
   *  (still gated by the global encounter chance). */
  firstOnly?: boolean
  /** Optional curated loot override. When present, defeating this
   *  encounter drops exactly this table (not the mob's archetype loot).
   *  Only fires when the defeated mob was actually spawned from the
   *  curated entry (Mob.curated === true) so a random-pool spawn of
   *  the same mob id doesn't trigger the override. */
  loot?: RoomCuratedLoot
}

export interface RoomCuratedLoot {
  /** Gold payout range. Drops a random integer in [min, max]. Omit for
   *  a gold-less encounter. */
  gold?: { min: number; max: number }
  /** Curated item drops, each dropped deterministically on defeat
   *  (no per-drop chance roll — curated means guaranteed). Optional
   *  per-drop rarity/level overrides; absent ⇒ roll the usual way. */
  items?: RoomCuratedItem[]
}

export interface RoomCuratedItem {
  /** Item archetype id from the world's `items` library. */
  itemId: string
  /** Explicit rarity for the drop. Skips `rollDropRarity`. Absent ⇒
   *  roll as usual (biased by mob rarity + reward mult). */
  rarity?: Rarity
  /** Drop quantity. Absent ⇒ 1. */
  qty?: number
  /** Explicit item level. Skips `rollDropLevel`. Absent ⇒ roll around
   *  the mob's level with the usual jitter. */
  level?: number
}

export type Room = RoomArchetype & RoomFlavor

export interface Area {
  id: string
  name: string
  /** Optional rarity — drives the area-name color in the map header.
   *  Absent = treat as common for display purposes. */
  rarity?: Rarity
  /** Suggested character level for the area. Authored areas ship with
   *  hand-picked values; LLM-generated areas stamp the character's
   *  level at creation time. Absent = unknown tier (sorts last in UIs
   *  like the dev Area tab). */
  level?: number
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
