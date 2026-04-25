import { describe, expect, it } from 'vitest'
import {
  RARITIES,
  RARITY_DEFS,
  mobDisplayName,
  parseMobDisplayName,
  skullsFor,
  type Rarity,
} from '../rarity'

describe('mobDisplayName ↔ parseMobDisplayName: round-trip', () => {
  // Every rarity tier must round-trip through the renderer + parser for
  // a variety of base names. The longer the prefix, the more chances
  // there are for the parser to mis-attribute it (e.g. "Strong King "
  // vs "Strong "), so cover all five tiers explicitly.
  const baseNames = [
    'Cave Rat', // two words
    'Bandit', // one word
    'Ironclad Sentinel', // multi-word with caps
    'Slime', // short
  ]

  it.each(RARITIES)('rarity=%s round-trips for every base name', (rarity) => {
    for (const base of baseNames) {
      const display = mobDisplayName(base, rarity)
      const parsed = parseMobDisplayName(display)
      expect(parsed.rarity, display).toBe(rarity)
      expect(parsed.baseName, display).toBe(base)
    }
  })

  it('renders the prefix and skull pips per rarity table', () => {
    expect(mobDisplayName('Cave Rat', 'common')).toBe('Cave Rat')
    expect(mobDisplayName('Cave Rat', 'uncommon')).toBe('Strong Cave Rat')
    expect(mobDisplayName('Cave Rat', 'rare')).toBe('King Cave Rat ★')
    expect(mobDisplayName('Cave Rat', 'epic')).toBe('Strong King Cave Rat ★★')
    expect(mobDisplayName('Cave Rat', 'legendary')).toBe('Dread King Cave Rat ★★★')
  })
})

describe('parseMobDisplayName: prefix disambiguation', () => {
  it('"Strong King X ★★" parses to epic (not uncommon "Strong X" + leftover King)', () => {
    // Critical case: the parser checks longer prefixes first so the
    // epic prefix "Strong King " wins over the uncommon prefix "Strong ".
    // A naive implementation would chop "Strong " and leave "King " glued
    // onto the base name, which would break first-mob-discovery dedup
    // since the same archetype would parse to two different baseNames.
    const parsed = parseMobDisplayName('Strong King Cave Rat ★★')
    expect(parsed.rarity).toBe('epic')
    expect(parsed.baseName).toBe('Cave Rat')
  })

  it('plain name with no prefix parses to common', () => {
    const parsed = parseMobDisplayName('Cave Rat')
    expect(parsed.rarity).toBe('common')
    expect(parsed.baseName).toBe('Cave Rat')
  })

  it('preserves base names that legitimately start with prefix words', () => {
    // "Strongarm" is a base name whose first letters happen to spell
    // the uncommon prefix. The prefix table requires a trailing space,
    // so this should NOT be misread as uncommon "arm".
    const parsed = parseMobDisplayName('Strongarm')
    expect(parsed.rarity).toBe('common')
    expect(parsed.baseName).toBe('Strongarm')
  })
})

describe('skullsFor', () => {
  it.each<[Rarity, string]>([
    ['common', ''],
    ['uncommon', ''],
    ['rare', ' ★'],
    ['epic', ' ★★'],
    ['legendary', ' ★★★'],
  ])('rarity=%s → %j', (rarity, expected) => {
    expect(skullsFor(rarity)).toBe(expected)
  })

  it('count matches RARITY_DEFS.mobSkulls', () => {
    for (const r of RARITIES) {
      const stars = skullsFor(r)
      const count = (stars.match(/★/g) ?? []).length
      expect(count).toBe(RARITY_DEFS[r].mobSkulls)
    }
  })
})
