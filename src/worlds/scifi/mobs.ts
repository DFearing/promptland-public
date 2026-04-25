import type { MobArchetype, MobFlavor, MobTemplate } from '../../mobs'

const ARCHETYPES: MobArchetype[] = [
  {
    id: 'maintenance_bot',
    maxHp: 4,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.5, min: 1, max: 3 },
      { kind: 'item', itemId: 'hull_shard', chance: 0.45 },
      { kind: 'item', itemId: 'coolant_vial', chance: 0.2 },
    ],
  },
  {
    id: 'vent_crawler',
    maxHp: 3,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.2, min: 1, max: 2 },
      { kind: 'item', itemId: 'protein_bar', chance: 0.3 },
      { kind: 'item', itemId: 'hull_shard', chance: 0.4 },
    ],
  },
  {
    id: 'boarding_drone',
    maxHp: 8,
    attack: 3,
    defense: 1,
    xpReward: 6,
    applyOnHit: { conditionId: 'stunned', chance: 0.2 },
    loot: [
      { kind: 'gold', chance: 0.7, min: 2, max: 6 },
      { kind: 'item', itemId: 'power_cell', chance: 0.65, min: 1, max: 2 },
      { kind: 'item', itemId: 'medfoam', chance: 0.08 },
      { kind: 'item', itemId: 'service_pistol', chance: 0.1 },
      { kind: 'item', itemId: 'laser_carbine', chance: 0.04 },
      { kind: 'item', itemId: 'flight_suit', chance: 0.08 },
    ],
  },
  {
    id: 'reactor_wraith',
    maxHp: 6,
    attack: 3,
    defense: 0,
    xpReward: 5,
    applyOnHit: { conditionId: 'irradiated', chance: 0.3 },
    loot: [
      { kind: 'gold', chance: 0.3, min: 1, max: 4 },
      { kind: 'item', itemId: 'star_chart', chance: 0.4 },
      { kind: 'item', itemId: 'psi_lozenge', chance: 0.06 },
      { kind: 'item', itemId: 'phase_rifle', chance: 0.03 },
      { kind: 'item', itemId: 'mag_plate', chance: 0.05 },
      { kind: 'item', itemId: 'boarding_armor', chance: 0.02 },
    ],
  },
]

const FLAVORS: Record<string, MobFlavor> = {
  maintenance_bot: {
    name: 'Maintenance Bot',
    description: 'Treads scuffed, arms articulated wrong. Its task queue got corrupted years ago.',
  },
  vent_crawler: {
    name: 'Vent Crawler',
    description: 'Something lean and unlogged. Too many joints, wrong colour of eye-shine.',
  },
  boarding_drone: {
    name: 'Boarding Drone',
    description: 'Military surplus. Riot foam dispenser mounted where the neural lead used to be.',
  },
  reactor_wraith: {
    name: 'Reactor Wraith',
    description: 'A crewman who stayed too close to the core, after. Blue glow where their skin used to be.',
  },
}

export const SCIFI_MOBS: MobTemplate[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Sci-fi world is missing flavor for mob archetype '${a.id}'`)
  return { ...a, ...flavor }
})
