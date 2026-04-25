import type { Character, InventoryItem } from '../character'
import type { ItemDef } from '../items'
import type { Mob } from '../mobs'
import { uuid } from '../util/uuid'
import type { WorldContent } from '../worlds'

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

function addItem(inventory: InventoryItem[], def: ItemDef, qty: number): InventoryItem[] {
  if (def.stackable) {
    const idx = inventory.findIndex((i) => i.archetypeId === def.id)
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
    },
  ]
}

export function applyDrops(character: Character, world: WorldContent, drops: Drops): Character {
  let inventory = character.inventory
  for (const drop of drops.items) {
    const def = world.items.find((i) => i.id === drop.itemId)
    if (!def) continue
    inventory = addItem(inventory, def, drop.qty)
  }
  return {
    ...character,
    gold: character.gold + drops.gold,
    inventory,
  }
}
