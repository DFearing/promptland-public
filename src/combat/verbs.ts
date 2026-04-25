// Descriptive combat verbs keyed by damage severity and world.
//
// Severity is computed as damage / target.maxHp and bucketed into six tiers.
// The top two tiers render in ALL CAPS (stronger attacks feel stronger in the
// log). The final "critical" tier appends an exclamation mark.
//
// Verbs are attack-type neutral within a world (no "stabs" or "shoots") — the
// flavor comes from the world's list, not the weapon.

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
  ],
  light: [
    'nicks', 'jabs', 'clips', 'cuts', 'pricks',
    'slices', 'scores', 'pokes', 'gashes', 'snipes at',
  ],
  solid: [
    'strikes', 'hits', 'lands a blow on', 'wounds', 'cleaves',
    'thumps', 'clobbers', 'smashes', 'cracks', 'slugs', 'batters',
  ],
  heavy: [
    'hammers', 'bashes', 'staggers', 'ravages', 'pummels',
    'mauls', 'lays into', 'brutalizes', 'wrenches', 'splits',
  ],
  severe: [
    'MAULS', 'SAVAGES', 'BATTERS', 'CRUSHES', 'WRECKS',
    'REAVES', 'SUNDERS', 'RUINS', 'SLAUGHTERS', 'DEVOURS',
  ],
  critical: [
    'DEVASTATES', 'ANNIHILATES', 'OBLITERATES', 'UNMAKES', 'SHATTERS',
    'ERADICATES', 'OVERWHELMS', 'OBLIVIATES', 'EVISCERATES',
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

function verbsFor(worldId: string, severity: Severity): string[] {
  const set = WORLD_VERBS[worldId] ?? FANTASY_VERBS
  const list = set[severity]
  if (list.length === 0) return set.solid
  return list
}

/** Public read-only accessor — used by the dev panel's sample-log generator
 *  so each tier can show several real verbs per world rather than a single
 *  hand-picked one. */
export function getVerbs(worldId: string, severity: Severity): readonly string[] {
  return verbsFor(worldId, severity)
}

export function pickVerb(worldId: string, severity: Severity): string {
  const list = verbsFor(worldId, severity)
  const base = list[Math.floor(Math.random() * list.length)]
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
): { severity: Severity; verb: string } {
  const severity = severityOf(damage, targetMaxHp)
  return { severity, verb: pickVerb(worldId, severity) }
}
