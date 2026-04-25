import type { ActiveCondition } from '../conditions'
import { RARITY_DEFS, mobDisplayName, type Rarity } from '../items/rarity'

export type LootEntry =
  | { kind: 'gold'; chance: number; min: number; max: number }
  | { kind: 'item'; itemId: string; chance: number; min?: number; max?: number }

export interface ApplyOnHit {
  /** Condition id from the world's conditions library. */
  conditionId: string
  /** 0..1 probability of applying on a successful hit. */
  chance: number
}

// Mechanics of a mob. World-scoped but world-agnostic in shape. Hardcoded.
export interface MobArchetype {
  id: string
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  loot?: LootEntry[]
  applyOnHit?: ApplyOnHit
  /** Base effective level of the mob, before rarity scaling. Used by combat
   *  to scale damage dealt/taken by the level delta vs. the player. Missing
   *  values fall back to a derived level from xpReward (≈ xpReward / 3). */
  level?: number
  /** Self-preservation: how many times the mob can heal itself when badly
   *  hurt during a fight. Each use restores `healAmount` HP and consumes
   *  one charge. Absent or 0 → the mob has no heal. */
  healCharges?: number
  healAmount?: number
}

// Flavor of a mob. Today hardcoded per world; tomorrow LLM-generated and cached.
export interface MobFlavor {
  name: string
  description: string
}

// A ready-to-use mob template (archetype + flavor merged).
export type MobTemplate = MobArchetype & MobFlavor

// Running instance in a fight. Rarity is rolled at spawn; stats derive from
// the template scaled by rarity.statMult and the display name picks up the
// rarity prefix + skull count.
export type Mob = MobTemplate & {
  hp: number
  /** Per-fight conditions (slowed, burning, etc.). Empty on spawn. */
  conditions: ActiveCondition[]
  /** Tier rolled at spawn. Drives name, stats, xp, and loot scaling. */
  rarity: Rarity
  /** Effective combat level, derived at spawn. Used by the level-delta
   *  damage scaling. */
  level: number
  /** Remaining self-heal charges in the current encounter. Decrements on
   *  each use; defaults to the archetype's `healCharges` at spawn. */
  healChargesLeft: number
  /** True when this mob was spawned from a room's curated encounter
   *  override (not the random pool). Drives the curated-loot branch in
   *  `resolveMobDefeat` — so a random-pool spawn of the same mob id in
   *  a curated-loot room does NOT trigger the override. Absent ⇒ false. */
  curated?: boolean
}

/**
 * Derives a mob's effective combat level. Uses the explicit `template.level`
 * if set, otherwise back-computes from xpReward (3 XP ≈ level 1). Rarity
 * shifts the result up: uncommon +1, rare +2, epic +3, legendary +4.
 */
export function mobLevel(template: MobTemplate, rarity: Rarity = 'common'): number {
  const base = template.level ?? Math.max(1, Math.round(template.xpReward / 3))
  const rarityBump =
    rarity === 'common'
      ? 0
      : rarity === 'uncommon'
        ? 1
        : rarity === 'rare'
          ? 2
          : rarity === 'epic'
            ? 3
            : 4
  return base + rarityBump
}

// Rarity-scaled spawn. Multiplies HP, attack, defense, and xpReward by the
// tier's statMult, and rewrites the display name with the rarity's prefix +
// trailing skulls. When \`rarity\` is omitted, returns a \`common\` spawn
// identical to the template (backwards compatible).
export function spawn(template: MobTemplate, rarity: Rarity = 'common'): Mob {
  const def = RARITY_DEFS[rarity]
  const mult = def.statMult
  const maxHp = Math.max(1, Math.round(template.maxHp * mult))
  const attack = Math.max(0, Math.round(template.attack * mult))
  const defense = Math.max(0, Math.round(template.defense * mult))
  const xpReward = Math.max(1, Math.round(template.xpReward * mult))
  const name = mobDisplayName(template.name, rarity)
  return {
    ...template,
    name,
    maxHp,
    attack,
    defense,
    xpReward,
    hp: maxHp,
    conditions: [],
    rarity,
    level: mobLevel(template, rarity),
    healChargesLeft: template.healCharges ?? 0,
  }
}
