import type { ItemArchetype, ItemDef, ItemFlavor } from '../../items'

const ARCHETYPES: ItemArchetype[] = [
  { id: 'rat_tail', kind: 'junk', value: 2, stackable: true },
  { id: 'cobweb_rope', kind: 'junk', value: 5, stackable: true },
  { id: 'bone_shard', kind: 'junk', value: 3, stackable: true },
  { id: 'shade_essence', kind: 'junk', value: 12, stackable: true },
  { id: 'stale_bread', kind: 'junk', value: 1, stackable: true },
  {
    id: 'healing_draught',
    kind: 'consumable',
    value: 15,
    stackable: true,
    effect: { kind: 'heal', amount: 8 },
  },
  {
    id: 'mana_tincture',
    kind: 'consumable',
    value: 18,
    stackable: true,
    effect: { kind: 'restore-magic', amount: 6 },
  },
  {
    id: 'rusted_blade',
    kind: 'equipment',
    value: 10,
    slot: 'weapon',
    bonuses: { attack: 1 },
  },
  {
    id: 'iron_shortsword',
    kind: 'equipment',
    value: 28,
    slot: 'weapon',
    bonuses: { attack: 2 },
  },
  {
    id: 'runed_dagger',
    kind: 'equipment',
    value: 40,
    slot: 'weapon',
    bonuses: { attack: 3 },
  },
  {
    id: 'padded_vest',
    kind: 'equipment',
    value: 12,
    slot: 'armor',
    bonuses: { defense: 1 },
  },
  {
    id: 'leather_jerkin',
    kind: 'equipment',
    value: 26,
    slot: 'armor',
    bonuses: { defense: 2 },
  },
  {
    id: 'chain_vest',
    kind: 'equipment',
    value: 44,
    slot: 'armor',
    bonuses: { defense: 3 },
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  rat_tail: {
    name: 'rat tail',
    description: 'Stiff and unpleasant. Certain apothecaries pay for these.',
  },
  cobweb_rope: {
    name: 'cobweb rope',
    description: 'A dense hank of spider silk. Stronger than it looks.',
  },
  bone_shard: {
    name: 'bone shard',
    description: 'Splintered, yellow, faintly warm even now.',
  },
  shade_essence: {
    name: 'shade essence',
    description: 'A vial of not-quite-air. It moves in the bottle when nothing else does.',
  },
  stale_bread: {
    name: 'stale bread',
    description: 'Hard as stone, but edible. Probably.',
  },
  healing_draught: {
    name: 'healing draught',
    description: 'Red and thick. Smells of rust and rosemary.',
  },
  mana_tincture: {
    name: 'mana tincture',
    description: 'A cold blue liquid. Tingles on the tongue and behind the eyes.',
  },
  rusted_blade: {
    name: 'rusted blade',
    description: 'Pitted iron with a loose grip. Still cuts if you mean it.',
  },
  iron_shortsword: {
    name: 'iron shortsword',
    description: 'Plain, balanced, honest.',
  },
  runed_dagger: {
    name: 'runed dagger',
    description: 'Script you almost recognize runs down the blade.',
  },
  padded_vest: {
    name: 'padded vest',
    description: 'Quilted cloth. Soaks up the first strike, sometimes.',
  },
  leather_jerkin: {
    name: 'leather jerkin',
    description: 'Stained and supple. Someone else wore it longer.',
  },
  chain_vest: {
    name: 'chain vest',
    description: 'Rings on rings. Heavy, but the weight is a comfort.',
  },
}

export const FANTASY_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Fantasy world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
