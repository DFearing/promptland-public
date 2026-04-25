import type { Character, InventoryItem } from '../character'
import { parseMobDisplayName, type Rarity } from '../items'
import type { Subject, SubjectContext } from './LogPopoverContent'

// Item kinds that opt out of rarity tinting because they have their own
// progression axis (size for consumables, level for scrolls). Mirrors the
// suppression in InventoryPanel / LogPopoverContent so the log popover
// background doesn't paint a tier these items never rolled.
const RARITY_LESS_KINDS = new Set(['consumable', 'scroll'])

/** Most recent matching inventory pickup for an archetype id, looking
 *  through both loose inventory and every equipped slot. Duplicates the
 *  LogPopoverContent-local lookup so both surfaces stay in sync — keeping
 *  this here (rather than exporting from LogPopoverContent) lets the
 *  module stay a component-only file for react-refresh. */
function findOwnedItem(c: Character, archetypeId: string): InventoryItem | null {
  const candidates: InventoryItem[] = []
  for (const it of c.inventory ?? []) {
    if (it.archetypeId === archetypeId) candidates.push(it)
  }
  for (const slot of [
    c.equipped.weapon,
    c.equipped.offhand,
    c.equipped.armor,
    c.equipped.head,
    c.equipped.arms,
    c.equipped.hands,
    c.equipped.legs,
    c.equipped.feet,
    c.equipped.cape,
    c.equipped.amulet,
    c.equipped.ring1,
    c.equipped.ring2,
  ]) {
    if (slot?.archetypeId === archetypeId) candidates.push(slot)
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (b.acquired?.at ?? 0) - (a.acquired?.at ?? 0))
  return candidates[0]
}

/** Rarity the enclosing Popover should tint its background with. Mob
 *  subjects parse rarity from the display-name prefix; item subjects look
 *  up the most recent matching inventory pickup. Returns null when no
 *  rarity applies (rooms, characters, effects, stat-bonuses) or when the
 *  subject's rarity is common — callers use null as a signal to skip the
 *  tint entirely and keep the default neutral panel bg. */
export function resolveSubjectRarity(
  subject: Subject,
  ctx: SubjectContext,
): Rarity | null {
  switch (subject.kind) {
    case 'mob': {
      const { rarity } = parseMobDisplayName(subject.name)
      return rarity === 'common' ? null : rarity
    }
    case 'item': {
      const def = ctx.items?.find((i) => i.id === subject.id)
      if (def && RARITY_LESS_KINDS.has(def.kind)) return null
      const owned = findOwnedItem(ctx.character, subject.id)
      const rarity = owned?.rarity
      if (!rarity || rarity === 'common') return null
      return rarity
    }
    default:
      return null
  }
}
