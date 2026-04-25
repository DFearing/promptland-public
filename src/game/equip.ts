import type { Character, InventoryItem } from '../character'
import { conditionStatMods } from '../conditions'
import type { EquipBonuses, EquipmentArchetype, EquipSlot } from '../items'
import type { LogEntry } from '../log'
import type { WorldContent } from '../worlds'

const SLOTS: EquipSlot[] = ['weapon', 'armor']

function equipmentOf(
  item: InventoryItem,
  world: WorldContent,
): EquipmentArchetype | null {
  if (!item.archetypeId) return null
  const def = world.items.find((i) => i.id === item.archetypeId)
  if (!def || def.kind !== 'equipment') return null
  return def
}

function sumBonuses(b: EquipBonuses): number {
  return (b.attack ?? 0) + (b.defense ?? 0)
}

export function equipBonusesFor(
  item: InventoryItem | undefined,
  world: WorldContent,
): EquipBonuses {
  if (!item) return {}
  const eq = equipmentOf(item, world)
  return eq?.bonuses ?? {}
}

export function combatBonuses(
  character: Character,
  world: WorldContent,
): EquipBonuses {
  const w = equipBonusesFor(character.equipped.weapon, world)
  const a = equipBonusesFor(character.equipped.armor, world)
  const cond = conditionStatMods(character, world)
  return {
    attack: (w.attack ?? 0) + (a.attack ?? 0) + cond.attack,
    defense: (w.defense ?? 0) + (a.defense ?? 0) + cond.defense,
  }
}

export interface EquipEvent {
  slot: EquipSlot
  itemName: string
  replaced?: string
}

// Picks the best equipment per slot across (inventory + currently equipped).
// Swaps if the best choice isn't already equipped; the displaced item returns
// to inventory so nothing is lost.
export function applyAutoEquip(
  character: Character,
  world: WorldContent,
): { character: Character; events: EquipEvent[] } {
  let inventory = character.inventory
  const equipped = { ...character.equipped }
  const events: EquipEvent[] = []

  for (const slot of SLOTS) {
    const candidates: { item: InventoryItem; sum: number; source: 'inv' | 'eq' }[] = []
    for (const inv of inventory) {
      const eq = equipmentOf(inv, world)
      if (eq && eq.slot === slot) candidates.push({ item: inv, sum: sumBonuses(eq.bonuses), source: 'inv' })
    }
    const current = equipped[slot]
    if (current) {
      const eq = equipmentOf(current, world)
      if (eq) candidates.push({ item: current, sum: sumBonuses(eq.bonuses), source: 'eq' })
    }
    if (candidates.length === 0) continue

    let best = candidates[0]
    for (const c of candidates) if (c.sum > best.sum) best = c
    if (best.source === 'eq') continue

    const replaced = current
    inventory = inventory.filter((i) => i.id !== best.item.id)
    if (replaced) inventory = [...inventory, replaced]
    equipped[slot] = best.item
    events.push({
      slot,
      itemName: best.item.name,
      replaced: replaced?.name,
    })
  }

  return {
    character: { ...character, inventory, equipped },
    events,
  }
}

export function equipLogEntry(character: Character, event: EquipEvent): LogEntry {
  const verb = event.slot === 'weapon' ? 'wields' : 'dons'
  const text = event.replaced
    ? `${character.name} ${verb} the ${event.itemName}, setting aside the ${event.replaced}.`
    : `${character.name} ${verb} the ${event.itemName}.`
  return {
    kind: 'equip',
    text,
    slot: event.slot,
    meta: { name: character.name, itemName: event.itemName },
  }
}
