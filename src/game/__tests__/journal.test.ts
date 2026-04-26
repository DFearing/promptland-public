import { describe, expect, it } from 'vitest'
import type { Character, JournalEntry, SavedRecord } from '../../character'
import type { LogEntry } from '../../log'
import { Rng } from '../../rng'
import type { WorldContent } from '../../worlds'
import { deriveJournalEntries } from '../journal'

const rng = () => Rng.fromSeed(1)

// Minimal stubs scoped to the new entry kinds. The existing journal
// tests (in sacrifice.test.ts integration runs) cover the full pipeline
// — these focused tests prove the new favor-tier-up + death-save paths
// are wired correctly.
function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test',
    name: 'Hiro',
    worldId: 'fantasy',
    worldVersion: '1',
    speciesId: 'human',
    classId: 'warrior',
    createdAt: 1000,
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
    journal: [],
    ...overrides,
  }
}

const STUB_WORLD = {
  startingArea: { id: 'millhaven', name: 'Millhaven' },
  areas: [{ id: 'millhaven', name: 'Millhaven' }],
  items: [],
  mobs: [],
} as unknown as WorldContent

describe('deriveJournalEntries — favor tier-up', () => {
  it('emits a favor-tier-up journal entry when a tier-up log line lands', () => {
    const prev = character({ favor: 95 })
    const next = character({ favor: 105 })
    const log: LogEntry[] = [
      {
        kind: 'favor-tier-up',
        text: 'Hiro is now Touched of the gods.',
        meta: { tierName: 'Touched', tier: 1 },
      },
    ]
    const entries = deriveJournalEntries(prev, next, log, STUB_WORLD, rng())
    const tierEntries = entries.filter((e) => e.kind === 'favor-tier-up')
    expect(tierEntries).toHaveLength(1)
    expect(tierEntries[0].text).toBe('Reached Touched.')
    expect(tierEntries[0].meta?.tier).toBe(1)
    expect(tierEntries[0].meta?.tierName).toBe('Touched')
  })

  it('skips when the log line is missing tier metadata', () => {
    const prev = character({ favor: 95 })
    const next = character({ favor: 105 })
    const log: LogEntry[] = [
      // Malformed — meta has no tier/tierName fields. Defensive skip.
      { kind: 'favor-tier-up', text: 'Something happened.', meta: {} },
    ]
    const entries = deriveJournalEntries(prev, next, log, STUB_WORLD, rng())
    expect(entries.filter((e) => e.kind === 'favor-tier-up')).toHaveLength(0)
  })
})

describe('deriveJournalEntries — death-save', () => {
  it('emits a death-save entry when a SavedRecord is appended', () => {
    const saved: SavedRecord = {
      at: 5000,
      cause: 'Cut down by the Cave Rat',
      areaId: 'millhaven',
      roomName: 'Mossy Tunnel',
      roomKey: '1,2,0',
      mobName: 'Cave Rat',
    }
    const prev = character({ saved: [] })
    const next = character({ saved: [saved] })
    const entries = deriveJournalEntries(prev, next, [], STUB_WORLD, rng())
    const saves = entries.filter((e) => e.kind === 'death-save')
    expect(saves).toHaveLength(1)
    const entry = saves[0] as JournalEntry
    expect(entry.text).toContain('Cave Rat')
    expect(entry.text).toContain('Mossy Tunnel')
    expect(entry.text).toContain('Not today, death.')
    expect(entry.areaId).toBe('millhaven')
  })

  it('emits no death-save entry when saved is unchanged', () => {
    const saved: SavedRecord = {
      at: 5000,
      cause: 'Cut down by the Cave Rat',
      areaId: 'millhaven',
      mobName: 'Cave Rat',
    }
    const prev = character({ saved: [saved] })
    const next = character({ saved: [saved] })
    const entries = deriveJournalEntries(prev, next, [], STUB_WORLD, rng())
    expect(entries.filter((e) => e.kind === 'death-save')).toHaveLength(0)
  })
})
