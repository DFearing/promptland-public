import type { PotionSize, ScrollLevel } from './sizing'

export type ItemKind = 'junk' | 'consumable' | 'equipment' | 'scroll'

// Consumable effects no longer carry their own amount — every potion of
// a given size delivers a fixed value regardless of archetype, so amounts
// are resolved from `size + kind` via `potionEffectAmount`. This keeps a
// "Lesser Healing Draught" and a "Lesser Stim-Patch" healing the same
// number of HP across worlds.
export type ConsumableEffect =
  | { kind: 'heal' }
  | { kind: 'restore-magic' }

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
  /** Magic attack — added to the caster's per-spell roll
   *  (`matkRoll = roll(4) + mod(INT) + magicAttack + spell.amount`).
   *  Absent ⇒ 0. Staves / wands / spellbook-like gear contribute here. */
  magicAttack?: number
  /** Magic defense — reduces incoming spell damage the same way
   *  `defense` reduces physical damage. Absent ⇒ 0. Reserved for Phase 5
   *  (mob casters) on the character side; already meaningful as a gear
   *  slot so mob-caster gear doesn't need another round of type surgery. */
  magicDefense?: number
  /** Per-stat bonuses granted by wearing the item. Only the stats present
   *  on the definition count; absent stats contribute 0. Rarity scales the
   *  values the same way attack/defense are scaled. */
  strength?: number
  dexterity?: number
  constitution?: number
  intelligence?: number
  wisdom?: number
  charisma?: number
  /** Slows hunger accrual by this fractional amount per tick. 0.25 = 25 %
   *  less hunger each tick, summed across all equipped buff items and
   *  capped at 0.9 (never completely eliminate hunger). Absent ⇒ 0. */
  hungerSlow?: number
  /** Multiplies rest / meditate HP + MP recovery. 0.25 = +25 % faster
   *  recovery per tick. Summed across worn items, applied as (1 + total)
   *  against the base per-tick gain. Absent ⇒ 0. */
  restBoost?: number
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
  /** Marks this item as a world-authored "curated" artifact — a
   *  legendary / set-piece drop with a distinct lore hook. Curated
   *  items are excluded from regular archetype-loot rolls (`rollLoot`
   *  skips them) so they only reach the player via curated-room loot
   *  overrides or bespoke LLM generation. On first drop they fire the
   *  enhanced new-item banner and, if an LLM is configured, pick up
   *  an expanded bespoke description via the curatedItemFlavor path.
   *  Absent ⇒ false (ordinary archetype). */
  curated?: boolean
}

export interface JunkArchetype extends ArchetypeBase {
  kind: 'junk'
}

export interface ConsumableArchetype extends ArchetypeBase {
  kind: 'consumable'
  effect: ConsumableEffect
  /** Size — drives the heal/mana amount via `potionEffectAmount`. Five
   *  tiers (minor/lesser/standard/greater/major) replace rarity for
   *  consumables: a Lesser potion always delivers the same amount
   *  regardless of where it dropped. */
  size: PotionSize
}

/** Minimum stats a character must meet to equip this item. Rarity scales
 *  these downward — higher rarity items are more "universal". See
 *  `requirementMultFor` in items/requirements.ts. */
export interface EquipRequirements {
  level?: number
  strength?: number
  dexterity?: number
  intelligence?: number
  wisdom?: number
}

export interface EquipmentArchetype extends ArchetypeBase {
  kind: 'equipment'
  slot: EquipSlot
  bonuses: EquipBonuses
  /** Weapons only. Absent ⇒ one-handed. Ignored for armor. */
  hands?: WeaponHands
  /** Base requirements before rarity scaling. Absent ⇒ no requirements. */
  requirements?: EquipRequirements
  /** Damage family — picks the verb word-set in the combat log (slash
   *  for swords, crush for maces, pierce for bows). Weapons only; armor
   *  ignores. Absent ⇒ falls back to the world-generic verb set. See
   *  src/combat/verbs.ts::DamageFamily. */
  damageFamily?: import('../combat').DamageFamily
}

export interface ScrollArchetype extends ArchetypeBase {
  kind: 'scroll'
  /** Spell id from the world spell library triggered when the scroll is used. */
  spellId: string
  /** Power level (I-V) — multiplies the spell's printed `effect.amount`
   *  via `scrollAmountMultiplier` when read. Level I is the baseline
   *  (1.0×), higher tiers scale roughly geometrically. Replaces rarity
   *  for scrolls — a Level III scroll always hits the same regardless of
   *  where it dropped. */
  level: ScrollLevel
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
