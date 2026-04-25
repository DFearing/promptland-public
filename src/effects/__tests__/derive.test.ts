import { beforeEach, describe, expect, it } from 'vitest'
import type { Character, DeathRecord, LevelUpRecord } from '../../character'
import type { LogEntry } from '../../log'
import { deriveElementEvents, deriveEvents, deriveFieldEvents } from '../derive'
import type { EffectContext, EffectEvent } from '../types'

// Each test starts with a fresh character id so the module-level
// `seenMobs` / `seenItems` Sets in derive.ts don't leak between tests
// — first-discovery firing is per-character, and a stale Set would
// mask regressions in the discovery gate.
let charIdCounter = 0
function freshCharId(): string {
  charIdCounter += 1
  return `c-${charIdCounter}`
}

beforeEach(() => {
  charIdCounter += 100
})

function chr(overrides: Partial<Character> = {}): Character {
  return {
    id: freshCharId(),
    name: 'Hiro',
    worldId: 'fantasy',
    worldVersion: '3',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: 0,
    level: 1,
    xp: 0,
    hp: 10,
    maxHp: 10,
    magic: 0,
    maxMagic: 0,
    gold: 0,
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    inventory: [],
    equipped: {},
    position: { areaId: 'a', x: 0, y: 0, z: 0 },
    visitedRooms: [],
    deaths: [],
    levelUps: [],
    drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: 0 },
    conditions: [],
    spells: [],
    rngState: 1,
    ...overrides,
  }
}

function ctx(
  newLogEntries: readonly LogEntry[],
  options: {
    character?: Character
    characterName?: string
    prevStateKind?: EffectContext['prevStateKind']
    nextStateKind?: EffectContext['nextStateKind']
  } = {},
): EffectContext {
  const character = options.character ?? chr()
  return {
    prevStateKind: options.prevStateKind ?? 'exploring',
    nextStateKind: options.nextStateKind ?? 'exploring',
    characterName: options.characterName ?? character.name,
    character,
    newLogEntries,
  }
}

function kindsOf(events: readonly EffectEvent[]): EffectEvent['kind'][] {
  return events.map((e) => e.kind)
}

describe('deriveEvents: state-edge events', () => {
  it('emits enter-fight on the explore→fighting edge', () => {
    const out = deriveEvents(
      ctx([], { prevStateKind: 'exploring', nextStateKind: 'fighting' }),
    )
    expect(kindsOf(out)).toContain('enter-fight')
  })

  it('does NOT emit enter-fight when already fighting', () => {
    const out = deriveEvents(
      ctx([], { prevStateKind: 'fighting', nextStateKind: 'fighting' }),
    )
    expect(kindsOf(out)).not.toContain('enter-fight')
  })

  it('emits generating-area only on the entry edge', () => {
    const enter = deriveEvents(
      ctx([], { prevStateKind: 'exploring', nextStateKind: 'generating-area' }),
    )
    expect(kindsOf(enter)).toContain('generating-area')

    const stay = deriveEvents(
      ctx([], {
        prevStateKind: 'generating-area',
        nextStateKind: 'generating-area',
      }),
    )
    expect(kindsOf(stay)).not.toContain('generating-area')
  })
})

describe('deriveEvents: damage routing depends on meta.name in text', () => {
  // The damage event splits attacker-vs-defender by string-matching the
  // character name at the start of the entry text. This is THE consumer
  // of the meta.name invariant the logMeta suite locked down — a
  // regression in the emitter (text drifting from meta.name) routes
  // damage events the wrong direction here.
  it('routes character attacks → damage-dealt', () => {
    const entry: LogEntry = {
      kind: 'damage',
      text: 'Hiro strikes the Cave Rat.',
      amount: 4,
      meta: { name: 'Hiro' },
    }
    const out = deriveEvents(ctx([entry]))
    const dmg = out.find((e) => e.kind === 'damage-dealt')
    expect(dmg).toBeDefined()
    expect(dmg && 'amount' in dmg ? dmg.amount : null).toBe(4)
  })

  it('routes mob attacks → damage-taken with maxHp included', () => {
    const character = chr({ maxHp: 24 })
    const entry: LogEntry = {
      kind: 'damage',
      text: 'The Cave Rat bites Hiro.',
      amount: 3,
      meta: { mobName: 'Cave Rat' },
    }
    const out = deriveEvents(ctx([entry], { character }))
    const dmg = out.find((e) => e.kind === 'damage-taken')
    expect(dmg).toBeDefined()
    if (dmg && dmg.kind === 'damage-taken') {
      expect(dmg.amount).toBe(3)
      expect(dmg.maxHp).toBe(24)
    }
  })

  it('treats text-starts-with-character-name as the routing signal', () => {
    // Even with the same numeric amount, swapping who leads the text
    // changes which event fires. This confirms the routing is text-
    // driven, not meta-driven — the buildParts contract again.
    const e1: LogEntry = {
      kind: 'damage',
      text: 'Hiro hits the Cave Rat.',
      amount: 5,
    }
    const e2: LogEntry = {
      kind: 'damage',
      text: 'The Cave Rat hits Hiro.',
      amount: 5,
    }
    expect(kindsOf(deriveEvents(ctx([e1])))).toContain('damage-dealt')
    expect(kindsOf(deriveEvents(ctx([e2])))).toContain('damage-taken')
  })
})

describe('deriveEvents: first-mob discovery gate', () => {
  // First sighting fires `new-mob`; subsequent sightings of the SAME
  // display name don't. Common/uncommon stay quiet at all times.
  it('fires new-mob the first time a rare+ mob is seen, then never again', () => {
    const character = chr()
    const e: LogEntry = {
      kind: 'damage',
      text: 'Hiro strikes the King Cave Rat ★.',
      amount: 1,
      meta: { mobName: 'King Cave Rat ★' },
    }
    const first = deriveEvents(ctx([e], { character }))
    expect(kindsOf(first)).toContain('new-mob')

    const second = deriveEvents(ctx([e], { character }))
    expect(kindsOf(second)).not.toContain('new-mob')
  })

  it('does NOT fire new-mob for common/uncommon rarities', () => {
    const character = chr()
    const common: LogEntry = {
      kind: 'damage',
      text: 'Hiro strikes the Cave Rat.',
      amount: 1,
      meta: { mobName: 'Cave Rat' },
    }
    expect(kindsOf(deriveEvents(ctx([common], { character })))).not.toContain('new-mob')

    const uncommon: LogEntry = {
      kind: 'damage',
      text: 'Hiro strikes the Strong Cave Rat.',
      amount: 1,
      meta: { mobName: 'Strong Cave Rat' },
    }
    expect(kindsOf(deriveEvents(ctx([uncommon], { character })))).not.toContain('new-mob')
  })

  it('first-sighting set is keyed per character', () => {
    // Two independent characters each fire their own first-find banner
    // for the same mob — discovery is a per-character session beat,
    // not a global one.
    const a = chr()
    const b = chr()
    const e: LogEntry = {
      kind: 'damage',
      text: 'Hiro strikes the King Cave Rat ★.',
      amount: 1,
      meta: { mobName: 'King Cave Rat ★' },
    }
    expect(kindsOf(deriveEvents(ctx([e], { character: a })))).toContain('new-mob')
    expect(kindsOf(deriveEvents(ctx([e], { character: b })))).toContain('new-mob')
  })
})

describe('deriveEvents: gold thresholds', () => {
  it('emits gold-windfall at >= 30 and gold-jackpot at >= 150 (exclusive)', () => {
    const small: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 10 gold.',
      meta: { name: 'Hiro', goldAmount: 10 },
    }
    const windfall: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 50 gold.',
      meta: { name: 'Hiro', goldAmount: 50 },
    }
    const jackpot: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 200 gold.',
      meta: { name: 'Hiro', goldAmount: 200 },
    }

    const smallKinds = kindsOf(deriveEvents(ctx([small])))
    expect(smallKinds).toContain('loot')
    expect(smallKinds).not.toContain('gold-windfall')
    expect(smallKinds).not.toContain('gold-jackpot')

    const windfallKinds = kindsOf(deriveEvents(ctx([windfall])))
    expect(windfallKinds).toContain('gold-windfall')
    expect(windfallKinds).not.toContain('gold-jackpot')

    const jackpotKinds = kindsOf(deriveEvents(ctx([jackpot])))
    expect(jackpotKinds).toContain('gold-jackpot')
    // Jackpot suppresses windfall — only one fires for the same loot.
    expect(jackpotKinds).not.toContain('gold-windfall')
  })

  it('respects exact threshold boundaries', () => {
    const at30: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 30 gold.',
      meta: { name: 'Hiro', goldAmount: 30 },
    }
    const at29: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 29 gold.',
      meta: { name: 'Hiro', goldAmount: 29 },
    }
    const at150: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 150 gold.',
      meta: { name: 'Hiro', goldAmount: 150 },
    }
    const at149: LogEntry = {
      kind: 'loot',
      text: 'Hiro pockets 149 gold.',
      meta: { name: 'Hiro', goldAmount: 149 },
    }
    expect(kindsOf(deriveEvents(ctx([at30])))).toContain('gold-windfall')
    expect(kindsOf(deriveEvents(ctx([at29])))).not.toContain('gold-windfall')
    expect(kindsOf(deriveEvents(ctx([at150])))).toContain('gold-jackpot')
    const at149Kinds = kindsOf(deriveEvents(ctx([at149])))
    expect(at149Kinds).not.toContain('gold-jackpot')
    expect(at149Kinds).toContain('gold-windfall')
  })
})

describe('deriveEvents: first-item discovery', () => {
  it('fires new-item once for rare+ items, never for common/uncommon', () => {
    const character = chr()
    const rare: LogEntry = {
      kind: 'loot',
      text: 'Hiro gathers Sunblade.',
      meta: { name: 'Hiro', itemName: 'Sunblade', itemRarity: 'rare' },
    }
    const common: LogEntry = {
      kind: 'loot',
      text: 'Hiro gathers Worn Sword.',
      meta: { name: 'Hiro', itemName: 'Worn Sword', itemRarity: 'common' },
    }
    expect(kindsOf(deriveEvents(ctx([rare], { character })))).toContain('new-item')
    expect(kindsOf(deriveEvents(ctx([rare], { character })))).not.toContain('new-item')
    expect(kindsOf(deriveEvents(ctx([common], { character })))).not.toContain('new-item')
  })

  it('iterates the meta.items array for batched pickups', () => {
    const character = chr()
    const batched: LogEntry = {
      kind: 'loot',
      text: 'Hiro gathers Sunblade and Moonshield.',
      meta: {
        name: 'Hiro',
        items: [
          { id: 'sb', name: 'Sunblade', rarity: 'rare' },
          { id: 'ms', name: 'Moonshield', rarity: 'epic' },
          { id: 'wb', name: 'Wooden Buckler', rarity: 'common' },
        ],
      },
    }
    const events = deriveEvents(ctx([batched], { character }))
    const newItems = events.filter((e) => e.kind === 'new-item')
    expect(newItems).toHaveLength(2)
    const names = newItems.map((e) => (e.kind === 'new-item' ? e.name : ''))
    expect(names).toContain('Sunblade')
    expect(names).toContain('Moonshield')
  })
})

describe('deriveEvents: death and level-up paths', () => {
  it('fires death from any kind when meta.isDeath is set', () => {
    const record: DeathRecord = {
      at: 0,
      cause: 'Cave Rat',
      areaId: 'a',
    }
    const character = chr({ deaths: [record] })
    const entry: LogEntry = {
      kind: 'narrative',
      text: 'Hiro falls to the Cave Rat.',
      meta: { isDeath: true },
    }
    const events = deriveEvents(ctx([entry], { character }))
    const death = events.find((e) => e.kind === 'death')
    expect(death).toBeDefined()
    if (death && death.kind === 'death') {
      expect(death.deathCount).toBe(1)
      expect(death.record).toEqual(record)
    }
  })

  it('death is short-circuited above damage routing', () => {
    // Even though this entry is `kind: damage` and starts with the
    // character name (would normally fire damage-dealt), the isDeath
    // meta flag wins and the only event fired is `death`.
    const record: DeathRecord = { at: 0, cause: 'Rat', areaId: 'a' }
    const character = chr({ deaths: [record] })
    const entry: LogEntry = {
      kind: 'damage',
      text: 'Hiro is slain by the Cave Rat.',
      amount: 0,
      meta: { isDeath: true },
    }
    const events = deriveEvents(ctx([entry], { character }))
    const kinds = kindsOf(events)
    expect(kinds).toContain('death')
    expect(kinds).not.toContain('damage-dealt')
    expect(kinds).not.toContain('damage-taken')
  })

  it('chapter entries with meta.levelTo emit level-up events', () => {
    const record: LevelUpRecord = { at: 100, from: 1, to: 2 }
    const character = chr({ level: 2, levelUps: [record] })
    const entry: LogEntry = {
      kind: 'chapter',
      text: 'Hiro rises to level 2!',
      meta: { levelTo: 2 },
    }
    const events = deriveEvents(ctx([entry], { character }))
    const lvl = events.find((e) => e.kind === 'level-up')
    expect(lvl).toBeDefined()
    if (lvl && lvl.kind === 'level-up') {
      expect(lvl.record.to).toBe(2)
    }
  })
})

describe('deriveEvents: heal and consume', () => {
  it('heal entries fire heal-self with the character maxHp', () => {
    const character = chr({ maxHp: 24 })
    const entry: LogEntry = {
      kind: 'heal',
      text: 'Hiro patches up.',
      amount: 5,
      meta: { name: 'Hiro' },
    }
    const events = deriveEvents(ctx([entry], { character }))
    const heal = events.find((e) => e.kind === 'heal-self')
    expect(heal).toBeDefined()
    if (heal && heal.kind === 'heal-self') {
      expect(heal.amount).toBe(5)
      expect(heal.maxHp).toBe(24)
    }
  })

  it('healing potions (consume kind=heal) also fire heal-self', () => {
    const entry: LogEntry = {
      kind: 'consume',
      text: 'Hiro drinks a Healing Draught.',
      effect: 'heal',
      amount: 8,
    }
    const out = deriveEvents(ctx([entry]))
    const heal = out.find((e) => e.kind === 'heal-self')
    expect(heal).toBeDefined()
    if (heal && heal.kind === 'heal-self') expect(heal.amount).toBe(8)
  })

  it('mana potions do NOT fire heal-self', () => {
    const entry: LogEntry = {
      kind: 'consume',
      text: 'Hiro drinks a Mana Draught.',
      effect: 'restore-magic',
      amount: 8,
    }
    expect(kindsOf(deriveEvents(ctx([entry])))).not.toContain('heal-self')
  })
})

describe('deriveFieldEvents: pool deltas', () => {
  it('emits one event per non-zero delta', () => {
    const a = chr({ hp: 10, magic: 4, gold: 0, xp: 5, level: 1, maxHp: 10 })
    const b = chr({
      id: a.id,
      hp: 6,
      magic: 4,
      gold: 12,
      xp: 8,
      level: 1,
      maxHp: 10,
    })
    const out = deriveFieldEvents(a, b)
    const map = Object.fromEntries(out.map((e) => [e.field, e.delta]))
    expect(map.hp).toBe(-4)
    expect(map.gold).toBe(12)
    expect(map.xp).toBe(3)
    expect(map.magic).toBeUndefined() // unchanged
  })

  it('suppresses XP delta on the tick the level-up happens', () => {
    // After a level-up the XP counter resets, so a raw next.xp - prev.xp
    // is misleadingly negative. The level-up banner already carries the
    // celebration; suppressing the field indicator avoids the awkward
    // "-50 XP" jolt.
    const a = chr({ level: 1, xp: 95 })
    const b = chr({ id: a.id, level: 2, xp: 5 })
    const out = deriveFieldEvents(a, b)
    expect(out.find((e) => e.field === 'xp')).toBeUndefined()
  })
})

describe('deriveElementEvents', () => {
  it('routes character attacks to the mob target', () => {
    const entry: LogEntry = {
      kind: 'damage',
      text: 'Hiro burns the Cave Rat.',
      amount: 3,
      meta: { name: 'Hiro', element: 'fire' },
    }
    const out = deriveElementEvents([entry])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ target: 'mob', element: 'fire' })
  })

  it('routes mob attacks to the character target', () => {
    const entry: LogEntry = {
      kind: 'damage',
      text: 'The Cave Rat bites Hiro.',
      amount: 3,
      meta: { mobName: 'Cave Rat', element: 'ice' },
    }
    const out = deriveElementEvents([entry])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ target: 'character', element: 'ice' })
  })

  it('skips entries without meta.element', () => {
    const entry: LogEntry = {
      kind: 'damage',
      text: 'Hiro hits the Cave Rat.',
      amount: 3,
      meta: { name: 'Hiro' },
    }
    expect(deriveElementEvents([entry])).toHaveLength(0)
  })

  it('routes condition entries based on which actor the meta names', () => {
    const onMob: LogEntry = {
      kind: 'condition-gain',
      text: 'The Cave Rat catches fire.',
      conditionId: 'burning',
      polarity: 'debuff',
      meta: { mobName: 'Cave Rat', element: 'fire' },
    }
    const onChar: LogEntry = {
      kind: 'condition-gain',
      text: 'Hiro catches fire.',
      conditionId: 'burning',
      polarity: 'debuff',
      meta: { name: 'Hiro', element: 'fire' },
    }
    expect(deriveElementEvents([onMob])[0]).toMatchObject({ target: 'mob' })
    expect(deriveElementEvents([onChar])[0]).toMatchObject({ target: 'character' })
  })
})
