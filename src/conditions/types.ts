export type ConditionKind = 'dot' | 'skip' | 'stat-mod'

/** Positive conditions (buffs) render green; negative (debuffs) render warn. */
export type ConditionPolarity = 'buff' | 'debuff'

export interface ConditionParams {
  /** For 'dot': damage per tick. Clamped so DoT can't kill — min 1 HP. */
  damagePerTick?: number
  /** For 'skip': 0..1 chance to lose the tick's action. */
  skipChance?: number
  /** For 'stat-mod': flat attack bonus (negative allowed). */
  attack?: number
  /** For 'stat-mod': flat defense bonus (negative allowed). */
  defense?: number
}

export interface ConditionDef {
  id: string
  name: string
  description: string
  kind: ConditionKind
  polarity: ConditionPolarity
  /** Default duration in ticks when applied. Callers may override. */
  defaultDuration: number
  params: ConditionParams
  /** Optional elemental overlay for application / tick events
   *  (e.g. poisoned → earth, hacked → hack, irradiated → fire). */
  element?: 'fire' | 'ice' | 'electric' | 'earth' | 'hack'
  /** Transitive verb for the active-voice application log when a source is
   *  known, e.g. "poisons" → "Goblin poisons Aerin.". Falls back to the
   *  passive form (`is ${name.toLowerCase()}`) when absent or source is
   *  unknown. Intensity adverbs may be appended by the log layer. */
  verb?: string
  /** Noun form for passive DoT lines that mention the condition as the
   *  agent — "X is DEVASTATED by poison." Without this, the fallback is
   *  `name.toLowerCase()`, which reads awkwardly ("by poisoned"). */
  noun?: string
}

export interface ActiveCondition {
  id: string
  remainingTicks: number
  /** Optional: who / what applied this. Free text for log flavor. */
  source?: string
  /** Snapshot of the caster's contribution to per-tick DoT damage at the
   *  moment of application. When set, `tickConditions` / `tickMobConditions`
   *  use this instead of the condition def's `params.damagePerTick` — so a
   *  high-INT Mage's poison stays hot even as later ticks resolve, and a
   *  weak source's DoT doesn't suddenly scale up if a stronger caster
   *  refreshes it via the same condition id. */
  damagePerTickOverride?: number
}
