import type { Character, Equipped } from '../character'
import type { LogEntry } from '../log'
import type { Rng } from '../rng'

const EQUIPMENT_LOSS_CHANCE = 1.0
const XP_LOSS_PERCENT = 0.25
const GOLD_LOSS_MIN_PERCENT = 0.10
const GOLD_LOSS_MAX_PERCENT = 0.25
const GOLD_LOSS_FLOOR = 10

/** Wear-slot name as it appears on `Equipped` — superset of EquipSlot because
 *  offhand / ring1 / ring2 are distinct from their archetype slot. */
type WearKey = keyof Equipped

const WEAR_KEYS: WearKey[] = [
  'weapon',
  'offhand',
  'armor',
  'head',
  'arms',
  'hands',
  'legs',
  'feet',
  'cape',
  'amulet',
  'ring1',
  'ring2',
]

function pickLostSlot(equipped: Equipped, rng: Rng): WearKey | null {
  const slots = WEAR_KEYS.filter((k) => equipped[k])
  if (slots.length === 0) return null
  return rng.pick(slots)
}

// Applies default death penalties: one equipped item destroyed (when any are
// equipped) plus 25% of current XP. XP is floor-clamped at 0 so a death can't
// drop a level. Log entries describe each loss. MEMORY calls for these to be
// configurable; that belongs with the broader config-file slice.
export function applyDeathPenalty(character: Character, rng: Rng): {
  character: Character
  entries: LogEntry[]
} {
  const entries: LogEntry[] = []
  let equipped = character.equipped

  const loseEquip = rng.chance(EQUIPMENT_LOSS_CHANCE)
  if (loseEquip) {
    const slot = pickLostSlot(equipped, rng)
    if (slot) {
      const lost = equipped[slot]!
      equipped = { ...equipped, [slot]: undefined }
      entries.push({
        kind: 'death-loss',
        text: `${character.name} has lost the ${lost.name}.`,
        meta: {
          name: character.name,
          itemId: lost.archetypeId,
          itemName: lost.name,
          itemRarity: lost.rarity,
        },
      })
    }
  }

  const xpLost = Math.floor(character.xp * XP_LOSS_PERCENT)
  let xp = character.xp
  if (xpLost > 0) {
    xp = Math.max(0, character.xp - xpLost)
    entries.push({
      kind: 'death-loss',
      text: `${character.name} loses ${xpLost} XP.`,
      meta: { name: character.name, xpText: `${xpLost} XP` },
    })
  }

  let gold = character.gold
  if (gold > 0) {
    const r = rng.next()
    const pct = GOLD_LOSS_MIN_PERCENT + r * (GOLD_LOSS_MAX_PERCENT - GOLD_LOSS_MIN_PERCENT)
    const goldLost = Math.max(GOLD_LOSS_FLOOR, Math.floor(gold * pct))
    const actualLoss = Math.min(gold, goldLost)
    gold = gold - actualLoss
    entries.push({
      kind: 'death-loss',
      text: `${character.name} loses ${actualLoss} gold — scattered in the chaos.`,
      meta: {
        name: character.name,
        goldAmount: actualLoss,
        goldText: `${actualLoss} gold`,
      },
    })
  }

  return {
    character: { ...character, equipped, xp, gold },
    entries,
  }
}
