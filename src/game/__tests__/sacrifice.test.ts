import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type Character,
  type Equipped,
  type InventoryItem,
  makeDefaults,
  maxHpFor,
  maxMagicFor,
} from '../../character'
import type { ItemDef } from '../../items'
import { mulberry32 } from '../../rng'
import { getWorldContent, getWorldManifest } from '../../worlds'

import { pickItemsToSacrifice } from '../sacrifice'
import { INITIAL_STATE } from '../state'
import { type Playing, runTick } from '../tick'

// ---------------------------------------------------------------------------
// Determinism harness — same as runTick.test.ts. We re-create it locally
// rather than import so the suite stays self-contained.
// ---------------------------------------------------------------------------
const FROZEN_TIME = 1_700_000_000_000
const originalDateNow = Date.now
const originalMathRandom = Math.random
beforeAll(() => {
  Date.now = () => FROZEN_TIME
  const stream = mulberry32(0xfeed_face)
  Math.random = stream
})
afterAll(() => {
  Date.now = originalDateNow
  Math.random = originalMathRandom
})

// ===========================================================================
// SECTION 1 — pure-function unit tests on pickItemsToSacrifice.
//
// These exercise the picker logic in isolation. They prove that *given*
// the trigger conditions are met and the action runs, the right items
// are chosen. They DON'T tell us whether the trigger ever fires in
// real gameplay — that's section 2.
// ===========================================================================

function makeBareCharacter(overrides: Partial<Character> = {}): Character {
  // Minimal Character — fields beyond the resolver's read set are stubbed
  // with zeros / defaults. The picker only reads `inventory` and
  // `equipped`, so most of this is unused but type-required.
  return {
    id: 'test',
    name: 'Tester',
    worldId: 'fantasy',
    worldVersion: '1',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: FROZEN_TIME,
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
    position: { areaId: 'millhaven', x: 0, y: 0, z: 0 },
    visitedRooms: [],
    deaths: [],
    levelUps: [],
    drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: 0, piety: 0 },
    conditions: [],
    spells: [],
    rngState: 1,
    ...overrides,
  }
}

const TEST_ITEMS: ItemDef[] = [
  {
    id: 'rat-tail',
    kind: 'junk',
    stackable: true,
    weight: 1,
    value: 2,
    name: 'Rat Tail',
    description: 'a stub',
  },
  {
    id: 'iron-sword',
    kind: 'equipment',
    slot: 'weapon',
    bonuses: { attack: 2 },
    weight: 3,
    value: 10,
    name: 'Iron Sword',
    description: 'a stub',
  },
  {
    id: 'plate-armor',
    kind: 'equipment',
    slot: 'armor',
    bonuses: { defense: 4 },
    weight: 6,
    value: 30,
    name: 'Plate Armor',
    description: 'a stub',
  },
  {
    id: 'healing-potion',
    kind: 'consumable',
    effect: { kind: 'heal' },
    size: 'standard',
    weight: 1,
    value: 5,
    name: 'Healing Potion',
    description: 'a stub',
  },
  {
    id: 'fire-scroll',
    kind: 'scroll',
    spellId: 'fireball',
    level: 1,
    weight: 1,
    value: 5,
    name: 'Scroll of Fire',
    description: 'a stub',
  },
]

function makeItem(
  id: string,
  archetypeId: string,
  rarity: InventoryItem['rarity'] = 'common',
  quantity = 1,
): InventoryItem {
  return {
    id,
    archetypeId,
    name: archetypeId,
    quantity,
    rarity,
    acquired: { at: FROZEN_TIME, source: 'mob' },
  }
}

describe('pickItemsToSacrifice — pure logic', () => {
  it('empty inventory → nothing sacrificed', () => {
    const c = makeBareCharacter()
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(0)
    expect(r.totalGold).toBe(0)
    expect(r.remainingInventory).toHaveLength(0)
  })

  it('common items are always eligible (even when nothing better is owned)', () => {
    const c = makeBareCharacter({
      inventory: [
        makeItem('a', 'rat-tail', 'common'),
        makeItem('b', 'rat-tail', 'common'),
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(2)
    expect(r.totalGold).toBe(2)
    expect(r.remainingInventory).toHaveLength(0)
  })

  it('quantity counts toward gold (one stack of 7 = 7 gold)', () => {
    const c = makeBareCharacter({
      inventory: [makeItem('a', 'rat-tail', 'common', 7)],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(1)
    expect(r.totalGold).toBe(7)
  })

  it('rare item is kept when no higher tier is owned (max-rarity = rare)', () => {
    // The picker considers a rare "still relevant" because nothing better
    // is owned. Only commons should leave.
    const c = makeBareCharacter({
      inventory: [
        makeItem('a', 'rat-tail', 'common'),
        makeItem('b', 'iron-sword', 'rare'),
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed.map((s) => s.item.id)).toEqual(['a'])
    expect(r.remainingInventory.map((i) => i.id)).toEqual(['b'])
  })

  it('rare items become eligible once the character owns an epic', () => {
    // Adding an epic to the character's owned set bumps max-rarity. Now
    // the rare drops below the threshold and joins the commons in the
    // sacrifice pile.
    const c = makeBareCharacter({
      inventory: [
        makeItem('a', 'rat-tail', 'common'),
        makeItem('b', 'iron-sword', 'rare'),
        makeItem('c', 'plate-armor', 'epic'),
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed.map((s) => s.item.id).sort()).toEqual(['a', 'b'])
    expect(r.remainingInventory.map((i) => i.id)).toEqual(['c'])
  })

  it('equipped items are never sacrificed (even commons)', () => {
    const equippedSword = makeItem('worn', 'iron-sword', 'common')
    const equipped: Equipped = { weapon: equippedSword }
    const c = makeBareCharacter({
      inventory: [equippedSword, makeItem('spare', 'rat-tail', 'common')],
      equipped,
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed.map((s) => s.item.id)).toEqual(['spare'])
    expect(r.remainingInventory.map((i) => i.id)).toContain('worn')
  })

  it('equipped epic counts toward max-rarity (rares in inventory drop to eligible)', () => {
    // An epic worn item should still gate sacrificeability — i.e. an
    // epic on the body makes inventory rares "no longer relevant".
    const wornEpic = makeItem('worn', 'plate-armor', 'epic')
    const c = makeBareCharacter({
      inventory: [wornEpic, makeItem('rare-bag', 'iron-sword', 'rare')],
      equipped: { armor: wornEpic },
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed.map((s) => s.item.id)).toEqual(['rare-bag'])
  })

  it('consumables are never sacrificed (utility regardless of rarity)', () => {
    const c = makeBareCharacter({
      inventory: [makeItem('p', 'healing-potion', 'common')],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(0)
    expect(r.remainingInventory).toHaveLength(1)
  })

  it('scrolls are never sacrificed (utility regardless of rarity)', () => {
    const c = makeBareCharacter({
      inventory: [makeItem('s', 'fire-scroll', 'common')],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(0)
  })

  it('items without archetypeId are kept (defensive — flavor / starting items)', () => {
    const c = makeBareCharacter({
      inventory: [
        {
          id: 'flavor',
          name: 'Mystery Trinket',
          quantity: 1,
          rarity: 'common',
          acquired: { at: FROZEN_TIME, source: 'starting' },
        },
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed).toHaveLength(0)
  })

  it('legendary kept when nothing higher exists; commons still go', () => {
    const c = makeBareCharacter({
      inventory: [
        makeItem('a', 'rat-tail', 'common'),
        makeItem('b', 'plate-armor', 'legendary'),
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.sacrificed.map((s) => s.item.id)).toEqual(['a'])
    expect(r.remainingInventory.map((i) => i.id)).toEqual(['b'])
  })

  // Favor delta — sacrifice was rewired to grant 1 favor per sacrificed
  // item alongside the existing 1-gold-per-item. Confirms the 1:1 parity
  // is preserved across mixed-rarity bags.
  it('returns 1 favor per sacrificed item — matches gold curve', () => {
    const c = makeBareCharacter({
      inventory: [
        makeItem('a', 'rat-tail', 'common', 1),
        makeItem('b', 'rat-tail', 'common', 4),
      ],
    })
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.totalFavor).toBe(5)
    expect(r.totalFavor).toBe(r.totalGold)
  })

  it('totalFavor is 0 when nothing is eligible', () => {
    const c = makeBareCharacter()
    const r = pickItemsToSacrifice(c, TEST_ITEMS)
    expect(r.totalFavor).toBe(0)
  })
})

// ===========================================================================
// SECTION 2 — auto-trigger wiring + design constraints.
//
// The picker tests above prove that GIVEN the action fires, the right
// items get chosen. These integration tests cover the trigger itself:
//
//   A1. Overweight character at a normal (non-shrine) room — fires.
//       Proves the design intent that sacrifice works ANYWHERE.
//   A2. Overweight at a shrine — still fires (subset of A1).
//   A3. Overweight + high greed — does NOT fire. The greed gate
//       captures a hoarder who refuses to part with loot.
//   A4. Overweight + narratable-satisfying room (water → hunger) —
//       satisfaction wins. Sacrifice is the genuine fallback,
//       priority-below room business.
//   B.  Long scripted natural-play run — count how often sacrifice
//       surfaces with seed 0xc0ffee_01 over 500 ticks. Snapshotted
//       so any future change to the trigger reads here.
// ===========================================================================

const PINNED_RNG_SEED = 0xc0ffee_01

function makeStartingCharacter(): Character {
  const world = getWorldManifest('fantasy')
  if (!world) throw new Error('fantasy manifest missing')
  const klass = world.classes.find((c) => c.id === 'warrior')
  if (!klass) throw new Error('warrior class missing')
  const stats = { ...klass.startingStats }
  const inventory: InventoryItem[] = klass.startingInventory.map((t, i) => ({
    id: `inv-${i}`,
    name: t.name,
    description: t.description,
    quantity: t.quantity,
    level: 1,
    acquired: { at: FROZEN_TIME, source: 'starting' },
  }))
  const maxHp = maxHpFor(stats)
  const maxMagic =
    klass.magicAffinity !== undefined
      ? maxMagicFor(stats, klass.magicAffinity, klass.castingStat)
      : (klass.startingMaxMagic ?? 0)
  const defaults = makeDefaults('fantasy')
  return {
    ...defaults,
    id: 'pinned-char',
    name: 'Hiro',
    worldId: world.id,
    worldVersion: world.version,
    speciesId: 'human',
    classId: 'warrior',
    createdAt: FROZEN_TIME,
    level: 1,
    xp: 0,
    hp: Math.max(1, Math.ceil(maxHp * 0.6)),
    maxHp,
    magic: maxMagic,
    maxMagic,
    stats,
    inventory,
    spells: [...(klass.startingSpells ?? [])],
    segment: { startedAt: FROZEN_TIME, startGold: 0 },
    tickSpeed: '50',
    tickSpeedAuto: false,
    rngState: PINNED_RNG_SEED,
    journal: [],
  }
}

function isVoluntarySacrificeLine(text: string): boolean {
  // tick.ts narrative line — "<actor> sacrifices <n> item(s) at <room>."
  return /sacrifices? \d+ items? at /i.test(text)
}

function isForcedAbandonLine(text: string): boolean {
  // tick.ts:2338 chest-overflow line — "... to the weight of the road."
  return /to the weight of the road/i.test(text)
}

/** Stack of N common rat-tail junk items — each weight=1, so 50 stacks
 *  saturate the weight drive above the 35 threshold for any starting
 *  character (base capacity 20). */
function overloadedJunk(count: number): InventoryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `junk-${i}`,
    archetypeId: 'rat_tail',
    name: 'rat tail',
    quantity: 1,
    rarity: 'common',
    acquired: { at: FROZEN_TIME, source: 'mob' },
  }))
}

/** Build a starting character at the given Millhaven position with full
 *  HP (so the rest path doesn't fire) and the given inventory + drives.
 *  The starting position default `(0,0,0)` is a plain chamber tile — no
 *  shop / shrine / satisfy room within one move, so a 2-3 tick test
 *  observes a clean sacrifice beat without the character wandering off
 *  to sell or rest first. */
function characterAt(
  x: number,
  y: number,
  z: number,
  inventory: InventoryItem[],
  drives: Partial<Character['drives']> = {},
): Character {
  const base = makeStartingCharacter()
  return {
    ...base,
    hp: base.maxHp,
    position: { areaId: 'millhaven', x, y, z },
    visitedRooms: [`millhaven:${x},${y},${z}`],
    inventory,
    drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: 0, piety: 0, ...drives },
  }
}

describe('SCENARIO A1 — sacrifice fires anywhere when overweight', () => {
  it('overweight character at a plain chamber (non-shrine, non-shop) triggers sacrifice', () => {
    // Position at (0,0,0) — Millhaven's NW corner, four moves from the
    // shop and not a safe-family room. With 50 junk in the bag, the
    // overweight check fires on the first explore tick; over 3 ticks
    // the character can't reach the shop, so we cleanly observe the
    // sacrifice path firing instead of a sell.
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(0, 0, 0, overloadedJunk(50)),
      log: [],
      state: INITIAL_STATE,
    }
    for (let i = 0; i < 3; i++) p = runTick(p, world)

    const fired = p.log.some((e) => isVoluntarySacrificeLine(e.text))
    if (!fired) {
      throw new Error(
        'Sacrifice did not fire at a non-shrine, non-shop tile. Log:\n' +
          p.log.map((e) => `[${e.kind}] ${e.text}`).join('\n'),
      )
    }
    expect(fired).toBe(true)
    expect(p.character.gold).toBeGreaterThan(0)
    expect(p.character.inventory.length).toBeLessThan(50)
  })

  it('weight drive drops below threshold after the sacrifice resolves', () => {
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(0, 0, 0, overloadedJunk(50)),
      log: [],
      state: INITIAL_STATE,
    }
    for (let i = 0; i < 3; i++) p = runTick(p, world)
    expect(p.character.drives.weight).toBeLessThan(35)
  })
})

describe('SCENARIO A2 — sacrifice still fires at shrines (regression check)', () => {
  it('overweight at a shrine continues to trigger sacrifice', () => {
    // (1,1,0) is the shrine. Start one tile west at (0,1,0) exit so the
    // first move steps onto the shrine tile.
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(0, 1, 0, overloadedJunk(50)),
      log: [],
      state: INITIAL_STATE,
    }
    for (let i = 0; i < 3; i++) p = runTick(p, world)
    expect(p.log.some((e) => isVoluntarySacrificeLine(e.text))).toBe(true)
  })
})

describe('SCENARIO A3 — high greed suppresses sacrifice (hoarder gate)', () => {
  it('overweight + greed at threshold (35) → no sacrifice fires', () => {
    // Greed at the threshold (and growing each tick by +2) suppresses
    // the sacrifice gate. Run only 2 ticks so the character can't walk
    // to the shop and offload via sell either.
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(0, 0, 0, overloadedJunk(50), { greed: 35 }),
      log: [],
      state: INITIAL_STATE,
    }
    for (let i = 0; i < 2; i++) p = runTick(p, world)

    expect(p.log.some((e) => isVoluntarySacrificeLine(e.text))).toBe(false)
    // The character may have moved one tile, but inventory is intact —
    // they didn't sacrifice and they didn't reach the shop.
    expect(p.character.inventory.length).toBe(50)
    expect(p.character.drives.weight).toBeGreaterThanOrEqual(35)
  })

  it('overweight + greed well below threshold (20) → sacrifice DOES fire', () => {
    // Positive control on the same boundary. Greed=20 grows by 2/tick;
    // even after 3 ticks it's still 26 < 35, so the gate stays open
    // and the trigger fires.
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(0, 0, 0, overloadedJunk(50), { greed: 20 }),
      log: [],
      state: INITIAL_STATE,
    }
    for (let i = 0; i < 3; i++) p = runTick(p, world)
    expect(p.log.some((e) => isVoluntarySacrificeLine(e.text))).toBe(true)
  })
})

describe('SCENARIO A4 — drive satisfactions outprioritize sacrifice', () => {
  it('overweight + at a water tile satisfying high hunger → satisfy wins, sacrifice deferred', () => {
    // Water tile at (2,2,0) satisfies hunger. To put hunger above weight
    // as the top drive (so moveByGoal aims for water, not shop), we use
    // only 8 junk items: weight drive ≈ 40 (above sacrifice threshold)
    // but below hunger drive (80). Start one tile north on the corridor
    // (2,1,0)... actually (2,1,0) is the safe room, isSafeFamily=true,
    // which would invite a rest. Use (3,2,0) corridor instead — adjacent
    // to water, no rest, and far enough from the shop.
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let p: Playing = {
      character: characterAt(3, 2, 0, overloadedJunk(8), { hunger: 80 }),
      log: [],
      state: INITIAL_STATE,
    }
    // Two ticks: tick 1 explores → satisfy beat; tick 2 resolves it.
    for (let i = 0; i < 2; i++) p = runTick(p, world)

    expect(p.log.some((e) => isVoluntarySacrificeLine(e.text))).toBe(false)
    // Hunger should have dropped — satisfy fired.
    expect(p.character.drives.hunger).toBeLessThan(80)
  })
})

describe('SCENARIO B — does sacrifice happen in natural play?', () => {
  // Replays a long scripted run and counts both kinds of sacrifice text.
  // The snapshot is the headline evidence: with the shrine restriction
  // gone, the count should be substantially higher than 1-per-500-ticks
  // (the pre-fix baseline). Compare the snapshot's `voluntaryCount`
  // against git history if you change the trigger again.

  function runScripted(ticks: number) {
    const world = getWorldContent('fantasy')
    if (!world) throw new Error('fantasy content missing')
    let playing: Playing = {
      character: makeStartingCharacter(),
      log: [],
      state: INITIAL_STATE,
    }
    let peakWeightDrive = 0
    let peakGreedDrive = 0
    for (let i = 0; i < ticks; i++) {
      playing = runTick(playing, world)
      if (playing.character.drives.weight > peakWeightDrive) {
        peakWeightDrive = playing.character.drives.weight
      }
      if (playing.character.drives.greed > peakGreedDrive) {
        peakGreedDrive = playing.character.drives.greed
      }
    }
    const voluntary = playing.log.filter((e) => isVoluntarySacrificeLine(e.text))
    const abandoned = playing.log.filter((e) => isForcedAbandonLine(e.text))
    return {
      voluntaryCount: voluntary.length,
      abandonedCount: abandoned.length,
      peakWeightDrive,
      peakGreedDrive,
      finalInventoryCount: playing.character.inventory.length,
      finalGold: playing.character.gold,
    }
  }

  it('500-tick scripted warrior run — surface the evidence', () => {
    const summary = runScripted(500)
    expect(summary).toMatchSnapshot()
  })
})
