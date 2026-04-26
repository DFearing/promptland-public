import { enforceAreaCaps, pruneDisconnectedRooms, type ShapeRoom } from '../areas'
import type { Area, NPC, Room, RoomEncounter } from '../areas/types'
import { roomKey } from '../areas/types'
import { isNPCFriendlyRoomType } from './templates'
import type { EntityCache, EntityCacheEntry, GenerationMeta } from '../storage/types'

/** Maximum number of LLM-generated areas per world. */
export const MAX_GENERATED_AREAS = 100

/** Shape returned by the LLM flavor-only pass. The LLM names and
 *  describes rooms in order against a pre-built shape; positions and
 *  types come from the shape, not the payload. Optional per-room
 *  `encounter` lets the LLM curate specific foes by mob id (Phase 1).
 *  Optional per-room `npc` adds a fixed flavor character whose
 *  dialogue is generated up-front and replayed on every visit. */
export interface GeneratedAreaPayload {
  id: string
  name: string
  description: string
  rooms: Array<{
    name: string
    description: string
    encounter?: RoomEncounter
    npc?: NPC
  }>
}

// Capitalises the first letter — used as a last-resort room name when
// the LLM returns fewer flavors than shape rooms. "chamber" → "Chamber".
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * Merges a pre-built shape with the LLM's flavor pass into a full Area.
 * The shape is authoritative for position and type; the payload provides
 * area name / description and per-room name / description, keyed by
 * index to the shape. When the LLM returns fewer entries than shape
 * rooms (prompt misinterpretation, truncation, etc.) the missing rooms
 * fall back to a capitalised type name and a generic description so
 * nothing is rendered as "undefined".
 */
export function payloadToArea(
  payload: GeneratedAreaPayload,
  shape: ShapeRoom[],
): Area {
  const rooms: Record<string, Room> = {}
  for (let i = 0; i < shape.length; i++) {
    const s = shape[i]
    const flavor = payload.rooms[i]
    const name = flavor?.name ?? capitalize(s.type)
    const description =
      flavor?.description ?? `An unremarkable ${s.type.replace(/_/g, ' ')}.`
    // Safe rooms are downtime hubs — drop any curated encounter the LLM
    // tried to pin to one. The gameplay engine already skips encounter
    // rolls on safe rooms, so a curated encounter there would just be
    // dead data.
    const encounter =
      s.type !== 'safe' && flavor?.encounter ? flavor.encounter : undefined
    // NPCs only ride along on welcoming room types — the prompt asks
    // for the same restriction, but the install pass enforces it so a
    // hallucinated NPC in a corridor or boss room can't slip through.
    const npc =
      flavor?.npc && isNPCFriendlyRoomType(s.type) ? flavor.npc : undefined
    rooms[roomKey(s.x, s.y, s.z)] = {
      x: s.x,
      y: s.y,
      z: s.z,
      type: s.type,
      name,
      description,
      ...(encounter ? { encounter } : {}),
      ...(npc ? { npc } : {}),
      // Exit rooms in generated areas are frontier exits — mark them as
      // pending so the tick loop triggers a fresh generation when the
      // player reaches them, enabling recursive exploration.
      ...(s.type === 'exit' ? { pendingAreaGeneration: true } : {}),
    }
  }
  const start = shape[0] ?? { x: 0, y: 0, z: 0 }
  const area: Area = {
    id: payload.id,
    name: payload.name,
    startX: start.x,
    startY: start.y,
    startZ: start.z,
    rooms,
  }
  // Shape-first generation already respects the caps (one-level grid,
  // ≤ 2 exit rooms), but run the enforcers anyway so the pipeline stays
  // robust if a shape template is extended later.
  return enforceAreaCaps(pruneDisconnectedRooms(area))
}

/** Template ID used for area-gen entries in the entity cache. */
export const AREA_GEN_TEMPLATE_ID = 'areaGen'

/** Loads all generated areas from the entity cache for a given world. */
export async function loadGeneratedAreas(
  cache: EntityCache,
  worldId: string,
): Promise<Area[]> {
  // EntityCache doesn't have a list-all method, so we scan by known keys
  // stored in the generatedAreaGraph. This function is called with the
  // graph keys from WorldContent at runtime.
  void cache
  void worldId
  return []
}

/** Counts area-gen entries by scanning the generatedAreaGraph. */
export function countGeneratedAreas(
  graph: Record<string, string> | undefined,
): number {
  if (!graph) return 0
  return new Set(Object.values(graph)).size
}

/** Stores a generated area in the entity cache with metadata.
 *  Also stamps the provenance (`generatedAt`, `createdBy`, `createdByModel`)
 *  directly onto the Area payload. Duplicates the entry-level `meta` by
 *  design: surfaces like the map's room index read straight from the Area
 *  (which is the object passed around the running session) and would
 *  otherwise have to plumb the cache `meta` everywhere. */
export async function storeGeneratedArea(
  cache: EntityCache,
  area: Area,
  worldId: string,
  meta: GenerationMeta,
): Promise<void> {
  const stamped: Area = {
    ...area,
    generatedAt: area.generatedAt ?? meta.generatedAt,
    createdBy: area.createdBy ?? meta.characterName,
    createdByModel: area.createdByModel ?? meta.modelId,
  }
  const entry: EntityCacheEntry = {
    hash: `${AREA_GEN_TEMPLATE_ID}:${worldId}:${stamped.id}`,
    kind: 'location',
    createdAt: Date.now(),
    payload: stamped,
    meta,
  }
  await cache.put(entry)
}
