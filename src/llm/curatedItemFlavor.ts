import type { ItemDef } from '../items'
import type { EntityCache, EntityCacheEntry, GenerationMeta } from '../storage/types'

/**
 * Bespoke-description generation for curated items on first drop.
 *
 * Design mirrors the bespoke-mob / bespoke-item flow: the world ships a
 * curated item's seed lore hook as its hardcoded `description`, and the
 * first time the player actually picks one up we ask the LLM to expand
 * that hook into a longer, character-flavored description — then cache
 * the result keyed by (worldId, itemId) so subsequent drops of the same
 * artifact read the same way every time.
 *
 * This module is the cache + call-site seam. The actual LLM prompt
 * template + client wiring is deliberately left as a TODO — the
 * infrastructure (entity-cache bucket, rehydrate hook, first-drop
 * detection) is in place so the LLM layer is drop-in later.
 */

/** Template id for curated-item flavor entries in the entity cache.
 *  Scoped per world via the hash prefix
 *  `curatedItemFlavor:${worldId}:${itemId}`. */
export const CURATED_ITEM_FLAVOR_TEMPLATE_ID = 'curatedItemFlavor'

const hashOf = (worldId: string, itemId: string) =>
  `${CURATED_ITEM_FLAVOR_TEMPLATE_ID}:${worldId}:${itemId}`

export interface CuratedItemFlavor {
  /** Item archetype id this flavor expands. */
  itemId: string
  /** LLM-expanded description. Replaces the hardcoded seed on drop. */
  description: string
}

/**
 * Read a cached bespoke description for a curated item. Returns
 * `undefined` if the LLM hasn't produced one yet (or if the cache is
 * unavailable). Callers should fall back to the hardcoded
 * `ItemDef.description` when this returns undefined.
 */
export async function getCuratedItemFlavor(
  cache: EntityCache,
  worldId: string,
  itemId: string,
): Promise<CuratedItemFlavor | undefined> {
  try {
    const entry = await cache.get(hashOf(worldId, itemId))
    if (!entry) return undefined
    const payload = entry.payload as CuratedItemFlavor | null
    if (!payload || typeof payload.description !== 'string') return undefined
    return payload
  } catch {
    return undefined
  }
}

/**
 * Persist a generated bespoke description for a curated item. Keyed by
 * (worldId, itemId) so repeated generations overwrite rather than
 * duplicate.
 */
export async function storeCuratedItemFlavor(
  cache: EntityCache,
  worldId: string,
  flavor: CuratedItemFlavor,
  meta: GenerationMeta,
): Promise<void> {
  const entry: EntityCacheEntry = {
    hash: hashOf(worldId, flavor.itemId),
    kind: 'item',
    createdAt: Date.now(),
    payload: flavor,
    meta,
  }
  await cache.put(entry)
}

/**
 * First-drop hook for a curated item. Fire-and-forget: runs in the
 * background, doesn't block the tick. If the LLM integration isn't
 * wired yet this is a no-op — the cached flavor stays absent and the
 * hardcoded `ItemDef.description` keeps showing. Once the LLM layer
 * lands, implement `generateCuratedItemFlavor` below to call the
 * generate pipeline and persist via `storeCuratedItemFlavor`.
 *
 * Called from the loot path on the first-ever drop of a curated item
 * for the current character, so re-drops of the same artifact don't
 * re-trigger generation.
 */
export function requestCuratedItemFlavor(
  cache: EntityCache,
  worldId: string,
  item: ItemDef,
): void {
  // TODO(llm): when the curated-item flavor prompt + client wiring is
  // in, replace this no-op with a fire-and-forget call:
  //   void generateCuratedItemFlavor(cache, worldId, item).catch(() => {})
  // The generate function should:
  //   1. Check `getCuratedItemFlavor` — skip if cached.
  //   2. Prompt the LLM with the item's seed description + the world's
  //      tone hints (from the world manifest).
  //   3. Persist via `storeCuratedItemFlavor` with a proper
  //      GenerationMeta.
  // Keeping this as a stub today so the schema + cache plumbing ship
  // now and the LLM layer is a drop-in later.
  //
  // Parameters are referenced here so the stub compiles clean under
  // strict lint rules without an ignore directive.
  void cache
  void worldId
  void item
}
