import type { DamageFamily } from '../combat'
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
  /** Magic defense — subtracted from incoming spell damage the same way
   *  `defense` handles physical hits. Absent ⇒ derived at runtime via
   *  `mobMagicDefense()` as `floor(level / 3)`, so authored archetypes
   *  don't need to set this unless they want a non-default (a fire
   *  elemental might set magicDefense high; a mindless blob might set it
   *  to 0 to be extra-soft to casters). */
  magicDefense?: number
  /** Per-element / per-family resistance map, applied as a multiplicative
   *  reduction on incoming damage of the matching family. Values are
   *  fractions (`0.5` = 50 % less damage taken; `1.0` = immune;
   *  `-0.5` = 50 % weakness, takes 150 %). Missing families read as `0`
   *  (no modifier). Final resist multiplier is clamped at 0 — can't deal
   *  negative damage — but values above 1× are allowed for weaknesses. */
  resist?: Partial<Record<DamageFamily, number>>
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
  /** Damage family for the mob's natural weapon — picks the verb
   *  word-set in the combat log. Absent ⇒ 'claw' (generic beast feel).
   *  Override per-mob when a different family reads better (armored
   *  knight → crush, rogue AI → hack, spirit → ice, etc.). */
  attackFamily?: import('../combat').DamageFamily
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

/**
 * Early-game HP bump. Low-level mobs shipped feeling glass-cannon — a level-1
 * rat at 4 HP could evaporate in a single swing before the player felt the
 * fight. Doubles HP at level 1, tapers to 1.0× by level 5, flat past that so
 * late game stays on the authored curve. Applied in `spawn` after the rarity
 * stat multiplier so an uncommon cave rat still feels like an uncommon cave
 * rat, just with more meat on the bones.
 */
function lowLevelHpBoost(level: number): number {
  if (level >= 5) return 1
  // level 1 → 2.0, level 2 → 1.75, level 3 → 1.5, level 4 → 1.25, level 5+ → 1.0
  return 1 + Math.max(0, (5 - level)) * 0.25
}

/**
 * Early-game XP bump. Pairs with `lowLevelHpBoost` so the first few levels
 * don't feel grindy — a level-1 kill pays ~1.75× what it used to, tapering
 * to 1.0× by level 5. Applied in `spawn` after the rarity xp scalar so
 * uncommon/rare kills still out-pay commons at the same level.
 */
function lowLevelXpBoost(level: number): number {
  if (level >= 5) return 1
  // level 1 → 1.75, level 2 → 1.55, level 3 → 1.35, level 4 → 1.15, level 5+ → 1.0
  return 1 + Math.max(0, (5 - level)) * 0.2 - 0.05
}

// Rarity-scaled spawn. Multiplies HP, attack, defense, and xpReward by the
// tier's statMult, and rewrites the display name with the rarity's prefix +
// trailing skulls. When \`rarity\` is omitted, returns a \`common\` spawn
// identical to the template (backwards compatible). Low-level mobs get an
// additional HP / XP bump so the first few levels don't feel glass-cannon —
// see `lowLevelHpBoost` / `lowLevelXpBoost`.
export function spawn(template: MobTemplate, rarity: Rarity = 'common'): Mob {
  const def = RARITY_DEFS[rarity]
  const mult = def.statMult
  const level = mobLevel(template, rarity)
  const hpBoost = lowLevelHpBoost(level)
  const xpBoost = lowLevelXpBoost(level)
  const maxHp = Math.max(1, Math.round(template.maxHp * mult * hpBoost))
  const attack = Math.max(0, Math.round(template.attack * mult))
  const defense = Math.max(0, Math.round(template.defense * mult))
  const xpReward = Math.max(1, Math.round(template.xpReward * mult * xpBoost))
  const name = mobDisplayName(template.name, rarity)
  // Authored magicDefense scales with rarity the same way physical defense
  // does; archetypes that leave it unset keep it unset here so
  // `mobMagicDefense` can fall through to the level-derived default at
  // read time. Preserves the undefined-vs-0 distinction (an explicit 0 is
  // "mindless, no magic resistance"; undefined is "let the default pick").
  const scaledMagicDefense =
    template.magicDefense !== undefined
      ? Math.max(0, Math.round(template.magicDefense * mult))
      : undefined
  return {
    ...template,
    name,
    maxHp,
    attack,
    defense,
    magicDefense: scaledMagicDefense,
    xpReward,
    hp: maxHp,
    conditions: [],
    rarity,
    level,
    healChargesLeft: template.healCharges ?? 0,
  }
}

/**
 * Resolves a mob's effective magic defense. Authored value wins when set,
 * otherwise falls back to `floor(level / 3)` so low-level mobs are soft
 * targets for casters and late-game mobs start to resist.
 */
export function mobMagicDefense(mob: Mob): number {
  return mob.magicDefense ?? Math.max(0, Math.floor(mob.level / 3))
}

/**
 * Resolves a mob's incoming-damage multiplier for a given damage family.
 * Returns `1` when no resist entry exists or no family is supplied (so
 * untyped damage just passes through). A family-keyed entry of `0.25`
 * means "25 % resist" → multiplier `0.75`; `1.0` means immune (multiplier
 * floored at `0`); `-0.5` means 50 % weak (multiplier `1.5`).
 */
export function mobResistMultiplier(
  mob: Mob,
  family: DamageFamily | undefined,
): number {
  if (!family) return 1
  const resist = mob.resist?.[family]
  if (!resist) return 1
  return Math.max(0, 1 - resist)
}
