import type { WorldManifest } from './types'

// --- Title ladders --------------------------------------------------------
// 39 entries per class: indexes 0..23 = levels 2..25 (one per level),
// indexes 24..38 = levels 30, 35, …, 100 (every 5). Level 1 uses the world
// manifest's birthTitle. Levels past 100 are LLM-generated on demand.
// See src/character/titles.ts for the math.

const FANTASY_WARRIOR_TITLES = [
  'Man-at-Arms', 'Footman', 'Spearhand', 'Shieldbearer', 'Swordhand',
  'Guardsman', 'Sergeant-at-Arms', 'Sworn Sword', 'Banderhand', 'Veteran',
  'Knight Errant', 'Knight', 'Bannerman', 'Captain of the Watch', 'Hearthguard',
  'Lieutenant', 'Captain', 'Champion', 'Swordmaster', 'Ironwarden',
  'Commander', 'Knight-Captain', 'Lord-Protector', 'Marshal',
  // 30, 35, 40, 45, 50
  'Knight-Commander', 'High Marshal', 'Warlord', 'Paladin of the Vow', 'Living Blade',
  // 55, 60, 65, 70, 75
  'Iron Pillar', 'Undying Knight', 'Sword-Saint', 'Warden of the Realm', 'Hero of the Banner',
  // 80, 85, 90, 95, 100
  'Protector Eternal', 'Myth of Steel', 'Age-Warden', 'First Sword', 'Sovereign of War',
]

const FANTASY_ROGUE_TITLES = [
  'Cutpurse', 'Pickpocket', 'Footpad', 'Sneakthief', 'Housebreaker',
  'Fencer', 'Blackhand', 'Prowler', 'Whisperfoot', 'Nightwalker',
  'Lockbreaker', 'Shadowhand', 'Cat', 'Second-Story Man', 'Informer',
  'Road Agent', 'Master Thief', 'Ghost of the Alley', 'Assassin', 'Guildbreaker',
  'Silent Blade', 'Nightlord', 'Master of the Guild', 'Shadow Prince',
  'Unseen Hand', 'Thousand Knives', 'Oath-Slayer', 'Keeper of Secrets', 'Hollow Shadow',
  'Moonwalker', 'Whisper of the Court', 'Ghost Made Flesh', 'Unknown Knife', 'King of Thieves',
  'Faceless One', 'Silence Incarnate', 'Shroud', 'Last Breath', 'The Nameless',
]

const FANTASY_MAGE_TITLES = [
  'Apprentice', 'Acolyte', 'Initiate of Words', 'Circle-Student', 'Cantor',
  'Junior Scribe', 'Sigil-Bearer', 'Adept', 'Spellbound', 'Journeyman Mage',
  'Wizard', 'Sorcerer', 'Conjurer', 'Enchanter', 'Magister',
  'Warlock', 'Mystic', 'High Wizard', 'Archmage', 'Rune-Graver',
  'Spell-Weaver', 'Court Magus', 'Master of the Seven Circles', 'Grand Magister',
  'Archon of Thought', 'Ether-Binder', 'Master of the Wyrd', 'Star-Reader', 'Keeper of the Flame',
  'Weaver of Realities', 'Dreamwright', 'World-Singer', 'Lich-Walker', 'Spellfather',
  'Unmade Mage', 'Mind of the Void', 'Incanter Eternal', 'First Word', 'Pillar of the Arcane',
]

const FANTASY_CLERIC_TITLES = [
  'Novice', 'Postulant', 'Lay Brother', 'Acolyte', 'Deacon',
  'Almoner', 'Confessor', 'Chaplain', 'Priest', 'Elder',
  'Exorcist', 'Witness', 'Keeper of the Flame', 'Canon', 'Templar',
  'Prior', 'Pilgrim-Captain', 'Arch-Priest', 'Bishop', 'Oathbound',
  'Hospitaller', 'Vicar', 'High Priest', 'Patriarch',
  'Hand of the Gods', 'Living Saint', 'Miracle-Maker', 'Voice of the Word', 'Keeper of Sanctuaries',
  'Prophet', 'Chosen of Heaven', 'Gods-Touched', 'Flame Bearer', 'Ascendant',
  'Martyr-Unbroken', 'Vessel of Grace', 'Pillar of Faith', 'Anointed Eternal', 'Hierophant',
]

const FANTASY_RANGER_TITLES = [
  'Trailfinder', 'Hunter', 'Tracker', 'Bowman', 'Fletcher\'s Kin',
  'Scout', 'Woodsman', 'Outrider', 'Pathwarden', 'Borderman',
  'Forester', 'Deepwalker', 'Wildkeeper', 'Watcher of the Marches', 'Bowmaster',
  'March-Warden', 'Beastfriend', 'Long-Strider', 'Deep Ranger', 'Silent Bow',
  'Hunter of Oaths', 'Wardenknight', 'Chief of the March', 'Warden Lord',
  'Keeper of the Wild', 'Pathmaster', 'Voice of the Forest', 'Wolf-Sworn', 'Tree-Walker',
  'Green-Warden', 'Shadow of the Woods', 'Wildstar', 'Earth-Singer', 'Undying Bow',
  'Last Ranger', 'Old One of the Greenwood', 'Oak-Father', 'First Arrow', 'Evergreen',
]

const CYBERPUNK_NETRUNNER_TITLES = [
  'Script Kiddie', 'Codemonkey', 'Lurker', 'Board Haunt', 'Dataslinger',
  'Phreaker', 'Greybrow', 'Jackhead', 'Wireworm', 'Deck-Rider',
  'Runner', 'Ice-Breaker', 'Blackbox', 'Ghostwalker', 'Rootkid',
  'Cold Wire', 'Deep Runner', 'Daemon', 'Trace-Slayer', 'Kernel Sovereign',
  'Silent Subnet', 'Mirror-Walker', 'Net-Prophet', 'Architect',
  'Signal Ghost', 'Matrix Lord', 'Zero-Day Prophet', 'System God', 'Mainframe Saint',
  'Phantom Process', 'Root of Roots', 'Machine Whisperer', 'Silent Exploit', 'Daemon Father',
  'Firewall Breaker', 'Cipher Unbroken', 'Unreal Architect', 'First Daemon', 'Singularity Ghost',
]

const CYBERPUNK_SAMURAI_TITLES = [
  'Recruit', 'Thug', 'Ganger', 'Bouncer', 'Enforcer',
  'Bladehand', 'Knuckle', 'Wirehand', 'Streethand', 'Soldier',
  'Chrome Kid', 'Runner', 'Blademan', 'Lieutenant', 'Hitter',
  'Point-Man', 'Cleaner', 'Solo', 'Iceheart', 'Bladework Master',
  'Sinsmith', 'Named Blade', 'Captain of the Cut', 'Street Lord',
  'Razor of the Block', 'Chromewalker', 'Silent Edge', 'Living Katana', 'Saint of the Gutter',
  'Neon Wraith', 'Bulletproof', 'Patron of Knives', 'Blade-Eternal', 'Last Samurai',
  'Myth of the Midnight', 'Street King', 'Oldblood', 'First Cut', 'Shadow Emperor',
]

const CYBERPUNK_TECHIE_TITLES = [
  'Wrencher', 'Solder-Jock', 'Scavenger', 'Tinkerer', 'Fixer',
  'Grease Monkey', 'Part-Swapper', 'Hardware Hand', 'Maker', 'Rig-Wright',
  'Gadgeteer', 'Jury-Rigger', 'Artificer', 'Kit-Builder', 'Street Engineer',
  'Chop-Shop Chief', 'Master Maker', 'Implant-Smith', 'Wirewright', 'Rig-Master',
  'Chrome-Cutter', 'Specialist', 'Foundry Lord', 'Street Architect',
  'Gearsaint', 'Mother of Machines', 'Lord of the Parts Bin', 'Chrome Weaver', 'Flesh-Smith',
  'Oracle of Circuits', 'Machine-Mother', 'Old Rig', 'Maker Eternal', 'Myth of the Workshop',
  'Worldbuilder', 'Grey Architect', 'Scavenger-King', 'Last Engineer', 'Maker of Gods',
]

const CYBERPUNK_FIXER_TITLES = [
  'Runner', 'Courier', 'Gopher', 'Go-Between', 'Dealer',
  'Contact', 'Agent', 'Broker', 'Middleman', 'Handler',
  'Wheeler', 'Connection', 'Player', 'Operator', 'Kingpin-in-Waiting',
  'Information Broker', 'Merchant of Favors', 'Power-Broker', 'Godfather', 'District Boss',
  'Mayor of the Block', 'Shadow Mayor', 'Lord of Deals', 'Kingpin',
  'Grandfather', 'Power Incarnate', 'Voice of the Undercity', 'The Fixer', 'Patron of Patrons',
  'Lord of the Gutter', 'Neon Emperor', 'Hand of the Market', 'Deal-Maker Eternal', 'Saint of Favors',
  'Patron Saint', 'Unkillable', 'Shadow-Throne', 'First Broker', 'Undercity God',
]

const SCIFI_CAPTAIN_TITLES = [
  'Ensign', 'Junior Officer', 'Officer', 'Lieutenant JG', 'Lieutenant',
  'Commander\'s Aide', 'Duty Officer', 'Bridge Officer', 'Watch Commander', 'Chief of the Watch',
  'Executive Officer', 'Commander', 'Shuttle Captain', 'Boat Captain', 'Commanding Officer',
  'Ship Captain', 'Squadron Leader', 'Captain of the Line', 'Fleet Captain', 'Commodore',
  'Rear Admiral', 'Admiral', 'Fleet Admiral', 'Admiral of the Line',
  'Grand Admiral', 'Starbreaker', 'Voice of the Fleet', 'Admiral of Worlds', 'Legend of the Deep Black',
  'Constellation Captain', 'Pilot Eternal', 'Myth of the Flight Deck', 'Lodestar', 'Star-Forger',
  'Fleet Saint', 'Undying Flag', 'Pillar of the Service', 'First Captain', 'Starfather',
]

const SCIFI_ENGINEER_TITLES = [
  'Apprentice', 'Junior Engineer', 'Second-Class Engineer', 'First-Class Engineer', 'Petty Officer',
  'Chief Petty Officer', 'Warrant Officer', 'Technician', 'Propulsion Hand', 'Reactor Watchman',
  'Systems Engineer', 'Flight Engineer', 'Chief Engineer\'s Aide', 'Assistant Chief Engineer', 'Chief Engineer',
  'Senior Chief', 'Fleet Engineer', 'Master Engineer', 'Chief of Systems', 'Propulsion Master',
  'Reactor Master', 'Warp-Keeper', 'Starbreaker Engineer', 'Fleet Chief',
  'Warp-Master', 'Starwright', 'Builder of Ships', 'Engineer of Suns', 'Plasma-Saint',
  'Engine-Whisperer', 'Drive-Master', 'Myth of the Black Deck', 'Warp-Priest', 'Architect of the Fleet',
  'Unseen Hand', 'Reactor Eternal', 'Star-Forge', 'First Engineer', 'Builder of the Black',
]

const SCIFI_SCIENCE_TITLES = [
  'Research Aide', 'Junior Scientist', 'Associate', 'Analyst', 'Researcher',
  'Senior Analyst', 'Staff Scientist', 'Research Lead', 'Senior Scientist', 'Lab Director',
  'Science Officer JG', 'Science Officer', 'Senior Science Officer', 'Branch Chief', 'Mission Specialist',
  'Principal Investigator', 'Chief Science Officer', 'Exo-Theorist', 'Astrographer-in-Chief', 'Director of Research',
  'Director of Exobiology', 'Grand Theorist', 'Pathfinder of the Sciences', 'Head of All Sciences',
  'First Philosopher', 'Gravity-Reader', 'Voice of the Unknown', 'Namer of Stars', 'Quantum-Saint',
  'Mind of the Deep Field', 'Theorist Eternal', 'Reader of the Void', 'Archivist of All', 'Sage of Galaxies',
  'Living Encyclopedia', 'Unspooled Mind', 'Godmind', 'First Scientist', 'Cosmos-Reader',
]

const SCIFI_SECURITY_TITLES = [
  'Crewman Recruit', 'Security Cadet', 'Crewman', 'Petty Officer', 'Security Officer',
  'Senior Crewman', 'Corporal', 'Sergeant', 'Sergeant-at-Arms', 'Chief of Shift',
  'Security Chief Aide', 'Lieutenant', 'Security Lieutenant', 'Watch Commander', 'Chief of Security',
  'Tactical Officer', 'Weapons Officer', 'Master Chief of Security', 'Fleet Marshal', 'Ground Commander',
  'Marine Captain', 'Commander of Arms', 'Marshal of the Fleet', 'Director of Security',
  'Marine Warlord', 'Sidearm Eternal', 'Spacebreaker', 'Captain of the Boarders', 'Silent Wall',
  'Shieldsworn', 'Weapon of the Fleet', 'Last Defender', 'Myth of the Airlock', 'Standard-Bearer',
  'Wraith in Armor', 'Iron Citadel', 'Unbroken Line', 'First Sentinel', 'Bulwark of Stars',
]

const SCIFI_MEDIC_TITLES = [
  'Corpsman', 'Medical Cadet', 'Nurse', 'Senior Nurse', 'Field Medic',
  'Medical Technician', 'Physician\'s Aide', 'Junior Physician', 'Physician', 'Attending Physician',
  'Senior Physician', 'Ship\'s Doctor', 'Chief Medical Officer', 'Surgeon', 'Trauma Specialist',
  'Xeno-Physician', 'Battlefield Surgeon', 'Chief of Medicine', 'Medical Director', 'Surgeon-General',
  'Lifegiver', 'Healer of Worlds', 'Chief Bio-Ethicist', 'Medical Preceptor',
  'Healer\'s Saint', 'Heart of the Ship', 'Hand That Mends', 'Life-Weaver', 'Star-Surgeon',
  'Guardian of Breath', 'Blood-Calmer', 'Myth of the Infirmary', 'Undying Medic', 'Rebuilder',
  'Architect of Flesh', 'Keeper of Life', 'Patron of Mercy', 'First Healer', 'Life Eternal',
]

const FANTASY: WorldManifest = {
  id: 'fantasy',
  version: '3',
  name: 'Fantasy',
  description:
    'Swords, sorcery, and candle-lit taverns. Dragons hoard gold and kings die young.',
  species: [
    {
      id: 'human',
      name: 'Human',
      description: 'Adaptable, ambitious, and everywhere.',
      growth: { hpPerLevel: 1, statBumpInterval: 4, statBumps: { charisma: 1 } },
    },
    {
      id: 'elf',
      name: 'Elf',
      description: 'Long-lived, sharp-eyed, and quietly condescending.',
      growth: { mpPerLevel: 1, statBumpInterval: 4, statBumps: { intelligence: 1 } },
    },
    {
      id: 'dwarf',
      name: 'Dwarf',
      description: 'Stout, stubborn, and born of stone.',
      growth: { hpPerLevel: 2, statBumpInterval: 4, statBumps: { constitution: 1 } },
    },
    {
      id: 'halfling',
      name: 'Halfling',
      description: 'Small, nimble, and hungry.',
      growth: { statBumpInterval: 4, statBumps: { dexterity: 1 } },
    },
    {
      id: 'orc',
      name: 'Orc',
      description: 'Strong, loud, and misunderstood.',
      growth: { hpPerLevel: 2, statBumpInterval: 4, statBumps: { strength: 1 } },
    },
  ],
  classes: [
    {
      id: 'warrior',
      name: 'Warrior',
      description: 'Steel, shields, and scars.',
      startingStats: { strength: 14, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 6,
      startingInventory: [
        { name: 'Worn Sword', description: 'Notched but sharp enough.' },
        { name: 'Leather Cuirass' },
      ],
      growth: {
        hpPerLevel: 6,
        mpPerLevel: 1,
        statBumpInterval: 4,
        statBumps: { strength: 1, constitution: 1 },
      },
      primaryStats: ['STR', 'CON'],
      secondaryStat: 'DEX',
      titles: FANTASY_WARRIOR_TITLES,
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
      growth: {
        hpPerLevel: 4,
        mpPerLevel: 2,
        statBumpInterval: 4,
        statBumps: { dexterity: 1, charisma: 1 },
      },
      primaryStats: ['DEX', 'CHA'],
      secondaryStat: 'INT',
      titles: FANTASY_ROGUE_TITLES,
    },
    {
      id: 'mage',
      name: 'Mage',
      description: 'Old books, older words.',
      startingStats: { strength: 8, dexterity: 10, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 16,
      startingInventory: [
        { name: 'Wooden Staff' },
        { name: 'Candle Stub', description: 'Barely enough for a cantrip.' },
      ],
      startingSpells: ['magic_missile', 'fireball', 'poison_bolt', 'recall'],
      growth: {
        hpPerLevel: 2,
        mpPerLevel: 6,
        statBumpInterval: 4,
        statBumps: { intelligence: 1, wisdom: 1 },
      },
      primaryStats: ['INT', 'WIS'],
      secondaryStat: 'DEX',
      titles: FANTASY_MAGE_TITLES,
    },
    {
      id: 'cleric',
      name: 'Cleric',
      description: 'Faith as both shield and sword.',
      startingStats: { strength: 10, dexterity: 8, constitution: 12, intelligence: 10, wisdom: 14, charisma: 12 },
      startingMaxMagic: 12,
      startingInventory: [
        { name: 'Oak Mace' },
        { name: 'Prayer Beads' },
      ],
      startingSpells: ['lesser_heal', 'shield_of_faith', 'greater_heal'],
      growth: {
        hpPerLevel: 4,
        mpPerLevel: 4,
        statBumpInterval: 4,
        statBumps: { wisdom: 1, constitution: 1 },
      },
      primaryStats: ['WIS', 'CON'],
      secondaryStat: 'CHA',
      titles: FANTASY_CLERIC_TITLES,
    },
    {
      id: 'ranger',
      name: 'Ranger',
      description: 'A bow, a path, a long silence.',
      startingStats: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 12, charisma: 8 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Hunting Bow' },
        { name: 'Trail Rations', quantity: 3 },
      ],
      startingSpells: ['lesser_heal'],
      growth: {
        hpPerLevel: 5,
        mpPerLevel: 2,
        statBumpInterval: 4,
        statBumps: { dexterity: 1, constitution: 1 },
      },
      primaryStats: ['DEX', 'CON'],
      secondaryStat: 'WIS',
      titles: FANTASY_RANGER_TITLES,
    },
  ],
  magicName: 'Mana',
  magicAbbreviation: 'MP',
  currencyName: 'Gold',
  currencyAbbreviation: 'GP',
  allowedConcepts: ['sword', 'bow', 'magic', 'dragon', 'tavern', 'dungeon', 'castle'],
  forbiddenConcepts: ['gun', 'laser', 'spaceship', 'computer', 'robot'],
  creationVerb: 'Born',
  birthTitle: 'Wayfarer',
  birthIntro:
    'The kingdom has been old a long time. Moths in the lanterns, rust on whatever\'s slung at the hip, dust on every threshold worth crossing. One more Wayfarer takes to the road anyway — they call them {name}.',
  sacrificePhrase: 'The gods smile and grant',
}

const CYBERPUNK: WorldManifest = {
  id: 'cyberpunk',
  version: '3',
  name: 'Cyberpunk',
  comingSoon: true,
  description:
    'Neon on wet streets. Corporations own the sky; you rent a coffin for the night.',
  species: [
    {
      id: 'human',
      name: 'Human',
      description: 'Baseline meat, if that still means anything.',
      growth: { hpPerLevel: 1, statBumpInterval: 4, statBumps: { charisma: 1 } },
    },
    {
      id: 'augmented',
      name: 'Augmented',
      description: 'Half you, half warranty.',
      growth: { hpPerLevel: 2, statBumpInterval: 4, statBumps: { strength: 1 } },
    },
    {
      id: 'construct',
      name: 'Construct',
      description: 'Built, not born — and paying off the loan.',
      growth: { hpPerLevel: 1, mpPerLevel: 1, statBumpInterval: 4, statBumps: { constitution: 1 } },
    },
    {
      id: 'ghost',
      name: 'Ghost',
      description: 'A mind that outlived its body.',
      growth: { mpPerLevel: 2, statBumpInterval: 4, statBumps: { intelligence: 1 } },
    },
  ],
  classes: [
    {
      id: 'netrunner',
      name: 'Netrunner',
      description: 'Breaks systems from inside.',
      startingStats: { strength: 8, dexterity: 10, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 16,
      startingInventory: [
        { name: 'Cyberdeck (Old Model)' },
        { name: 'Stim Shot', quantity: 1 },
      ],
      startingSpells: ['icepick', 'overload', 'hack_attack', 'extract'],
      growth: {
        hpPerLevel: 2,
        mpPerLevel: 6,
        statBumpInterval: 4,
        statBumps: { intelligence: 1, wisdom: 1 },
      },
      primaryStats: ['INT', 'WIS'],
      secondaryStat: 'DEX',
      titles: CYBERPUNK_NETRUNNER_TITLES,
    },
    {
      id: 'samurai',
      name: 'Street Samurai',
      description: 'Chrome and a code.',
      startingStats: { strength: 14, dexterity: 12, constitution: 12, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Mono-Katana' },
        { name: 'Ballistic Jacket' },
      ],
      growth: {
        hpPerLevel: 6,
        mpPerLevel: 1,
        statBumpInterval: 4,
        statBumps: { strength: 1, dexterity: 1 },
      },
      primaryStats: ['STR', 'DEX'],
      secondaryStat: 'CON',
      titles: CYBERPUNK_SAMURAI_TITLES,
    },
    {
      id: 'techie',
      name: 'Techie',
      description: 'Solders, scavenges, survives.',
      startingStats: { strength: 10, dexterity: 12, constitution: 8, intelligence: 14, wisdom: 12, charisma: 10 },
      startingMaxMagic: 14,
      startingInventory: [
        { name: 'Multi-Tool' },
        { name: 'Soldering Kit' },
      ],
      startingSpells: ['patch_kit', 'overclock_self', 'autoinjector'],
      growth: {
        hpPerLevel: 3,
        mpPerLevel: 5,
        statBumpInterval: 4,
        statBumps: { intelligence: 1, dexterity: 1 },
      },
      primaryStats: ['INT', 'DEX'],
      secondaryStat: 'WIS',
      titles: CYBERPUNK_TECHIE_TITLES,
    },
    {
      id: 'fixer',
      name: 'Fixer',
      description: 'Knows a guy. Is the guy.',
      startingStats: { strength: 10, dexterity: 12, constitution: 10, intelligence: 12, wisdom: 12, charisma: 14 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Burner Phone' },
        { name: 'Pack of Cigarettes', quantity: 20 },
      ],
      growth: {
        hpPerLevel: 4,
        mpPerLevel: 2,
        statBumpInterval: 4,
        statBumps: { charisma: 1, wisdom: 1 },
      },
      primaryStats: ['CHA', 'WIS'],
      secondaryStat: 'INT',
      titles: CYBERPUNK_FIXER_TITLES,
    },
  ],
  magicName: 'Hack',
  magicAbbreviation: 'HAX',
  currencyName: 'Credits',
  currencyAbbreviation: 'CR',
  allowedConcepts: ['neon', 'chrome', 'hacker', 'megacorp', 'alley', 'implant', 'drone'],
  forbiddenConcepts: ['magic', 'sword', 'dragon', 'wizard'],
  creationVerb: 'Grown',
  birthTitle: 'Nobody',
  birthIntro:
    'The city has been on too long. Rain on the neon, chrome fogged from the inside, rent due on whatever coffin counts as a home. Another Nobody jacks into the grid anyway — handle: {name}.',
  sacrificePhrase: 'The net pings back and credits',
}

const SCIFI: WorldManifest = {
  id: 'scifi',
  version: '3',
  name: 'Sci-Fi',
  comingSoon: true,
  description:
    'Starships, first contacts, and the slow horror of deep space. A frontier with better plumbing.',
  species: [
    {
      id: 'human',
      name: 'Human',
      description: 'The curious apes, now in space.',
      growth: { hpPerLevel: 1, statBumpInterval: 4, statBumps: { charisma: 1 } },
    },
    {
      id: 'xarn',
      name: 'Xarn',
      description: 'Cold logic, warmer than they let on.',
      growth: { mpPerLevel: 1, statBumpInterval: 4, statBumps: { wisdom: 1 } },
    },
    {
      id: 'synthetic',
      name: 'Synthetic',
      description: 'Person-shaped; person, depending on whom you ask.',
      growth: { hpPerLevel: 2, statBumpInterval: 4, statBumps: { intelligence: 1 } },
    },
    {
      id: 'zoll',
      name: 'Zoll',
      description: 'Chitinous, hive-minded, polite.',
      growth: { hpPerLevel: 2, statBumpInterval: 4, statBumps: { constitution: 1 } },
    },
  ],
  classes: [
    {
      id: 'captain',
      name: 'Captain',
      description: 'The one who decides.',
      startingStats: { strength: 10, dexterity: 10, constitution: 12, intelligence: 12, wisdom: 12, charisma: 14 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Comm Badge' },
        { name: 'Service Pistol' },
      ],
      growth: {
        hpPerLevel: 4,
        mpPerLevel: 2,
        statBumpInterval: 4,
        statBumps: { charisma: 1, wisdom: 1 },
      },
      primaryStats: ['CHA', 'WIS'],
      secondaryStat: 'CON',
      titles: SCIFI_CAPTAIN_TITLES,
    },
    {
      id: 'engineer',
      name: 'Engineer',
      description: 'Keeps the ship from coming apart.',
      startingStats: { strength: 10, dexterity: 12, constitution: 10, intelligence: 14, wisdom: 12, charisma: 8 },
      startingMaxMagic: 10,
      startingInventory: [
        { name: 'Plasma Torch' },
        { name: 'Gravity Wrench' },
      ],
      growth: {
        hpPerLevel: 4,
        mpPerLevel: 3,
        statBumpInterval: 4,
        statBumps: { intelligence: 1, dexterity: 1 },
      },
      primaryStats: ['INT', 'DEX'],
      secondaryStat: 'CON',
      titles: SCIFI_ENGINEER_TITLES,
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
      startingSpells: ['psi_bolt', 'mind_storm', 'radiant_burst', 'beam_out'],
      growth: {
        hpPerLevel: 3,
        mpPerLevel: 5,
        statBumpInterval: 4,
        statBumps: { intelligence: 1, wisdom: 1 },
      },
      primaryStats: ['INT', 'WIS'],
      secondaryStat: 'CON',
      titles: SCIFI_SCIENCE_TITLES,
    },
    {
      id: 'security',
      name: 'Security',
      description: 'Stands between the crew and the airlock.',
      startingStats: { strength: 14, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 10 },
      startingMaxMagic: 8,
      startingInventory: [
        { name: 'Phaser (Type-1)' },
        { name: 'Body Armor' },
      ],
      growth: {
        hpPerLevel: 6,
        mpPerLevel: 1,
        statBumpInterval: 4,
        statBumps: { strength: 1, constitution: 1 },
      },
      primaryStats: ['STR', 'CON'],
      secondaryStat: 'DEX',
      titles: SCIFI_SECURITY_TITLES,
    },
    {
      id: 'medic',
      name: 'Medic',
      description: 'Patches bodies and the occasional ego.',
      startingStats: { strength: 8, dexterity: 10, constitution: 12, intelligence: 14, wisdom: 14, charisma: 12 },
      startingMaxMagic: 10,
      startingInventory: [
        { name: 'Medical Kit' },
        { name: 'Hypospray', quantity: 2 },
      ],
      startingSpells: ['bioregen', 'force_field', 'field_mend'],
      growth: {
        hpPerLevel: 3,
        mpPerLevel: 4,
        statBumpInterval: 4,
        statBumps: { wisdom: 1, intelligence: 1 },
      },
      primaryStats: ['WIS', 'INT'],
      secondaryStat: 'CHA',
      titles: SCIFI_MEDIC_TITLES,
    },
  ],
  magicName: 'Psionics',
  magicAbbreviation: 'PSY',
  currencyName: 'Credits',
  currencyAbbreviation: 'CR',
  allowedConcepts: ['starship', 'phaser', 'warp', 'nebula', 'away team', 'bridge', 'sensor'],
  forbiddenConcepts: ['magic', 'sword', 'dragon', 'wizard'],
  creationVerb: 'Commissioned',
  birthTitle: 'Cadet',
  birthIntro:
    'The station has been in slow orbit a long time. Coolant lines ticking, recyclers humming a note flatter than last year, the star outside cooling faster than the surveys promised. One more Cadet reports aboard anyway — designation: {name}.',
  sacrificePhrase: 'The archive registers the offering and issues',
}

export const WORLD_MANIFESTS: readonly WorldManifest[] = [FANTASY, CYBERPUNK, SCIFI] as const

export function getWorldManifest(id: string): WorldManifest | undefined {
  return WORLD_MANIFESTS.find((w) => w.id === id)
}
