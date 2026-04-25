import type { Rarity } from './rarity'
import type { EquipRequirements } from './types'

/**
 * Rarity multiplier for equipment requirements. Higher rarity items have
 * lower requirements — a legendary item is powerful but more "universal" or
 * self-adapting. Applied to each base requirement and rounded down, minimum 1.
 */
const RARITY_REQ_MULT: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 0.85,
  rare: 0.7,
  epic: 0.55,
  legendary: 0.4,
}

export function requirementMultFor(rarity: Rarity): number {
  return RARITY_REQ_MULT[rarity]
}

/**
 * Returns the effective requirements for an item after rarity scaling.
 * Each base value is multiplied by the rarity factor, floored, and clamped
 * to a minimum of 1. Returns undefined if there are no requirements.
 */
export function scaledRequirements(
  base: EquipRequirements | undefined,
  rarity: Rarity,
): EquipRequirements | undefined {
  if (!base) return undefined
  const mult = RARITY_REQ_MULT[rarity]
  const out: EquipRequirements = {}
  let any = false
  for (const key of ['level', 'strength', 'dexterity', 'intelligence', 'wisdom'] as const) {
    const v = base[key]
    if (v != null) {
      out[key] = Math.max(1, Math.floor(v * mult))
      any = true
    }
  }
  return any ? out : undefined
}

/**
 * Returns true if the character meets all scaled requirements.
 */
export function meetsRequirements(
  reqs: EquipRequirements | undefined,
  stats: { level: number; strength: number; dexterity: number; intelligence: number; wisdom: number },
): boolean {
  if (!reqs) return true
  if (reqs.level != null && stats.level < reqs.level) return false
  if (reqs.strength != null && stats.strength < reqs.strength) return false
  if (reqs.dexterity != null && stats.dexterity < reqs.dexterity) return false
  if (reqs.intelligence != null && stats.intelligence < reqs.intelligence) return false
  if (reqs.wisdom != null && stats.wisdom < reqs.wisdom) return false
  return true
}
