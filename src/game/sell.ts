import type { Character, InventoryItem } from '../character'
import type { ItemDef } from '../items'
import { rarityValueMult, type Rarity } from '../items'

interface SellResult {
  sold: Array<{ item: InventoryItem; def: ItemDef; gold: number }>
  totalGold: number
  remainingInventory: InventoryItem[]
}

// Items an equipped set references -- never sell these.
function equippedIds(character: Character): Set<string> {
  const ids = new Set<string>()
  for (const slot of Object.values(character.equipped)) {
    if (slot?.id) ids.add(slot.id)
  }
  return ids
}

// Class-aware keep rules. Returns true if the item should be kept.
function shouldKeep(
  _item: InventoryItem,
  def: ItemDef,
  classId: string,
): boolean {
  // Always keep consumables (potions and food).
  if (def.kind === 'consumable') return true

  // Always keep scrolls -- they're lightweight and universally useful.
  if (def.kind === 'scroll') return true

  // Junk is always sellable.
  if (def.kind === 'junk') return false

  // Equipment: class-aware filtering.
  if (def.kind === 'equipment') {
    // Mages keep staves and light items; sell heavy armor and heavy weapons.
    if (classId === 'mage') {
      if (def.slot === 'weapon') {
        const hasInt = (def.bonuses.intelligence ?? 0) > 0
        const hasWis = (def.bonuses.wisdom ?? 0) > 0
        return hasInt || hasWis
      }
      // Mages don't want heavy armor (chain, plate).
      if (def.slot === 'armor' && (def.bonuses.defense ?? 0) >= 3) return false
      if (def.slot === 'head' && (def.bonuses.defense ?? 0) >= 2) return false
      // Keep light defensive gear and accessories.
      return true
    }

    // Warriors keep heavy weapons and heavy armor; sell INT/WIS-focused gear.
    if (classId === 'warrior') {
      if (def.slot === 'weapon') {
        const hasInt = (def.bonuses.intelligence ?? 0) > 0
        const noStr = (def.bonuses.strength ?? 0) === 0
        const noAtk = (def.bonuses.attack ?? 0) === 0
        if (hasInt && noStr && noAtk) return false
      }
      return true
    }

    // Rogues keep DEX-focused gear; sell heavy armor and STR-only weapons.
    if (classId === 'rogue') {
      if (def.slot === 'armor' && (def.bonuses.defense ?? 0) >= 3) return false
      if (def.slot === 'weapon') {
        const hasDex = (def.bonuses.dexterity ?? 0) > 0
        const hasAtk = (def.bonuses.attack ?? 0) > 0
        return hasDex || hasAtk
      }
      return true
    }

    // Rangers favor ranged weapons (pierce / shortbow analogs) and DEX
    // gear; sell heavy armor and STR-only weapons.
    if (classId === 'ranger') {
      if (def.slot === 'armor' && (def.bonuses.defense ?? 0) >= 3) return false
      if (def.slot === 'weapon') {
        const hasDex = (def.bonuses.dexterity ?? 0) > 0
        const isPierce = def.damageFamily === 'pierce'
        const hasAtk = (def.bonuses.attack ?? 0) > 0
        return hasDex || isPierce || hasAtk
      }
      return true
    }

    // Clerics keep WIS/CON gear; sell pure INT-focused and heavy STR gear.
    if (classId === 'cleric') {
      if (def.slot === 'weapon') {
        const hasWis = (def.bonuses.wisdom ?? 0) > 0
        const hasStr = (def.bonuses.strength ?? 0) > 0
        const hasAtk = (def.bonuses.attack ?? 0) > 0
        return hasWis || hasStr || hasAtk
      }
      return true
    }

    // Default: keep everything we don't recognize.
    return true
  }

  return true
}

export function pickItemsToSell(
  character: Character,
  worldItems: ItemDef[],
): SellResult {
  const defs = new Map(worldItems.map((d) => [d.id, d]))
  const worn = equippedIds(character)
  const sold: SellResult['sold'] = []
  const remaining: InventoryItem[] = []

  for (const item of character.inventory) {
    if (worn.has(item.id)) {
      remaining.push(item)
      continue
    }
    const def = item.archetypeId ? defs.get(item.archetypeId) : undefined
    if (!def) {
      remaining.push(item)
      continue
    }
    if (shouldKeep(item, def, character.classId)) {
      remaining.push(item)
      continue
    }
    const rarity: Rarity = item.rarity ?? 'common'
    const baseValue = def.value ?? 1
    const qty = item.quantity ?? 1
    const gold = Math.max(1, Math.round(baseValue * rarityValueMult(rarity) * qty))
    sold.push({ item, def, gold })
  }

  const totalGold = sold.reduce((sum, s) => sum + s.gold, 0)
  return { sold, totalGold, remainingInventory: remaining }
}
