import type { RoomCuratedLoot, RoomType } from '../areas/types'
import type { Character, InventoryItem, ItemAcquisition, LevelSegment } from '../character'
import {
  RARITIES,
  rarityStatMult,
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

// Room-type reward multipliers — dangerous rooms pay more.
const ROOM_TYPE_REWARD: Partial<Record<RoomType, number>> = {
  crypt: 1.4,
  chamber: 1.3,
  storage: 1.2,
}

function roomTypeRewardMult(roomType: RoomType | undefined): number {
  if (!roomType) return 1.0
  return ROOM_TYPE_REWARD[roomType] ?? 1.0
}

/** Context passed into loot functions so rewards can scale by environment. */
export interface RewardContext {
  mobRarity: Rarity
  mobLevel: number
  roomType?: RoomType
  areaRarity?: Rarity
}

/**
 * Combined reward multiplier for a combat encounter. Accounts for mob rarity,
 * room danger, area rarity, and mob level. Used to scale gold drops and bias
 * item rarity rolls.
 */
export function combatRewardMult(ctx: RewardContext): number {
  const mobMult = rarityStatMult(ctx.mobRarity)
  const roomMult = roomTypeRewardMult(ctx.roomType)
  const areaMult = rarityStatMult(ctx.areaRarity ?? 'common')
  const levelMult = 1 + ctx.mobLevel * 0.1
  return mobMult * roomMult * areaMult * levelMult
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
  items: DropItem[]
}

export interface DropItem {
  itemId: string
  qty: number
  /** Explicit rarity override (curated drops). Absent ⇒ `applyDrops`
   *  rolls the usual way. */
  rarity?: Rarity
  /** Explicit level override (curated drops). Absent ⇒ `applyDrops`
   *  rolls around the mob's level. */
  level?: number
}

function rollRange(min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * Curated-loot roll for rooms with a `RoomEncounter.loot` override.
 * Gold rolls a flat range (no chance gate — curated means guaranteed)
 * AND scales by `combatRewardMult` so a rare curated encounter in a
 * level-7 room pays more than the same encounter in a level-1 area.
 *
 * Items drop at their explicit qty, with the author's rarity and level
 * as a floor that `reward-scaling` can bump upward (never downward) —
 * Phase 4 polish. An item with explicit level=5 in a rewardMult=2 area
 * lands around level 7; rarity bumps only at extreme mults (≥3.0) so
 * author intent is respected in normal play.
 */
export function rollCuratedLoot(curated: RoomCuratedLoot, ctx?: RewardContext): Drops {
  const mult = ctx ? combatRewardMult(ctx) : 1
  const baseGold = curated.gold
    ? Math.max(0, rollRange(curated.gold.min, curated.gold.max))
    : 0
  const gold = Math.round(baseGold * mult)
  const items: DropItem[] = (curated.items ?? [])
    .filter((i) => (i.qty ?? 1) > 0)
    .map((i) => {
      const drop: DropItem = {
        itemId: i.itemId,
        qty: i.qty ?? 1,
      }
      if (typeof i.level === 'number') {
        drop.level = scaleCuratedLevel(i.level, mult)
      }
      if (i.rarity) {
        drop.rarity = bumpCuratedRarity(i.rarity, mult)
      }
      return drop
    })
  return { gold, items }
}

/**
 * Scales a curated item's explicit level upward by a soft curve of the
 * reward mult. `sqrt(mult)` keeps the bump gentle — at rewardMult=2
 * the floor rises by ~40%, at rewardMult=4 it doubles. Never lowers
 * the author's floor, which matters because some bespoke items are
 * pinned to a specific level for balance reasons.
 */
function scaleCuratedLevel(baseLevel: number, mult: number): number {
  if (mult <= 1) return baseLevel
  const scaled = Math.round(baseLevel * Math.sqrt(mult))
  return Math.max(baseLevel, scaled)
}

/**
 * Nudges a curated rarity up one tier at very high reward multipliers.
 * Below 3.0 mult (which is already "stronger than rare mob in a rare
 * room in a rare area") the author's pick stands. At or above, one
 * tier bump; legendary caps out.
 */
function bumpCuratedRarity(rarity: Rarity, mult: number): Rarity {
  if (mult < 3.0) return rarity
  const idx = RARITIES.indexOf(rarity)
  if (idx < 0) return rarity
  return RARITIES[Math.min(RARITIES.length - 1, idx + 1)]
}

export function rollLoot(mob: Mob, ctx?: RewardContext): Drops {
  const mult = ctx ? combatRewardMult(ctx) : 1
  let gold = 0
  const items: DropItem[] = []
  const rollOnce = () => {
    for (const entry of mob.loot ?? []) {
      // Scale item drop chance upward at high reward mults.
      const chanceBonus = mult >= 2.0 ? 0.2 : 0
      if (Math.random() > entry.chance + chanceBonus) continue
      if (entry.kind === 'gold') {
        gold += Math.round(rollRange(entry.min, entry.max) * mult)
      } else {
        const qty = rollRange(entry.min ?? 1, entry.max ?? 1)
        if (qty > 0) items.push({ itemId: entry.itemId, qty })
      }
    }
  }
  rollOnce()
  // At very high reward mults, roll loot a second time for bonus drops.
  if (mult >= 3.0) rollOnce()
  return { gold, items }
}

// Rarity only rolls for equipment and scrolls. Junk & consumables stay baseline
// to avoid log-clutter on small drops.
function rollDropRarity(def: ItemDef, mobRarity: Rarity, rewardMult = 1): Rarity {
  if (def.kind !== 'equipment' && def.kind !== 'scroll') return 'common'
  // Bias upward by the mob's own tier: stronger mobs drop better loot.
  let bias = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[]).indexOf(mobRarity)
  // Additional bias from the combined reward multiplier — rare mobs in rare
  // rooms in rare areas shift loot toward higher tiers.
  if (rewardMult >= 4.0) bias += 2.0
  else if (rewardMult >= 2.5) bias += 1.0
  else if (rewardMult >= 1.5) bias += 0.5
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
  rewardCtx?: RewardContext,
): Character {
  let inventory = character.inventory
  let segment = character.segment
  const mobRarity: Rarity = mob?.rarity ?? 'common'
  const mobLevel = mob?.level ?? 1
  const rewardMult = rewardCtx ? combatRewardMult(rewardCtx) : 1
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    // Curated drops (drop.rarity / drop.level set) skip the rarity /
    // level rolls — they're authored or LLM-picked to land at an exact
    // tier. Plain drops roll the usual way.
    const rarity = drop.rarity ?? rollDropRarity(def, mobRarity, rewardMult)
    const level = drop.level ?? rollDropLevel(def, mobLevel)
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
