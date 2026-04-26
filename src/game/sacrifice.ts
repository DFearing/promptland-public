import type { Character, InventoryItem } from '../character'
import type { ItemDef } from '../items'
import { RARITIES, type Rarity } from '../items'

interface SacrificeResult {
  sacrificed: Array<{ item: InventoryItem; def: ItemDef }>
  totalGold: number
  /** 1 favor per sacrificed item (stack quantity counts). Earned alongside
   *  `totalGold` — the user explicitly asked for both. The shrine-tithe
   *  bonus (+5 favor / -5 gold) is layered on at the call site, not
   *  here, because it depends on `room.type === 'shrine'` and the
   *  character's gold balance. */
  totalFavor: number
  remainingInventory: InventoryItem[]
}

function equippedIds(character: Character): Set<string> {
  const ids = new Set<string>()
  for (const slot of Object.values(character.equipped)) {
    if (slot?.id) ids.add(slot.id)
  }
  return ids
}

// The highest rarity the character currently owns anywhere (equipped or stashed).
// Anything strictly below this tier is "no longer relevant" and eligible for
// sacrifice. Commons are always eligible regardless.
function maxOwnedRarity(character: Character): Rarity {
  let max: Rarity = 'common'
  let maxIdx = 0
  const scan = (item: InventoryItem | undefined) => {
    if (!item) return
    const r = item.rarity ?? 'common'
    const idx = RARITIES.indexOf(r)
    if (idx > maxIdx) {
      max = r
      maxIdx = idx
    }
  }
  for (const slot of Object.values(character.equipped)) scan(slot)
  for (const item of character.inventory) scan(item)
  return max
}

function isEligible(rarity: Rarity, max: Rarity): boolean {
  if (rarity === 'common') return true
  return RARITIES.indexOf(rarity) < RARITIES.indexOf(max)
}

// Picks items eligible for sacrifice: unworn, non-consumable, non-scroll items
// whose rarity is common OR below the character's highest owned tier. The gods
// (or whoever) give 1 gold per item sacrificed — stack quantity counts.
export function pickItemsToSacrifice(
  character: Character,
  worldItems: ItemDef[],
): SacrificeResult {
  const defs = new Map(worldItems.map((d) => [d.id, d]))
  const worn = equippedIds(character)
  const max = maxOwnedRarity(character)
  const sacrificed: SacrificeResult['sacrificed'] = []
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
    // Keep consumables and scrolls — utility is utility regardless of rarity.
    if (def.kind === 'consumable' || def.kind === 'scroll') {
      remaining.push(item)
      continue
    }
    const rarity: Rarity = item.rarity ?? 'common'
    if (!isEligible(rarity, max)) {
      remaining.push(item)
      continue
    }
    sacrificed.push({ item, def })
  }

  // Both ledgers are computed independently from the same source (sacrificed
  // stack quantities) so changing one curve later won't silently change the
  // other. Today they're identical — 1 gold and 1 favor per item — but that's
  // an intentional design choice, not a coupling. Rarity scaling was
  // considered and rejected: common drops dominate end-game inventory anyway,
  // and a flat-rate makes the "did the gods notice?" math instantly readable.
  const sumQuantities = (acc: number, s: { item: InventoryItem }) =>
    acc + (s.item.quantity ?? 1)
  const totalGold = sacrificed.reduce(sumQuantities, 0)
  const totalFavor = sacrificed.reduce(sumQuantities, 0)
  return { sacrificed, totalGold, totalFavor, remainingInventory: remaining }
}
