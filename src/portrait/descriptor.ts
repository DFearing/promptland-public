// Sprite descriptor schema — locks open decision #1 from issue #75.
//
// A `SpriteDescriptor` is the cache key for a single portrait *layer* (one
// equipment slot's worth of pixels). The descriptor is the same pattern as
// `curatedItemFlavor` applied to art: every infinite-variety item resolves
// down to a small finite tuple at creation time, and that tuple keys a
// shared sprite-layer cache. The first item with a given descriptor pays
// the ComfyUI generation cost; every future item with the same descriptor
// reuses the cached PNG.
//
// What goes in here vs. a runtime filter:
//
//   In the descriptor (cache key, drives generation):
//     - slot, material, form, tone — the *silhouette* of the sprite
//
//   NOT in the descriptor (applied at render time as PixiJS filters):
//     - rarity outline color
//     - elemental tint (fire / frost / shock / etc.)
//     - enchant glow (pulsing aura)
//     - durability cracks / wear overlay
//
// The split is deliberate: visual *uniqueness* per item is virtually free
// at runtime, while regenerating PNGs through ComfyUI is the expensive
// operation. Keeping rarity / element / enchant out of the cache key
// keeps the sprite library finite while letting every item still feel
// distinct.
//
// Rough cache budget:
//   ~12 materials × ~6 forms × 4 tones = ~288 layers per slot, with many
//   (material, form) pairs disallowed (no plate hoods, no silk helms),
//   so realistically ~150-200 layers per slot × 10 visible slots ≈ 2K
//   total. Tractable in IndexedDB; future server-shared cache (open
//   decision #3) is purely a population-speed optimization.

/** Visible portrait layers. Subset of `EquipSlot` from items/types.ts:
 *  amulet and rings are excluded because they don't read at portrait
 *  scale — those slots show through runtime filters (rare-amulet shimmer,
 *  ring-of-fire elemental tint) rather than dedicated layers.
 *
 *  Also includes the synthetic `body-base` layer for the underlying
 *  species/skin sprite — i.e. the character before any equipment is
 *  drawn over them. `body-base`'s descriptor uses material=skin-tone,
 *  form=species-build, and tone=lighting. */
export type PortraitSlot =
  | 'body-base'
  | 'cape'
  | 'legs'
  | 'feet'
  | 'armor'
  | 'arms'
  | 'hands'
  | 'offhand'
  | 'mainhand'
  | 'head'

export const PORTRAIT_SLOTS: readonly PortraitSlot[] = [
  'body-base',
  'cape',
  'legs',
  'feet',
  'armor',
  'arms',
  'hands',
  'offhand',
  'mainhand',
  'head',
] as const

/** Coarse light/saturation flavor of the sprite. Drives the prompt's tone
 *  modifier ("dark muted", "vibrant", etc.) without exploding the palette
 *  axis with elemental colors — those come in as runtime tints. Four
 *  values intentionally: more granularity multiplies cache size without
 *  adding visual differentiation the player will notice at portrait scale. */
export type Tone = 'dark' | 'muted' | 'vibrant' | 'pale'

export const TONES: readonly Tone[] = ['dark', 'muted', 'vibrant', 'pale'] as const

/** Material vocabulary shared across slots. Not every material is valid
 *  on every slot — see `SLOT_MATERIALS`. The `shadowstuff` and `crystal`
 *  entries are reserved for legendary / arcane gear and are intentionally
 *  rare in the LLM item-prompt vocabulary so cache hits cluster on the
 *  mundane materials. */
export type Material =
  | 'cloth'
  | 'leather'
  | 'hide'
  | 'silk'
  | 'wool'
  | 'wood'
  | 'bone'
  | 'mail'
  | 'scale'
  | 'plate'
  | 'crystal'
  | 'shadowstuff'

export const MATERIALS: readonly Material[] = [
  'cloth',
  'leather',
  'hide',
  'silk',
  'wool',
  'wood',
  'bone',
  'mail',
  'scale',
  'plate',
  'crystal',
  'shadowstuff',
] as const

/** Per-slot allowed materials. Bans like "silk plate" or "plate hood" are
 *  encoded here so the descriptor → prompt compiler can't accidentally
 *  ask ComfyUI for nonsense (or, more importantly, can't pollute the
 *  cache with descriptors that no item should ever resolve to). */
export const SLOT_MATERIALS: Record<PortraitSlot, readonly Material[]> = {
  'body-base': ['cloth'], // body-base reuses the descriptor shape for uniformity; material is a no-op token here.
  cape: ['cloth', 'leather', 'silk', 'wool', 'shadowstuff'],
  legs: ['cloth', 'leather', 'hide', 'silk', 'wool', 'mail', 'scale', 'plate'],
  feet: ['cloth', 'leather', 'hide', 'mail', 'scale', 'plate'],
  armor: ['cloth', 'leather', 'hide', 'silk', 'mail', 'scale', 'plate', 'bone', 'crystal', 'shadowstuff'],
  arms: ['cloth', 'leather', 'hide', 'mail', 'scale', 'plate', 'bone'],
  hands: ['cloth', 'leather', 'hide', 'mail', 'scale', 'plate'],
  offhand: ['wood', 'leather', 'mail', 'plate', 'bone', 'crystal'],
  mainhand: ['wood', 'leather', 'mail', 'plate', 'bone', 'crystal', 'shadowstuff'],
  head: ['cloth', 'leather', 'hide', 'mail', 'scale', 'plate', 'bone', 'crystal'],
}

/** Per-slot form (silhouette) vocabulary. The form is the part of the
 *  descriptor most likely to need expansion as item generation matures —
 *  add new forms here, not in items/templates.ts, so the cache key stays
 *  authoritative. The literal-tuple `as const` is intentional so
 *  `SlotForm<S>` derives the narrow union below. */
export const SLOT_FORMS = {
  'body-base': ['humanoid'],
  cape: ['cloak', 'mantle', 'tabard', 'shawl', 'wrap'],
  legs: ['breeches', 'leggings', 'greaves', 'kilt', 'skirt'],
  feet: ['boots', 'sandals', 'sabatons', 'wraps'],
  armor: ['tunic', 'vest', 'breastplate', 'robe', 'jerkin', 'brigandine'],
  arms: ['bracers', 'vambraces', 'sleeves', 'pauldrons'],
  hands: ['gloves', 'gauntlets', 'wraps', 'mitts'],
  offhand: ['shield-round', 'shield-kite', 'shield-tower', 'buckler', 'orb', 'tome', 'dagger', 'wand'],
  mainhand: ['sword', 'axe', 'mace', 'spear', 'bow', 'staff', 'dagger', 'hammer'],
  head: ['hood', 'cap', 'helm', 'coif', 'circlet', 'crown'],
} as const satisfies Record<PortraitSlot, readonly string[]>

/** Narrow `form` type for a given slot. Use as `SlotForm<'head'>` to
 *  constrain a function parameter to the legal head forms. */
export type SlotForm<S extends PortraitSlot> = (typeof SLOT_FORMS)[S][number]

/** Sprite-layer cache key. Generic over slot so a `SpriteDescriptor<'head'>`
 *  is only assignable from a head form — keeps "silk plate-helm" out of
 *  the type system, not just out of runtime validation.
 *
 *  Stable serialization (for IndexedDB key + ComfyUI hash) is
 *  `${slot}|${material}|${form}|${tone}` — see `descriptorKey`. */
export type SpriteDescriptor<S extends PortraitSlot = PortraitSlot> = {
  readonly slot: S
  readonly material: Material
  readonly form: SlotForm<S>
  readonly tone: Tone
}

/** Stable string key for a descriptor. Order-stable so two descriptors
 *  with identically-typed fields always hash to the same string,
 *  regardless of how the object literal was authored. The pipe separator
 *  is safe — no vocabulary token contains it. */
export const descriptorKey = (d: SpriteDescriptor): string =>
  `${d.slot}|${d.material}|${d.form}|${d.tone}`

/** Runtime visual modifiers — applied as PixiJS filters/shaders on top
 *  of the cached layer, never baked into generation. Listed here as the
 *  authoritative "what is NOT in the cache key" so future contributors
 *  don't accidentally promote one of these into the descriptor and
 *  invalidate the entire layer cache. */
export type RuntimeFilter =
  | { kind: 'rarity-outline'; tier: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' }
  | { kind: 'elemental-tint'; element: 'fire' | 'frost' | 'shock' | 'shadow' | 'arcane' | 'holy' }
  | { kind: 'enchant-glow'; intensity: number }
  | { kind: 'durability-wear'; ratio: number }
