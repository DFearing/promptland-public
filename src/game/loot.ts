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
import type { Rng } from '../rng'
import { uuid } from '../util/uuid'
import type { WorldContent } from '../worlds'
import { biasEquipmentDrop } from './lootBias'
import { getItem } from './worldLookup'
import { computeInventoryWeight, weightCapacity } from './weight'

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

/** Context for the drop-bias layer — class / room name / world item
 *  pool — so a drop can be swapped for a class- or room-appropriate
 *  alternative. Absent ⇒ no bias (keeps curated/test paths honest). */
export interface DropBiasContext {
  classId?: string
  roomName?: string
  roomType?: RoomType
  worldItems: ItemDef[]
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

function rollRange(min: number, max: number, rng: Rng): number {
  if (max <= min) return min
  const span = max - min + 1
  return min + rng.nextInt(span)
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
export function rollCuratedLoot(curated: RoomCuratedLoot, ctx: RewardContext | undefined, rng: Rng): Drops {
  const mult = ctx ? combatRewardMult(ctx) : 1
  const baseGold = curated.gold
    ? Math.max(0, rollRange(curated.gold.min, curated.gold.max, rng))
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

export function rollLoot(
  mob: Mob,
  ctx: RewardContext | undefined,
  bias: DropBiasContext | undefined,
  world: WorldContent | undefined,
  rng: Rng,
): Drops {
  const mult = ctx ? combatRewardMult(ctx) : 1
  let gold = 0
  const items: DropItem[] = []
  // Curated-item gate: archetype loot tables shouldn't leak curated
  // items (legendary set-pieces) into the background pool, even if a
  // hardcoded mob table or an LLM-authored bespoke mob's table mis-
  // references one. Curated items only reach the player through per-
  // room curated-loot overrides (rollCuratedLoot). When a world is
  // provided we filter here; absent world (legacy callers) means no
  // filter, which matches prior behaviour.
  const curatedIds = world
    ? new Set(world.items.filter((i) => i.curated).map((i) => i.id))
    : null
  const rollOnce = () => {
    for (const entry of mob.loot ?? []) {
      // Scale item drop chance upward at high reward mults.
      const chanceBonus = mult >= 2.0 ? 0.2 : 0
      const dropRoll = rng.next()
      if (dropRoll > entry.chance + chanceBonus) continue
      if (entry.kind === 'gold') {
        gold += Math.round(rollRange(entry.min, entry.max, rng) * mult)
      } else {
        if (curatedIds?.has(entry.itemId)) continue
        const qty = rollRange(entry.min ?? 1, entry.max ?? 1, rng)
        if (qty > 0) {
          // Class + room-context bias layer. Curated drops (loot with an
          // explicit rarity/level) go through `rollCuratedLoot` and bypass
          // this — authored drops stay authored. Only ordinary mob-table
          // equipment / scroll drops get the class/context swap.
          const rolledId = bias
            ? biasEquipmentDrop(entry.itemId, bias, rng)
            : entry.itemId
          items.push({ itemId: rolledId, qty })
        }
      }
    }
  }
  rollOnce()
  // At very high reward mults, roll loot a second time for bonus drops.
  if (mult >= 3.0) rollOnce()
  return { gold, items }
}

// Rarity only rolls for equipment. Junk, consumables, and scrolls stay
// baseline — consumables and scrolls have their own progression axes
// (size / level) defined per-archetype. Exported so tick.ts can pre-roll
// each drop's rarity before the log line fires, keeping the log color in
// lockstep with the inventory item's actual rarity.
export function rollDropRarity(def: ItemDef, mobRarity: Rarity, rewardMult: number, rng: Rng): Rarity {
  if (def.kind !== 'equipment') return 'common'
  // Bias upward by the mob's own tier: stronger mobs drop better loot.
  let bias = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[]).indexOf(mobRarity)
  // Additional bias from the combined reward multiplier — rare mobs in rare
  // rooms in rare areas shift loot toward higher tiers.
  if (rewardMult >= 4.0) bias += 2.0
  else if (rewardMult >= 2.5) bias += 1.0
  else if (rewardMult >= 1.5) bias += 0.5
  return rollRarity(Math.max(0, bias), rng)
}

/**
 * Roll a level for a dropped item. Only equipment scales by mob level
 * with a small jitter (a level-5 mob can drop something between level 4
 * and 7). Junk, consumables, and scrolls stay at level 1 — consumables
 * derive their power from `size` and scrolls from their own archetype
 * `level` field, neither of which the per-drop level roll touches.
 */
function rollDropLevel(def: ItemDef, mobLevel: number, rng: Rng): number {
  if (def.kind !== 'equipment') return 1
  const jitter = rng.nextInt(4) - 1 // -1..2
  return Math.max(1, mobLevel + jitter)
}

/**
 * Merges an item into an inventory, stacking if the archetype + rarity +
 * level already exist and the def is stackable. Shared between live loot
 * drops and the dev panel's "give item" action so both paths can never
 * diverge on stacking rules.
 */
export function addItemToInventory(
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

/** Hard encumbrance cap as a multiple of the character's capacity.
 *  Soft threshold (capacity × 1.0) is what drives the weight drive;
 *  hard cap (× this multiplier) is the "absolutely can't fit another
 *  thing in the pack" ceiling. Beyond it, new drops are abandoned. */
const HARD_CAP_MULT = 2.0

export interface ApplyDropsResult {
  character: Character
  /** Items the character couldn't carry. Caller surfaces these as
   *  "leaves behind" log entries so the player sees what was lost. */
  abandoned: ItemDef[]
}

export function applyDrops(
  character: Character,
  world: WorldContent,
  drops: Drops,
  mob: Mob | undefined,
  context: { areaId?: string; roomName?: string } | undefined,
  rewardCtx: RewardContext | undefined,
  rng: Rng,
): ApplyDropsResult {
  // Encumbrance check uses the live inventory as the baseline; chest path
  // doesn't apply here, so the working inventory is just the character's.
  const resolved = resolveDrops(
    character,
    character.inventory,
    world,
    drops.items,
    mob,
    context,
    rewardCtx,
    rng,
  )
  // Merge resolved entries into the inventory, stacking against existing
  // entries the same way `addItemToInventory` would.
  let inventory = character.inventory
  let segment = character.segment
  for (const entry of resolved.entries) {
    const def = getItem(world, entry.archetypeId)
    if (!def) continue
    inventory = addItemToInventory(
      inventory,
      def,
      entry.quantity ?? 1,
      entry.rarity ?? 'common',
      entry.level ?? 1,
      entry.acquired ?? {
        at: Date.now(),
        source: 'mob',
        mobName: mob?.name,
        mobRarity: mob?.rarity,
        areaId: context?.areaId,
        roomName: context?.roomName,
      },
    )
    // Track best pickup for the current level segment.
    const baseValue = def.value ?? 0
    const scaledValue = Math.round(baseValue * rarityValueMult(entry.rarity ?? 'common'))
    const bestItem = betterItem(segment, {
      name: def.name,
      rarity: entry.rarity ?? 'common',
      value: scaledValue,
    })
    segment = segment
      ? { ...segment, bestItem }
      : { startedAt: character.createdAt, startGold: character.gold, bestItem }
  }
  return {
    character: {
      ...character,
      gold: character.gold + drops.gold,
      inventory,
      segment,
    },
    abandoned: resolved.abandoned,
  }
}

/** Resolves a list of `DropItem`s into fully-rolled `InventoryItem`
 *  entries WITHOUT mutating the character. Rolls rarity (when not
 *  pre-stamped), level, and acquisition metadata, and walks the
 *  encumbrance hard-cap exactly like the prior inline loop did. Items
 *  beyond the cap go to `abandoned`; everything else lands in
 *  `entries` (one entry per drop — stacking is the caller's job at
 *  inventory-merge time).
 *
 *  Encumbrance baseline is `existingInventory`, which lets the chest
 *  path pass `pack + already-in-chest` so a multi-kill chest can't
 *  sneak past the cap by spreading drops across kills.
 *
 *  Shared between `applyDrops` and `resolveChestDrops` so neither path
 *  can drift on level / rarity rolls or encumbrance accounting. */
function resolveDrops(
  character: Character,
  existingInventory: InventoryItem[],
  world: WorldContent,
  dropItems: readonly DropItem[],
  mob: Mob | undefined,
  context: { areaId?: string; roomName?: string } | undefined,
  rewardCtx: RewardContext | undefined,
  rng: Rng,
): { entries: InventoryItem[]; abandoned: ItemDef[] } {
  const entries: InventoryItem[] = []
  const abandoned: ItemDef[] = []
  const mobRarity: Rarity = mob?.rarity ?? 'common'
  const mobLevel = mob?.level ?? 1
  const rewardMult = rewardCtx ? combatRewardMult(rewardCtx) : 1
  const capacity = weightCapacity(character)
  const hardCap = capacity > 0 ? capacity * HARD_CAP_MULT : Infinity
  // Track running weight as a number so a multi-drop table cumulatively
  // pushes against the cap without rebuilding a working inventory each
  // iteration. Equipped weight is captured by `computeInventoryWeight`
  // when called against the existing pack — the equipped contribution
  // is constant across this loop, so a single starting baseline plus
  // per-drop addends matches `applyDrops`'s prior behaviour.
  let runningWeight = computeInventoryWeight(
    { ...character, inventory: existingInventory },
    world,
  )
  for (const drop of dropItems) {
    const def = getItem(world, drop.itemId)
    if (!def) continue
    const addWeight = (def.weight ?? 1) * drop.qty
    if (runningWeight + addWeight > hardCap) {
      abandoned.push(def)
      continue
    }
    runningWeight += addWeight
    const rarity = drop.rarity ?? rollDropRarity(def, mobRarity, rewardMult, rng)
    const level = drop.level ?? rollDropLevel(def, mobLevel, rng)
    const acquired: ItemAcquisition = {
      at: Date.now(),
      source: 'mob',
      mobName: mob?.name,
      mobRarity: mob?.rarity,
      areaId: context?.areaId,
      roomName: context?.roomName,
    }
    entries.push({
      id: uuid(),
      archetypeId: def.id,
      name: def.name,
      description: def.description,
      quantity: drop.qty,
      rarity,
      level,
      acquired,
    })
  }
  return { entries, abandoned }
}

/** Adds a chest's worth of pre-resolved entries into the character's
 *  inventory (stacking rules apply via `addItemToInventory`) and
 *  updates the segment's best-item tracker. Used at chest-unlock time.
 *  Gold is NOT touched here — caller adds it separately so callers can
 *  log the gold pickup as part of the unlock line. */
export function applyChestEntries(
  character: Character,
  world: WorldContent,
  entries: readonly InventoryItem[],
): Character {
  let inventory = character.inventory
  let segment = character.segment
  for (const entry of entries) {
    if (!entry.archetypeId) continue
    const def = getItem(world, entry.archetypeId)
    if (!def) continue
    const rarity = entry.rarity ?? 'common'
    const level = entry.level ?? 1
    const qty = entry.quantity ?? 1
    inventory = addItemToInventory(
      inventory,
      def,
      qty,
      rarity,
      level,
      entry.acquired ?? { at: Date.now(), source: 'mob' },
    )
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
  return { ...character, inventory, segment }
}

/** Resolves drops to entries for the chest queue without mutating the
 *  character's live inventory. Encumbrance check spans the character's
 *  pack PLUS items already in the chest, so a chest can't sneak past
 *  the hard cap by spreading drops across multiple kills.
 *
 *  Returns the resolved entries (ready to merge into the chest) and
 *  any abandoned `ItemDef`s for the standard "sacrifices to the road"
 *  log line. */
export function resolveChestDrops(
  character: Character,
  world: WorldContent,
  dropItems: readonly DropItem[],
  mob: Mob | undefined,
  context: { areaId?: string; roomName?: string } | undefined,
  rewardCtx: RewardContext | undefined,
  rng: Rng,
): { entries: InventoryItem[]; abandoned: ItemDef[] } {
  const inChest = character.lockedChest?.items ?? []
  const baseline = inChest.length > 0 ? [...character.inventory, ...inChest] : character.inventory
  return resolveDrops(character, baseline, world, dropItems, mob, context, rewardCtx, rng)
}
