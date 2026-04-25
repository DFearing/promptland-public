import type { ItemDef } from '../items'
import type { EntityCache, EntityCacheEntry, GenerationMeta } from '../storage/types'
import type { WorldContent } from '../worlds'
import type { AreaGenBespokeItem } from './templates'

/** Template id for bespoke-item entries in the entity cache. Scoped
 *  per world via the hash prefix `bespokeItem:${worldId}:${itemId}`. */
export const BESPOKE_ITEM_TEMPLATE_ID = 'bespokeItem'

const hashOf = (worldId: string, itemId: string) =>
  `${BESPOKE_ITEM_TEMPLATE_ID}:${worldId}:${itemId}`

/**
 * Converts a validated AreaGenBespokeItem into a world ItemDef.
 * Only `junk` and `equipment` kinds are produced — consumables and
 * scrolls need engine wiring (consume effects, spell ids) that the
 * LLM can't safely invent. The parser already rejects other kinds.
 */
export function bespokeToItemDef(b: AreaGenBespokeItem): ItemDef {
  if (b.kind === 'junk') {
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      kind: 'junk',
      ...(typeof b.value === 'number' ? { value: b.value } : {}),
      ...(typeof b.weight === 'number' ? { weight: b.weight } : {}),
      ...(typeof b.stackable === 'boolean' ? { stackable: b.stackable } : {}),
    }
  }
  // Equipment. Slot + bonuses are required; the parser rejects the
  // bespoke item if slot is missing. Bonuses may legitimately be empty
  // (a cosmetic-only equip) — default to {} so EquipmentArchetype is
  // satisfied without forcing the LLM to always emit bonuses.
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    kind: 'equipment',
    slot: b.slot!,
    bonuses: b.bonuses ?? {},
    ...(typeof b.value === 'number' ? { value: b.value } : {}),
    ...(typeof b.weight === 'number' ? { weight: b.weight } : {}),
    ...(typeof b.stackable === 'boolean' ? { stackable: b.stackable } : {}),
    ...(b.hands ? { hands: b.hands } : {}),
    ...(b.requirements ? { requirements: b.requirements } : {}),
  }
}

/** Writes a bespoke item to the entity cache. */
export async function storeBespokeItem(
  cache: EntityCache,
  worldId: string,
  item: ItemDef,
  meta: GenerationMeta,
): Promise<void> {
  const entry: EntityCacheEntry = {
    hash: hashOf(worldId, item.id),
    kind: 'item',
    createdAt: Date.now(),
    payload: item,
    meta,
  }
  await cache.put(entry)
}

/**
 * Rehydrates bespoke items for a world and merges into `world.items`,
 * deduping by id. Hardcoded items always win on id collision.
 *
 * Idempotent — safe to call on every boot.
 */
export async function rehydrateBespokeItems(
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
): Promise<void> {
  const prefix = `${BESPOKE_ITEM_TEMPLATE_ID}:${worldId}:`
  let entries: EntityCacheEntry[] = []
  try {
    entries = await cache.listByPrefix(prefix)
  } catch {
    return
  }
  if (entries.length === 0) return
  const existingIds = new Set(world.items.map((i) => i.id))
  for (const entry of entries) {
    const item = entry.payload as ItemDef | null
    if (!item || !item.id) continue
    if (existingIds.has(item.id)) continue
    world.items.push(item)
    existingIds.add(item.id)
  }
}
