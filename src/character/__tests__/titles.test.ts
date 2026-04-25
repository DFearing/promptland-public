import { describe, expect, it } from 'vitest'
import {
  currentTitleIndex,
  levelForTitleIndex,
  titleIndexForLevel,
  LAST_AUTHORED_TITLE_INDEX,
} from '../titles'

// titleIndexForLevel returns the index granted *only* on threshold-crossing
// levels — null on levels that don't unlock a new title. currentTitleIndex
// is the "what title are you wearing right now" view: defined on every
// level ≥ 1, floored to the most recent threshold.

describe('titleIndexForLevel: per-threshold mapping', () => {
  it('level 1 → index 0 (birth title)', () => {
    expect(titleIndexForLevel(1)).toBe(0)
  })

  it('levels 2..25 each unlock the next index', () => {
    for (let lvl = 2; lvl <= 25; lvl++) {
      expect(titleIndexForLevel(lvl)).toBe(lvl - 1)
    }
  })

  it('levels 26..29 do not unlock a new title (next is at 30)', () => {
    for (let lvl = 26; lvl <= 29; lvl++) {
      expect(titleIndexForLevel(lvl)).toBeNull()
    }
  })

  it('levels 30..100 unlock at multiples of 5 only', () => {
    for (let lvl = 30; lvl <= 100; lvl++) {
      const idx = titleIndexForLevel(lvl)
      if (lvl % 5 === 0) {
        expect(idx).toBe(24 + (lvl - 25) / 5)
      } else {
        expect(idx).toBeNull()
      }
    }
    expect(titleIndexForLevel(100)).toBe(LAST_AUTHORED_TITLE_INDEX)
  })

  it('levels > 100 unlock at multiples of 10 only', () => {
    expect(titleIndexForLevel(101)).toBeNull()
    expect(titleIndexForLevel(110)).toBe(40)
    expect(titleIndexForLevel(115)).toBeNull()
    expect(titleIndexForLevel(120)).toBe(41)
    expect(titleIndexForLevel(200)).toBe(49)
  })

  it('non-positive levels return null', () => {
    expect(titleIndexForLevel(0)).toBeNull()
    expect(titleIndexForLevel(-1)).toBeNull()
  })
})

describe('currentTitleIndex: floored "what are you wearing"', () => {
  it('is monotonic non-decreasing across levels', () => {
    let prev = currentTitleIndex(1)
    for (let lvl = 2; lvl <= 200; lvl++) {
      const idx = currentTitleIndex(lvl)
      expect(idx).toBeGreaterThanOrEqual(prev)
      prev = idx
    }
  })

  it('floors levels 26..29 to index 24 (level-25 title)', () => {
    for (let lvl = 26; lvl <= 29; lvl++) {
      expect(currentTitleIndex(lvl)).toBe(24)
    }
  })

  it('matches titleIndexForLevel exactly on threshold-crossing levels', () => {
    for (let lvl = 1; lvl <= 200; lvl++) {
      const granted = titleIndexForLevel(lvl)
      if (granted !== null) {
        expect(currentTitleIndex(lvl)).toBe(granted)
      }
    }
  })

  it('never decreases when level increases', () => {
    expect(currentTitleIndex(1)).toBe(0)
    expect(currentTitleIndex(99)).toBe(38) // last title before 100
    expect(currentTitleIndex(100)).toBe(39)
    expect(currentTitleIndex(109)).toBe(39) // still wearing the level-100 title
    expect(currentTitleIndex(110)).toBe(40)
  })
})

describe('levelForTitleIndex / titleIndexForLevel: inverses on threshold levels', () => {
  // levelForTitleIndex(idx) → the level at which `idx` becomes wearable.
  // Composing it with titleIndexForLevel must round-trip on every index
  // — that level always crosses the threshold by definition.
  it.each([0, 1, 5, 24, 25, 39, 40, 49] as const)(
    'index %i round-trips through levelForTitleIndex',
    (idx) => {
      const lvl = levelForTitleIndex(idx)
      expect(titleIndexForLevel(lvl)).toBe(idx)
    },
  )

  it('index 0 lives at level 1', () => {
    expect(levelForTitleIndex(0)).toBe(1)
  })

  it('the LAST_AUTHORED_TITLE_INDEX lives at level 100', () => {
    expect(levelForTitleIndex(LAST_AUTHORED_TITLE_INDEX)).toBe(100)
  })
})
