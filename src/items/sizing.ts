// Potion sizes and scroll levels — the per-item progression axis that
// replaces rarity for these item kinds.
//
// Rarity made no mechanical sense for consumables (a "rare" healing potion
// looked the same as a common one because consume.ts read a fixed
// `effect.amount` off the archetype) and was inconsistent for scrolls (the
// rarity affected sale price but never the spell power). Sizes / levels
// give these items a proper progression axis that scales with the
// drinker / reader: a Minor heal potion always restores the same fraction
// of max HP regardless of character level, and a Level III scroll
// multiplies the spell's printed amount by a fixed factor that stacks
// with the caster's INT / gear.
//
// Potion amounts are RELATIVE — a percentage of the consumer's max HP /
// MP — so a Minor potion always feels like "a little" whether you have
// 20 HP or 200. This keeps the same potion useful across the whole game
// without needing to retire and re-author tiers as the player levels.

export type PotionSize = 'minor' | 'lesser' | 'standard' | 'greater' | 'major'

export const POTION_SIZES: PotionSize[] = [
  'minor',
  'lesser',
  'standard',
  'greater',
  'major',
]

const POTION_SIZE_LABELS: Record<PotionSize, string> = {
  minor: 'Minor',
  lesser: 'Lesser',
  standard: 'Standard',
  greater: 'Greater',
  major: 'Major',
}

// Fraction of max HP / MP restored per size. Same percentages are used
// for both heal and restore-magic so a Lesser potion of either kind feels
// proportionally identical. Major caps at 1.0 = full restore.
const POTION_FRACTION_BY_SIZE: Record<PotionSize, number> = {
  minor: 0.10,
  lesser: 0.20,
  standard: 0.35,
  greater: 0.60,
  major: 1.00,
}

export function potionSizeLabel(size: PotionSize): string {
  return POTION_SIZE_LABELS[size]
}

export function potionFraction(size: PotionSize): number {
  return POTION_FRACTION_BY_SIZE[size]
}

/** Resolves the effect amount for a sized consumable, given the
 *  consumer's max for the relevant resource (HP for heal, MP for
 *  restore-magic). Always at least 1 — a Minor potion on a 5-HP
 *  character still restores 1, never 0, so the player gets something for
 *  the action. */
export function potionEffectAmount(size: PotionSize, max: number): number {
  if (max <= 0) return 0
  return Math.max(1, Math.round(max * POTION_FRACTION_BY_SIZE[size]))
}

// ── Scrolls ───────────────────────────────────────────────────────────────

export type ScrollLevel = 1 | 2 | 3 | 4 | 5

export const SCROLL_LEVELS: ScrollLevel[] = [1, 2, 3, 4, 5]

const SCROLL_LEVEL_LABELS: Record<ScrollLevel, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
}

// Multiplier applied to the spell's `effect.amount` (damage / heal) when
// cast from a scroll. Level I = 1.0× = the spell's printed baseline so
// existing Level-I archetypes match prior behaviour exactly. Higher levels
// scale roughly geometrically — a Level V scroll hits about 3× as hard as
// the same spell at Level I.
const SCROLL_LEVEL_MULTIPLIERS: Record<ScrollLevel, number> = {
  1: 1.0,
  2: 1.4,
  3: 1.9,
  4: 2.5,
  5: 3.2,
}

export function scrollLevelLabel(level: ScrollLevel): string {
  return SCROLL_LEVEL_LABELS[level]
}

export function scrollAmountMultiplier(level: ScrollLevel): number {
  return SCROLL_LEVEL_MULTIPLIERS[level]
}

/** Narrow a number to the ScrollLevel union, clamping out-of-range values
 *  to 1. Used at the archetype/inventory boundary where a stored level
 *  could be out of range on legacy saves. */
export function clampScrollLevel(n: number | undefined): ScrollLevel {
  const v = Math.max(1, Math.min(5, Math.round(n ?? 1)))
  return v as ScrollLevel
}
