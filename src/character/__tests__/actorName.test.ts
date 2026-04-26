import { describe, expect, it } from 'vitest'
import { formatActorName } from '../actorName'
import type { Character } from '../types'

// Stub Character — only the four fields actorName.ts reads (level, name,
// worldId, classId) need real values; the rest are zero-filled. Using
// `fantasy/warrior` so titles resolve from the hand-authored ladder.
function chr(level: number, name = 'Hiro'): Character {
  return {
    id: 'a',
    name,
    worldId: 'fantasy',
    worldVersion: '3',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: 0,
    level,
    xp: 0,
    hp: 1,
    maxHp: 1,
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
    drives: { hunger: 0, fatigue: 0, greed: 0, curiosity: 0, weight: 0, piety: 0 },
    conditions: [],
    spells: [],
    rngState: 1,
  }
}

// The four 'log' arc segments from actorName.ts:
//   idx <  5  → bare title       — at idx 0 the world's birthTitle, at
//                                  idx 1..4 the class-specific titles.
//                                  No character name yet.
//   idx <  15 → bare name         ("Hiro")
//   idx <  25 → "Title Name"      ("Hearthguard Hiro")
//   idx >= 25 → "Name the Title"  ("Hiro the Knight-Commander")
// Numbers below land squarely inside each segment. Boundary cases
// (idx == 5 / 15 / 25) sit in the segment they're crossing INTO, so
// level 6 is the first 'bare name' segment, level 16 is the first
// 'Title Name' segment, level 30 is the first 'Name the Title'.
describe('formatActorName: log context', () => {
  it.each([
    [1, 'Wayfarer'], // idx 0 — world birthTitle stands alone
    [4, 'Spearhand'], // idx 3 — class-specific bare title
    [5, 'Shieldbearer'], // idx 4 — last bare-title level
    [6, 'Hiro'], // idx 5 — first bare-name level
    [10, 'Hiro'], // idx 9
    [15, 'Hiro'], // idx 14 — last bare-name level
    [16, 'Hearthguard Hiro'], // idx 15 — first "Title Name" level
    [20, 'Swordmaster Hiro'], // idx 19
    [25, 'Marshal Hiro'], // idx 24 — last "Title Name" level
    [30, 'Hiro the Knight-Commander'], // idx 25 — first "Name the Title"
    [50, 'Hiro the Living Blade'], // idx 29
  ])('level %i → "%s"', (level, expected) => {
    expect(formatActorName(chr(level), 'log')).toBe(expected)
  })
})

describe('formatActorName: log-milestone context', () => {
  // Milestone form is title + name through idx < 25, then name + the +
  // title. Birth tier (idx 0) intentionally falls back to title + name
  // so a level-1 milestone still reads "Wayfarer Hiro" — never bare.
  it.each([
    [1, 'Wayfarer Hiro'],
    [6, 'Swordhand Hiro'],
    [16, 'Hearthguard Hiro'],
    [25, 'Marshal Hiro'],
    [30, 'Hiro the Knight-Commander'],
    [100, 'Hiro the Sovereign of War'],
  ])('level %i → "%s"', (level, expected) => {
    expect(formatActorName(chr(level), 'log-milestone')).toBe(expected)
  })
})

describe('formatActorName: npc-greeting context', () => {
  // Greeting form has its own birth-tier branch: at idx 0 the title is
  // class-neutral and stands alone ("Wayfarer") — class-specific titles
  // ("Apprentice", "Novice") would read awkwardly without the name, so
  // every other tier folds the name in.
  it.each([
    [1, 'Wayfarer'], // anonymous greeting
    [2, 'Man-at-Arms Hiro'], // first class-specific title
    [16, 'Hearthguard Hiro'],
    [30, 'Hiro the Knight-Commander'],
  ])('level %i → "%s"', (level, expected) => {
    expect(formatActorName(chr(level), 'npc-greeting')).toBe(expected)
  })
})

describe('formatActorName: defaults to log', () => {
  it('omitted ctx behaves the same as ctx=log', () => {
    const c = chr(6)
    expect(formatActorName(c)).toBe(formatActorName(c, 'log'))
  })
})

describe('formatActorName: unresolved title', () => {
  // Unknown world id → currentTitle returns text:null → actorName falls
  // back to the bare character name regardless of context. Guards the
  // graceful-degradation comment in actorName.ts:24.
  it.each(['log', 'log-milestone', 'npc-greeting'] as const)(
    'falls back to bare name for ctx=%s when no manifest exists',
    (ctx) => {
      const c = chr(10)
      c.worldId = 'no-such-world'
      expect(formatActorName(c, ctx)).toBe('Hiro')
    },
  )
})
