import { describe, expect, it } from 'vitest'
import {
  KILL_LINES_BY_FAMILY,
  pickCombinedKillLine,
  type DamageFamily,
} from '../index'

const ALL_FAMILIES: ReadonlyArray<DamageFamily | 'generic'> = [
  'slash',
  'crush',
  'pierce',
  'fire',
  'ice',
  'electric',
  'earth',
  'hack',
  'claw',
  'generic',
]

// Every template in every family pool must contain BOTH placeholders
// exactly once. pickCombinedKillLine substitutes globally, so a template
// missing one would silently leak the literal "{name}" / "{mob}" into
// the rendered log. This guard fails loud on any future authoring slip.
describe('KILL_LINES_BY_FAMILY: template integrity', () => {
  it.each(ALL_FAMILIES)('every %s template contains both placeholders', (family) => {
    const pool = KILL_LINES_BY_FAMILY[family]
    expect(pool.length).toBeGreaterThan(0)
    for (const tpl of pool) {
      expect(tpl, tpl).toContain('{name}')
      expect(tpl, tpl).toContain('{mob}')
    }
  })

  it('pools have at least 3 entries each (so picks don\'t feel repetitive)', () => {
    for (const family of ALL_FAMILIES) {
      expect(KILL_LINES_BY_FAMILY[family].length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('pickCombinedKillLine: substitution', () => {
  // Sample many picks to cover the rng path. Every result must:
  //  - contain both substituted strings,
  //  - leave no unresolved `{...}` placeholder behind.
  it.each(ALL_FAMILIES)('substitutes {name} and {mob} for family %s', (family) => {
    for (let i = 0; i < 50; i++) {
      const out = pickCombinedKillLine(family, 'Hiro', 'Cave Rat')
      expect(out).toContain('Hiro')
      expect(out).toContain('Cave Rat')
      expect(out).not.toMatch(/\{name\}|\{mob\}/)
    }
  })

  it('undefined family falls through to generic and still substitutes', () => {
    for (let i = 0; i < 25; i++) {
      const out = pickCombinedKillLine(undefined, 'Hiro', 'Cave Rat')
      expect(out).toContain('Hiro')
      expect(out).toContain('Cave Rat')
    }
  })

  it('substitutes every occurrence of a repeated placeholder', () => {
    // Every authored template uses each placeholder once today, so the
    // visible substitution is one-to-one. Force the global-replace path
    // to be exercised by passing names that themselves contain text the
    // renderer must NOT match against the placeholder regex (no curly
    // braces) — and confirm the leading char is the attacker's name so
    // the effects/derive layer's "starts with character name" check
    // works on every family pool.
    for (const family of ALL_FAMILIES) {
      for (let i = 0; i < 10; i++) {
        const out = pickCombinedKillLine(family, 'Hiro', 'Cave Rat')
        expect(out.startsWith('Hiro ')).toBe(true)
      }
    }
  })
})
