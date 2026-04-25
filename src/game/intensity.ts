// Adverb / phrase selection for effect "power" in log entries.
//
// Heal, rest, meditate, and heal-spell lines all want to feel different
// when the effect is a trickle vs. a flood. The magnitude is expressed
// as the restored amount divided by the pool's capacity; we bucket that
// into five tiers and pick a tier-appropriate adverb. Staying as a
// single shared ladder means a massive heal-spell reads at roughly the
// same intensity as a massive potion — consistent tone across sources.

/** Five intensity tiers, ordered by magnitude. */
export type IntensityTier = 'trace' | 'light' | 'moderate' | 'large' | 'huge'

/** Bucket a restored-amount / max-pool ratio into an intensity tier. */
export function intensityTier(amount: number, max: number): IntensityTier {
  if (max <= 0) return 'trace'
  const ratio = Math.max(0, Math.min(1, amount / max))
  if (ratio < 0.1) return 'trace'
  if (ratio < 0.25) return 'light'
  if (ratio < 0.5) return 'moderate'
  if (ratio < 0.75) return 'large'
  return 'huge'
}

/** Phrase that completes "feeling ___ better" for HP restoration. */
export function healAdverb(amount: number, maxHp: number): string {
  switch (intensityTier(amount, maxHp)) {
    case 'trace':
      return 'slightly'
    case 'light':
      return 'somewhat'
    case 'moderate':
      return 'notably'
    case 'large':
      return 'considerably'
    case 'huge':
      return 'immensely'
  }
}

/** Phrase that completes "focusing ___" for MP / magic restoration. */
export function focusAdverb(amount: number, maxMagic: number): string {
  switch (intensityTier(amount, maxMagic)) {
    case 'trace':
      return 'a little more clearly'
    case 'light':
      return 'more keenly'
    case 'moderate':
      return 'sharply'
    case 'large':
      return 'with new clarity'
    case 'huge':
      return 'with preternatural focus'
  }
}

/** Adverb for resting — same intensity ladder, rest-flavored word map.
 *  Used in "catches their breath, feeling ___ restored". */
export function restAdverb(amount: number, maxHp: number): string {
  switch (intensityTier(amount, maxHp)) {
    case 'trace':
      return 'barely'
    case 'light':
      return 'a little'
    case 'moderate':
      return 'measurably'
    case 'large':
      return 'deeply'
    case 'huge':
      return 'profoundly'
  }
}
