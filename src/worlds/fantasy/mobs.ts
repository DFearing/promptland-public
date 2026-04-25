import type { MobArchetype, MobFlavor, MobTemplate } from '../../mobs'

// Mechanics only. Shape we'd ship to any world that uses similar archetypes.
const ARCHETYPES: MobArchetype[] = [
  // ── Common / low-threat ─────────────────────────────────────────────────────
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
  {
    id: 'barrow_crow',
    maxHp: 3,
    attack: 2,
    defense: 0,
    xpReward: 3,
    loot: [
      { kind: 'gold', chance: 0.2, min: 1, max: 2 },
      { kind: 'item', itemId: 'crow_feather', chance: 0.65 },
    ],
  },
  // ── Medium threat ───────────────────────────────────────────────────────────
  {
    id: 'marsh_adder',
    maxHp: 5,
    attack: 3,
    defense: 0,
    xpReward: 5,
    applyOnHit: { conditionId: 'poisoned', chance: 0.25 },
    loot: [
      { kind: 'gold', chance: 0.2, min: 1, max: 3 },
      { kind: 'item', itemId: 'snake_skin', chance: 0.55 },
      { kind: 'item', itemId: 'healing_draught', chance: 0.06 },
    ],
  },
  {
    id: 'lost_shade',
    maxHp: 6,
    attack: 3,
    defense: 0,
    xpReward: 5,
    applyOnHit: { conditionId: 'slept', chance: 0.2 },
    // Shades siphon life from the shadows when cornered — one hefty refill
    // per encounter, enough to feel like a second chance but not a stall.
    healCharges: 1,
    healAmount: 4,
    loot: [
      { kind: 'gold', chance: 0.3, min: 1, max: 4 },
      { kind: 'item', itemId: 'shade_essence', chance: 0.45 },
      { kind: 'item', itemId: 'mana_tincture', chance: 0.06 },
      { kind: 'item', itemId: 'runed_dagger', chance: 0.03 },
      { kind: 'item', itemId: 'leather_jerkin', chance: 0.05 },
      { kind: 'item', itemId: 'chain_vest', chance: 0.02 },
      { kind: 'item', itemId: 'scroll_fireball', chance: 0.04 },
      { kind: 'item', itemId: 'scroll_recall', chance: 0.01 },
    ],
  },
  {
    id: 'ragged_wolf',
    maxHp: 9,
    attack: 4,
    defense: 1,
    xpReward: 8,
    level: 3,
    loot: [
      { kind: 'gold', chance: 0.5, min: 2, max: 8 },
      { kind: 'item', itemId: 'wolf_pelt', chance: 0.65 },
      { kind: 'item', itemId: 'huntsman_boots', chance: 0.06 },
      { kind: 'item', itemId: 'woodsman_cloak', chance: 0.04 },
    ],
  },
  // ── Hard / dungeon-tier ─────────────────────────────────────────────────────
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
      { kind: 'item', itemId: 'pot_helm', chance: 0.06 },
      { kind: 'item', itemId: 'leather_bracers', chance: 0.05 },
      { kind: 'item', itemId: 'studded_gloves', chance: 0.05 },
      { kind: 'item', itemId: 'quilted_leggings', chance: 0.05 },
      { kind: 'item', itemId: 'scuffed_boots', chance: 0.05 },
      { kind: 'item', itemId: 'travelers_cloak', chance: 0.04 },
      { kind: 'item', itemId: 'bone_amulet', chance: 0.03 },
      { kind: 'item', itemId: 'silver_ring', chance: 0.03 },
      { kind: 'item', itemId: 'iron_band', chance: 0.03 },
      { kind: 'item', itemId: 'scroll_missile', chance: 0.05 },
      { kind: 'item', itemId: 'scroll_heal', chance: 0.03 },
    ],
  },
  {
    id: 'hollow_knight',
    maxHp: 16,
    attack: 5,
    defense: 3,
    xpReward: 14,
    level: 5,
    loot: [
      { kind: 'gold', chance: 0.85, min: 8, max: 20 },
      { kind: 'item', itemId: 'bone_shard', chance: 0.5, min: 1, max: 2 },
      { kind: 'item', itemId: 'rusted_blade', chance: 0.2 },
      { kind: 'item', itemId: 'open_helm', chance: 0.1 },
      { kind: 'item', itemId: 'iron_mace', chance: 0.08 },
      { kind: 'item', itemId: 'iron_shortsword', chance: 0.06 },
      { kind: 'item', itemId: 'chain_vest', chance: 0.05 },
      { kind: 'item', itemId: 'scroll_missile', chance: 0.06 },
      { kind: 'item', itemId: 'scroll_heal', chance: 0.04 },
      { kind: 'item', itemId: 'thorn_ring', chance: 0.04 },
    ],
  },
]

// Fantasy-flavored names and descriptions. Will be swapped for an LLM-backed
// provider later — this table is the clean seam.
const FLAVORS: Record<string, MobFlavor> = {
  cave_rat: {
    name: 'Cave Rat',
    description: 'Matted fur, yellow teeth, eyes like wet beads.',
  },
  cellar_spider: {
    name: 'Cellar Spider',
    description: 'Big as a cat, patient as a jailer.',
  },
  barrow_crow: {
    name: 'Barrow Crow',
    description: 'A big, black bird with a grudge. It has seen things in that hole and decided they were yours.',
  },
  marsh_adder: {
    name: 'Marsh Adder',
    description: 'Patterned black and grey, coiled in the shadow before you arrived. It was waiting for something.',
  },
  lost_shade: {
    name: 'Lost Shade',
    description: "A smear of colder air, vaguely person-shaped. It doesn't want to be seen.",
  },
  ragged_wolf: {
    name: 'Ragged Wolf',
    description: 'Lean ribs, yellow eyes, a limp it ignores. It has been following you since the treeline.',
  },
  skeletal_scrap: {
    name: 'Skeletal Scrap',
    description: 'A rattling bone-thing, mostly ribs and want.',
  },
  hollow_knight: {
    name: 'Hollow Knight',
    description: 'Full plate with nothing in it but old habit. The visor is rusted shut; whatever looks out has no eyes to close.',
  },
}

export const FANTASY_MOBS: MobTemplate[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Fantasy world is missing flavor for mob archetype '${a.id}'`)
  return { ...a, ...flavor }
})
