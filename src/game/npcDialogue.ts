import type { Area, NPC, Room } from '../areas/types'
import { roomKey } from '../areas/types'
import type { WorldContent } from '../worlds/types'

/** Counter key used in `character.npcInteractionCounts`. NPC ids are
 *  unique within an area but two areas may host NPCs that share an id,
 *  so we always scope the count by `areaId`. */
export function npcInteractionKey(areaId: string, npcId: string): string {
  return `${areaId}:${npcId}`
}

export type FrontierState =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'known'; areaName: string }

/** Chebyshev radius around the NPC's room used to detect a "nearby"
 *  frontier exit. 2 is generous enough to catch a settlement plaza
 *  whose road-end exit is one or two corridors away, but tight enough
 *  that an exit on the far side of the map doesn't bleed in. */
const FRONTIER_NEIGHBOR_RADIUS = 2

/** Inspects the same area's exit rooms within FRONTIER_NEIGHBOR_RADIUS
 *  of the given room and decides whether the NPC there should warn
 *  about an unknown destination, mention a known one, or stay silent
 *  on the topic.
 *
 *  Priority: any unresolved exit beats a resolved one — the player
 *  still hasn't seen what's out there, so the unknown warning is the
 *  more useful piece of information to surface. */
export function findFrontierStateForRoom(
  area: Area,
  room: Room,
  world: Pick<WorldContent, 'areas'>,
): FrontierState {
  let foundKnown: { areaName: string; distance: number } | null = null
  for (const key in area.rooms) {
    const r = area.rooms[key]
    if (r.type !== 'exit') continue
    if (r.x === room.x && r.y === room.y && r.z === room.z) continue
    const distance = Math.max(
      Math.abs(r.x - room.x),
      Math.abs(r.y - room.y),
      Math.abs(r.z - room.z),
    )
    if (distance > FRONTIER_NEIGHBOR_RADIUS) continue
    if (r.pendingAreaGeneration) {
      // Unknown wins — short-circuit, return immediately.
      return { kind: 'unknown' }
    }
    if (r.destination) {
      const destArea = world.areas?.find((a) => a.id === r.destination!.areaId)
      if (destArea && (!foundKnown || distance < foundKnown.distance)) {
        foundKnown = { areaName: destArea.name, distance }
      }
    }
  }
  if (foundKnown) return { kind: 'known', areaName: foundKnown.areaName }
  return { kind: 'none' }
}

export interface PickNPCLineInput {
  npc: NPC
  /** Number of times the character has been greeted by this NPC
   *  before the current visit. 0 = brand new, 1 = met once already
   *  (this is the second meeting), and so on. */
  visitCount: number
  characterClassId: string
  characterSpeciesId: string
  frontier: FrontierState
}

/**
 * Picks the line the NPC says on this visit. Pure — no side effects.
 *
 * - First meeting (visitCount === 0): firstMeet, optionally prefixed
 *   with the class- or species-keyed hook. The hook is dropped if the
 *   NPC has nothing for the player's id (keeping silent feels natural).
 * - Subsequent meetings: frontier override if both available and
 *   relevant, otherwise rotate through `regular` indexed by visit.
 * - Empty `regular`: fall back to `firstMeet` so a player still gets
 *   *something* on later visits.
 */
export function pickNPCLine(input: PickNPCLineInput): string {
  const { npc, visitCount, characterClassId, characterSpeciesId, frontier } = input

  if (visitCount === 0) {
    const hookKey = npc.cares === 'class' ? characterClassId : characterSpeciesId
    const hook = npc.hooks[hookKey]
    return hook ? `${hook} ${npc.firstMeet}` : npc.firstMeet
  }

  if (frontier.kind === 'unknown' && npc.frontierUnknown) {
    return npc.frontierUnknown
  }
  if (frontier.kind === 'known' && npc.frontierKnown) {
    return npc.frontierKnown.replaceAll('{areaName}', frontier.areaName)
  }

  if (npc.regular.length > 0) {
    return npc.regular[(visitCount - 1) % npc.regular.length]
  }
  return npc.firstMeet
}

/** Computes the next interaction counter for an NPC. Encapsulates the
 *  "key + bump" so tick.ts doesn't have to thread the lookup through
 *  ad-hoc local helpers. */
export function bumpNPCInteractionCount(
  counts: Record<string, number> | undefined,
  areaId: string,
  npcId: string,
): { counts: Record<string, number>; visitCount: number } {
  const key = npcInteractionKey(areaId, npcId)
  const prev = counts?.[key] ?? 0
  return {
    counts: { ...(counts ?? {}), [key]: prev + 1 },
    visitCount: prev,
  }
}

/** Convenience: re-exports `roomKey` so callers wiring NPC line emission
 *  on room entry don't have to import from two places. */
export { roomKey }
