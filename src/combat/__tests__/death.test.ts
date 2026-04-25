import { describe, expect, it } from 'vitest'
import { Rng } from '../../rng'
import { deathClause, deathSentence, pickDeathPredicate } from '../death'
import type { DamageFamily } from '../verbs'

const FAMILIES_AND_POISON: ReadonlyArray<DamageFamily | 'poison' | undefined> = [
  'slash',
  'crush',
  'pierce',
  'fire',
  'ice',
  'electric',
  'earth',
  'hack',
  'claw',
  'poison',
  undefined, // generic fallback path
]

describe('deathSentence', () => {
  it.each(FAMILIES_AND_POISON)(
    'always includes both victim and killer (family=%s)',
    (family) => {
      // Use 200 different RNG seeds so both branches (family pool vs.
      // generic fallback) are exercised — FAMILY_BIAS is 0.6 inside the
      // helper, so half-and-half is more than enough.
      for (let seed = 1; seed <= 200; seed++) {
        const out = deathSentence('Hiro', 'Cave Rat', family, Rng.fromSeed(seed))
        expect(out).toContain('Hiro')
        expect(out).toContain('Cave Rat')
        expect(out).not.toMatch(/\{victim\}|\{killer\}/)
      }
    },
  )

  it('victim leads the sentence', () => {
    // Effect derivation never reads death sentences directly, but the
    // log keeps the convention that death lines start with the victim
    // — keep it stable so future surfaces relying on it (history dialog,
    // share-card image generator) don't have to special-case templates.
    for (let seed = 1; seed <= 50; seed++) {
      const out = deathSentence('Hiro', 'Cave Rat', 'fire', Rng.fromSeed(seed))
      expect(out.startsWith('Hiro')).toBe(true)
    }
  })
})

describe('deathClause', () => {
  it.each(FAMILIES_AND_POISON)(
    'includes killer but not victim (family=%s)',
    (family) => {
      for (let seed = 1; seed <= 200; seed++) {
        const out = deathClause('Cave Rat', family, Rng.fromSeed(seed))
        expect(out).toContain('Cave Rat')
        // The clause is meant to slot into prose where the victim's name
        // is already present in the surrounding sentence — the helper
        // strips the "{victim} " prefix so the clause never re-introduces
        // it. Use a name that wouldn't accidentally appear in any frame.
        expect(out).not.toContain('Sentinel-X')
      }
    },
  )
})

describe('pickDeathPredicate', () => {
  it.each(FAMILIES_AND_POISON)(
    'returns a non-empty predicate for family=%s',
    (family) => {
      for (let seed = 1; seed <= 100; seed++) {
        const out = pickDeathPredicate(family, Rng.fromSeed(seed))
        expect(out).toBeTruthy()
        expect(out).not.toMatch(/\{|\}/)
      }
    },
  )

  it('exercises both family and generic pools across seeds', () => {
    // The bias is 60/40, so over 1000 seeds we should see at least one
    // generic predicate even when a family pool exists. This guards the
    // FAMILY_BIAS escape hatch — if bias ever pinned to 1.0, the generic
    // pool would silently die and this assertion would fail.
    let sawFamily = false
    let sawGeneric = false
    const familyPool = new Set([
      'is reduced to ash',
      'burns away',
      'is scorched hollow',
      'is cremated',
    ])
    for (let seed = 1; seed <= 1000; seed++) {
      const p = pickDeathPredicate('fire', Rng.fromSeed(seed))
      if (familyPool.has(p)) sawFamily = true
      else sawGeneric = true
      if (sawFamily && sawGeneric) break
    }
    expect(sawFamily).toBe(true)
    expect(sawGeneric).toBe(true)
  })
})
