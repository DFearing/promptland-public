import { describe, expect, it } from 'vitest'
import { formatActorName, type ActorContext, type Character } from '../../character'
import type { ItemDef } from '../../items'
import type { LogEntry, LogMeta } from '../../log'
import type { Mob } from '../../mobs'
import { Rng } from '../../rng'
import {
  formatCombinedKillLog,
  formatGoldPickupLog,
  formatItemPickupLog,
  formatMeditateSummaryLog,
  formatMobDefeatLog,
  formatMobSelfHealLog,
  formatRestSummaryLog,
} from '../logLines'

// Returns the entry's meta if present. Each emitter under test produces
// a kind that carries `meta`; a runtime check keeps the helper safe if
// somebody changes a kind to one without meta later.
function metaOf(entry: LogEntry): LogMeta | undefined {
  return 'meta' in entry ? entry.meta : undefined
}

// Builds a minimal Character whose fields are only those the rendering
// helpers + actorName.ts read. The world id has to be a real registered
// manifest so `currentTitle` resolves rather than coming back null.
function makeCharacter(level: number, name = 'Hiro'): Character {
  return {
    id: 'test-character',
    name,
    worldId: 'fantasy',
    worldVersion: '3',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: 0,
    level,
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
  }
}

const fixedItem: ItemDef = {
  id: 'worn_sword',
  kind: 'equipment',
  slot: 'weapon',
  bonuses: { attack: 1 },
  name: 'Worn Sword',
  description: 'Notched but sharp enough.',
}

const fixedMob: Mob = {
  id: 'cave_rat',
  maxHp: 6,
  attack: 2,
  defense: 0,
  xpReward: 3,
  name: 'Cave Rat',
  description: 'A rodent of unusual size.',
  hp: 0,
  conditions: [],
  rarity: 'common',
  level: 1,
  healChargesLeft: 0,
}

// Deterministic Rng so emitters that pick from word lists produce a
// stable line; the invariants under test don't depend on which line was
// drawn, but a fixed seed keeps the rest-of-suite reproducible.
function rng(): Rng {
  return Rng.fromSeed(0xc0ffee)
}

// Invariant 1 — every emitter that sets `meta.name` must also embed that
// exact name in the rendered text. LogPanel.tsx:97-102 and effects/derive.ts
// both rely on this: the panel highlights `meta.name` by string-matching it
// inside `entry.text`, and the derive layer uses `text.startsWith(meta.name)`
// to decide whether the character was the attacker on a damage line. If the
// name in `meta` ever drifts from what's in `text`, the panel silently
// stops painting the actor token and the effects layer mis-routes events.
describe('logMeta: meta.name appears in entry.text', () => {
  const characterName = 'Hiro'

  it('formatGoldPickupLog', () => {
    const entry = formatGoldPickupLog(characterName, 12, 'gold', rng())
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  it('formatItemPickupLog', () => {
    const entry = formatItemPickupLog({
      characterName,
      def: fixedItem,
      rarity: 'common',
      qty: 1,
    })
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  it('formatRestSummaryLog (with HP gained)', () => {
    const entry = formatRestSummaryLog(characterName, 5, 10)
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  it('formatRestSummaryLog (no HP gained)', () => {
    const entry = formatRestSummaryLog(characterName, 0, 10)
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  it.each([
    ['both pools', 4, 10, 5, 10] as const,
    ['MP only', 4, 10, 0, 10] as const,
    ['HP only', 0, 10, 5, 10] as const,
    ['neither', 0, 10, 0, 10] as const,
  ])('formatMeditateSummaryLog (%s)', (_label, mp, maxMp, hp, maxHp) => {
    const entry = formatMeditateSummaryLog(characterName, mp, maxMp, hp, maxHp)
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  it('formatCombinedKillLog', () => {
    const entry = formatCombinedKillLog({
      characterName,
      mob: fixedMob,
      awardedXp: 3,
      severity: 'critical',
    })
    const meta = metaOf(entry)
    expect(meta?.name).toBe(characterName)
    expect(entry.text).toContain(characterName)
  })

  // Sanity-check the negative side: the mob-only lines do NOT carry
  // meta.name, but they DO carry meta.mobName, and the same containment
  // contract applies for that field. Keeps the suite catching regressions
  // in either direction without mixing them up.
  it('formatMobDefeatLog has no meta.name and embeds mobName in text', () => {
    const entry = formatMobDefeatLog({
      mob: fixedMob,
      awardedXp: 3,
      rng: rng(),
    })
    const meta = metaOf(entry)
    expect(meta?.name).toBeUndefined()
    expect(meta?.mobName).toBe(fixedMob.name)
    expect(entry.text).toContain(fixedMob.name)
  })

  it('formatMobSelfHealLog has no meta.name and embeds mobName in text', () => {
    const entry = formatMobSelfHealLog(fixedMob.name, 4)
    const meta = metaOf(entry)
    expect(meta?.name).toBeUndefined()
    expect(meta?.mobName).toBe(fixedMob.name)
    expect(entry.text).toContain(fixedMob.name)
  })
})

// Invariant 2 — when a caller passes `formatActorName(c, ctx)` into the
// emitter as the character name, the emitter's `meta.name` must round-trip
// back to that exact string for the same context. tick.ts threads
// `formatActorName(c, 'log')` (and 'log-milestone' on level-up flavor) into
// the helpers, so this asserts the contract a tick callsite is depending on:
// pulling meta.name out of the log entry should give the same display name
// the line was rendered with, even after the title-arc has flipped the
// actor's display form ("Wayfarer" → "Hiro" → "Wayfarer Hiro" → "Hiro the
// Warlord").
describe('logMeta: meta.name === formatActorName(c, ctx)', () => {
  // Levels chosen to land in each of the four 'log' arc segments: idx<5
  // (anonymous title), idx<15 (bare name), idx<25 (title + name),
  // idx>=25 (name + "the" + title). Levels 110 ensures the post-100
  // ladder still flows through.
  const levels = [1, 6, 16, 30, 60, 110] as const
  const contexts: ActorContext[] = ['log', 'log-milestone', 'npc-greeting']

  for (const level of levels) {
    for (const ctx of contexts) {
      it(`level=${level} ctx=${ctx} round-trips through emitters`, () => {
        const c = makeCharacter(level)
        const displayName = formatActorName(c, ctx)
        // No call site uses 'npc-greeting' with the gold/item/rest helpers,
        // but the contract we're validating is purely string-in / string-out
        // — passing each context through every helper exercises the same
        // invariant the tick callers rely on for 'log' / 'log-milestone'.
        const cases: Array<{ label: string; entry: LogEntry }> = [
          {
            label: 'gold',
            entry: formatGoldPickupLog(displayName, 7, 'gold', rng()),
          },
          {
            label: 'item',
            entry: formatItemPickupLog({
              characterName: displayName,
              def: fixedItem,
              rarity: 'common',
              qty: 1,
            }),
          },
          {
            label: 'rest',
            entry: formatRestSummaryLog(displayName, 4, 10),
          },
          {
            label: 'meditate',
            entry: formatMeditateSummaryLog(displayName, 3, 10, 4, 10),
          },
          {
            label: 'combined-kill',
            entry: formatCombinedKillLog({
              characterName: displayName,
              mob: fixedMob,
              awardedXp: 3,
              severity: 'critical',
            }),
          },
        ]
        for (const { label, entry } of cases) {
          const meta = metaOf(entry)
          expect(meta?.name, `${label} meta.name`).toBe(displayName)
          expect(entry.text, `${label} text`).toContain(displayName)
        }
      })
    }
  }
})

// Stretch — snapshot the rendered actor name and a representative log
// line at each of the four title-arc thresholds. Locks the title/name
// flips so a regression in actorName.ts (e.g. accidentally swapping
// LEGENDARY_AT for KNOWN_AT) shows up as a snapshot diff instead of
// silently rewording every log line in the game.
describe('logMeta: title-arc snapshot', () => {
  // One representative level inside each arc segment — same buckets as
  // the round-trip test above, narrowed to the canonical four.
  const milestones = [
    { level: 1, label: 'birth' }, // idx 0   → anonymous "Wayfarer"
    { level: 6, label: 'introduced' }, // idx 5   → bare "Hiro"
    { level: 16, label: 'known' }, // idx 15  → "Wayfarer Hiro" (title + name)
    { level: 30, label: 'legendary' }, // idx 25  → "Hiro the Warlord" (name + the + title)
  ] as const

  it('produces stable display names + log lines across the arc', () => {
    const lines = milestones.map(({ level, label }) => {
      const c = makeCharacter(level)
      const display = formatActorName(c, 'log')
      const milestone = formatActorName(c, 'log-milestone')
      const greeting = formatActorName(c, 'npc-greeting')
      const gold = formatGoldPickupLog(display, 7, 'gold', rng()).text
      const rest = formatRestSummaryLog(display, 4, 10).text
      const meditate = formatMeditateSummaryLog(display, 3, 10, 4, 10).text
      return { label, level, display, milestone, greeting, gold, rest, meditate }
    })
    expect(lines).toMatchSnapshot()
  })
})
