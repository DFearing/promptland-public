import type { Area } from '../areas'
import { enforceAreaCaps, pruneDisconnectedRooms } from '../areas'
import type { EntityCache, GenerationMeta } from '../storage/types'
import type { WorldContent } from '../worlds'
import { AREA_GEN_TEMPLATE_ID } from './areaGen'

// Per-world localStorage key for the exit→area graph. The graph itself is
// small (one string per exit), but persisting it — rather than derived
// state — is what lets the app rehydrate cached generated areas on boot
// without scanning the entity cache (which has no list-all API).
const graphKey = (worldId: string) => `promptland.generatedAreaGraph.${worldId}`

export function loadGeneratedAreaGraph(worldId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(graphKey(worldId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveGeneratedAreaGraph(
  worldId: string,
  graph: Record<string, string>,
): void {
  try {
    localStorage.setItem(graphKey(worldId), JSON.stringify(graph))
  } catch {
    // localStorage unavailable / quota exceeded — ignore, the session
    // still works, the graph just won't survive reload.
  }
}

/**
 * Rehydrates generated areas for a world from the entity cache on boot.
 *
 * Reads the persisted graph (exit key → area id), fetches each referenced
 * area payload from the cache, pushes them onto `world.areas`, and re-wires
 * both directions of the portal: the source area's exit room points at the
 * generated area's start cell, and the generated area's start room is
 * flipped to a `portal` that leads back to the originating exit.
 *
 * Idempotent — areas already present by id are skipped, so calling it
 * repeatedly (e.g. on hot-reload) does not duplicate entries.
 */
export async function rehydrateGeneratedAreas(
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
): Promise<void> {
  // Two discovery sources, merged:
  //
  //   1. Prefix-scan the cache for `areaGen:${worldId}:*` entries. This
  //      catches every generated area, including ones created before the
  //      graph was being persisted (older sessions didn't save it).
  //   2. The persisted graph maps exit keys → area ids. It's the only
  //      way to re-wire the exit room's destination + the portal-back
  //      room, since the cached area payload doesn't carry its source.
  //
  // The tab just needs (1) to list the area; (2) layers on navigation
  // wiring when available.
  const prefix = `${AREA_GEN_TEMPLATE_ID}:${worldId}:`
  const byId: Record<string, Area> = {}
  // Entries that have no recoverable level (neither on the Area payload
  // nor in the GenerationMeta) predate the level stamp and can't be
  // tiered. Drop them — both from rehydration and from the cache itself
  // — so the Area tab doesn't carry an "Unknown" tier forever.
  const toDelete: string[] = []
  // pruneDisconnectedRooms fixes older cached areas where the LLM left
  // orphan rooms (e.g. a "Dark Caverns" island inside Forsaken Hollow)
  // that the map would otherwise render as unreachable clutter.
  const intake = (
    raw: Area,
    meta: GenerationMeta | undefined,
    hash: string,
  ) => {
    if (!raw.id) return
    const level = typeof raw.level === 'number' ? raw.level : meta?.characterLevel
    if (typeof level !== 'number') {
      toDelete.push(hash)
      return
    }
    const pruned = enforceAreaCaps(pruneDisconnectedRooms(raw))
    // Backfill provenance on older cached payloads that predate the
    // Area-level fields. `meta` is still authoritative in that case, so
    // the dev Area tab and the map's room index can always attribute a
    // generated area. Each field only fills in when the payload doesn't
    // already carry it, so new-format payloads keep their own stamp.
    const withProvenance: Area = {
      ...pruned,
      level: typeof pruned.level === 'number' ? pruned.level : level,
      generatedAt: pruned.generatedAt ?? meta?.generatedAt,
      createdBy: pruned.createdBy ?? meta?.characterName,
      createdByModel: pruned.createdByModel ?? meta?.modelId,
    }
    byId[raw.id] = withProvenance
  }
  try {
    const entries = await cache.listByPrefix(prefix)
    for (const entry of entries) {
      if (!entry.payload) continue
      intake(entry.payload as Area, entry.meta, entry.hash)
    }
  } catch {
    // Cache may not support listByPrefix in every impl — fall through to
    // the graph-driven point lookups below.
  }

  const graph = loadGeneratedAreaGraph(worldId)
  for (const areaId of new Set(Object.values(graph))) {
    if (byId[areaId]) continue
    const hash = `${prefix}${areaId}`
    const entry = await cache.get(hash)
    if (!entry || !entry.payload) continue
    intake(entry.payload as Area, entry.meta, hash)
  }

  // Fire-and-forget the actual cache deletes; they can't fail the boot.
  for (const hash of toDelete) {
    void cache.delete(hash).catch(() => {})
  }
  // Strip graph entries whose target area got dropped, and re-persist.
  if (toDelete.length > 0 && Object.keys(graph).length > 0) {
    const droppedIds = new Set(
      toDelete.map((h) => h.slice(prefix.length)),
    )
    const cleaned: Record<string, string> = {}
    let changed = false
    for (const [k, v] of Object.entries(graph)) {
      if (droppedIds.has(v)) {
        changed = true
        continue
      }
      cleaned[k] = v
    }
    if (changed) {
      for (const k of Object.keys(graph)) delete graph[k]
      Object.assign(graph, cleaned)
      saveGeneratedAreaGraph(worldId, cleaned)
    }
  }

  if (Object.keys(byId).length === 0) return

  const currentAreas = world.areas ?? [world.startingArea]
  const existingIds = new Set(currentAreas.map((a) => a.id))
  const nextAreas: Area[] = [...currentAreas]
  for (const area of Object.values(byId)) {
    if (!existingIds.has(area.id)) {
      nextAreas.push(area)
      existingIds.add(area.id)
    }
  }
  world.areas = nextAreas

  for (const [exitKey, destAreaId] of Object.entries(graph)) {
    const area = byId[destAreaId]
    if (!area) continue
    const [srcAreaId, coords] = exitKey.split('::')
    if (!srcAreaId || !coords) continue
    const srcArea = world.areas.find((a) => a.id === srcAreaId)
    if (!srcArea) continue
    const exitRoom = srcArea.rooms[coords]
    // Skip destination wiring for permanent frontier exits — they must
    // stay un-wired so each visit triggers a fresh LLM generation.
    if (exitRoom && !exitRoom.permanentFrontier) {
      exitRoom.destination = {
        areaId: area.id,
        x: area.startX,
        y: area.startY,
        z: area.startZ,
      }
      exitRoom.pendingAreaGeneration = false
    }
    const startKey = `${area.startX},${area.startY},${area.startZ}`
    const startRoom = area.rooms[startKey]
    if (startRoom) {
      startRoom.type = 'portal'
      const [rx, ry, rz] = coords.split(',').map(Number)
      startRoom.destination = { areaId: srcAreaId, x: rx, y: ry, z: rz }
    }
  }

  if (Object.keys(graph).length > 0) {
    world.generatedAreaGraph = graph
  }
}
