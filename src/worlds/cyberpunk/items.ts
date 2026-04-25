import type { ItemArchetype, ItemDef, ItemFlavor } from '../../items'

const ARCHETYPES: ItemArchetype[] = [
  { id: 'chrome_scrap', kind: 'junk', value: 2, stackable: true },
  { id: 'wire_bundle', kind: 'junk', value: 3, stackable: true },
  { id: 'drone_part', kind: 'junk', value: 4, stackable: true },
  { id: 'data_sliver', kind: 'junk', value: 6, stackable: true },
  { id: 'ration_pack', kind: 'junk', value: 1, stackable: true },
  {
    id: 'stim_patch',
    kind: 'consumable',
    value: 16,
    stackable: true,
    effect: { kind: 'heal', amount: 8 },
  },
  {
    id: 'neural_cap',
    kind: 'consumable',
    value: 20,
    stackable: true,
    effect: { kind: 'restore-magic', amount: 6 },
  },
  {
    id: 'shock_baton',
    kind: 'equipment',
    value: 10,
    slot: 'weapon',
    bonuses: { attack: 1 },
  },
  {
    id: 'monofilament_blade',
    kind: 'equipment',
    value: 30,
    slot: 'weapon',
    bonuses: { attack: 2 },
  },
  {
    id: 'plasma_cutter',
    kind: 'equipment',
    value: 46,
    slot: 'weapon',
    bonuses: { attack: 3 },
  },
  {
    id: 'kevlar_jacket',
    kind: 'equipment',
    value: 12,
    slot: 'armor',
    bonuses: { defense: 1 },
  },
  {
    id: 'trauma_plate',
    kind: 'equipment',
    value: 28,
    slot: 'armor',
    bonuses: { defense: 2 },
  },
  {
    id: 'riot_vest',
    kind: 'equipment',
    value: 48,
    slot: 'armor',
    bonuses: { defense: 3 },
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  chrome_scrap: {
    name: 'chrome scrap',
    description: 'Peeled from something that used to be expensive. Still is, if you find the right buyer.',
  },
  wire_bundle: {
    name: 'wire bundle',
    description: 'Twisted copper and optical, colour codes long faded.',
  },
  drone_part: {
    name: 'drone part',
    description: 'A servo casing with half a gyro still inside. Warm.',
  },
  data_sliver: {
    name: 'data sliver',
    description: 'A paper-thin wafer. Something on it pulls at the edge of your eye.',
  },
  ration_pack: {
    name: 'ration pack',
    description: 'Corp-branded nutrient paste. Tastes of yeast and disappointment.',
  },
  stim_patch: {
    name: 'stim patch',
    description: 'Press it to a vein and the pain forgets where you put it.',
  },
  neural_cap: {
    name: 'neural cap',
    description: 'A chrome wafer that sits wet on the roof of your mouth.',
  },
  shock_baton: {
    name: 'shock baton',
    description: 'Private security surplus. One charge left, maybe two.',
  },
  monofilament_blade: {
    name: 'monofilament blade',
    description: 'The edge is one molecule thick. Cut yourself before you notice it happened.',
  },
  plasma_cutter: {
    name: 'plasma cutter',
    description: 'Meant for doors, works on anything that bleeds.',
  },
  kevlar_jacket: {
    name: 'kevlar jacket',
    description: 'Patched and washed a hundred times. Keeps out most things.',
  },
  trauma_plate: {
    name: 'trauma plate',
    description: 'Ceramic insert that turns a kill into a bruise, once.',
  },
  riot_vest: {
    name: 'riot vest',
    description: 'Stenciled property of a precinct that no longer exists.',
  },
}

export const CYBERPUNK_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Cyberpunk world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
