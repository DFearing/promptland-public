import type { Drive } from '../game/drives'

export type RoomType = 'safe' | 'corridor' | 'chamber' | 'crypt' | 'storage'

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
  startX: number
  startY: number
  startZ: number
  rooms: Record<string, Room>
}

export function roomKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

export function visitedKey(areaId: string, x: number, y: number, z: number): string {
  return `${areaId}:${x},${y},${z}`
}
