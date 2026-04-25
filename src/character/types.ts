import type { Position } from '../areas/types'
import type { ActiveCondition } from '../conditions'
import type { Drives } from '../game/drives'

export interface StatBlock {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export interface InventoryItem {
  id: string
  /** Archetype id in world.items. Absent for starting-inventory flavor items
   * that don't correspond to a world-scoped archetype. */
  archetypeId?: string
  name: string
  description?: string
  quantity?: number
}

export interface Equipped {
  weapon?: InventoryItem
  armor?: InventoryItem
}

export interface DeathRecord {
  at: number
  cause: string
  areaId: string
  roomName?: string
}

export interface LevelUpRecord {
  at: number
  from: number
  to: number
}

export interface Character {
  id: string
  name: string
  worldId: string
  worldVersion: string
  speciesId: string
  genderId: string
  classId: string
  createdAt: number
  level: number
  xp: number
  hp: number
  maxHp: number
  magic: number
  maxMagic: number
  gold: number
  stats: StatBlock
  inventory: InventoryItem[]
  equipped: Equipped
  position: Position
  visitedRooms: string[]
  deaths: DeathRecord[]
  levelUps: LevelUpRecord[]
  drives: Drives
  lastSafePosition?: Position
  conditions: ActiveCondition[]
}
