import type { Character } from '../character'
import { damageVerb } from '../combat'
import type { LogEntry } from '../log'
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
        const dmg = def.params.damagePerTick ?? 0
        if (dmg > 0 && hp > 1) {
          const taken = Math.min(dmg, hp - 1)
          hp -= taken
          const { verb } = damageVerb(taken, character.maxHp, character.worldId)
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
        if (Math.random() < (def.params.skipChance ?? 1)) skipTurn = true
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

// Applies a new condition or refreshes duration if the id is already active.
// Returns { character, entry? } — entry is null if the condition is unknown or
// simply refreshed an existing one (no new announcement for refreshes).
export function applyCondition(
  character: Character,
  world: WorldContent,
  conditionId: string,
  source?: string,
): { character: Character; entry: LogEntry | null } {
  const def = world.conditions.find((d) => d.id === conditionId)
  if (!def) return { character, entry: null }

  const existing = character.conditions.findIndex((c) => c.id === conditionId)
  if (existing >= 0) {
    const refreshed = character.conditions.map((c, i) =>
      i === existing ? { ...c, remainingTicks: def.defaultDuration, source } : c,
    )
    return { character: { ...character, conditions: refreshed }, entry: null }
  }

  const newActive: ActiveCondition = {
    id: conditionId,
    remainingTicks: def.defaultDuration,
    source,
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
