import type { Character, InventoryItem } from '../character'
import {
  potionEffectAmount,
  type ConsumableArchetype,
  type ConsumableEffect,
  type ItemDef,
} from '../items'
import type { LogEntry } from '../log'
import { getSpell } from '../spells'
import type { WorldContent } from '../worlds'
import { getItem } from './worldLookup'
import { focusAdverb, healAdverb } from './intensity'

const HEAL_THRESHOLD = 0.35
const MAGIC_THRESHOLD = 0.35
/** Magic users grab a mana tincture earlier than non-casters — staying topped
 *  up matters because their entire combat plan hinges on having spells to
 *  cast. Tuned just below "force meditate" so the potion goes first when
 *  one's in inventory, and the meditate fallback covers the empty-pockets
 *  case. */
const MAGIC_USER_MAGIC_THRESHOLD = 0.5

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
    const def = getItem(world, item.archetypeId)
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
      const heal = Math.min(
        character.maxHp - character.hp,
        potionEffectAmount(match.def.size, character.maxHp),
      )
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
          text: `${character.name} drinks a ${match.def.name}, feeling ${healAdverb(
            heal,
            character.maxHp,
          )} better.`,
          meta: {
            name: character.name,
            itemId: match.def.id,
            itemName: match.def.name,
            potionEffect: match.def.effect.kind,
          },
        },
      }
    }
  }

  // Magic users (any character carrying a damage spell) get a higher MP-restore
  // threshold so they replenish well before they have to fall back to melee.
  const isMagicUser = (character.spells ?? []).some((id) => {
    const s = getSpell(character.worldId, id)
    return (
      !!s &&
      (s.effect.kind === 'damage' || s.effect.kind === 'damage-over-time')
    )
  })
  const magicThreshold = isMagicUser ? MAGIC_USER_MAGIC_THRESHOLD : MAGIC_THRESHOLD
  if (character.maxMagic > 0 && character.magic < character.maxMagic * magicThreshold) {
    const match = findConsumable(character.inventory, world, 'restore-magic')
    if (match) {
      const restore = Math.min(
        character.maxMagic - character.magic,
        potionEffectAmount(match.def.size, character.maxMagic),
      )
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
          text: `${character.name} drinks a ${match.def.name}, focusing ${focusAdverb(
            restore,
            character.maxMagic,
          )}.`,
          meta: {
            name: character.name,
            itemId: match.def.id,
            itemName: match.def.name,
            potionEffect: match.def.effect.kind,
          },
        },
      }
    }
  }

  return null
}
