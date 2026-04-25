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
    effect: { kind: 'heal' },
    size: 'lesser',
  },
  {
    id: 'neural_cap',
    kind: 'consumable',
    value: 20,
    stackable: true,
    effect: { kind: 'restore-magic' },
    size: 'lesser',
  },
  {
    id: 'shock_baton',
    kind: 'equipment',
    value: 10,
    slot: 'weapon',
    damageFamily: 'electric',
    bonuses: { attack: 1 },
  },
  {
    id: 'monofilament_blade',
    kind: 'equipment',
    value: 30,
    slot: 'weapon',
    damageFamily: 'slash',
    bonuses: { attack: 2 },
  },
  {
    id: 'plasma_cutter',
    kind: 'equipment',
    value: 46,
    slot: 'weapon',
    damageFamily: 'fire',
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
  {
    id: 'daemon_overload',
    kind: 'scroll',
    value: 35,
    stackable: true,
    spellId: 'overload',
    level: 1,
  },
  {
    id: 'daemon_icepick',
    kind: 'scroll',
    value: 18,
    stackable: true,
    spellId: 'icepick',
    level: 1,
  },
  {
    id: 'daemon_patch',
    kind: 'scroll',
    value: 22,
    stackable: true,
    spellId: 'patch_kit',
    level: 1,
  },
  {
    id: 'daemon_extract',
    kind: 'scroll',
    value: 90,
    stackable: true,
    spellId: 'extract',
    level: 1,
  },

  // ── Buff implants ──────────────────────────────────────────────────────
  {
    id: 'nutrichip_implant',
    kind: 'equipment',
    value: 85,
    slot: 'amulet',
    bonuses: { hungerSlow: 0.35 },
  },
  {
    id: 'neural_relaxant_dose',
    kind: 'equipment',
    value: 95,
    slot: 'amulet',
    bonuses: { restBoost: 0.4 },
  },

  // ── Curated (legendary / artifact) ─────────────────────────────────────────
  // Pre-release prototype chipset. Excluded from background loot rolls; only
  // drops from curated encounters or bespoke LLM hooks. Fold it into the head
  // slot so it reads as a neural interface rather than a weapon.
  {
    id: 'prototype_os9_chipset',
    kind: 'equipment',
    value: 1400,
    weight: 1,
    slot: 'head',
    bonuses: { attack: 2, defense: 2, intelligence: 3, dexterity: 1 },
    requirements: { intelligence: 12, level: 6 },
    curated: true,
  },
]

const FLAVORS: Record<string, ItemFlavor> = {
  chrome_scrap: {
    name: 'Chrome Scrap',
    description: 'Peeled from something that used to be expensive. Still is, if you find the right buyer.',
  },
  wire_bundle: {
    name: 'Wire Bundle',
    description: 'Twisted copper and optical, colour codes long faded.',
  },
  drone_part: {
    name: 'Drone Part',
    description: 'A servo casing with half a gyro still inside. Warm.',
  },
  data_sliver: {
    name: 'Data Sliver',
    description: 'A paper-thin wafer. Something on it pulls at the edge of your eye.',
  },
  ration_pack: {
    name: 'Ration Pack',
    description: 'Corp-branded nutrient paste. Tastes of yeast and disappointment.',
  },
  stim_patch: {
    name: 'Stim Patch',
    description: 'Press it to a vein and the pain forgets where you put it.',
  },
  neural_cap: {
    name: 'Neural Cap',
    description: 'A chrome wafer that sits wet on the roof of your mouth.',
  },
  shock_baton: {
    name: 'Shock Baton',
    description: 'Private security surplus. One charge left, maybe two.',
  },
  monofilament_blade: {
    name: 'Monofilament Blade',
    description: 'The edge is one molecule thick. Cut yourself before you notice it happened.',
  },
  plasma_cutter: {
    name: 'Plasma Cutter',
    description: 'Meant for doors, works on anything that bleeds.',
  },
  kevlar_jacket: {
    name: 'Kevlar Jacket',
    description: 'Patched and washed a hundred times. Keeps out most things.',
  },
  trauma_plate: {
    name: 'Trauma Plate',
    description: 'Ceramic insert that turns a kill into a bruise, once.',
  },
  riot_vest: {
    name: 'Riot Vest',
    description: 'Stenciled property of a precinct that no longer exists.',
  },
  daemon_overload: {
    name: 'Daemon: Overload',
    description: 'A one-shot script. Signed by someone too angry to hide their tag.',
  },
  daemon_icepick: {
    name: 'Daemon: Icepick',
    description: 'A cheap ICE-breaker burned to a single-use dongle.',
  },
  daemon_patch: {
    name: 'Daemon: Patch',
    description: 'Biomesh deploy script. Opens a subcutaneous patch kit remotely.',
  },
  daemon_extract: {
    name: 'Daemon: Extract',
    description: 'Extraction protocol. Burns out after the door closes.',
  },
  nutrichip_implant: {
    name: 'NutriChip Implant',
    description:
      'A subdermal wafer that leaks calorie-analogue into the bloodstream. The body stops nagging you about lunch.',
  },
  neural_relaxant_dose: {
    name: 'Neural Relaxant Dose',
    description:
      'A slow-release cortical patch. Downtime snaps into repair time; you wake up sharper than you went down.',
  },

  // Curated / legendary — lore hook seeds the LLM expansion on first drop.
  prototype_os9_chipset: {
    name: 'Prototype OS-9 Chipset',
    description:
      'A sliver of unreleased silicon stamped with a corp logo nobody recognises. It runs warm even unplugged, and the city feels a little quieter when you hold it.',
  },
}

export const CYBERPUNK_ITEMS: ItemDef[] = ARCHETYPES.map((a) => {
  const flavor = FLAVORS[a.id]
  if (!flavor) throw new Error(`Cyberpunk world is missing flavor for item archetype '${a.id}'`)
  return { ...a, ...flavor }
})
