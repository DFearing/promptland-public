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
    effect: { kind: 'heal' },
    size: 'lesser',
  },
  {
    id: 'psi_lozenge',
    kind: 'consumable',
    value: 20,
    stackable: true,
    effect: { kind: 'restore-magic' },
    size: 'lesser',
  },
  {
    id: 'service_pistol',
    kind: 'equipment',
    value: 12,
    slot: 'weapon',
    damageFamily: 'pierce',
    bonuses: { attack: 1 },
  },
  {
    id: 'laser_carbine',
    kind: 'equipment',
    value: 32,
    slot: 'weapon',
    damageFamily: 'fire',
    bonuses: { attack: 2 },
  },
  {
    id: 'phase_rifle',
    kind: 'equipment',
    value: 48,
    slot: 'weapon',
    damageFamily: 'electric',
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
  {
    id: 'psi_charge_bolt',
    kind: 'scroll',
    value: 18,
    stackable: true,
    spellId: 'psi_bolt',
    level: 1,
  },
  {
    id: 'psi_charge_storm',
    kind: 'scroll',
    value: 35,
    stackable: true,
    spellId: 'mind_storm',
    level: 1,
  },
  {
    id: 'psi_charge_mend',
    kind: 'scroll',
    value: 22,
    stackable: true,
    spellId: 'bioregen',
    level: 1,
  },
  {
    id: 'psi_charge_beam_out',
    kind: 'scroll',
    value: 90,
    stackable: true,
    spellId: 'beam_out',
    level: 1,
  },

  // ── Buff modules ───────────────────────────────────────────────────────
  {
    id: 'ration_synth_module',
    kind: 'equipment',
    value: 85,
    slot: 'amulet',
    bonuses: { hungerSlow: 0.35 },
  },
  {
    id: 'circadian_regulator',
    kind: 'equipment',
    value: 95,
    slot: 'amulet',
    bonuses: { restBoost: 0.4 },
  },

  // ── Curated (legendary / artifact) ─────────────────────────────────────────
  // Fleet decoration awarded posthumously to a captain who held a failing
  // bridge alone. Amulet slot so it reads as a worn honour rather than an
  // offensive tool. Excluded from background loot rolls.
  {
    id: 'captains_medal_of_valor',
    kind: 'equipment',
    value: 1300,
    weight: 1,
    slot: 'amulet',
    bonuses: { defense: 3, charisma: 3, wisdom: 2, constitution: 1 },
    // Note: EquipRequirements doesn't include charisma — use wisdom as
    // the "earned through service" gate instead. Keeps the bonus list
    // (which allows all stats) reading as the captaincy reward while
    // staying inside the schema.
    requirements: { wisdom: 10, level: 6 },
    curated: true,
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  hull_shard: {
    name: 'Hull Shard',
    description: 'A palm-sized curl of ship plate, cold even when warm.',
  },
  power_cell: {
    name: 'Power Cell',
    description: 'Dim indicator, still charged. Careful not to short it.',
  },
  coolant_vial: {
    name: 'Coolant Vial',
    description: 'Blue gel that refuses to settle. Useful in engineering bays that still work.',
  },
  star_chart: {
    name: 'Star Chart',
    description: 'Coordinates scratched onto a data-plaque. Three of the systems are circled in red.',
  },
  protein_bar: {
    name: 'Protein Bar',
    description: 'Vacuum-sealed, best-before long gone. Still edible.',
  },
  medfoam: {
    name: 'Medfoam Canister',
    description: 'Spray it on the wound and pretend the hissing sound is healing.',
  },
  psi_lozenge: {
    name: 'Psi Lozenge',
    description: 'A lavender wafer that quiets the channels in your skull.',
  },
  service_pistol: {
    name: 'Service Pistol',
    description: 'Standard-issue. Reliable. Your hand remembers the weight.',
  },
  laser_carbine: {
    name: 'Laser Carbine',
    description: 'Focused emitter, folding stock. One good cell gets you a dozen shots.',
  },
  phase_rifle: {
    name: 'Phase Rifle',
    description: 'Rarely seen outside the Fleet. The air warps where it points.',
  },
  flight_suit: {
    name: 'Flight Suit',
    description: 'Patched thermal weave. Keeps you alive through a hull crack, briefly.',
  },
  mag_plate: {
    name: 'Mag Plate',
    description: 'Slides over the chest and clicks to itself. Absorbs more than it should.',
  },
  boarding_armor: {
    name: 'Boarding Armor',
    description: 'Marines’ kit, stenciled with someone else’s service number.',
  },
  psi_charge_bolt: {
    name: 'Psi-Charge: Bolt',
    description: 'A one-use crystal keyed to a sharp, simple thought.',
  },
  psi_charge_storm: {
    name: 'Psi-Charge: Storm',
    description: 'A heavier crystal. Something howls inside it when held.',
  },
  psi_charge_mend: {
    name: 'Psi-Charge: Mend',
    description: 'A soft-edged crystal. Warm.',
  },
  psi_charge_beam_out: {
    name: 'Psi-Charge: Beam-Out',
    description: 'A transit-lock keyed to your last safe anchor.',
  },
  ration_synth_module: {
    name: 'Ration Synth Module',
    description:
      'A palm-sized synth pack that trickles nutrients on-demand. Suppresses appetite without spoiling real meals.',
  },
  circadian_regulator: {
    name: 'Circadian Regulator',
    description:
      'Wrist-worn field driver keyed to the crew-cycle. Recovery phases hit harder and land quicker.',
  },

  // Curated / legendary — lore hook seeds the LLM expansion on first drop.
  captains_medal_of_valor: {
    name: "Captain's Medal of Valor",
    description:
      'A Fleet decoration — a small star of cold alloy, the ribbon frayed. The engraved name has been rubbed smooth by a thumb that no longer lives.',
  },
}

export const SCIFI_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Sci-fi world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
