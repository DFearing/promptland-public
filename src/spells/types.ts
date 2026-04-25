import type { VerbSet } from '../combat'
import type { ElementKind } from '../effects/types'

export type SpellLevel = 1 | 2 | 3 | 4 | 5

export type SpellTarget = 'self' | 'enemy'

export type SpellEffect =
  /** Direct damage to the target mob. */
  | { kind: 'damage'; amount: number }
  /** Applies a DoT condition (from world conditions) to the target. */
  | { kind: 'damage-over-time'; conditionId: string }
  /** Restores HP to the caster. */
  | { kind: 'heal'; amount: number }
  /** Applies a condition to the caster (buff) or target (debuff). */
  | { kind: 'buff'; conditionId: string }
  | { kind: 'debuff'; conditionId: string }
  /** Teleports caster to their last safe position and fully restores HP. */
  | { kind: 'teleport-safe' }

/** Per-severity verbs override the world's default combat verbs when a damage
 *  spell lands. Partial — missing tiers fall back to the world verb set. */
export type SpellVerbs = Partial<VerbSet>

export interface SpellDef {
  id: string
  name: string
  level: SpellLevel
  magicCost: number
  description: string
  target: SpellTarget
  effect: SpellEffect
  /** INT requirement to read this spell from a scroll. Gating:
   *   lv1 → 8  (most characters)
   *   lv2 → 11 (some)
   *   lv3 → 14 (trained)
   *   lv4 → 16 (highly trained)
   *   lv5 → 18 (masters) */
  scrollIntRequirement: number
  /** Optional spell-flavored verbs for damage-kind spells. Ignored otherwise. */
  verbs?: SpellVerbs
  /** Elemental overlay to trigger on the affected actor when this spell resolves. */
  element?: ElementKind
}
