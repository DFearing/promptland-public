import type { Character, InventoryItem } from '../character'
import { conditionStatMods } from '../conditions'
import { meetsRequirements, scaledRequirements, rarityStatMult, type EquipBonuses, type EquipmentArchetype, type EquipSlot } from '../items'
import type { LogEntry } from '../log'
import type { WorldContent } from '../worlds'
import { getItem } from './worldLookup'

function equipmentOf(
  item: InventoryItem,
  world: WorldContent,
): EquipmentArchetype | null {
  const def = getItem(world, item.archetypeId)
  if (!def || def.kind !== 'equipment') return null
  return def
}

const BONUS_KEYS: (keyof EquipBonuses)[] = [
  'attack',
  'defense',
  'magicAttack',
  'magicDefense',
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]

function sumBonuses(b: EquipBonuses): number {
  // Summed for weapon-candidate ranking only — attack + defense is the
  // historic "how good is this weapon for fighting" heuristic. Per-stat
  // bonuses weigh equally here since they all become power eventually.
  let total = 0
  for (const k of BONUS_KEYS) total += b[k] ?? 0
  return total
}

/**
 * Per-stat scaling rule:
 *   baseAtLevel  = round(base × (1 + 0.5 × (level − 1)))   ─ each item level
 *                                                            adds 50 % of the
 *                                                            archetype base
 *   rarityBonus  = round(base × (rarityStatMult − 1))      ─ rarity adds a
 *                                                            flat bonus on top
 *   total        = baseAtLevel + rarityBonus
 *
 * Result: a legendary level-1 sword has mostly rarity-driven stats; a common
 * level-10 sword has mostly level-driven stats; a legendary level-10 sword
 * stacks both.
 */
function scaledBonuses(
  raw: EquipBonuses,
  mult: number,
  level: number,
): EquipBonuses {
  const out: EquipBonuses = {}
  const safeLevel = Math.max(1, level)
  const levelFactor = 1 + 0.5 * (safeLevel - 1)
  const rarityDelta = Math.max(0, mult - 1)
  for (const k of BONUS_KEYS) {
    const base = raw[k]
    if (!base) continue
    const baseAtLevel = Math.max(0, Math.round(base * levelFactor))
    const rarityBonus = Math.max(0, Math.round(base * rarityDelta))
    const total = baseAtLevel + rarityBonus
    if (total > 0) out[k] = total
  }
  // Buff-slot fractions (hungerSlow, restBoost) scale on a softer curve —
  // they're already percentages, so linear item-level scaling would push
  // them past 100 % quickly. Instead, light level-scaling (× 1.05 per level
  // past 1) + flat rarity delta.
  const fractionalLevelFactor = 1 + 0.05 * (safeLevel - 1)
  if (raw.hungerSlow) {
    out.hungerSlow = raw.hungerSlow * fractionalLevelFactor * mult
  }
  if (raw.restBoost) {
    out.restBoost = raw.restBoost * fractionalLevelFactor * mult
  }
  return out
}

export function equipBonusesFor(
  item: InventoryItem | undefined,
  world: WorldContent,
): EquipBonuses {
  if (!item) return {}
  const eq = equipmentOf(item, world)
  if (!eq) return {}
  const mult = rarityStatMult(item.rarity ?? 'common')
  return scaledBonuses(eq.bonuses, mult, item.level ?? 1)
}

export type BonusKey = keyof EquipBonuses

export interface BonusSource {
  /** Human-readable name of the contributor (item name or condition name). */
  name: string
  /** Positive integer contribution to the stat. Scaled by rarity for items. */
  value: number
  /** Human-readable wear slot label ("Head", "Ring I", "Off Hand"), when the
   *  source is an equipped item. Omitted for non-item sources like stat-mod
   *  conditions. Rendered as "Name (Slot)" in the bonus popover so the user
   *  can see where each contribution is coming from at a glance. */
  slot?: string
}

export interface BonusBreakdown {
  /** Running sum across all sources. */
  total: number
  sources: BonusSource[]
}

// Returns a per-stat breakdown (total + contributing items/conditions) that
// the sheet UI uses to render "X (+Y)" and an on-demand popover of who is
// pushing the number up. Only bonuses > 0 show up as sources; zero-valued
// slots are omitted so the list stays tight.
export function bonusBreakdowns(
  character: Character,
  world: WorldContent,
): Record<BonusKey, BonusBreakdown> {
  const out = {} as Record<BonusKey, BonusBreakdown>
  for (const key of BONUS_KEYS) out[key] = { total: 0, sources: [] }

  const add = (name: string, bonuses: EquipBonuses, slot?: string) => {
    for (const key of BONUS_KEYS) {
      const value = bonuses[key] ?? 0
      if (value === 0) continue
      out[key].total += value
      out[key].sources.push({ name, value, slot })
    }
  }

  const eq = character.equipped
  // Walk every wear slot — simple slots + both weapon hands + both rings.
  // Slot labels here must match the InventoryPanel's slot labels so the
  // popover reads as a natural mirror of the equipped list. "Weapon" covers
  // both one- and two-handed main-hand; Off Hand is its own slot.
  const worn: Array<[InventoryItem | undefined, string]> = [
    [eq.weapon, 'Weapon'],
    [eq.offhand, 'Off Hand'],
    [eq.armor, 'Torso'],
    [eq.head, 'Head'],
    [eq.arms, 'Arms'],
    [eq.hands, 'Hands'],
    [eq.legs, 'Legs'],
    [eq.feet, 'Feet'],
    [eq.cape, 'Cape'],
    [eq.amulet, 'Amulet'],
    [eq.ring1, 'Ring I'],
    [eq.ring2, 'Ring II'],
  ]
  for (const [item, slot] of worn) {
    if (item) add(item.name, equipBonusesFor(item, world), slot)
  }

  // stat-mod conditions currently only carry attack/defense, but the shape
  // of EquipBonuses is a superset — passing them through keeps one path.
  const cond = conditionStatMods(character, world)
  const condBonuses: EquipBonuses = {
    attack: cond.attack,
    defense: cond.defense,
  }
  // Attribute the condition deltas to each active stat-mod condition by name
  // so the popover actually tells the user why they're buffed.
  for (const active of character.conditions ?? []) {
    const def = world.conditions.find((c) => c.id === active.id)
    if (!def || def.kind !== 'stat-mod') continue
    const contribution: EquipBonuses = {
      attack: def.params.attack ?? 0,
      defense: def.params.defense ?? 0,
    }
    add(def.name, contribution)
  }
  // Guard against double-counting — the per-condition loop above already
  // pushed every stat-mod condition's attack/defense into the totals; bail
  // without touching condBonuses so it just stays for potential future use.
  void condBonuses

  return out
}

export function combatBonuses(
  character: Character,
  world: WorldContent,
): EquipBonuses {
  let attack = 0
  let defense = 0
  let magicAttack = 0
  let magicDefense = 0
  const eq = character.equipped
  const worn: Array<InventoryItem | undefined> = [
    eq.weapon,
    eq.offhand,
    eq.armor,
    eq.head,
    eq.arms,
    eq.hands,
    eq.legs,
    eq.feet,
    eq.cape,
    eq.amulet,
    eq.ring1,
    eq.ring2,
  ]
  for (const item of worn) {
    const b = equipBonusesFor(item, world)
    attack += b.attack ?? 0
    defense += b.defense ?? 0
    magicAttack += b.magicAttack ?? 0
    magicDefense += b.magicDefense ?? 0
  }
  const cond = conditionStatMods(character, world)
  return {
    attack: attack + cond.attack,
    defense: defense + cond.defense,
    magicAttack,
    magicDefense,
  }
}

/**
 * Sums the hunger-slow and rest-boost multipliers from every equipped item.
 * Both are bounded:
 *   - hungerSlow: capped at 0.9 so hunger never fully stops
 *   - restBoost: capped at 1.5 (3.5× recovery) so a fully-kitted rest
 *                doesn't trivialize exploration
 * Returned values feed directly into the tick.ts hunger/rest formulas.
 */
export function buffMultipliers(
  character: Character,
  world: WorldContent,
): { hungerSlow: number; restBoost: number } {
  let hungerSlow = 0
  let restBoost = 0
  const eq = character.equipped
  const worn: Array<InventoryItem | undefined> = [
    eq.weapon,
    eq.offhand,
    eq.armor,
    eq.head,
    eq.arms,
    eq.hands,
    eq.legs,
    eq.feet,
    eq.cape,
    eq.amulet,
    eq.ring1,
    eq.ring2,
  ]
  for (const item of worn) {
    const b = equipBonusesFor(item, world)
    hungerSlow += b.hungerSlow ?? 0
    restBoost += b.restBoost ?? 0
  }
  return {
    hungerSlow: Math.min(0.9, Math.max(0, hungerSlow)),
    restBoost: Math.min(1.5, Math.max(0, restBoost)),
  }
}

/**
 * Wear-slot on the character (what slot of `Equipped` the item occupies).
 * Mostly 1:1 with EquipSlot, but:
 *   - 'weapon' archetypes can land in either `weapon` (main) or `offhand`
 *   - 'ring' archetypes can land in `ring1` or `ring2`
 */
export type EquipEventSlot =
  | EquipSlot
  | 'offhand'
  | 'ring1'
  | 'ring2'

/** Slots on Equipped that correspond 1:1 to a single-item EquipSlot. */
type SimpleSlot =
  | 'armor'
  | 'head'
  | 'arms'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'cape'
  | 'amulet'

const SIMPLE_SLOTS: readonly SimpleSlot[] = [
  'armor',
  'head',
  'arms',
  'hands',
  'legs',
  'feet',
  'cape',
  'amulet',
] as const

export interface EquipEvent {
  slot: EquipEventSlot
  itemName: string
  /** Archetype id of the newly-equipped item — populated when the item came
   *  from a world archetype so the log can render a clickable [Bracket]. */
  itemId?: string
  itemRarity?: InventoryItem['rarity']
  replaced?: string
  replacedId?: string
  replacedRarity?: InventoryItem['rarity']
}

/** Returns true when the character satisfies the (rarity-scaled) requirements
 *  of the given equipment archetype. Items without requirements always pass. */
function charMeetsItemReqs(
  character: Character,
  item: InventoryItem,
  eq: EquipmentArchetype,
): boolean {
  const reqs = scaledRequirements(eq.requirements, item.rarity ?? 'common')
  return meetsRequirements(reqs, {
    level: character.level,
    strength: character.stats.strength,
    dexterity: character.stats.dexterity,
    intelligence: character.stats.intelligence,
    wisdom: character.stats.wisdom,
  })
}

type Candidate = { item: InventoryItem; sum: number; hands: 1 | 2; source: 'inv' | 'eq-w' | 'eq-o' }

function weaponCandidates(
  inventory: InventoryItem[],
  equippedWeapon: InventoryItem | undefined,
  equippedOffhand: InventoryItem | undefined,
  world: WorldContent,
  character?: Character,
): Candidate[] {
  const out: Candidate[] = []
  const push = (item: InventoryItem, source: Candidate['source']) => {
    const eq = equipmentOf(item, world)
    if (!eq || eq.slot !== 'weapon') return
    if (character && !charMeetsItemReqs(character, item, eq)) return
    const hands: 1 | 2 = eq.hands === 2 ? 2 : 1
    out.push({ item, sum: sumBonuses(equipBonusesFor(item, world)), hands, source })
  }
  for (const inv of inventory) push(inv, 'inv')
  if (equippedWeapon) push(equippedWeapon, 'eq-w')
  if (equippedOffhand) push(equippedOffhand, 'eq-o')
  return out
}

/**
 * Picks the best in-inventory item for a simple (1-per-slot) equipment slot,
 * compared to whatever is currently worn. Returns a swap if a better pick
 * exists, otherwise null.
 */
function pickBestForSlot(
  inventory: InventoryItem[],
  currentlyWorn: InventoryItem | undefined,
  slot: EquipSlot,
  world: WorldContent,
  character?: Character,
): { item: InventoryItem; inventoryAfter: InventoryItem[] } | null {
  type Option = { item: InventoryItem; sum: number; fromInventory: boolean }
  const options: Option[] = []
  for (const inv of inventory) {
    const eq = equipmentOf(inv, world)
    if (!eq || eq.slot !== slot) continue
    if (character && !charMeetsItemReqs(character, inv, eq)) continue
    options.push({
      item: inv,
      sum: sumBonuses(equipBonusesFor(inv, world)),
      fromInventory: true,
    })
  }
  if (currentlyWorn) {
    options.push({
      item: currentlyWorn,
      sum: sumBonuses(equipBonusesFor(currentlyWorn, world)),
      fromInventory: false,
    })
  }
  if (options.length === 0) return null
  const best = options.reduce((a, b) => (b.sum > a.sum ? b : a))
  // Already wearing the best? No change.
  if (!best.fromInventory) return null
  const inventoryAfter = inventory.filter((i) => i.id !== best.item.id)
  const withReplaced = currentlyWorn ? [...inventoryAfter, currentlyWorn] : inventoryAfter
  return { item: best.item, inventoryAfter: withReplaced }
}

/**
 * Ring-specific autoequip. Considers the two ring slots together: picks the
 * top two 'ring'-slot items from (inventory + currently worn) and assigns
 * them to ring1 / ring2 in descending order.
 */
function resolveRings(
  inventory: InventoryItem[],
  ring1: InventoryItem | undefined,
  ring2: InventoryItem | undefined,
  world: WorldContent,
  character?: Character,
): {
  inventoryAfter: InventoryItem[]
  ring1: InventoryItem | undefined
  ring2: InventoryItem | undefined
  events: EquipEvent[]
} {
  type RingOption = { item: InventoryItem; sum: number }
  const all: RingOption[] = []
  const consider = (item: InventoryItem | undefined) => {
    if (!item) return
    const eq = equipmentOf(item, world)
    if (!eq || eq.slot !== 'ring') return
    if (character && !charMeetsItemReqs(character, item, eq)) return
    all.push({ item, sum: sumBonuses(equipBonusesFor(item, world)) })
  }
  for (const inv of inventory) consider(inv)
  consider(ring1)
  consider(ring2)

  all.sort((a, b) => b.sum - a.sum)
  const winners = all.slice(0, 2).map((o) => o.item)
  const winnerIds = new Set(winners.map((w) => w.id))

  // Everything that isn't a winner goes back to inventory if it was worn.
  const displaced: InventoryItem[] = []
  for (const worn of [ring1, ring2]) {
    if (worn && !winnerIds.has(worn.id)) displaced.push(worn)
  }
  const inventoryAfter = [
    ...inventory.filter((i) => !winnerIds.has(i.id)),
    ...displaced,
  ]

  const newRing1 = winners[0]
  const newRing2 = winners[1]
  const events: EquipEvent[] = []
  if (newRing1 && newRing1.id !== ring1?.id) {
    events.push({
      slot: 'ring1',
      itemName: newRing1.name,
      itemId: newRing1.archetypeId,
      itemRarity: newRing1.rarity,
      replaced: ring1?.name,
      replacedId: ring1?.archetypeId,
      replacedRarity: ring1?.rarity,
    })
  }
  if (newRing2 && newRing2.id !== ring2?.id) {
    events.push({
      slot: 'ring2',
      itemName: newRing2.name,
      itemId: newRing2.archetypeId,
      itemRarity: newRing2.rarity,
      replaced: ring2?.name,
      replacedId: ring2?.archetypeId,
      replacedRarity: ring2?.rarity,
    })
  }
  return { inventoryAfter, ring1: newRing1, ring2: newRing2, events }
}

/**
 * Picks the best gear for every slot across (inventory + currently equipped).
 * Swaps when the best pick isn't already in place; displaced items flow back
 * into inventory so nothing is lost.
 *
 * Weapons:
 *   - Pick the single best weapon for the main hand. If it's two-handed, the
 *     off-hand is cleared to inventory.
 *   - If the main hand is one-handed, pick the next-best one-handed weapon for
 *     the off-hand.
 */
export function applyAutoEquip(
  character: Character,
  world: WorldContent,
): { character: Character; events: EquipEvent[] } {
  let inventory = character.inventory
  let weapon = character.equipped.weapon
  let offhand = character.equipped.offhand
  const events: EquipEvent[] = []

  // Simple slots: armor, head, arms, hands, legs, feet, cape, amulet.
  // Each picks the best candidate from inventory + currently worn; old
  // wear is pushed back into the inventory if displaced.
  const simpleResults: Record<SimpleSlot, InventoryItem | undefined> = {
    armor: character.equipped.armor,
    head: character.equipped.head,
    arms: character.equipped.arms,
    hands: character.equipped.hands,
    legs: character.equipped.legs,
    feet: character.equipped.feet,
    cape: character.equipped.cape,
    amulet: character.equipped.amulet,
  }
  for (const slot of SIMPLE_SLOTS) {
    const pick = pickBestForSlot(inventory, simpleResults[slot], slot, world, character)
    if (pick) {
      const replaced = simpleResults[slot]
      events.push({
        slot,
        itemName: pick.item.name,
        itemId: pick.item.archetypeId,
        itemRarity: pick.item.rarity,
        replaced: replaced?.name,
        replacedId: replaced?.archetypeId,
        replacedRarity: replaced?.rarity,
      })
      inventory = pick.inventoryAfter
      simpleResults[slot] = pick.item
    }
  }

  // Rings — two slots, picked together so we don't wear the same ring twice
  // or leave a better ring in inventory while worse ones are equipped.
  const ringRes = resolveRings(
    inventory,
    character.equipped.ring1,
    character.equipped.ring2,
    world,
    character,
  )
  inventory = ringRes.inventoryAfter
  const ring1 = ringRes.ring1
  const ring2 = ringRes.ring2
  events.push(...ringRes.events)

  // Weapons — pick main hand, then off-hand.
  const pool = weaponCandidates(inventory, weapon, offhand, world, character)
  if (pool.length > 0) {
    const bestMain = pool.reduce((a, b) => (b.sum > a.sum ? b : a))
    if (bestMain.source !== 'eq-w') {
      // Previous main-hand needs to go back to inventory (unless it's the same
      // thing we're pulling from off-hand).
      const prevMain = weapon
      const prevOff = offhand
      inventory = inventory.filter((i) => i.id !== bestMain.item.id)
      if (prevMain && prevMain.id !== bestMain.item.id) inventory = [...inventory, prevMain]
      // If the pick came from the off-hand slot, nothing extra to return.
      if (bestMain.source === 'eq-o') offhand = undefined
      weapon = bestMain.item
      events.push({
        slot: 'weapon',
        itemName: bestMain.item.name,
        itemId: bestMain.item.archetypeId,
        itemRarity: bestMain.item.rarity,
        replaced: prevMain?.name,
        replacedId: prevMain?.archetypeId,
        replacedRarity: prevMain?.rarity,
      })
      // Flush off-hand if the new main-hand is two-handed.
      if (bestMain.hands === 2 && prevOff) {
        inventory = [...inventory, prevOff]
        offhand = undefined
      }
    }

    // Off-hand pick (only if main-hand is one-handed).
    const mainHands: 1 | 2 =
      weapon && equipmentOf(weapon, world)?.hands === 2 ? 2 : 1
    if (mainHands === 1) {
      const offPool = weaponCandidates(inventory, undefined, offhand, world, character).filter(
        (c) => c.hands === 1 && c.item.id !== weapon?.id,
      )
      if (offPool.length > 0) {
        const bestOff = offPool.reduce((a, b) => (b.sum > a.sum ? b : a))
        if (bestOff.source !== 'eq-o') {
          const prevOff = offhand
          inventory = inventory.filter((i) => i.id !== bestOff.item.id)
          if (prevOff && prevOff.id !== bestOff.item.id) inventory = [...inventory, prevOff]
          offhand = bestOff.item
          events.push({
            slot: 'offhand',
            itemName: bestOff.item.name,
            itemId: bestOff.item.archetypeId,
            itemRarity: bestOff.item.rarity,
            replaced: prevOff?.name,
            replacedId: prevOff?.archetypeId,
            replacedRarity: prevOff?.rarity,
          })
        }
      }
    }
  }

  return {
    character: {
      ...character,
      inventory,
      equipped: {
        weapon,
        offhand,
        armor: simpleResults.armor,
        head: simpleResults.head,
        arms: simpleResults.arms,
        hands: simpleResults.hands,
        legs: simpleResults.legs,
        feet: simpleResults.feet,
        cape: simpleResults.cape,
        amulet: simpleResults.amulet,
        ring1,
        ring2,
      },
    },
    events,
  }
}

// Verb per wear-slot for the log. Keeps the narration grounded — you don't
// "wield" a cape, and you don't "slip on" a sword.
const EQUIP_VERBS: Record<EquipEventSlot, string> = {
  weapon: 'wields',
  offhand: 'takes up',
  armor: 'dons',
  head: 'dons',
  arms: 'straps on',
  hands: 'pulls on',
  legs: 'slides into',
  feet: 'laces up',
  cape: 'throws on',
  amulet: 'fastens',
  ring: 'slips on',
  ring1: 'slips on',
  ring2: 'slips on',
}

/** Returns true when the equip event is a no-op swap — the new item and the
 *  replaced item share the same archetype and rarity, so logging would produce
 *  a confusing "wields X, setting aside X" line. Callers should skip these. */
export function isRedundantEquip(event: EquipEvent): boolean {
  if (!event.replaced || !event.itemId || !event.replacedId) return false
  // Absent rarity is treated as 'common' everywhere else (starting-inventory
  // items have no rarity field). Normalize before comparing so a looted
  // 'common' replacing a starting item reads as redundant, not a swap.
  const a = event.itemRarity ?? 'common'
  const b = event.replacedRarity ?? 'common'
  return event.itemId === event.replacedId && a === b
}

export function equipLogEntry(character: Character, event: EquipEvent): LogEntry {
  const verb = EQUIP_VERBS[event.slot] ?? 'equips'
  // "setting aside" names the PREVIOUSLY-equipped item being swapped out.
  // Guard against the replaced name matching the incoming item's name —
  // that would read as "dons the Pot Helm, setting aside the Pot Helm."
  // which is nonsense. Two paths this could happen: the slot was empty
  // (no replaced at all) or the previous wearable shared an archetype
  // name with the incoming one (re-equipping a copy). Both cases drop
  // the clause entirely.
  const hasReplaced = !!event.replaced && event.replaced !== event.itemName
  const text = hasReplaced
    ? `${character.name} ${verb} the ${event.itemName}, setting aside the ${event.replaced}.`
    : `${character.name} ${verb} the ${event.itemName}.`
  // The persisted log entry's `slot` field is a narrow 'weapon' | 'armor'
  // union (LogEntry predates the expanded gear set). Collapse the ten
  // wear-slots down to 'weapon' for off-hands/rings-as-weapons, else 'armor'.
  const slotKind = event.slot === 'offhand' || event.slot === 'weapon'
    ? 'weapon'
    : 'armor'
  return {
    kind: 'equip',
    slot: slotKind,
    text,
    meta: {
      name: character.name,
      itemId: event.itemId,
      itemName: event.itemName,
      itemRarity: event.itemRarity,
      // Only thread the replaced-item meta when the clause actually
      // rendered — otherwise the tokenizer has no text to match
      // against (and would try to decorate a name that isn't on
      // the line).
      replacedItemId: hasReplaced ? event.replacedId : undefined,
      replacedItemName: hasReplaced ? event.replaced : undefined,
      replacedItemRarity: hasReplaced ? event.replacedRarity : undefined,
    },
  }
}
