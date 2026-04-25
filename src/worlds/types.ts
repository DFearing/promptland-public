import type { Area, RoomType } from '../areas/types'
import type { StatBlock } from '../character/types'
import type { ConditionDef } from '../conditions/types'
import type { ItemDef } from '../items/types'
import type { WorldContextDefaults } from '../llm/templates'
import type { MobTemplate } from '../mobs/types'

/**
 * Per-level growth contributed by a species or class. All fields optional —
 * tables default to 0 HP / 0 MP / no stat bumps.
 *   - `hpPerLevel` / `mpPerLevel` are flat bumps applied every level.
 *   - `statBumpInterval` defines how often the `statBumps` record fires;
 *     stat bumps only apply at levels divisible by the interval.
 */
export interface Growth {
  hpPerLevel?: number
  mpPerLevel?: number
  statBumpInterval?: number
  statBumps?: Partial<import('../character/types').StatBlock>
}

export interface SpeciesOption {
  id: string
  name: string
  description: string
  /** Growth contribution on every level-up. Stacks with class.growth. */
  growth?: Growth
}

export interface ItemTemplate {
  name: string
  description?: string
  quantity?: number
}

/** Short stat code used by class primary/secondary declarations. Matches the
 *  three-letter abbreviations surfaced in the SheetPanel (STR / DEX / CON /
 *  INT / WIS / CHA). */
export type StatCode = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'

export interface ClassOption {
  id: string
  name: string
  description: string
  startingStats: StatBlock
  startingMaxMagic: number
  startingInventory: ItemTemplate[]
  /** Spell ids from the world spell library that this class starts with.
   *  Omit or leave empty for non-magical classes. */
  startingSpells?: string[]
  /** Growth contribution on every level-up. Stacks with species.growth. */
  growth?: Growth
  /** The two stats this class leans on most — surfaced on class selection
   *  cards as a quick readout of what the class is about. Order matters only
   *  for display (primary reads first). */
  primaryStats: [StatCode, StatCode]
  /** One supporting stat the class also cares about, ranked below the
   *  primaries on the card. */
  secondaryStat: StatCode
  /** Titles earned by this class, positional: index 0 = level 2, index 1 = 3,
   *  …, index 23 = 25, index 24 = 30, index 25 = 35, …, index 38 = 100. 39
   *  entries total. Level 1 uses the world's birthTitle. Levels past 100 are
   *  LLM-generated on demand. See src/character/titles.ts for the math. */
  titles?: string[]
}

export interface WorldManifest {
  id: string
  version: string
  name: string
  description: string
  species: SpeciesOption[]
  classes: ClassOption[]
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
  /** Verb the leveling history shows for the character's creation row.
   *  Fantasy / scifi default to "Born"; cyberpunk uses "Grown" for the
   *  vat-born cast. Optional — treat missing as "Born". */
  creationVerb?: string
  /** Level-1 title shared by every class in this world. Classes diverge from
   *  level 2 onward via their own `titles` ladder. */
  birthTitle?: string
  /** One-line introduction emitted on character creation that ties the
   *  player's chosen name to the world's birthTitle. Uses `{name}` as the
   *  placeholder. The log spends the first tier rendering the character
   *  as their title alone ("The Wayfarer stands in the Cave…") — this
   *  line is the only place the reader learns the name behind that
   *  title early on. Fires only on discovery, not on save reload. */
  birthIntro?: string
  /** Thematic response to an item-sacrifice. Plugged into the sacrifice log
   *  line as: `{name} sacrifices N item(s). {sacrificePhrase} N {currency}.`
   *  Fantasy: "The gods smile and give". Optional — defaults to that phrase. */
  sacrificePhrase?: string
  /** When true, the world is still in development and is shown as
   *  "(Coming Soon)" in the character creation picker. The world's
   *  WorldContent may still be registered so internal tests pass, but
   *  it won't be selectable by the player. */
  comingSoon?: boolean
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
  /** All areas in this world. Must include startingArea. Used for portal destination lookups. */
  areas?: Area[]
  /** Per-world status conditions (poisoned, hacked, irradiated, etc.). */
  conditions: ConditionDef[]
  /** Code-authored LLM prompt context. Injected into every generation request
   *  for this world. See src/llm/templates.ts::WorldContextDefaults. */
  context: WorldContextDefaults
  /** Items available for purchase at shop rooms. */
  shopInventory?: Array<{ itemId: string; price: number; maxStock: number }>
  /** Maps exit room keys (e.g. "millhaven::5,0,0") to generated area IDs.
   *  Populated at runtime when LLM-generated areas are wired in. */
  generatedAreaGraph?: Record<string, string>
}
