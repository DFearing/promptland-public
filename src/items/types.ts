export type ItemKind = 'junk' | 'consumable' | 'equipment'

export type ConsumableEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'restore-magic'; amount: number }

export type EquipSlot = 'weapon' | 'armor'

export interface EquipBonuses {
  attack?: number
  defense?: number
}

interface ArchetypeBase {
  id: string
  value?: number
  stackable?: boolean
}

export interface JunkArchetype extends ArchetypeBase {
  kind: 'junk'
}

export interface ConsumableArchetype extends ArchetypeBase {
  kind: 'consumable'
  effect: ConsumableEffect
}

export interface EquipmentArchetype extends ArchetypeBase {
  kind: 'equipment'
  slot: EquipSlot
  bonuses: EquipBonuses
}

// Mechanics of an item. World-scoped, hardcoded.
export type ItemArchetype = JunkArchetype | ConsumableArchetype | EquipmentArchetype

// Flavor of an item. Today hardcoded per world; tomorrow LLM-generated and cached.
export interface ItemFlavor {
  name: string
  description: string
}

export type ItemDef = ItemArchetype & ItemFlavor
