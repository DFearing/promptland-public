/**
 * Damage-out multiplier based on (attacker level − defender level). Each
 * level of advantage adds ~15 % damage; disadvantage subtracts the same.
 * Saturates so a 10-level gap maxes at +150 % / −75 %: fights stay decisive
 * at extremes but neither side one-shots in a single roll.
 *
 * Used by both physical swings (tick.ts fight()) and spell casts
 * (spells/cast.ts) so magic and melee scale by level the same way.
 */
export function levelScaleOutgoing(delta: number): number {
  const clamped = Math.max(-10, Math.min(10, delta))
  if (clamped >= 0) return 1 + clamped * 0.15
  // Negative delta: shrinks damage dealt, floor at 25 %.
  return Math.max(0.25, 1 + clamped * 0.075)
}

/**
 * Damage-in multiplier from the defender's perspective. Mirror image of
 * `levelScaleOutgoing`: a higher-level attacker hits harder, a lower-level
 * one bounces off.
 */
export function levelScaleIncoming(delta: number): number {
  return levelScaleOutgoing(-delta)
}
