export type ItemKind = 'junk' | 'consumable' | 'equipment' | 'scroll'

export type ConsumableEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'restore-magic'; amount: number }

/**
 * Archetype-declared wear slot. `ring` covers both `ring1` and `ring2` wear
 * slots on the character — any ring-slot item goes to the first empty ring
 * slot (or displaces the worst-ranked ring if both are full).
 */
export type EquipSlot =
  | 'weapon'
  /** Body / torso armor. Historically the only armor slot; kept as
   *  `armor` rather than renamed to `torso` so existing saves + items
   *  continue to resolve. */
  | 'armor'
  | 'head'
  /** Bracers, vambraces, sleeves — upper-arm protection. */
  | 'arms'
  /** Gauntlets, gloves — hand covering. */
  | 'hands'
  | 'legs'
  | 'feet'
  | 'cape'
  | 'amulet'
  | 'ring'

export interface EquipBonuses {
  attack?: number
  defense?: number
  /** Per-stat bonuses granted by wearing the item. Only the stats present
   *  on the definition count; absent stats contribute 0. Rarity scales the
   *  values the same way attack/defense are scaled. */
  strength?: number
  dexterity?: number
  constitution?: number
  intelligence?: number
  wisdom?: number
  charisma?: number
}

/**
 * Weapon grip. `1` = one-handed, dual-wieldable into the off-hand. `2` = two-handed,
 * occupies both hands and forces the off-hand slot to stay empty. Defaults to 1
 * if absent on a weapon archetype.
 */
export type WeaponHands = 1 | 2

interface ArchetypeBase {
  id: string
  value?: number
  stackable?: boolean
  weight?: number
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
  /** Weapons only. Absent ⇒ one-handed. Ignored for armor. */
  hands?: WeaponHands
}

export interface ScrollArchetype extends ArchetypeBase {
  kind: 'scroll'
  /** Spell id from the world spell library triggered when the scroll is used. */
  spellId: string
}

// Mechanics of an item. World-scoped, hardcoded.
export type ItemArchetype =
  | JunkArchetype
  | ConsumableArchetype
  | EquipmentArchetype
  | ScrollArchetype

// Flavor of an item. Today hardcoded per world; tomorrow LLM-generated and cached.
export interface ItemFlavor {
  name: string
  description: string
}

export type ItemDef = ItemArchetype & ItemFlavor
