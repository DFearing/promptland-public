import { describe, expect, it } from 'vitest'

import type { Area, NPC, Room } from '../../areas/types'

import {
  bumpNPCInteractionCount,
  findFrontierStateForRoom,
  npcInteractionKey,
  pickNPCLine,
  type FrontierState,
} from '../npcDialogue'

// ---------------------------------------------------------------------------
// Test fixtures — kept inline so the suite stays self-contained.
// ---------------------------------------------------------------------------

function makeNPC(overrides: Partial<NPC> = {}): NPC {
  return {
    id: 'harwick',
    name: 'Harwick',
    role: 'retired city guard',
    description: 'A weather-worn man leaning on the well.',
    cares: 'class',
    hooks: {
      warrior: 'A swordhand, eh?',
      wizard: 'I see runes on you, scholar.',
    },
    firstMeet: 'Welcome to Millhaven, traveler.',
    regular: [
      'The well still runs, thank the gods.',
      'Watch the road north — wolves been bold this season.',
      'Buy bread at the south gate, not the plaza. Cheaper.',
    ],
    ...overrides,
  }
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    x: 0,
    y: 0,
    z: 0,
    type: 'safe',
    name: 'Plaza',
    description: 'A cobbled square.',
    ...overrides,
  } as Room
}

function makeArea(rooms: Room[]): Area {
  const map: Record<string, Room> = {}
  for (const r of rooms) map[`${r.x},${r.y},${r.z}`] = r
  return {
    id: 'millhaven',
    name: 'Millhaven',
    startX: rooms[0]?.x ?? 0,
    startY: rooms[0]?.y ?? 0,
    startZ: rooms[0]?.z ?? 0,
    rooms: map,
  }
}

// ===========================================================================
// pickNPCLine — line selection logic
// ===========================================================================

describe('pickNPCLine', () => {
  const baseInput = {
    visitCount: 0,
    characterClassId: 'warrior',
    characterSpeciesId: 'human',
    frontier: { kind: 'none' } as FrontierState,
  }

  it('first meet prepends the class hook when cares=class and a hook exists', () => {
    const npc = makeNPC({ cares: 'class' })
    const line = pickNPCLine({ ...baseInput, npc, visitCount: 0 })
    expect(line).toBe('A swordhand, eh? Welcome to Millhaven, traveler.')
  })

  it('first meet falls back to bare firstMeet when the player class has no hook', () => {
    const npc = makeNPC({ cares: 'class' })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 0,
      characterClassId: 'cleric',
    })
    expect(line).toBe('Welcome to Millhaven, traveler.')
  })

  it('first meet keys off speciesId when cares=species', () => {
    const npc = makeNPC({
      cares: 'species',
      hooks: {
        human: 'Manling, eh?',
        elf: 'Hail, kin of the long road.',
      },
    })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 0,
      characterSpeciesId: 'elf',
    })
    expect(line).toBe('Hail, kin of the long road. Welcome to Millhaven, traveler.')
  })

  it('cares=class ignores the speciesId entirely', () => {
    const npc = makeNPC({
      cares: 'class',
      hooks: { warrior: 'A swordhand!' },
    })
    // species hook would be 'human-only' but cares is class — should be skipped.
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 0,
      characterClassId: 'wizard',
      characterSpeciesId: 'warrior',
    })
    // wizard has no class hook so the class-keyed lookup misses; species
    // shouldn't accidentally fill in.
    expect(line).toBe('Welcome to Millhaven, traveler.')
  })

  it('rotates through regular lines on subsequent visits', () => {
    const npc = makeNPC()
    const lines = [1, 2, 3, 4, 5, 6].map((vc) =>
      pickNPCLine({ ...baseInput, npc, visitCount: vc }),
    )
    // visitCount 1 → regular[0], 2 → regular[1], 3 → regular[2], wraps at 4.
    expect(lines).toEqual([
      'The well still runs, thank the gods.',
      'Watch the road north — wolves been bold this season.',
      'Buy bread at the south gate, not the plaza. Cheaper.',
      'The well still runs, thank the gods.',
      'Watch the road north — wolves been bold this season.',
      'Buy bread at the south gate, not the plaza. Cheaper.',
    ])
  })

  it('falls back to firstMeet when regular is empty', () => {
    const npc = makeNPC({ regular: [] })
    expect(pickNPCLine({ ...baseInput, npc, visitCount: 5 })).toBe(
      'Welcome to Millhaven, traveler.',
    )
  })

  it('frontierUnknown overrides regular when both available', () => {
    const npc = makeNPC({
      frontierUnknown:
        'There is an exit east to an unknown destination, and I would not walk it lightly.',
      frontierKnown: 'They say {areaName} lies down that road.',
    })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 2,
      frontier: { kind: 'unknown' },
    })
    expect(line).toBe(
      'There is an exit east to an unknown destination, and I would not walk it lightly.',
    )
  })

  it('frontierKnown substitutes the area name', () => {
    const npc = makeNPC({
      frontierUnknown: 'Unknown.',
      frontierKnown: 'They say {areaName} lies down that road. {areaName}, hard going.',
    })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 1,
      frontier: { kind: 'known', areaName: 'Forsaken Hollow' },
    })
    // replaceAll covers multiple occurrences in one line.
    expect(line).toBe(
      'They say Forsaken Hollow lies down that road. Forsaken Hollow, hard going.',
    )
  })

  it('frontier override does NOT preempt firstMeet — first impressions still win', () => {
    const npc = makeNPC({
      frontierUnknown: 'There is an exit to an unknown destination.',
    })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 0,
      frontier: { kind: 'unknown' },
    })
    expect(line).toBe('A swordhand, eh? Welcome to Millhaven, traveler.')
  })

  it('frontier override is a no-op when the NPC lacks the corresponding line', () => {
    const npc = makeNPC({
      frontierUnknown: undefined,
      frontierKnown: undefined,
    })
    const line = pickNPCLine({
      ...baseInput,
      npc,
      visitCount: 1,
      frontier: { kind: 'unknown' },
    })
    expect(line).toBe('The well still runs, thank the gods.')
  })
})

// ===========================================================================
// findFrontierStateForRoom — proximity scan
// ===========================================================================

describe('findFrontierStateForRoom', () => {
  const npcRoom = makeRoom({ x: 2, y: 2, z: 0, name: 'Plaza' })

  it('returns "none" when no exits are near', () => {
    const distantExit = makeRoom({
      x: 9,
      y: 9,
      z: 0,
      type: 'exit',
      name: 'Far Gate',
      pendingAreaGeneration: true,
    })
    const area = makeArea([npcRoom, distantExit])
    const state = findFrontierStateForRoom(area, npcRoom, { areas: [area] })
    expect(state.kind).toBe('none')
  })

  it('returns "unknown" for an adjacent pending exit', () => {
    const pendingExit = makeRoom({
      x: 3,
      y: 2,
      z: 0,
      type: 'exit',
      name: 'East Gate',
      pendingAreaGeneration: true,
    })
    const area = makeArea([npcRoom, pendingExit])
    const state = findFrontierStateForRoom(area, npcRoom, { areas: [area] })
    expect(state).toEqual({ kind: 'unknown' })
  })

  it('returns "known" with the destination area name when the exit is wired', () => {
    const wiredExit = makeRoom({
      x: 4,
      y: 2,
      z: 0,
      type: 'exit',
      name: 'East Gate',
      destination: { areaId: 'forsaken-hollow', x: 0, y: 0, z: 0 },
    })
    const destArea: Area = {
      id: 'forsaken-hollow',
      name: 'Forsaken Hollow',
      startX: 0,
      startY: 0,
      startZ: 0,
      rooms: {},
    }
    const area = makeArea([npcRoom, wiredExit])
    const state = findFrontierStateForRoom(area, npcRoom, {
      areas: [area, destArea],
    })
    expect(state).toEqual({ kind: 'known', areaName: 'Forsaken Hollow' })
  })

  it('unknown beats known when both exit kinds are nearby', () => {
    const wiredExit = makeRoom({
      x: 3,
      y: 2,
      z: 0,
      type: 'exit',
      name: 'East Gate',
      destination: { areaId: 'forsaken-hollow', x: 0, y: 0, z: 0 },
    })
    const pendingExit = makeRoom({
      x: 1,
      y: 2,
      z: 0,
      type: 'exit',
      name: 'West Gate',
      pendingAreaGeneration: true,
    })
    const destArea: Area = {
      id: 'forsaken-hollow',
      name: 'Forsaken Hollow',
      startX: 0,
      startY: 0,
      startZ: 0,
      rooms: {},
    }
    const area = makeArea([npcRoom, wiredExit, pendingExit])
    const state = findFrontierStateForRoom(area, npcRoom, {
      areas: [area, destArea],
    })
    expect(state).toEqual({ kind: 'unknown' })
  })

  it('ignores the NPC\'s own room even if it were tagged as exit', () => {
    const selfExit: Room = {
      ...npcRoom,
      type: 'exit',
      pendingAreaGeneration: true,
    }
    const area = makeArea([selfExit])
    const state = findFrontierStateForRoom(area, selfExit, { areas: [area] })
    expect(state.kind).toBe('none')
  })

  it('drops a wired exit whose destination area has not been hydrated', () => {
    const wiredExit = makeRoom({
      x: 3,
      y: 2,
      z: 0,
      type: 'exit',
      name: 'East Gate',
      destination: { areaId: 'unknown-place', x: 0, y: 0, z: 0 },
    })
    const area = makeArea([npcRoom, wiredExit])
    // Only the source area is in the world — the dest area lookup misses,
    // so we should not claim a "known" name we can't actually substitute.
    const state = findFrontierStateForRoom(area, npcRoom, { areas: [area] })
    expect(state.kind).toBe('none')
  })
})

// ===========================================================================
// bumpNPCInteractionCount — counter math
// ===========================================================================

describe('bumpNPCInteractionCount', () => {
  it('starts at 0 visitCount when the counter map is undefined', () => {
    const result = bumpNPCInteractionCount(undefined, 'millhaven', 'harwick')
    expect(result.visitCount).toBe(0)
    expect(result.counts).toEqual({ 'millhaven:harwick': 1 })
  })

  it('returns the previous count as visitCount and bumps by one', () => {
    const before = { 'millhaven:harwick': 4 }
    const result = bumpNPCInteractionCount(before, 'millhaven', 'harwick')
    expect(result.visitCount).toBe(4)
    expect(result.counts).toEqual({ 'millhaven:harwick': 5 })
  })

  it('scopes counts by area — same NPC id in two areas counts independently', () => {
    const before = { 'millhaven:harwick': 2 }
    const next = bumpNPCInteractionCount(before, 'forsaken-hollow', 'harwick')
    expect(next.visitCount).toBe(0)
    expect(next.counts).toEqual({
      'millhaven:harwick': 2,
      'forsaken-hollow:harwick': 1,
    })
  })

  it('does not mutate the original counts object', () => {
    const before = { 'millhaven:harwick': 1 }
    bumpNPCInteractionCount(before, 'millhaven', 'harwick')
    expect(before).toEqual({ 'millhaven:harwick': 1 })
  })
})

describe('npcInteractionKey', () => {
  it('joins areaId and npcId with a colon', () => {
    expect(npcInteractionKey('millhaven', 'harwick')).toBe('millhaven:harwick')
  })
})
