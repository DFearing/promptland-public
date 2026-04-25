// Descriptive combat verbs keyed by damage severity and world.
//
// Severity is computed as damage / target.maxHp and bucketed into six tiers.
// The top two tiers render in ALL CAPS (stronger attacks feel stronger in the
// log). The final "critical" tier appends an exclamation mark.
//
// Verbs are attack-type neutral within a world (no "stabs" or "shoots") — the
// flavor comes from the world's list, not the weapon.

import type { Rng } from '../rng'

export type Severity = 'grazing' | 'light' | 'solid' | 'heavy' | 'severe' | 'critical'

export const SEVERITIES: Severity[] = [
  'grazing',
  'light',
  'solid',
  'heavy',
  'severe',
  'critical',
]

export interface VerbSet {
  grazing: string[]
  light: string[]
  solid: string[]
  heavy: string[]
  severe: string[]
  critical: string[]
}

// Each list is intentionally over-stocked (10–12 verbs per tier) so the same
// line doesn't repeat for several rounds running. Verbs are listed in rough
// intensity order within a tier — the picker is uniform-random, but ordering
// makes it easy to see at a glance that the tier holds together tonally.
const FANTASY_VERBS: VerbSet = {
  grazing: [
    'grazes', 'skims', 'glances off', 'brushes', 'scuffs',
    'scratches', 'kisses', 'snags', 'scrapes', 'taps',
    'nicks', 'glances across',
  ],
  light: [
    'nicks', 'jabs', 'clips', 'cuts', 'pricks',
    'slices', 'scores', 'pokes', 'gashes', 'snipes at',
    'tags', 'bloodies',
  ],
  solid: [
    'strikes', 'hits', 'wounds', 'cleaves',
    'thumps', 'clobbers', 'smashes', 'cracks', 'slugs', 'batters',
    'lands on', 'wallops',
  ],
  heavy: [
    'hammers', 'bashes', 'staggers', 'ravages', 'pummels',
    'mauls', 'brutalizes', 'wrenches', 'splits',
    'rocks', 'pounds',
  ],
  severe: [
    'MAULS', 'SAVAGES', 'BATTERS', 'CRUSHES', 'WRECKS',
    'REAVES', 'SUNDERS', 'RUINS', 'SLAUGHTERS', 'DEVOURS',
    'ROUTS', 'BREAKS',
  ],
  critical: [
    'DEVASTATES', 'ANNIHILATES', 'OBLITERATES', 'UNMAKES', 'SHATTERS',
    'ERADICATES', 'OVERWHELMS', 'EVISCERATES',
    'BREAKS UTTERLY', 'UNDOES',
  ],
}

const CYBERPUNK_VERBS: VerbSet = {
  grazing: [
    'glances off', 'scuffs', 'grazes', 'pings off', 'brushes',
    'snags', 'ricochets off', 'skims past', 'glances over',
  ],
  light: [
    'nicks', 'jabs', 'pops', 'tags', 'flicks',
    'snaps at', 'peppers', 'zaps', 'taps', 'pricks',
  ],
  solid: [
    'hits', 'slams', 'cracks', 'drops a blow on', 'thumps',
    'decks', 'knocks', 'walls', 'rocks', 'tags hard', 'cracks open',
  ],
  heavy: [
    'hammers', 'rattles', 'staggers', 'wrecks', 'smashes',
    'levels', 'lays into', 'pulverizes', 'flattens', 'busts',
  ],
  severe: [
    'SHATTERS', 'TOTALS', 'MAULS', 'DROPS', 'TRASHES',
    'BUSTS UP', 'RIPS APART', 'BREAKS DOWN', 'WRECKS HARD', 'STOMPS',
  ],
  critical: [
    'ANNIHILATES', 'DELETES', 'OBLITERATES', 'TERMINATES', 'FRAGS',
    'NUKES', 'WIPES', 'ENDS', 'SCRAGS',
  ],
}

const SCIFI_VERBS: VerbSet = {
  grazing: [
    'grazes', 'skims', 'glances off', 'brushes', 'deflects off',
    'scuffs', 'sparks against', 'scrapes', 'flickers across',
  ],
  light: [
    'jolts', 'stings', 'clips', 'nicks', 'scorches',
    'singes', 'pricks', 'sparks', 'sears', 'lances at',
  ],
  solid: [
    'strikes', 'hits', 'batters', 'staggers', 'sears',
    'bores into', 'fries', 'blasts', 'perforates', 'scorches', 'cracks',
  ],
  heavy: [
    'ravages', 'hammers', 'breaks', 'crushes', 'lances',
    'breaches', 'splits', 'tears apart', 'lacerates', 'chars',
  ],
  severe: [
    'DECIMATES', 'SHATTERS', 'RAVAGES', 'DEMOLISHES', 'CARBONIZES',
    'INCINERATES', 'BREACHES', 'ATOMIZES', 'SCORCHES', 'RUPTURES',
  ],
  critical: [
    'VAPORIZES', 'ANNIHILATES', 'DISINTEGRATES', 'ERASES', 'ANNULS',
    'EVAPORATES', 'COLLAPSES', 'UNWRITES', 'VOIDS',
  ],
}

const WORLD_VERBS: Record<string, VerbSet> = {
  fantasy: FANTASY_VERBS,
  cyberpunk: CYBERPUNK_VERBS,
  scifi: SCIFI_VERBS,
}

// ------------ Damage-family verb sets ---------------------------------------
//
// The world verb set above is the "generic" fallback — used when no family
// is specified (e.g. an unarmed mob punch in a fantasy world). When a
// family IS specified, its verbs REPLACE the world's, so a sword and a
// mace read visibly different even in the same tier. Same severity ladder;
// different word choice.
//
// Families are world-agnostic by design — "crush" in fantasy and
// "crush" in cyberpunk both want the same family of verbs. If a world
// ever needs bespoke flavor it can still read its own world verb set
// via the fallback.

export type DamageFamily =
  | 'slash'      // swords, blades — cutting edge
  | 'crush'      // maces, hammers, clubs — blunt impact
  | 'pierce'     // bows, daggers, spears — point attack
  | 'fire'       // flame spells, burning conditions
  | 'ice'        // frost spells, freezing conditions
  | 'electric'   // lightning spells, shock conditions
  | 'earth'      // rock / acid / physical-elemental
  | 'hack'       // cyberpunk / digital / corruption
  | 'claw'       // natural weapons — beasts, monsters

export const DAMAGE_FAMILIES: readonly DamageFamily[] = [
  'slash',
  'crush',
  'pierce',
  'fire',
  'ice',
  'electric',
  'earth',
  'hack',
  'claw',
]

const SLASH_VERBS: VerbSet = {
  grazing: ['nicks', 'scrapes', 'grazes', 'skims', 'kisses', 'glances off', 'tickles'],
  light: ['slices', 'cuts', 'scores', 'slashes at', 'nicks', 'slits', 'draws blood on'],
  // Replaced "scores deeply" (reads awkwardly — "X scores deeply Y") with
  // clean transitive verbs that slot into "The {mob} VERB {target}."
  solid: ['slashes', 'cuts open', 'opens up', 'gashes', 'scythes', 'slices into', 'rakes across'],
  heavy: ['cleaves', 'rends', 'carves', 'lacerates', 'shreds', 'hacks apart', 'filets'],
  severe: ['CLEAVES', 'BUTCHERS', 'HEWS', 'SAVAGES', 'REAVES', 'CARVES UP', 'RIBBONS'],
  critical: ['BISECTS', 'EVISCERATES', 'UNSEAMS', 'DECAPITATES', 'SUNDERS', 'QUARTERS'],
}

const CRUSH_VERBS: VerbSet = {
  grazing: ['taps', 'thumps', 'raps', 'knocks', 'bumps', 'glances off', 'nudges'],
  light: ['bruises', 'clubs', 'thuds into', 'thumps', 'jars', 'cuffs', 'bonks'],
  solid: ['smashes', 'cracks', 'hammers', 'clobbers', 'decks', 'whacks', 'slugs'],
  heavy: ['pulverizes', 'bashes', 'batters', 'pounds', 'staves in', 'brains', 'wallops'],
  severe: ['SHATTERS', 'PULVERIZES', 'CRUSHES', 'SUNDERS', 'DEMOLISHES', 'POUNDS FLAT'],
  critical: ['OBLITERATES', 'PULPIFIES', 'FLATTENS', 'ATOMIZES', 'ANNIHILATES', 'MASHES'],
}

const PIERCE_VERBS: VerbSet = {
  grazing: ['pricks', 'nicks', 'skims', 'glances off', 'scrapes', 'grazes'],
  light: ['jabs', 'pokes', 'stings', 'pricks', 'lances at', 'needles'],
  solid: ['pierces', 'punctures', 'stabs', 'skewers', 'perforates', 'pokes through'],
  heavy: ['transfixes', 'runs through', 'impales', 'bores into', 'spears', 'harpoons'],
  severe: ['IMPALES', 'TRANSFIXES', 'SKEWERS', 'PERFORATES', 'SPEARS', 'SPITS'],
  critical: ['PINS', 'KEBABS', 'RUNS CLEAN THROUGH', 'ELIMINATES', 'TERMINATES'],
}

const FIRE_VERBS: VerbSet = {
  grazing: ['warms', 'singes', 'licks at', 'crackles against', 'kisses with flame'],
  light: ['scorches', 'sears', 'burns', 'blisters', 'chars', 'smolders against'],
  solid: ['ignites', 'engulfs', 'roasts', 'torches', 'sets alight', 'kindles'],
  heavy: ['conflagrates', 'combusts', 'blazes through', 'melts', 'cooks', 'bakes'],
  severe: ['INCINERATES', 'IMMOLATES', 'CARBONIZES', 'TORCHES', 'CREMATES', 'BROILS'],
  // Old "REDUCES TO ASH" and "OBLATES" read awkwardly in the "X VERB Y."
  // template. Kept the ashing idea as "ASHES", a clean transitive.
  critical: ['ASHES', 'VAPORIZES', 'CONSUMES', 'PYRES', 'KILNS', 'ANNEALS'],
}

const ICE_VERBS: VerbSet = {
  grazing: ['chills', 'cools', 'rimes', 'frosts', 'numbs', 'nips at'],
  light: ['freezes', 'bites', 'nips', 'ices over', 'frostbites'],
  solid: ['freezes', 'frosts over', 'ices', 'glaciates', 'stiffens', 'crystallizes'],
  heavy: ['fractures', 'brittles', 'cracks', 'freezes solid', 'entombs in ice'],
  // Old "PETRIFIES IN ICE" read as an adverb phrase rather than a verb.
  // Cleaner: "GLACIATES", "ENTOMBS" already carry the same meaning.
  severe: ['SHATTERS', 'FRACTURES', 'GLACIATES', 'ENTOMBS', 'FREEZES SOLID'],
  // "OBLITERATES IN ICE" and "SHATTERS UTTERLY" pushed toward the awkward
  // end. Cleaner: pair each with the intended idea in one transitive verb.
  critical: ['SHATTERS', 'CRYSTALLIZES', 'PETRIFIES', 'ICES OVER', 'FREEZES DEAD'],
}

const ELECTRIC_VERBS: VerbSet = {
  grazing: ['tingles', 'sparks at', 'arcs past', 'pricks', 'crackles against', 'static-kisses'],
  light: ['zaps', 'shocks', 'jolts', 'stings', 'buzzes', 'snaps at'],
  solid: ['electrocutes', 'jolts', 'shocks', 'fries', 'arcs into', 'sparks through'],
  heavy: ['electrifies', 'surges through', 'torches', 'lights up', 'overvolts'],
  severe: ['ELECTROCUTES', 'FRIES', 'COOKS', 'ARC-BLASTS', 'OVERLOADS'],
  // "DISINTEGRATES IN LIGHT" read as an adverb phrase. Replaced with
  // cleaner transitives that fit the "X VERB Y." template.
  critical: ['OVERLOADS', 'ANNIHILATES', 'INCINERATES', 'FLASH-FRIES', 'DISINTEGRATES'],
}

const EARTH_VERBS: VerbSet = {
  grazing: ['dusts', 'grits', 'scours', 'rubs', 'chips at', 'pelts'],
  light: ['pelts', 'grinds', 'abrades', 'wears at', 'strikes', 'peppers'],
  solid: ['crushes', 'grinds', 'pulverizes', 'splits', 'jars', 'stones'],
  heavy: ['buries', 'collapses on', 'splits open', 'fractures', 'compacts'],
  // Kept the "ENTOMBS" imagery but cut the awkward "CRUSHES UNDER STONE"
  // and "COLLAPSES ONTO" which need post-verb particles the template
  // doesn't supply.
  severe: ['BURIES', 'ENTOMBS', 'FRACTURES', 'SLABS', 'CRUSHES', 'STONES'],
  // "REDUCES TO RUBBLE", "FOLDS UP", "CONSUMES IN ROCK" all need adverb
  // phrases that don't fit the template. Trimmed to single-word
  // transitives that carry the same idea.
  critical: ['INTERS', 'RUBBLES', 'ENTOMBS', 'SWALLOWS', 'PETRIFIES', 'FOSSILIZES'],
}

const HACK_VERBS: VerbSet = {
  // "dropouts" isn't a verb. Replaced with "flickers across" (already
  // transitive via the preposition) and added more flavor.
  grazing: ['glitches', 'stutters', 'lags', 'flickers across', 'pings', 'dust-bins'],
  light: ['corrupts', 'garbles', 'scrambles', 'patches', 'injects', 'phreaks'],
  solid: ['hijacks', 'overwrites', 'spoofs', 'pwns', 'roots', 'jailbreaks'],
  heavy: ['shreds', 'wipes', 'bricks', 'forks', 'trashes', 'heap-corrupts'],
  severe: ['WIPES', 'BRICKS', 'CORRUPTS', 'DEGAUSSES', 'SHREDS', 'SEGFAULTS'],
  critical: ['FORMATS', 'DELETES', 'TERMINATES', 'NULLROUTES', 'DROPS', 'KERNEL-PANICS'],
}

const CLAW_VERBS: VerbSet = {
  grazing: ['grazes', 'swipes at', 'paws at', 'snaps at', 'brushes past', 'nips'],
  light: ['bites', 'claws', 'nips', 'rakes', 'gnaws', 'worries'],
  solid: ['mauls', 'savages', 'claws', 'bites into', 'rakes across', 'tears at'],
  heavy: ['shreds', 'tears into', 'rends', 'mauls', 'ravages', 'mangles'],
  severe: ['SAVAGES', 'MAULS', 'RENDS', 'SHREDS', 'DISMEMBERS', 'MANGLES'],
  // "SAVAGES UTTERLY" was an adverb-dragging phrase — cut.
  critical: ['DISEMBOWELS', 'EVISCERATES', 'UNMAKES', 'CONSUMES', 'DEVOURS', 'GUTS'],
}

const FAMILY_VERBS: Record<DamageFamily, VerbSet> = {
  slash: SLASH_VERBS,
  crush: CRUSH_VERBS,
  pierce: PIERCE_VERBS,
  fire: FIRE_VERBS,
  ice: ICE_VERBS,
  electric: ELECTRIC_VERBS,
  earth: EARTH_VERBS,
  hack: HACK_VERBS,
  claw: CLAW_VERBS,
}

// Bucket thresholds: fraction-of-max-HP at which each tier kicks in (upper).
// A hit at exactly 1.0 always lands in 'critical' (it's the killing blow or
// damned close to it); a 0% hit never actually happens (game clamps to 1).
const THRESHOLDS: Array<{ max: number; severity: Severity }> = [
  { max: 0.08, severity: 'grazing' },
  { max: 0.18, severity: 'light' },
  { max: 0.35, severity: 'solid' },
  { max: 0.55, severity: 'heavy' },
  { max: 0.8, severity: 'severe' },
  { max: Infinity, severity: 'critical' },
]

export function severityOf(damage: number, targetMaxHp: number): Severity {
  if (targetMaxHp <= 0) return 'solid'
  const ratio = Math.max(0, damage) / targetMaxHp
  for (const t of THRESHOLDS) {
    if (ratio <= t.max) return t.severity
  }
  return 'critical'
}

function verbsFor(worldId: string, severity: Severity, family?: DamageFamily): string[] {
  // Family beats world — if a damage family is specified (sword slash,
  // fire spell, mob claw), its verbs replace the world-generic set.
  // World verbs are the fallback for unfamilied attacks (bare fists in
  // a fantasy world, etc.) and keep the per-world tone for them.
  if (family) {
    const familySet = FAMILY_VERBS[family]
    const familyList = familySet[severity]
    if (familyList.length > 0) return familyList
    if (familySet.solid.length > 0) return familySet.solid
  }
  const set = WORLD_VERBS[worldId] ?? FANTASY_VERBS
  const list = set[severity]
  if (list.length === 0) return set.solid
  return list
}

/** Public read-only accessor — used by the dev panel's sample-log generator
 *  so each tier can show several real verbs per world rather than a single
 *  hand-picked one. */
export function getVerbs(worldId: string, severity: Severity, family?: DamageFamily): readonly string[] {
  return verbsFor(worldId, severity, family)
}

export function pickVerb(worldId: string, severity: Severity, family: DamageFamily | undefined, rng: Rng): string {
  const list = verbsFor(worldId, severity, family)
  const base = rng.pick(list)
  return severity === 'critical' ? `${base}!` : base
}

export function isEmphatic(severity: Severity): boolean {
  return severity === 'severe' || severity === 'critical'
}

// Convenience: compute severity + verb in one call.
export function damageVerb(
  damage: number,
  targetMaxHp: number,
  worldId: string,
  family: DamageFamily | undefined,
  rng: Rng,
): { severity: Severity; verb: string } {
  const severity = severityOf(damage, targetMaxHp)
  return { severity, verb: pickVerb(worldId, severity, family, rng) }
}
