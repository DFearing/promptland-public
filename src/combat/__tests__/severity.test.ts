import { describe, expect, it } from 'vitest'
import { Rng } from '../../rng'
import { isEmphatic, pickVerb, severityOf, type Severity } from '../verbs'

// Boundary table from src/combat/verbs.ts:
//   ratio ≤ 0.08  → grazing
//   ratio ≤ 0.18  → light
//   ratio ≤ 0.35  → solid
//   ratio ≤ 0.55  → heavy
//   ratio ≤ 0.80  → severe
//   ratio >  0.80 → critical
// Each test below sits squarely inside a tier and on each boundary so a
// future tweak to the ladder shows up clearly.
describe('severityOf: tier boundaries', () => {
  const max = 100
  it.each<[number, Severity]>([
    [1, 'grazing'], //  1% — well inside grazing
    [8, 'grazing'], //  exact boundary, ratio=0.08 ≤ 0.08
    [9, 'light'], //  just past grazing
    [18, 'light'], //  exact boundary
    [19, 'solid'],
    [35, 'solid'], //  exact boundary
    [36, 'heavy'],
    [55, 'heavy'], //  exact boundary
    [56, 'severe'],
    [80, 'severe'], //  exact boundary
    [81, 'critical'],
    [100, 'critical'],
    [200, 'critical'], //  beyond max — still critical
  ])('damage %i / max 100 → %s', (dmg, expected) => {
    expect(severityOf(dmg, max)).toBe(expected)
  })

  it('zero damage clamps to grazing', () => {
    expect(severityOf(0, 100)).toBe('grazing')
  })

  it('negative damage clamps to grazing (defensive)', () => {
    expect(severityOf(-50, 100)).toBe('grazing')
  })

  it('zero or negative max returns solid (degenerate target)', () => {
    expect(severityOf(10, 0)).toBe('solid')
    expect(severityOf(10, -1)).toBe('solid')
  })
})

describe('isEmphatic', () => {
  it.each<[Severity, boolean]>([
    ['grazing', false],
    ['light', false],
    ['solid', false],
    ['heavy', false],
    ['severe', true],
    ['critical', true],
  ])('%s → %s', (s, expected) => {
    expect(isEmphatic(s)).toBe(expected)
  })
})

describe('pickVerb: critical always ends with !', () => {
  // The bang is the visual cue that the line is a critical hit. It is
  // pinned in pickVerb (not in the verb lists) so authors can never
  // accidentally drop it when adding new verbs to the critical pool.
  it.each(['fantasy', 'cyberpunk', 'scifi'] as const)(
    'world=%s critical verbs end with "!"',
    (worldId) => {
      for (let seed = 1; seed <= 50; seed++) {
        const verb = pickVerb(worldId, 'critical', undefined, Rng.fromSeed(seed))
        expect(verb).toMatch(/!$/)
      }
    },
  )

  it('non-critical severities never end with "!"', () => {
    const nonCrit: Severity[] = ['grazing', 'light', 'solid', 'heavy', 'severe']
    for (const sev of nonCrit) {
      for (let seed = 1; seed <= 50; seed++) {
        const verb = pickVerb('fantasy', sev, undefined, Rng.fromSeed(seed))
        expect(verb).not.toMatch(/!$/)
      }
    }
  })

  it('family-keyed verbs add the bang too (family wins over world)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const verb = pickVerb('fantasy', 'critical', 'fire', Rng.fromSeed(seed))
      expect(verb).toMatch(/!$/)
    }
  })
})
