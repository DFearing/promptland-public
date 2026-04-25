import type { Character, InventoryItem } from '../character'
import type { ConsumableArchetype, ConsumableEffect, ItemDef } from '../items'
import type { LogEntry } from '../log'
import type { WorldContent } from '../worlds'

const HEAL_THRESHOLD = 0.35
const MAGIC_THRESHOLD = 0.35

interface ResolvedConsumable {
  inventoryIdx: number
  def: ItemDef & ConsumableArchetype
}

function findConsumable(
  inventory: InventoryItem[],
  world: WorldContent,
  effectKind: ConsumableEffect['kind'],
): ResolvedConsumable | null {
  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i]
    if (!item.archetypeId) continue
    const def = world.items.find((d) => d.id === item.archetypeId)
    if (!def || def.kind !== 'consumable') continue
    if (def.effect.kind !== effectKind) continue
    return { inventoryIdx: i, def: def as ItemDef & ConsumableArchetype }
  }
  return null
}

function removeOne(inventory: InventoryItem[], idx: number): InventoryItem[] {
  const item = inventory[idx]
  const qty = item.quantity ?? 1
  if (qty > 1) {
    const updated: InventoryItem = { ...item, quantity: qty - 1 }
    return inventory.map((v, i) => (i === idx ? updated : v))
  }
  return inventory.filter((_, i) => i !== idx)
}

export interface ConsumeResult {
  character: Character
  entry: LogEntry
}

// Auto-consumes a heal potion if HP is critical, else a magic potion if magic is
// critical. Returns null when no action is taken. Callers should skip this for
// states where consuming is wasteful (Resting).
export function maybeAutoConsume(
  character: Character,
  world: WorldContent,
): ConsumeResult | null {
  if (character.hp < character.maxHp * HEAL_THRESHOLD && character.hp > 0) {
    const match = findConsumable(character.inventory, world, 'heal')
    if (match) {
      const effect = match.def.effect as Extract<ConsumableEffect, { kind: 'heal' }>
      const heal = Math.min(character.maxHp - character.hp, effect.amount)
      return {
        character: {
          ...character,
          hp: character.hp + heal,
          inventory: removeOne(character.inventory, match.inventoryIdx),
        },
        entry: {
          kind: 'consume',
          effect: 'heal',
          amount: heal,
          text: `${character.name} drinks a ${match.def.name}.`,
          meta: { name: character.name, itemName: match.def.name },
        },
      }
    }
  }

  if (character.maxMagic > 0 && character.magic < character.maxMagic * MAGIC_THRESHOLD) {
    const match = findConsumable(character.inventory, world, 'restore-magic')
    if (match) {
      const effect = match.def.effect as Extract<ConsumableEffect, { kind: 'restore-magic' }>
      const restore = Math.min(character.maxMagic - character.magic, effect.amount)
      return {
        character: {
          ...character,
          magic: character.magic + restore,
          inventory: removeOne(character.inventory, match.inventoryIdx),
        },
        entry: {
          kind: 'consume',
          effect: 'restore-magic',
          amount: restore,
          text: `${character.name} drinks a ${match.def.name}.`,
          meta: { name: character.name, itemName: match.def.name },
        },
      }
    }
  }

  return null
}
