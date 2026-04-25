import type { ItemArchetype, ItemDef, ItemFlavor } from '../../items'

const ARCHETYPES: ItemArchetype[] = [
  { id: 'hull_shard', kind: 'junk', value: 2, stackable: true },
  { id: 'power_cell', kind: 'junk', value: 4, stackable: true },
  { id: 'coolant_vial', kind: 'junk', value: 3, stackable: true },
  { id: 'star_chart', kind: 'junk', value: 6, stackable: true },
  { id: 'protein_bar', kind: 'junk', value: 1, stackable: true },
  {
    id: 'medfoam',
    kind: 'consumable',
    value: 16,
    stackable: true,
    effect: { kind: 'heal', amount: 8 },
  },
  {
    id: 'psi_lozenge',
    kind: 'consumable',
    value: 20,
    stackable: true,
    effect: { kind: 'restore-magic', amount: 6 },
  },
  {
    id: 'service_pistol',
    kind: 'equipment',
    value: 12,
    slot: 'weapon',
    bonuses: { attack: 1 },
  },
  {
    id: 'laser_carbine',
    kind: 'equipment',
    value: 32,
    slot: 'weapon',
    bonuses: { attack: 2 },
  },
  {
    id: 'phase_rifle',
    kind: 'equipment',
    value: 48,
    slot: 'weapon',
    bonuses: { attack: 3 },
  },
  {
    id: 'flight_suit',
    kind: 'equipment',
    value: 12,
    slot: 'armor',
    bonuses: { defense: 1 },
  },
  {
    id: 'mag_plate',
    kind: 'equipment',
    value: 28,
    slot: 'armor',
    bonuses: { defense: 2 },
  },
  {
    id: 'boarding_armor',
    kind: 'equipment',
    value: 48,
    slot: 'armor',
    bonuses: { defense: 3 },
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  hull_shard: {
    name: 'hull shard',
    description: 'A palm-sized curl of ship plate, cold even when warm.',
  },
  power_cell: {
    name: 'power cell',
    description: 'Dim indicator, still charged. Careful not to short it.',
  },
  coolant_vial: {
    name: 'coolant vial',
    description: 'Blue gel that refuses to settle. Useful in engineering bays that still work.',
  },
  star_chart: {
    name: 'star chart',
    description: 'Coordinates scratched onto a data-plaque. Three of the systems are circled in red.',
  },
  protein_bar: {
    name: 'protein bar',
    description: 'Vacuum-sealed, best-before long gone. Still edible.',
  },
  medfoam: {
    name: 'medfoam canister',
    description: 'Spray it on the wound and pretend the hissing sound is healing.',
  },
  psi_lozenge: {
    name: 'psi lozenge',
    description: 'A lavender wafer that quiets the channels in your skull.',
  },
  service_pistol: {
    name: 'service pistol',
    description: 'Standard-issue. Reliable. Your hand remembers the weight.',
  },
  laser_carbine: {
    name: 'laser carbine',
    description: 'Focused emitter, folding stock. One good cell gets you a dozen shots.',
  },
  phase_rifle: {
    name: 'phase rifle',
    description: 'Rarely seen outside the Fleet. The air warps where it points.',
  },
  flight_suit: {
    name: 'flight suit',
    description: 'Patched thermal weave. Keeps you alive through a hull crack, briefly.',
  },
  mag_plate: {
    name: 'mag plate',
    description: 'Slides over the chest and clicks to itself. Absorbs more than it should.',
  },
  boarding_armor: {
    name: 'boarding armor',
    description: 'Marines’ kit, stenciled with someone else’s service number.',
  },
}

export const SCIFI_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Sci-fi world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
