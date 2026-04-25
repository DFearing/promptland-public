import type { Area, RoomType } from '../areas/types'
import type { StatBlock } from '../character/types'
import type { ConditionDef } from '../conditions/types'
import type { ItemDef } from '../items/types'
import type { MobTemplate } from '../mobs/types'

export interface SpeciesOption {
  id: string
  name: string
  description: string
}

export interface ItemTemplate {
  name: string
  description?: string
  quantity?: number
}

export interface ClassOption {
  id: string
  name: string
  description: string
  startingStats: StatBlock
  startingMaxMagic: number
  startingInventory: ItemTemplate[]
}

export interface GenderOption {
  id: string
  name: string
}

export interface WorldManifest {
  id: string
  version: string
  name: string
  description: string
  species: SpeciesOption[]
  classes: ClassOption[]
  genders: GenderOption[]
  /** Display name for the per-world magic/tech/psionic stat (e.g. "Arcana", "Hack", "Psionics"). */
  magicName: string
  /** Three-letter abbreviation for the magic stat (e.g. "ARC", "HAX", "PSY"). */
  magicAbbreviation: string
  /** Display name for the per-world currency (e.g. "Gold", "Credits"). */
  currencyName: string
  /** Short abbreviation for the currency (e.g. "GP", "CR"). */
  currencyAbbreviation: string
  allowedConcepts: string[]
  forbiddenConcepts: string[]
}

/**
 * Runtime content for a world: mobs, items, encounter tables, starting area.
 * Registered per worldId alongside WorldManifest (which is the creation-side data).
 */
export interface WorldContent {
  mobs: MobTemplate[]
  items: ItemDef[]
  /** Mob archetype ids available in each room type. Empty list → no encounters. */
  encounters: Record<RoomType, string[]>
  startingArea: Area
  /** Per-world status conditions (poisoned, hacked, irradiated, etc.). */
  conditions: ConditionDef[]
}
