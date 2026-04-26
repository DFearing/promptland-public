import type { StatBlock } from './types'
import type { StatCode } from '../worlds/types'

export const BASE_HP = 10

export function maxHpFor(stats: StatBlock): number {
  return BASE_HP + stats.constitution * 2
}

/**
 * Resolves the value of the stat a class casts off. When `castingStat` is
 * omitted, returns the higher of INT or WIS — the permissive default for
 * classes that haven't pinned themselves (Mage, Ranger, etc.). Cleric
 * declares `castingStat: 'WIS'` so divine magic is purely WIS-driven.
 */
export function castingStatValue(stats: StatBlock, castingStat?: StatCode): number {
  switch (castingStat) {
    case 'STR': return stats.strength
    case 'DEX': return stats.dexterity
    case 'CON': return stats.constitution
    case 'INT': return stats.intelligence
    case 'WIS': return stats.wisdom
    case 'CHA': return stats.charisma
    default: return Math.max(stats.intelligence, stats.wisdom)
  }
}

/**
 * Starting Max MP scaled off the class's casting stat, mirroring how Max HP
 * scales with CON. `affinity` is class-defined (Warrior 0.5, Mage 2.5,
 * etc.); when omitted the caller falls back to the legacy flat
 * `startingMaxMagic` field on the class manifest. Always rounded so the UI
 * shows whole numbers.
 */
export function maxMagicFor(
  stats: StatBlock,
  affinity: number,
  castingStat?: StatCode,
): number {
  return Math.round(affinity * castingStatValue(stats, castingStat))
}

export function xpToNextLevel(level: number): number {
  return level * 100
}
