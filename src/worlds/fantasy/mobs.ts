import type { MobArchetype, MobFlavor, MobTemplate } from '../../mobs'

// Mechanics only. Shape we'd ship to any world that uses similar archetypes.
const ARCHETYPES: MobArchetype[] = [
  {
    id: 'cave_rat',
    maxHp: 4,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.5, min: 1, max: 3 },
      { kind: 'item', itemId: 'rat_tail', chance: 0.45 },
      { kind: 'item', itemId: 'stale_bread', chance: 0.1 },
    ],
  },
  {
    id: 'skeletal_scrap',
    maxHp: 8,
    attack: 3,
    defense: 1,
    xpReward: 6,
    loot: [
      { kind: 'gold', chance: 0.7, min: 2, max: 6 },
      { kind: 'item', itemId: 'bone_shard', chance: 0.7, min: 1, max: 2 },
      { kind: 'item', itemId: 'healing_draught', chance: 0.08 },
      { kind: 'item', itemId: 'rusted_blade', chance: 0.1 },
      { kind: 'item', itemId: 'iron_shortsword', chance: 0.04 },
      { kind: 'item', itemId: 'padded_vest', chance: 0.08 },
    ],
  },
  {
    id: 'lost_shade',
    maxHp: 6,
    attack: 3,
    defense: 0,
    xpReward: 5,
    applyOnHit: { conditionId: 'slept', chance: 0.2 },
    loot: [
      { kind: 'gold', chance: 0.3, min: 1, max: 4 },
      { kind: 'item', itemId: 'shade_essence', chance: 0.45 },
      { kind: 'item', itemId: 'mana_tincture', chance: 0.06 },
      { kind: 'item', itemId: 'runed_dagger', chance: 0.03 },
      { kind: 'item', itemId: 'leather_jerkin', chance: 0.05 },
      { kind: 'item', itemId: 'chain_vest', chance: 0.02 },
    ],
  },
  {
    id: 'cellar_spider',
    maxHp: 3,
    attack: 2,
    defense: 0,
    xpReward: 3,
    applyOnHit: { conditionId: 'poisoned', chance: 0.3 },
    loot: [
      { kind: 'gold', chance: 0.25, min: 1, max: 2 },
      { kind: 'item', itemId: 'cobweb_rope', chance: 0.55, min: 1, max: 2 },
    ],
  },
]

// Fantasy-flavored names and descriptions. Will be swapped for an LLM-backed
// provider later — this table is the clean seam.
const FLAVORS: Record<string, MobFlavor> = {
  cave_rat: {
    name: 'cave rat',
    description: 'Matted fur, yellow teeth, eyes like wet beads.',
  },
  skeletal_scrap: {
    name: 'skeletal scrap',
    description: 'A rattling bone-thing, mostly ribs and want.',
  },
  lost_shade: {
    name: 'lost shade',
    description: "A smear of colder air, vaguely person-shaped. It doesn't want to be seen.",
  },
  cellar_spider: {
    name: 'cellar spider',
    description: 'Big as a cat, patient as a jailer.',
  },
}

export const FANTASY_MOBS: MobTemplate[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Fantasy world is missing flavor for mob archetype '${a.id}'`)
  return { ...a, ...flavor }
})
