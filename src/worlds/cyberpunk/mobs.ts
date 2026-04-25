import type { MobArchetype, MobFlavor, MobTemplate } from '../../mobs'

const ARCHETYPES: MobArchetype[] = [
  {
    id: 'street_punk',
    maxHp: 4,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.6, min: 1, max: 4 },
      { kind: 'item', itemId: 'chrome_scrap', chance: 0.45 },
      { kind: 'item', itemId: 'ration_pack', chance: 0.1 },
    ],
  },
  {
    id: 'scav_hound',
    maxHp: 3,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.2, min: 1, max: 2 },
      { kind: 'item', itemId: 'wire_bundle', chance: 0.55, min: 1, max: 2 },
      { kind: 'item', itemId: 'ration_pack', chance: 0.15 },
    ],
  },
  {
    id: 'security_drone',
    maxHp: 8,
    attack: 3,
    defense: 1,
    xpReward: 6,
    applyOnHit: { conditionId: 'jammed', chance: 0.2 },
    loot: [
      { kind: 'gold', chance: 0.7, min: 2, max: 6 },
      { kind: 'item', itemId: 'drone_part', chance: 0.65, min: 1, max: 2 },
      { kind: 'item', itemId: 'stim_patch', chance: 0.08 },
      { kind: 'item', itemId: 'shock_baton', chance: 0.1 },
      { kind: 'item', itemId: 'monofilament_blade', chance: 0.03 },
      { kind: 'item', itemId: 'kevlar_jacket', chance: 0.08 },
    ],
  },
  {
    id: 'netrunner_ghost',
    maxHp: 6,
    attack: 3,
    defense: 0,
    xpReward: 5,
    applyOnHit: { conditionId: 'hacked', chance: 0.3 },
    loot: [
      { kind: 'gold', chance: 0.3, min: 1, max: 4 },
      { kind: 'item', itemId: 'data_sliver', chance: 0.45 },
      { kind: 'item', itemId: 'neural_cap', chance: 0.06 },
      { kind: 'item', itemId: 'plasma_cutter', chance: 0.03 },
      { kind: 'item', itemId: 'trauma_plate', chance: 0.05 },
      { kind: 'item', itemId: 'riot_vest', chance: 0.02 },
    ],
  },
]

const FLAVORS: Record<string, MobFlavor> = {
  street_punk: {
    name: 'street punk',
    description: 'Hoodie pulled low, grin pulled lower. Cheap knife, cheap attitude.',
  },
  scav_hound: {
    name: 'scav hound',
    description: 'Half dog, half augment, all hunger. Red LED where its left eye was.',
  },
  security_drone: {
    name: 'security drone',
    description: 'Corp logo scratched off. Still flies, still shoots, still thinks it owns the hall.',
  },
  netrunner_ghost: {
    name: 'netrunner ghost',
    description: 'A silhouette flickering between the walls. Something of them still runs on the net.',
  },
}

export const CYBERPUNK_MOBS: MobTemplate[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Cyberpunk world is missing flavor for mob archetype '${a.id}'`)
  return { ...a, ...flavor }
})
