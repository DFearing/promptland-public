import type { Character, InventoryItem, ItemAcquisition, LevelSegment } from '../character'
import {
  RARITIES,
  rarityValueMult,
  rollRarity,
  type ItemDef,
  type Rarity,
} from '../items'
import type { Mob } from '../mobs'
import { uuid } from '../util/uuid'
import type { WorldContent } from '../worlds'

function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r)
}

// Returns the new best item for the segment — either the incoming item
// (if it's a stronger keepsake) or the existing one.
function betterItem(
  segment: LevelSegment | undefined,
  candidate: { name: string; rarity: Rarity; value: number },
): LevelSegment['bestItem'] {
  const existing = segment?.bestItem
  if (!existing) return candidate
  const candRank = rarityRank(candidate.rarity)
  const currRank = rarityRank(existing.rarity)
  if (candRank > currRank) return candidate
  if (candRank < currRank) return existing
  return candidate.value > existing.value ? candidate : existing
}

export interface Drops {
  gold: number
  items: { itemId: string; qty: number }[]
}

function rollRange(min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function rollLoot(mob: Mob): Drops {
  let gold = 0
  const items: { itemId: string; qty: number }[] = []
  for (const entry of mob.loot ?? []) {
    if (Math.random() > entry.chance) continue
    if (entry.kind === 'gold') {
      gold += rollRange(entry.min, entry.max)
    } else {
      const qty = rollRange(entry.min ?? 1, entry.max ?? 1)
      if (qty > 0) items.push({ itemId: entry.itemId, qty })
    }
  }
  return { gold, items }
}

// Rarity only rolls for equipment and scrolls. Junk & consumables stay baseline
// to avoid log-clutter on small drops.
function rollDropRarity(def: ItemDef, mobRarity: Rarity): Rarity {
  if (def.kind !== 'equipment' && def.kind !== 'scroll') return 'common'
  // Bias upward by the mob's own tier: stronger mobs drop better loot.
  const bias = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[]).indexOf(mobRarity)
  return rollRarity(Math.max(0, bias))
}

/**
 * Roll a level for a dropped item. Equipment/scrolls scale by mob level
 * with a small jitter so a level-5 mob can drop something between level 4
 * and level 7. Junk and consumables stay at level 1 — a "level 3 rat tail"
 * is more confusing than useful.
 */
function rollDropLevel(def: ItemDef, mobLevel: number): number {
  if (def.kind !== 'equipment' && def.kind !== 'scroll') return 1
  const jitter = Math.floor(Math.random() * 4) - 1 // -1..2
  return Math.max(1, mobLevel + jitter)
}

function addItem(
  inventory: InventoryItem[],
  def: ItemDef,
  qty: number,
  rarity: Rarity,
  level: number,
  acquired: ItemAcquisition,
): InventoryItem[] {
  if (def.stackable) {
    // Same archetype + same rarity + same level stack. A level-5 vs level-6
    // legendary scroll are still distinct because their stats differ.
    const idx = inventory.findIndex(
      (i) =>
        i.archetypeId === def.id &&
        (i.rarity ?? 'common') === rarity &&
        (i.level ?? 1) === level,
    )
    if (idx >= 0) {
      const existing = inventory[idx]
      const updated: InventoryItem = {
        ...existing,
        quantity: (existing.quantity ?? 1) + qty,
      }
      return inventory.map((v, i) => (i === idx ? updated : v))
    }
  }
  return [
    ...inventory,
    {
      id: uuid(),
      archetypeId: def.id,
      name: def.name,
      description: def.description,
      quantity: qty,
      rarity,
      level,
      acquired,
    },
  ]
}

export function applyDrops(
  character: Character,
  world: WorldContent,
  drops: Drops,
  mob?: Mob,
  context?: { areaId?: string; roomName?: string },
): Character {
  let inventory = character.inventory
  let segment = character.segment
  const mobRarity: Rarity = mob?.rarity ?? 'common'
  const mobLevel = mob?.level ?? 1
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    const rarity = rollDropRarity(def, mobRarity)
    const level = rollDropLevel(def, mobLevel)
    const acquired: ItemAcquisition = {
      at: Date.now(),
      source: 'mob',
      mobName: mob?.name,
      mobRarity: mob?.rarity,
      areaId: context?.areaId,
      roomName: context?.roomName,
    }
    inventory = addItem(inventory, def, drop.qty, rarity, level, acquired)
    // Track best pickup for the current level segment.
    const baseValue = def.value ?? 0
    const scaledValue = Math.round(baseValue * rarityValueMult(rarity))
    const bestItem = betterItem(segment, {
      name: def.name,
      rarity,
      value: scaledValue,
    })
    segment = segment
      ? { ...segment, bestItem }
      : { startedAt: character.createdAt, startGold: character.gold, bestItem }
  }
  return {
    ...character,
    gold: character.gold + drops.gold,
    inventory,
    segment,
  }
}
