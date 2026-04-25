import type { GenderOption, WorldManifest } from './types'

const DEFAULT_GENDERS: GenderOption[] = [
  { id: 'man', name: 'Man' },
  { id: 'woman', name: 'Woman' },
  { id: 'nonbinary', name: 'Nonbinary' },
]

const FANTASY: WorldManifest = {
  id: 'fantasy',
  version: '3',
  name: 'Fantasy',
  description:
    'Swords, sorcery, and candle-lit taverns. Dragons hoard gold and kings die young.',
  species: [
    { id: 'human', name: 'Human', description: 'Adaptable, ambitious, and everywhere.' },
    { id: 'elf', name: 'Elf', description: 'Long-lived, sharp-eyed, and quietly condescending.' },
    { id: 'dwarf', name: 'Dwarf', description: 'Stout, stubborn, and born of stone.' },
    { id: 'halfling', name: 'Halfling', description: 'Small, nimble, and hungry.' },
    { id: 'orc', name: 'Orc', description: 'Strong, loud, and misunderstood.' },
  ],
  classes: [
    {
      id: 'warrior',
      name: 'Warrior',
      description: 'Steel, shields, and scars.',
      startingStats: { strength: 14, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 6,
      startingInventory: [
        { name: 'Worn sword', description: 'Notched but sharp enough.' },
        { name: 'Leather cuirass' },
      ],
    },
    {
      id: 'rogue',
      name: 'Rogue',
      description: 'Quiet feet, loose purses.',
      startingStats: { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 12 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Shortblade' },
        { name: 'Lockpicks', quantity: 5 },
      ],
    },
    {
      id: 'mage',
      name: 'Mage',
      description: 'Old books, older words.',
      startingStats: { strength: 8, dexterity: 10, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 16,
      startingInventory: [
        { name: 'Wooden staff' },
        { name: 'Candle stub', description: 'Barely enough for a cantrip.' },
      ],
    },
    {
      id: 'cleric',
      name: 'Cleric',
      description: 'Faith as both shield and sword.',
      startingStats: { strength: 10, dexterity: 8, constitution: 12, intelligence: 10, wisdom: 14, charisma: 12 },
      startingMaxMagic: 12,
      startingInventory: [
        { name: 'Oak mace' },
        { name: 'Prayer beads' },
      ],
    },
    {
      id: 'ranger',
      name: 'Ranger',
      description: 'A bow, a path, a long silence.',
      startingStats: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 12, charisma: 8 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Hunting bow' },
        { name: 'Trail rations', quantity: 3 },
      ],
    },
  ],
  genders: DEFAULT_GENDERS,
  magicName: 'Arcana',
  magicAbbreviation: 'ARC',
  currencyName: 'Gold',
  currencyAbbreviation: 'GP',
  allowedConcepts: ['sword', 'bow', 'magic', 'dragon', 'tavern', 'dungeon', 'castle'],
  forbiddenConcepts: ['gun', 'laser', 'spaceship', 'computer', 'robot'],
}

const CYBERPUNK: WorldManifest = {
  id: 'cyberpunk',
  version: '3',
  name: 'Cyberpunk',
  description:
    'Neon on wet streets. Corporations own the sky; you rent a coffin for the night.',
  species: [
    { id: 'human', name: 'Human', description: 'Baseline meat, if that still means anything.' },
    { id: 'augmented', name: 'Augmented', description: 'Half you, half warranty.' },
    { id: 'construct', name: 'Construct', description: 'Built, not born — and paying off the loan.' },
    { id: 'ghost', name: 'Ghost', description: 'A mind that outlived its body.' },
  ],
  classes: [
    {
      id: 'netrunner',
      name: 'Netrunner',
      description: 'Breaks systems from inside.',
      startingStats: { strength: 8, dexterity: 10, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 16,
      startingInventory: [
        { name: 'Cyberdeck (old model)' },
        { name: 'Stim shot', quantity: 1 },
      ],
    },
    {
      id: 'samurai',
      name: 'Street Samurai',
      description: 'Chrome and a code.',
      startingStats: { strength: 14, dexterity: 12, constitution: 12, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Mono-katana' },
        { name: 'Ballistic jacket' },
      ],
    },
    {
      id: 'techie',
      name: 'Techie',
      description: 'Solders, scavenges, survives.',
      startingStats: { strength: 10, dexterity: 12, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 14,
      startingInventory: [
        { name: 'Multi-tool' },
        { name: 'Soldering kit' },
      ],
    },
    {
      id: 'fixer',
      name: 'Fixer',
      description: 'Knows a guy. Is the guy.',
      startingStats: { strength: 10, dexterity: 12, constitution: 10, intelligence: 12, wisdom: 12, charisma: 14 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Burner phone' },
        { name: 'Pack of cigarettes', quantity: 20 },
      ],
    },
  ],
  genders: DEFAULT_GENDERS,
  magicName: 'Hack',
  magicAbbreviation: 'HAX',
  currencyName: 'Credits',
  currencyAbbreviation: 'CR',
  allowedConcepts: ['neon', 'chrome', 'hacker', 'megacorp', 'alley', 'implant', 'drone'],
  forbiddenConcepts: ['magic', 'sword', 'dragon', 'wizard'],
}

const SCIFI: WorldManifest = {
  id: 'scifi',
  version: '3',
  name: 'Sci-Fi',
  description:
    'Starships, first contacts, and the slow horror of deep space. A frontier with better plumbing.',
  species: [
    { id: 'human', name: 'Human', description: 'The curious apes, now in space.' },
    { id: 'xarn', name: 'Xarn', description: 'Cold logic, warmer than they let on.' },
    { id: 'synthetic', name: 'Synthetic', description: 'Person-shaped; person, depending on whom you ask.' },
    { id: 'zoll', name: 'Zoll', description: 'Chitinous, hive-minded, polite.' },
  ],
  classes: [
    {
      id: 'captain',
      name: 'Captain',
      description: 'The one who decides.',
      startingStats: { strength: 10, dexterity: 10, constitution: 12, intelligence: 12, wisdom: 12, charisma: 14 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Comm badge' },
        { name: 'Service pistol' },
      ],
    },
    {
      id: 'engineer',
      name: 'Engineer',
      description: 'Keeps the ship from coming apart.',
      startingStats: { strength: 10, dexterity: 12, constitution: 10, intelligence: 14, wisdom: 12, charisma: 8 },
      startingMaxMagic: 10,
      startingInventory: [
        { name: 'Plasma torch' },
        { name: 'Gravity wrench' },
      ],
    },
    {
      id: 'science',
      name: 'Science Officer',
      description: 'Names the unknown.',
      startingStats: { strength: 8, dexterity: 10, constitution: 10, intelligence: 14, wisdom: 14, charisma: 10 },
      startingMaxMagic: 14,
      startingInventory: [
        { name: 'Tricorder' },
        { name: 'Datapad' },
      ],
    },
    {
      id: 'security',
      name: 'Security',
      description: 'Stands between the crew and the airlock.',
      startingStats: { strength: 14, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Phaser (type-1)' },
        { name: 'Body armor' },
      ],
    },
    {
      id: 'medic',
      name: 'Medic',
      description: 'Patches bodies and the occasional ego.',
      startingStats: { strength: 8, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 14, charisma: 12 },
      startingMaxMagic: 10,
      startingInventory: [
        { name: 'Medical kit' },
        { name: 'Hypospray', quantity: 2 },
      ],
    },
  ],
  genders: DEFAULT_GENDERS,
  magicName: 'Psionics',
  magicAbbreviation: 'PSY',
  currencyName: 'Credits',
  currencyAbbreviation: 'CR',
  allowedConcepts: ['starship', 'phaser', 'warp', 'nebula', 'away team', 'bridge', 'sensor'],
  forbiddenConcepts: ['magic', 'sword', 'dragon', 'wizard'],
}

export const WORLD_MANIFESTS: readonly WorldManifest[] = [FANTASY, CYBERPUNK, SCIFI] as const

export function getWorldManifest(id: string): WorldManifest | undefined {
  return WORLD_MANIFESTS.find((w) => w.id === id)
}
