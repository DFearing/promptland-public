import { describe, expect, it } from 'vitest'
import {
  BLESSING_TICKS,
  FAVOR_MAX,
  SHRINE_PULL_BY_TIER,
  blessingFor,
  blessingRestMultiplier,
  blessingSeverityFloor,
  blessingXpMultiplier,
  canDeathSave,
  favorTier,
  favorTierName,
  gainFavor,
  pickTierAcknowledgement,
  shrinePull,
  stampPiety,
  tickBlessing,
} from '../favor'
import { ZERO_DRIVES } from '../drives'
import { Rng } from '../../rng'
import type { Character } from '../../character'

// Minimal character stub — only the favor-related fields are exercised
// here, so we cast to Character to keep the test focused. Other suites
// cover the full character lifecycle.
function stub(overrides: Partial<Character> = {}): Character {
  return {
    favor: 0,
    ...overrides,
  } as Character
}

describe('favorTier — threshold boundaries', () => {
  it('reports 0 for sub-100 favor (Unseen)', () => {
    expect(favorTier(0)).toBe(0)
    expect(favorTier(99)).toBe(0)
    expect(favorTier(undefined)).toBe(0)
  })

  it('crosses into tier 1 at exactly 100', () => {
    expect(favorTier(100)).toBe(1)
  })

  it('matches the documented thresholds 100/300/600/900', () => {
    expect(favorTier(299)).toBe(1)
    expect(favorTier(300)).toBe(2)
    expect(favorTier(599)).toBe(2)
    expect(favorTier(600)).toBe(3)
    expect(favorTier(899)).toBe(3)
    expect(favorTier(900)).toBe(4)
    expect(favorTier(FAVOR_MAX)).toBe(4)
  })
})

describe('favorTierName — manifest override + default fallback', () => {
  it('falls back to fantasy ladder when no manifest', () => {
    expect(favorTierName(0)).toBe('Unseen')
    expect(favorTierName(1)).toBe('Touched')
    expect(favorTierName(2)).toBe('Witnessed')
    expect(favorTierName(3)).toBe('Favored')
    expect(favorTierName(4)).toBe('Anointed')
  })

  it('honors manifest favorTierNames when supplied', () => {
    const manifest = {
      favorTierNames: ['One', 'Two', 'Three', 'Four'] as [string, string, string, string],
    }
    // @ts-expect-error — partial manifest is fine for the helper's lookup.
    expect(favorTierName(2, manifest)).toBe('Two')
    // @ts-expect-error — same partial-manifest reason as the line above.
    expect(favorTierName(0, manifest)).toBe('Unseen')
  })
})

describe('gainFavor — clamping + tier-up detection', () => {
  it('clamps at FAVOR_MAX', () => {
    expect(gainFavor(FAVOR_MAX, 50).next).toBe(FAVOR_MAX)
  })

  it('clamps at zero on negative deltas', () => {
    expect(gainFavor(10, -50).next).toBe(0)
  })

  it('flags tieredUp when crossing into a higher tier', () => {
    const r = gainFavor(95, 10)
    expect(r.next).toBe(105)
    expect(r.tieredUp).toBe(true)
    expect(r.fromTier).toBe(0)
    expect(r.toTier).toBe(1)
  })

  it('does NOT flag tieredUp on intra-tier gains', () => {
    expect(gainFavor(150, 10).tieredUp).toBe(false)
  })
})

describe('shrinePull — favor-driven, blessing-suppressed', () => {
  it('is zero with no favor', () => {
    expect(shrinePull(stub({ favor: 0 }))).toBe(0)
  })

  it('is zero while a blessing is active', () => {
    const c = stub({ favor: 999, blessing: { tier: 4, ticksRemaining: 50 } })
    expect(shrinePull(c)).toBe(0)
  })

  it('grows with tier when no blessing is active', () => {
    expect(shrinePull(stub({ favor: 100 }))).toBe(SHRINE_PULL_BY_TIER[1])
    expect(shrinePull(stub({ favor: 300 }))).toBe(SHRINE_PULL_BY_TIER[2])
    expect(shrinePull(stub({ favor: 600 }))).toBe(SHRINE_PULL_BY_TIER[3])
    expect(shrinePull(stub({ favor: 950 }))).toBe(SHRINE_PULL_BY_TIER[4])
  })
})

describe('canDeathSave — only at Anointed (tier 4)', () => {
  it('false below 900', () => {
    expect(canDeathSave(stub({ favor: 0 }))).toBe(false)
    expect(canDeathSave(stub({ favor: 600 }))).toBe(false)
    expect(canDeathSave(stub({ favor: 899 }))).toBe(false)
  })

  it('true at 900+', () => {
    expect(canDeathSave(stub({ favor: 900 }))).toBe(true)
    expect(canDeathSave(stub({ favor: FAVOR_MAX }))).toBe(true)
  })
})

describe('blessingFor — picks tier matching current favor', () => {
  it('returns null below tier 1', () => {
    expect(blessingFor(stub({ favor: 0 }))).toBeNull()
    expect(blessingFor(stub({ favor: 99 }))).toBeNull()
  })

  it('returns the tier-matched blessing record otherwise', () => {
    expect(blessingFor(stub({ favor: 150 }))).toEqual({
      tier: 1,
      ticksRemaining: BLESSING_TICKS[1],
    })
    expect(blessingFor(stub({ favor: 950 }))).toEqual({
      tier: 4,
      ticksRemaining: BLESSING_TICKS[4],
    })
  })
})

describe('blessing multipliers — gated by tier', () => {
  it('rest multiplier is 1.1× at tier 1+', () => {
    expect(blessingRestMultiplier(stub({}))).toBe(1)
    expect(blessingRestMultiplier(stub({ blessing: { tier: 1, ticksRemaining: 50 } }))).toBe(1.1)
    expect(blessingRestMultiplier(stub({ blessing: { tier: 4, ticksRemaining: 50 } }))).toBe(1.1)
  })

  it('XP multiplier kicks in at tier 2+', () => {
    expect(blessingXpMultiplier(stub({ blessing: { tier: 1, ticksRemaining: 5 } }))).toBe(1)
    expect(blessingXpMultiplier(stub({ blessing: { tier: 2, ticksRemaining: 5 } }))).toBe(1.1)
  })

  it('severity floor only at tier 4', () => {
    expect(blessingSeverityFloor(stub({ blessing: { tier: 3, ticksRemaining: 5 } }))).toBe(0)
    expect(blessingSeverityFloor(stub({ blessing: { tier: 4, ticksRemaining: 5 } }))).toBe(1)
  })
})

describe('stampPiety — derived drive value', () => {
  it('stamps shrinePull onto the drives object as piety', () => {
    const c = stub({ favor: 600 })
    const stamped = stampPiety({ ...ZERO_DRIVES }, c)
    expect(stamped.piety).toBe(SHRINE_PULL_BY_TIER[3])
  })

  it('zeros piety while a blessing is active', () => {
    const c = stub({ favor: 950, blessing: { tier: 4, ticksRemaining: 50 } })
    const stamped = stampPiety({ ...ZERO_DRIVES }, c)
    expect(stamped.piety).toBe(0)
  })

  it('leaves other drive values untouched', () => {
    const c = stub({ favor: 600 })
    const stamped = stampPiety(
      { ...ZERO_DRIVES, hunger: 50, fatigue: 30 },
      c,
    )
    expect(stamped.hunger).toBe(50)
    expect(stamped.fatigue).toBe(30)
  })
})

describe('pickTierAcknowledgement — NPC greeting prefix', () => {
  it('returns null for tier 0 (Unseen) — NPCs do not notice yet', () => {
    const c = stub({ favor: 0, name: 'Hiro' })
    expect(pickTierAcknowledgement(c, undefined, Rng.fromSeed(1))).toBeNull()
  })

  it('substitutes {name} with the character name', () => {
    const c = stub({ favor: 150, name: 'Hiro' })
    const line = pickTierAcknowledgement(c, undefined, Rng.fromSeed(1))
    expect(line).not.toBeNull()
    expect(line!).toContain('Hiro')
    expect(line!).not.toContain('{name}')
  })

  it('uses manifest pools when supplied', () => {
    const manifest = {
      favorTierAcknowledgements: [
        ['CUSTOM TIER ONE: {name}'],
        ['CUSTOM TIER TWO: {name}'],
        ['CUSTOM TIER THREE: {name}'],
        ['CUSTOM TIER FOUR: {name}'],
      ],
    }
    const c = stub({ favor: 350, name: 'Hiro' })
    // @ts-expect-error — partial manifest is fine for the helper's lookup.
    const line = pickTierAcknowledgement(c, manifest, Rng.fromSeed(1))
    expect(line).toBe('CUSTOM TIER TWO: Hiro')
  })

  it('returns null on an empty pool for the active tier', () => {
    const manifest = {
      favorTierAcknowledgements: [[], [], [], []] as [
        readonly string[],
        readonly string[],
        readonly string[],
        readonly string[],
      ],
    }
    const c = stub({ favor: 950, name: 'Hiro' })
    // @ts-expect-error — partial manifest is fine for the helper's lookup.
    expect(pickTierAcknowledgement(c, manifest, Rng.fromSeed(1))).toBeNull()
  })
})

describe('tickBlessing — decay + expiry', () => {
  it('decrements by one per tick', () => {
    const c = stub({ blessing: { tier: 2, ticksRemaining: 3 } })
    expect(tickBlessing(c).blessing).toEqual({ tier: 2, ticksRemaining: 2 })
  })

  it('drops the blessing field on expiry', () => {
    const c = stub({ blessing: { tier: 1, ticksRemaining: 1 } })
    const next = tickBlessing(c)
    expect(next.blessing).toBeUndefined()
  })

  it('is a no-op when no blessing is present', () => {
    const c = stub({})
    expect(tickBlessing(c)).toBe(c)
  })
})
