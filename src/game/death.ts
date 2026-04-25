import type { Character, Equipped } from '../character'
import type { EquipSlot } from '../items'
import type { LogEntry } from '../log'

const EQUIPMENT_LOSS_CHANCE = 1.0
const XP_LOSS_PERCENT = 0.25

function pickLostSlot(equipped: Equipped): EquipSlot | null {
  const slots: EquipSlot[] = []
  if (equipped.weapon) slots.push('weapon')
  if (equipped.armor) slots.push('armor')
  if (slots.length === 0) return null
  return slots[Math.floor(Math.random() * slots.length)]
}

// Applies default death penalties: one equipped item destroyed (when any are
// equipped) plus 25% of current XP. XP is floor-clamped at 0 so a death can't
// drop a level. Log entries describe each loss. MEMORY calls for these to be
// configurable; that belongs with the broader config-file slice.
export function applyDeathPenalty(character: Character): {
  character: Character
  entries: LogEntry[]
} {
  const entries: LogEntry[] = []
  let equipped = character.equipped

  if (Math.random() < EQUIPMENT_LOSS_CHANCE) {
    const slot = pickLostSlot(equipped)
    if (slot) {
      const lost = equipped[slot]!
      equipped = { ...equipped, [slot]: undefined }
      entries.push({
        kind: 'death-loss',
        text: `${character.name} has lost the ${lost.name}.`,
        meta: { name: character.name, itemName: lost.name },
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
      meta: { name: character.name },
    })
  }

  return {
    character: { ...character, equipped, xp },
    entries,
  }
}
