import type { ItemArchetype, ItemDef, ItemFlavor } from '../../items'

const ARCHETYPES: ItemArchetype[] = [
  // ── Junk ────────────────────────────────────────────────────────────────────
  { id: 'rat_tail', kind: 'junk', value: 2, stackable: true, weight: 1 },
  { id: 'cobweb_rope', kind: 'junk', value: 5, stackable: true, weight: 1 },
  { id: 'bone_shard', kind: 'junk', value: 3, stackable: true, weight: 1 },
  { id: 'shade_essence', kind: 'junk', value: 12, stackable: true, weight: 1 },
  { id: 'stale_bread', kind: 'junk', value: 1, stackable: true, weight: 1 },
  { id: 'crow_feather', kind: 'junk', value: 5, stackable: true, weight: 1 },
  { id: 'snake_skin', kind: 'junk', value: 6, stackable: true, weight: 1 },
  { id: 'wolf_pelt', kind: 'junk', value: 8, stackable: true, weight: 1 },
  // Quest oddity — ancient key found near the barrow.
  { id: 'barrow_key', kind: 'junk', value: 50, weight: 1 },

  // ── Consumables ─────────────────────────────────────────────────────────────
  {
    id: 'healing_draught',
    kind: 'consumable',
    value: 15,
    stackable: true,
    weight: 1,
    effect: { kind: 'heal', amount: 8 },
  },
  {
    id: 'greater_healing_draught',
    kind: 'consumable',
    value: 30,
    stackable: true,
    weight: 1,
    effect: { kind: 'heal', amount: 18 },
  },
  {
    id: 'hard_tack',
    kind: 'consumable',
    value: 4,
    stackable: true,
    weight: 1,
    effect: { kind: 'heal', amount: 3 },
  },
  {
    id: 'mana_tincture',
    kind: 'consumable',
    value: 18,
    stackable: true,
    weight: 1,
    effect: { kind: 'restore-magic', amount: 6 },
  },
  {
    id: 'mana_crystal',
    kind: 'consumable',
    value: 25,
    stackable: true,
    weight: 1,
    effect: { kind: 'restore-magic', amount: 10 },
  },

  // ── Weapons ─────────────────────────────────────────────────────────────────
  {
    id: 'rusted_blade',
    kind: 'equipment',
    value: 10,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 1 },
    requirements: { strength: 4 },
  },
  {
    id: 'hand_axe',
    kind: 'equipment',
    value: 20,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 1, strength: 1 },
    requirements: { strength: 5 },
  },
  {
    id: 'iron_shortsword',
    kind: 'equipment',
    value: 28,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 2 },
    requirements: { strength: 5 },
  },
  {
    id: 'shortbow',
    kind: 'equipment',
    value: 30,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 2, dexterity: 1 },
    requirements: { dexterity: 5 },
  },
  {
    id: 'iron_mace',
    kind: 'equipment',
    value: 32,
    weight: 4,
    slot: 'weapon',
    bonuses: { attack: 2, strength: 1 },
    requirements: { strength: 6 },
  },
  {
    id: 'carved_staff',
    kind: 'equipment',
    value: 35,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 1, intelligence: 1 },
    requirements: { intelligence: 6 },
  },
  {
    id: 'runed_dagger',
    kind: 'equipment',
    value: 40,
    weight: 2,
    slot: 'weapon',
    bonuses: { attack: 3 },
    requirements: { dexterity: 5 },
  },

  // ── Armor (torso) ────────────────────────────────────────────────────────────
  {
    id: 'padded_vest',
    kind: 'equipment',
    value: 12,
    weight: 2,
    slot: 'armor',
    bonuses: { defense: 1 },
    requirements: { strength: 4 },
  },
  {
    id: 'leather_jerkin',
    kind: 'equipment',
    value: 26,
    weight: 3,
    slot: 'armor',
    bonuses: { defense: 2 },
    requirements: { strength: 6 },
  },
  {
    id: 'chain_vest',
    kind: 'equipment',
    value: 44,
    weight: 5,
    slot: 'armor',
    bonuses: { defense: 3 },
    requirements: { strength: 10, level: 3 },
  },

  // ── Head ────────────────────────────────────────────────────────────────────
  {
    id: 'pot_helm',
    kind: 'equipment',
    value: 16,
    weight: 2,
    slot: 'head',
    bonuses: { defense: 1 },
    requirements: { strength: 4 },
  },
  {
    id: 'open_helm',
    kind: 'equipment',
    value: 28,
    weight: 2,
    slot: 'head',
    bonuses: { defense: 2 },
    requirements: { strength: 6 },
  },

  // ── Arms ────────────────────────────────────────────────────────────────────
  {
    id: 'leather_bracers',
    kind: 'equipment',
    value: 14,
    weight: 1,
    slot: 'arms',
    bonuses: { defense: 1 },
  },
  {
    id: 'wrist_wraps',
    kind: 'equipment',
    value: 12,
    weight: 1,
    slot: 'arms',
    bonuses: { defense: 1 },
  },

  // ── Hands ────────────────────────────────────────────────────────────────────
  {
    id: 'studded_gloves',
    kind: 'equipment',
    value: 14,
    weight: 1,
    slot: 'hands',
    bonuses: { attack: 1 },
  },
  {
    id: 'fur_gloves',
    kind: 'equipment',
    value: 14,
    weight: 1,
    slot: 'hands',
    bonuses: { constitution: 1 },
  },

  // ── Legs ────────────────────────────────────────────────────────────────────
  {
    id: 'quilted_leggings',
    kind: 'equipment',
    value: 16,
    weight: 2,
    slot: 'legs',
    bonuses: { defense: 1 },
  },

  // ── Feet ────────────────────────────────────────────────────────────────────
  {
    id: 'scuffed_boots',
    kind: 'equipment',
    value: 10,
    weight: 1,
    slot: 'feet',
    bonuses: { dexterity: 1 },
  },
  {
    id: 'huntsman_boots',
    kind: 'equipment',
    value: 28,
    weight: 1,
    slot: 'feet',
    bonuses: { dexterity: 1, constitution: 1 },
  },

  // ── Cape ────────────────────────────────────────────────────────────────────
  {
    id: 'travelers_cloak',
    kind: 'equipment',
    value: 20,
    weight: 1,
    slot: 'cape',
    bonuses: { defense: 1, wisdom: 1 },
  },
  {
    id: 'woodsman_cloak',
    kind: 'equipment',
    value: 32,
    weight: 1,
    slot: 'cape',
    bonuses: { strength: 1, dexterity: 1 },
  },

  // ── Amulet ──────────────────────────────────────────────────────────────────
  {
    id: 'bone_amulet',
    kind: 'equipment',
    value: 24,
    weight: 1,
    slot: 'amulet',
    bonuses: { wisdom: 2 },
    requirements: { wisdom: 5 },
  },
  {
    id: 'amber_pendant',
    kind: 'equipment',
    value: 30,
    weight: 1,
    slot: 'amulet',
    bonuses: { wisdom: 1, charisma: 1 },
    requirements: { wisdom: 4 },
  },

  // ── Rings ───────────────────────────────────────────────────────────────────
  {
    id: 'silver_ring',
    kind: 'equipment',
    value: 22,
    weight: 1,
    slot: 'ring',
    bonuses: { intelligence: 1 },
  },
  {
    id: 'iron_band',
    kind: 'equipment',
    value: 22,
    weight: 1,
    slot: 'ring',
    bonuses: { strength: 1 },
  },
  {
    id: 'copper_ring',
    kind: 'equipment',
    value: 14,
    weight: 1,
    slot: 'ring',
    bonuses: { dexterity: 1 },
  },
  {
    id: 'thorn_ring',
    kind: 'equipment',
    value: 55,
    weight: 1,
    slot: 'ring',
    bonuses: { attack: 1, strength: 1 },
  },

  // ── Scrolls ─────────────────────────────────────────────────────────────────
  {
    id: 'scroll_fireball',
    kind: 'scroll',
    value: 35,
    stackable: true,
    weight: 1,
    spellId: 'fireball',
  },
  {
    id: 'scroll_missile',
    kind: 'scroll',
    value: 18,
    stackable: true,
    weight: 1,
    spellId: 'magic_missile',
  },
  {
    id: 'scroll_heal',
    kind: 'scroll',
    value: 22,
    stackable: true,
    weight: 1,
    spellId: 'lesser_heal',
  },
  {
    id: 'scroll_recall',
    kind: 'scroll',
    value: 90,
    stackable: true,
    weight: 1,
    spellId: 'recall',
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  // Junk
  rat_tail: {
    name: 'Rat Tail',
    description: 'Stiff and unpleasant. Certain apothecaries pay for these.',
  },
  cobweb_rope: {
    name: 'Cobweb Rope',
    description: 'A dense hank of spider silk. Stronger than it looks.',
  },
  bone_shard: {
    name: 'Bone Shard',
    description: 'Splintered, yellow, faintly warm even now.',
  },
  shade_essence: {
    name: 'Shade Essence',
    description: 'A vial of not-quite-air. It moves in the bottle when nothing else does.',
  },
  stale_bread: {
    name: 'Stale Bread',
    description: 'Hard as stone, but edible. Probably.',
  },
  crow_feather: {
    name: 'Crow Feather',
    description: 'A flight feather, black on black, no shine left. Something about it makes people uneasy.',
  },
  snake_skin: {
    name: 'Snake Skin',
    description: 'Papery and dry, the pattern still vivid. A leatherworker might want it.',
  },
  wolf_pelt: {
    name: 'Wolf Pelt',
    description: 'A rough grey hide, stiff along the shoulder. A tanner will give a fair price.',
  },
  barrow_key: {
    name: 'Barrow Key',
    description: 'Iron, square-toothed, old enough that the teeth are worn smooth. It opened something once, and may again.',
  },

  // Consumables
  healing_draught: {
    name: 'Healing Draught',
    description: 'Red and thick. Smells of rust and rosemary.',
  },
  greater_healing_draught: {
    name: 'Greater Healing Draught',
    description: 'A darker red than the common sort. Burns all the way down and leaves you steadier than before.',
  },
  hard_tack: {
    name: 'Hard Tack',
    description: 'A round of baked flour, salted and dried until it keeps indefinitely. The teeth earn every bite.',
  },
  mana_tincture: {
    name: 'Mana Tincture',
    description: 'A cold blue liquid. Tingles on the tongue and behind the eyes.',
  },
  mana_crystal: {
    name: 'Mana Crystal',
    description: 'A shard of pale quartz that hums faintly. Dissolves on the tongue and makes the space behind your eyes ache briefly.',
  },

  // Weapons
  rusted_blade: {
    name: 'Rusted Blade',
    description: 'Pitted iron with a loose grip. Still cuts if you mean it.',
  },
  hand_axe: {
    name: 'Hand Axe',
    description: 'Single-bitted, hickory-handled, the poll scarred from use as a hammer. A working tool that also splits skulls.',
  },
  iron_shortsword: {
    name: 'Iron Shortsword',
    description: 'Plain, balanced, honest.',
  },
  shortbow: {
    name: 'Shortbow',
    description: 'A curved yew stave with a worn grip. Accurate to thirty paces, honest to twenty.',
  },
  iron_mace: {
    name: 'Iron Mace',
    description: 'A flanged head on an ash handle. Good against plate; the flanges say as much.',
  },
  carved_staff: {
    name: 'Carved Staff',
    description: 'Old ash, carved with small diagrams someone understood once. The wood remembers what was asked of it.',
  },
  runed_dagger: {
    name: 'Runed Dagger',
    description: 'Script you almost recognize runs down the blade.',
  },

  // Armor
  padded_vest: {
    name: 'Padded Vest',
    description: 'Quilted cloth. Soaks up the first strike, sometimes.',
  },
  leather_jerkin: {
    name: 'Leather Jerkin',
    description: 'Stained and supple. Someone else wore it longer.',
  },
  chain_vest: {
    name: 'Chain Vest',
    description: 'Rings on rings. Heavy, but the weight is a comfort.',
  },

  // Head
  pot_helm: {
    name: 'Pot Helm',
    description: 'A dented iron bowl with a noseguard. Ugly. Works.',
  },
  open_helm: {
    name: 'Open Helm',
    description: 'Riveted iron with cheek-guards and no face plate. Good visibility, acceptable coverage.',
  },

  // Arms
  leather_bracers: {
    name: 'Leather Bracers',
    description: 'Stiff cuffs that take the brunt of a parry.',
  },
  wrist_wraps: {
    name: 'Wrist Wraps',
    description: 'Tight-wound linen over rigid leather strips. A fighter\'s habit more than armor.',
  },

  // Hands
  studded_gloves: {
    name: 'Studded Gloves',
    description: 'The knuckles are iron under the hide. You feel the difference in a punch.',
  },
  fur_gloves: {
    name: 'Fur Gloves',
    description: 'Rabbit-lined leather, seams reinforced at the thumb. Keep the cold out of your grip.',
  },

  // Legs
  quilted_leggings: {
    name: 'Quilted Leggings',
    description: 'Layers of wool and linen, stitched tight against cold stone.',
  },

  // Feet
  scuffed_boots: {
    name: 'Scuffed Boots',
    description: 'Thin soles, quiet steps.',
  },
  huntsman_boots: {
    name: 'Huntsman\'s Boots',
    description: 'Calf-high leather, waterproofed and resoled twice. Built for wet ground and long mornings.',
  },

  // Cape
  travelers_cloak: {
    name: "Traveler's Cloak",
    description: 'Faded wool. Smells of woodsmoke and long roads.',
  },
  woodsman_cloak: {
    name: "Woodsman's Cloak",
    description: 'Heavy wool dyed the colour of dead bracken. Worn enough to shed noise as well as rain.',
  },

  // Amulet
  bone_amulet: {
    name: 'Bone Amulet',
    description: 'A thumb-length splinter bound in silver wire. Warm to the wearer.',
  },
  amber_pendant: {
    name: 'Amber Pendant',
    description: 'A teardrop of amber on a worn cord. Something small is preserved inside, too clouded to name.',
  },

  // Rings
  silver_ring: {
    name: 'Silver Ring',
    description: 'Delicate runes circle the band. They glow, faintly, when thought quickens.',
  },
  iron_band: {
    name: 'Iron Band',
    description: 'A heavy black ring. Grip tightens whenever you clench a fist.',
  },
  copper_ring: {
    name: 'Copper Ring',
    description: 'A plain band, green at the seam. The kind everyone has worn at some point.',
  },
  thorn_ring: {
    name: 'Thorn Ring',
    description: 'Iron set with blackthorn spurs. The thorns are not decorative.',
  },

  // Scrolls
  scroll_fireball: {
    name: 'Scroll of Fireball',
    description: 'Parchment warm to the touch. The ink writhes if watched.',
  },
  scroll_missile: {
    name: 'Scroll of Magic Missile',
    description: 'A cantrip on vellum. Cheap, common, useful.',
  },
  scroll_heal: {
    name: 'Scroll of Healing',
    description: 'Ink that smells faintly of rosemary.',
  },
  scroll_recall: {
    name: 'Scroll of Recall',
    description: 'Gilded edges. The words end in a door that opens elsewhere.',
  },
}

export const FANTASY_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Fantasy world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
