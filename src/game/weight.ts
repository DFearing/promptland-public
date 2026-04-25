import type { Character } from '../character'
import type { ItemDef } from '../items'
import { DRIVE_MAX } from './drives'

const BASE_CAPACITY = 20

export function weightCapacity(character: Character): number {
  const strMod = Math.floor((character.stats.strength - 10) / 2)
  return BASE_CAPACITY + strMod
}

export function computeInventoryWeight(
  character: Character,
  worldItems: ItemDef[],
): number {
  const defs = new Map(worldItems.map((d) => [d.id, d]))
  let total = 0
  for (const item of character.inventory) {
    const def = item.archetypeId ? defs.get(item.archetypeId) : undefined
    const w = def?.weight ?? 1
    total += w * (item.quantity ?? 1)
  }
  return total
}

// Weight drive is computed, not grown -- see drives.ts GROWABLE.
export function weightDriveValue(
  character: Character,
  worldItems: ItemDef[],
): number {
  const cap = weightCapacity(character)
  if (cap <= 0) return DRIVE_MAX
  const total = computeInventoryWeight(character, worldItems)
  return Math.min(DRIVE_MAX, Math.max(0, Math.round((total / cap) * DRIVE_MAX)))
}
