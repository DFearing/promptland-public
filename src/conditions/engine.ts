import type { Character } from '../character'
import { damageVerb } from '../combat'
import type { Rng } from '../rng'
import type { ElementKind } from '../effects/types'
import type { LogEntry } from '../log'
import type { Mob } from '../mobs'
import type { WorldContent } from '../worlds'
import type { ActiveCondition, ConditionDef } from './types'

export interface ConditionTickResult {
  character: Character
  /** True if any active 'skip' condition successfully rolled this tick. */
  skipTurn: boolean
  entries: LogEntry[]
}

function defMap(world: WorldContent): Map<string, ConditionDef> {
  return new Map(world.conditions.map((d) => [d.id, d]))
}

// Applies every active condition for one tick: DoT damage (capped so it can't
// kill — min 1 HP), skip-chance rolls, duration decrement, expiry logs.
// stat-mod conditions have no per-tick effect here — they're read by combat.
export function tickConditions(
  character: Character,
  world: WorldContent,
  rng: Rng,
): ConditionTickResult {
  if (!character.conditions || character.conditions.length === 0) {
    return { character, skipTurn: false, entries: [] }
  }
  const defs = defMap(world)
  const entries: LogEntry[] = []
  let hp = character.hp
  let skipTurn = false
  const next: ActiveCondition[] = []

  for (const active of character.conditions) {
    const def = defs.get(active.id)
    if (!def) continue

    switch (def.kind) {
      case 'dot': {
        // Snapshot override (set at application by a high-INT caster) wins
        // over the condition def's base so a strong Mage's poison keeps
        // its bite even as the condition plays out.
        const dmg = active.damagePerTickOverride ?? def.params.damagePerTick ?? 0
        if (dmg > 0 && hp > 1) {
          const taken = Math.min(dmg, hp - 1)
          hp -= taken
          const { verb } = damageVerb(taken, character.maxHp, character.worldId, def.element, rng)
          const noun = def.noun ?? def.name.toLowerCase()
          const capNoun = noun.charAt(0).toUpperCase() + noun.slice(1)
          entries.push({
            kind: 'condition-tick',
            text: `${capNoun} ${verb} ${character.name}.`,
            amount: taken,
            conditionId: def.id,
            meta: {
              name: character.name,
              conditionName: def.name,
              element: def.element,
            },
          })
        }
        break
      }
      case 'skip': {
        const chance = def.params.skipChance ?? 1
        const rolled = rng.chance(chance)
        if (rolled) skipTurn = true
        break
      }
      case 'stat-mod':
        break
    }

    const remaining = active.remainingTicks - 1
    if (remaining > 0) {
      next.push({ ...active, remainingTicks: remaining })
    } else {
      entries.push({
        kind: 'condition-end',
        text: `${character.name} shakes off ${def.name}.`,
        conditionId: def.id,
        meta: { name: character.name, conditionName: def.name },
      })
    }
  }

  return {
    character: { ...character, hp, conditions: next },
    skipTurn,
    entries,
  }
}

/**
 * Optional per-application scaling supplied by the caster. Both values are
 * snapshotted into the `ActiveCondition` at application time so subsequent
 * tick resolution doesn't need the caster's stats in scope. Undefined /
 * missing members are treated as 0 (the pre-scaling baseline).
 */
export interface ConditionScaling {
  /** Added to the condition's `defaultDuration` (in ticks). */
  durationBonus?: number
  /** For DoT conditions only: sets `damagePerTickOverride` to
   *  `params.damagePerTick + dotDamageBonus` so the caster's INT shapes
   *  the bite of each tick. Ignored on non-DoT condition kinds. */
  dotDamageBonus?: number
}

function scaledDuration(def: ConditionDef, scaling?: ConditionScaling): number {
  const bonus = Math.max(0, scaling?.durationBonus ?? 0)
  return def.defaultDuration + bonus
}

function dotOverride(def: ConditionDef, scaling?: ConditionScaling): number | undefined {
  if (def.kind !== 'dot') return undefined
  const bonus = scaling?.dotDamageBonus ?? 0
  if (bonus <= 0) return undefined
  const base = def.params.damagePerTick ?? 0
  return base + bonus
}

// Applies a new condition or refreshes duration if the id is already active.
// Returns { character, entry? } — entry is null if the condition is unknown or
// simply refreshed an existing one (no new announcement for refreshes).
export function applyCondition(
  character: Character,
  world: WorldContent,
  conditionId: string,
  source?: string,
  scaling?: ConditionScaling,
): { character: Character; entry: LogEntry | null } {
  const def = world.conditions.find((d) => d.id === conditionId)
  if (!def) return { character, entry: null }

  const duration = scaledDuration(def, scaling)
  const override = dotOverride(def, scaling)

  const existing = character.conditions.findIndex((c) => c.id === conditionId)
  if (existing >= 0) {
    const refreshed = character.conditions.map((c, i) =>
      i === existing
        ? {
            ...c,
            remainingTicks: duration,
            source,
            damagePerTickOverride: override ?? c.damagePerTickOverride,
          }
        : c,
    )
    return { character: { ...character, conditions: refreshed }, entry: null }
  }

  const newActive: ActiveCondition = {
    id: conditionId,
    remainingTicks: duration,
    source,
    ...(override !== undefined ? { damagePerTickOverride: override } : {}),
  }
  // Active voice when we know who did it AND the condition has a verb:
  //   "Goblin poisons Aerin." — reads like an action, not a status.
  // Intensity (light/heavy) rides the duration vs. default duration: a long-
  // lived stack leads with "heavily", a short one with "lightly".
  // Capitalize the source so "the cave rat poisons Aerin." → "The Cave Rat …"
  // while leaving the passive form ("— the cave rat") untouched — dashes read
  // as apposition there.
  const capSource = source
    ? source.charAt(0).toUpperCase() + source.slice(1)
    : source
  const activeText =
    source && def.verb
      ? `${capSource} ${intensityPrefix(def)}${def.verb} ${character.name}.`
      : source
        ? `${character.name} is ${def.name.toLowerCase()} — ${source}.`
        : `${character.name} is ${def.name.toLowerCase()}.`
  return {
    character: { ...character, conditions: [...character.conditions, newActive] },
    entry: {
      kind: 'condition-gain',
      text: activeText,
      conditionId: def.id,
      polarity: def.polarity,
      meta: {
        name: character.name,
        conditionName: def.name,
        element: def.element,
      },
    },
  }
}

// Mob-side mirror of `applyCondition`. Applies a condition to a mob or
// refreshes an existing one. The optional `caster` names the cause so the
// log reads as an action instead of ambient weather — and threads
// meta.name/spellName through so LogPanel can paint the caster token in
// its player color and the spell name in the MP color.
//
//   new + verb + caster     → "Shardath's Poison Bolt poisons the Cave Rat."
//   new + caster, no verb   → "Shardath's Poison Bolt afflicts the Cave Rat with X."
//   new + no caster         → "The Cave Rat is poisoned."         (ambient)
//   refresh + verb + caster → "Shardath's Poison Bolt keeps the Cave Rat poisoned."
//   refresh otherwise       → null entry (silent — matches applyCondition)
//
// Keeping refresh visible when a caster is provided avoids the prior
// failure mode where a player-cast spell spent MP with no log feedback if
// the condition was already active.
export interface MobConditionCaster extends ConditionScaling {
  /** Caster display name — goes into meta.name so LogPanel paints the
   *  player-color token. */
  name: string
  /** Spell name (for spell casts) — composes subject as
   *  "name's spellName" and sets meta.spellName for spell-color painting. */
  spellName?: string
  /** Weapon name (for melee procs like the rogue stealth-opener) —
   *  composes subject as "name's weaponName". Only one of spellName /
   *  weaponName is meaningful; spellName wins if both are set. */
  weaponName?: string
}

export function applyMobCondition(
  mob: Mob,
  world: WorldContent,
  conditionId: string,
  caster?: MobConditionCaster,
  fallbackElement?: ElementKind,
): { mob: Mob; entry: LogEntry | null } {
  const def = world.conditions.find((d) => d.id === conditionId)
  if (!def) return { mob, entry: null }

  const duration = scaledDuration(def, caster)
  const override = dotOverride(def, caster)

  const conditions = mob.conditions ?? []
  const existingIdx = conditions.findIndex((c) => c.id === conditionId)
  const isRefresh = existingIdx >= 0
  const nextConds: ActiveCondition[] = isRefresh
    ? conditions.map((c, i) =>
        i === existingIdx
          ? {
              ...c,
              remainingTicks: duration,
              damagePerTickOverride: override ?? c.damagePerTickOverride,
            }
          : c,
      )
    : [
        ...conditions,
        {
          id: conditionId,
          remainingTicks: duration,
          ...(override !== undefined ? { damagePerTickOverride: override } : {}),
        },
      ]

  const tool = caster?.spellName ?? caster?.weaponName
  const subject = caster
    ? tool
      ? `${caster.name}'s ${tool}`
      : caster.name
    : undefined

  let text: string | null = null
  if (!isRefresh) {
    if (subject && def.verb) {
      text = `${subject} ${intensityPrefix(def)}${def.verb} the ${mob.name}.`
    } else if (subject) {
      text = `${subject} afflicts the ${mob.name} with ${def.name.toLowerCase()}.`
    } else {
      text = `The ${mob.name} is ${def.name.toLowerCase()}.`
    }
  } else if (subject && def.verb) {
    text = `${subject} keeps the ${mob.name} ${def.name.toLowerCase()}.`
  }

  const entry: LogEntry | null = text
    ? {
        kind: 'condition-gain',
        text,
        conditionId: def.id,
        polarity: def.polarity,
        meta: {
          ...(caster ? { name: caster.name } : {}),
          ...(caster?.spellName ? { spellName: caster.spellName } : {}),
          mobName: mob.name,
          mobRarity: mob.rarity,
          conditionName: def.name,
          element: def.element ?? fallbackElement,
        },
      }
    : null

  return { mob: { ...mob, conditions: nextConds }, entry }
}

// Rough severity cue from the dot damage / skip chance / stat-mod magnitude.
// Returns "" for middling severity so the verb stands alone, or an adverb
// with trailing space so it slots straight into the sentence.
function intensityPrefix(def: ConditionDef): string {
  switch (def.kind) {
    case 'dot': {
      const dmg = def.params.damagePerTick ?? 0
      if (dmg >= 3) return 'severely '
      if (dmg <= 1) return 'lightly '
      return ''
    }
    case 'skip': {
      const chance = def.params.skipChance ?? 0
      if (chance >= 0.9) return 'fully '
      if (chance <= 0.4) return 'lightly '
      return ''
    }
    case 'stat-mod': {
      const mag = Math.max(
        Math.abs(def.params.attack ?? 0),
        Math.abs(def.params.defense ?? 0),
      )
      if (mag >= 3) return 'powerfully '
      if (mag <= 1) return 'faintly '
      return ''
    }
  }
}

// Clears every active condition. Used by Resting in a safe room — a night's
// sleep purges poison, sleep, hacks, etc.
export function clearConditions(character: Character): {
  character: Character
  entry: LogEntry | null
} {
  if (!character.conditions || character.conditions.length === 0) {
    return { character, entry: null }
  }
  return {
    character: { ...character, conditions: [] },
    entry: {
      kind: 'narrative',
      text: `${character.name} shakes off every lingering ill.`,
      meta: { name: character.name },
    },
  }
}

export interface ConditionStatMods {
  attack: number
  defense: number
}

// Sums stat-mod bonuses from all active conditions. Unknown ids are skipped.
export function conditionStatMods(
  character: Character,
  world: WorldContent,
): ConditionStatMods {
  let attack = 0
  let defense = 0
  if (!character.conditions) return { attack, defense }
  const defs = defMap(world)
  for (const a of character.conditions) {
    const def = defs.get(a.id)
    if (!def || def.kind !== 'stat-mod') continue
    attack += def.params.attack ?? 0
    defense += def.params.defense ?? 0
  }
  return { attack, defense }
}
