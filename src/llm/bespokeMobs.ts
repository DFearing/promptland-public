import type { Rarity } from '../items'
import type { MobTemplate } from '../mobs'
import type { EntityCache, EntityCacheEntry, GenerationMeta } from '../storage/types'
import type { WorldContent } from '../worlds'
import { bespokeToItemDef, storeBespokeItem } from './bespokeItems'
import type {
  AreaGenBespokeMob,
  AreaGenCuratedItem,
  AreaGenCuratedLoot,
  AreaGenPayload,
} from './templates'

/** Template id for bespoke-mob entries in the entity cache. Scoped per
 *  world by the hash prefix `bespokeMob:${worldId}:${mobId}` so two
 *  worlds can accidentally use the same mob id without colliding. */
export const BESPOKE_MOB_TEMPLATE_ID = 'bespokeMob'

const hashOf = (worldId: string, mobId: string) =>
  `${BESPOKE_MOB_TEMPLATE_ID}:${worldId}:${mobId}`

/** Converts a validated AreaGenBespokeMob into a MobTemplate ready to
 *  sit in `world.mobs` alongside hardcoded archetypes. */
export function bespokeToTemplate(b: AreaGenBespokeMob): MobTemplate {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    maxHp: b.maxHp,
    attack: b.attack,
    defense: b.defense,
    xpReward: b.xpReward,
    level: b.level,
    ...(b.loot ? { loot: b.loot } : {}),
  }
}

/** Writes a bespoke mob to the entity cache. Keyed by (worldId, mobId)
 *  so repeated installs for the same id overwrite rather than duplicate. */
export async function storeBespokeMob(
  cache: EntityCache,
  worldId: string,
  mob: MobTemplate,
  meta: GenerationMeta,
): Promise<void> {
  const entry: EntityCacheEntry = {
    hash: hashOf(worldId, mob.id),
    kind: 'mob',
    createdAt: Date.now(),
    payload: mob,
    meta,
  }
  await cache.put(entry)
}

/** Strips loot entries that reference item ids the world doesn't know
 *  about — an item id can leak into a bespoke mob's loot table when the
 *  LLM hallucinates. Keeping the entry wouldn't crash (applyDrops skips
 *  unknown ids) but would confuse the log stream. */
function pruneUnknownItems(mob: MobTemplate, world: WorldContent): MobTemplate {
  if (!mob.loot || mob.loot.length === 0) return mob
  const itemIds = new Set(world.items.map((i) => i.id))
  const filtered = mob.loot.filter(
    (l) => l.kind === 'gold' || itemIds.has(l.itemId),
  )
  if (filtered.length === mob.loot.length) return mob
  return { ...mob, loot: filtered }
}

/**
 * Rehydrates all bespoke mobs for a world from the entity cache and
 * merges them into `world.mobs`, deduping by id. Hardcoded mobs always
 * win on id collision.
 *
 * Idempotent — call on every boot, safe to call multiple times.
 */
export async function rehydrateBespokeMobs(
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
): Promise<void> {
  const prefix = `${BESPOKE_MOB_TEMPLATE_ID}:${worldId}:`
  let entries: EntityCacheEntry[] = []
  try {
    entries = await cache.listByPrefix(prefix)
  } catch {
    return
  }
  if (entries.length === 0) return
  const existingIds = new Set(world.mobs.map((m) => m.id))
  for (const entry of entries) {
    const mob = entry.payload as MobTemplate | null
    if (!mob || !mob.id) continue
    if (existingIds.has(mob.id)) continue
    const pruned = pruneUnknownItems(mob, world)
    world.mobs.push(pruned)
    existingIds.add(pruned.id)
  }
}

/** Normalised curated item after bespoke-item install — by id only. */
export interface NormalisedCuratedItem {
  itemId: string
  rarity?: Rarity
  qty?: number
  level?: number
}

/** Normalised curated loot — always by-id after install. */
export interface NormalisedCuratedLoot {
  gold?: { min: number; max: number }
  items?: NormalisedCuratedItem[]
}

/** Normalised encounter shape after bespoke install — always by id. */
export interface NormalisedRoomEncounter {
  mobId: string
  rarity: Rarity
  firstOnly?: boolean
  loot?: NormalisedCuratedLoot
}

/** Payload shape after bespoke install — encounters are all by-id and
 *  any curated items are also by-id (bespoke items → installed). */
export interface NormalisedAreaPayload {
  id: string
  name: string
  description: string
  rooms: Array<{
    name: string
    description: string
    encounter?: NormalisedRoomEncounter
  }>
}

/**
 * Installs any bespoke items in a curated-loot block and returns a
 * normalised loot block (all items by id). Same collision rules as
 * bespoke mobs — existing world.items wins, cache write is
 * fire-and-forget.
 */
function installCuratedLoot(
  loot: AreaGenCuratedLoot,
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
  meta: GenerationMeta,
): NormalisedCuratedLoot {
  const out: NormalisedCuratedLoot = {}
  if (loot.gold) out.gold = loot.gold
  if (loot.items && loot.items.length > 0) {
    const items: NormalisedCuratedItem[] = []
    for (const raw of loot.items) {
      const normalised = installCuratedItem(raw, world, worldId, cache, meta)
      if (normalised) items.push(normalised)
    }
    if (items.length > 0) out.items = items
  }
  return out
}

function installCuratedItem(
  item: AreaGenCuratedItem,
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
  meta: GenerationMeta,
): NormalisedCuratedItem | null {
  const rarity = item.rarity ? { rarity: item.rarity } : {}
  const qty = typeof item.qty === 'number' ? { qty: item.qty } : {}
  const level = typeof item.level === 'number' ? { level: item.level } : {}
  if ('itemId' in item && typeof item.itemId === 'string') {
    return { itemId: item.itemId, ...rarity, ...qty, ...level }
  }
  if ('newItem' in item && item.newItem) {
    const b = item.newItem
    const existing = world.items.find((i) => i.id === b.id)
    if (!existing) {
      const def = bespokeToItemDef(b)
      world.items.push(def)
      void storeBespokeItem(cache, worldId, def, meta).catch(() => {})
    }
    return { itemId: b.id, ...rarity, ...qty, ...level }
  }
  return null
}

/**
 * Walks a raw area-gen payload, installs every bespoke `newMob` into
 * the world pool + entity cache, and returns a normalised payload in
 * which every encounter is the by-id variant. After this step the
 * payload is safe to feed into `payloadToArea`.
 *
 * Collisions (bespoke id already in `world.mobs`) are skipped — the
 * existing mob wins, the encounter is rewritten to reference it by id.
 */
export async function installBespokeMobsFromPayload(
  payload: AreaGenPayload,
  world: WorldContent,
  worldId: string,
  cache: EntityCache,
  meta: GenerationMeta,
): Promise<NormalisedAreaPayload> {
  const rooms = payload.rooms.map((r) => {
    const enc = r.encounter
    if (!enc) return { name: r.name, description: r.description }
    // Bespoke mobs' archetype loot tables (part of the mob payload
    // itself) are installed via pruneUnknownItems at `newMob` install
    // time. The curated per-room `loot` is a separate concept — it
    // lives on the encounter and replaces the archetype loot when the
    // curated mob is defeated. Both need to resolve bespoke items
    // before the payload is ready for persistence.
    const lootField = enc.loot
      ? { loot: installCuratedLoot(enc.loot, world, worldId, cache, meta) }
      : {}
    if ('mobId' in enc && typeof enc.mobId === 'string') {
      return {
        name: r.name,
        description: r.description,
        encounter: {
          mobId: enc.mobId,
          rarity: enc.rarity,
          ...(enc.firstOnly ? { firstOnly: enc.firstOnly } : {}),
          ...lootField,
        },
      }
    }
    if ('newMob' in enc && enc.newMob) {
      const b = enc.newMob
      const existing = world.mobs.find((m) => m.id === b.id)
      if (!existing) {
        const template = pruneUnknownItems(bespokeToTemplate(b), world)
        world.mobs.push(template)
        void storeBespokeMob(cache, worldId, template, meta).catch(() => {})
      }
      return {
        name: r.name,
        description: r.description,
        encounter: {
          mobId: b.id,
          rarity: enc.rarity,
          ...(enc.firstOnly ? { firstOnly: enc.firstOnly } : {}),
          ...lootField,
        },
      }
    }
    return { name: r.name, description: r.description }
  })

  return {
    id: payload.id,
    name: payload.name,
    description: payload.description,
    rooms,
  }
}
