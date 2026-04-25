import { describe, expect, it } from 'vitest'
import {
  focusAdverb,
  healAdverb,
  intensityTier,
  restAdverb,
  type IntensityTier,
} from '../intensity'

// Five tiers ordered by magnitude:
//   ratio < 0.10  → trace
//   ratio < 0.25  → light
//   ratio < 0.50  → moderate
//   ratio < 0.75  → large
//   ratio ≥ 0.75  → huge
// A change to the ladder ripples through every meditate / rest summary
// and heal-effect log, so pin the tier table here.
describe('intensityTier: bucket boundaries', () => {
  it.each<[number, number, IntensityTier]>([
    [0, 100, 'trace'],
    [9, 100, 'trace'],
    [10, 100, 'light'], // exact 0.10
    [24, 100, 'light'],
    [25, 100, 'moderate'], // exact 0.25
    [49, 100, 'moderate'],
    [50, 100, 'large'], // exact 0.50
    [74, 100, 'large'],
    [75, 100, 'huge'], // exact 0.75
    [100, 100, 'huge'],
    [200, 100, 'huge'], // amount clamped to ratio 1.0
  ])('amount=%i max=%i → %s', (amount, max, expected) => {
    expect(intensityTier(amount, max)).toBe(expected)
  })

  it('zero or negative max returns trace (degenerate pool)', () => {
    expect(intensityTier(50, 0)).toBe('trace')
    expect(intensityTier(50, -1)).toBe('trace')
  })

  it('negative amount clamps to trace', () => {
    expect(intensityTier(-10, 100)).toBe('trace')
  })
})

describe('adverb helpers: distinct word per tier', () => {
  // Each helper must produce six distinct strings across the five
  // intensity tiers (well, five distinct strings — one per tier). This
  // guards against an accidental duplicate or empty string sneaking
  // into the word-map. The boundary anchors (0/10/25/50/75) hit one
  // tier each, so they're a good probe set.
  const probes: Array<[string, number]> = [
    ['trace', 0],
    ['light', 10],
    ['moderate', 25],
    ['large', 50],
    ['huge', 75],
  ]

  it.each([
    ['focusAdverb', focusAdverb],
    ['restAdverb', restAdverb],
    ['healAdverb', healAdverb],
  ] as const)('%s returns five distinct non-empty phrases', (_label, fn) => {
    const seen = new Set<string>()
    for (const [, amt] of probes) {
      const phrase = fn(amt, 100)
      expect(phrase).toBeTruthy()
      seen.add(phrase)
    }
    expect(seen.size).toBe(5)
  })
})

describe('focusAdverb: stable cross-tier ordering', () => {
  // The exact phrasing is part of the player-facing tone — guard it
  // explicitly so a content edit reads as a deliberate change in code
  // review instead of a silent regression in log voice.
  it('matches the published phrasing', () => {
    expect(focusAdverb(0, 100)).toBe('a little more clearly')
    expect(focusAdverb(10, 100)).toBe('more keenly')
    expect(focusAdverb(25, 100)).toBe('sharply')
    expect(focusAdverb(50, 100)).toBe('with new clarity')
    expect(focusAdverb(75, 100)).toBe('with preternatural focus')
  })
})

describe('restAdverb: stable cross-tier ordering', () => {
  it('matches the published phrasing', () => {
    expect(restAdverb(0, 100)).toBe('barely')
    expect(restAdverb(10, 100)).toBe('a little')
    expect(restAdverb(25, 100)).toBe('measurably')
    expect(restAdverb(50, 100)).toBe('deeply')
    expect(restAdverb(75, 100)).toBe('profoundly')
  })
})
