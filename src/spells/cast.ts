import type { Character } from '../character'
import { damageVerb, type Severity, type VerbSet } from '../combat'
import { applyCondition } from '../conditions'
import type { LogEntry } from '../log'
import type { Mob } from '../mobs'
import type { WorldContent } from '../worlds'
import { getSpell } from './library'
import type { SpellDef } from './types'

export interface CastResult {
  character: Character
  mob?: Mob
  entries: LogEntry[]
  /** Raw damage dealt to mob (0 if spell had no direct-damage effect). */
  damage: number
  /** True if this cast reduced the mob to 0 HP. */
  killed: boolean
  /** True if the spell teleported the caster to a safe location. */
  teleported: boolean
}

function rand(max: number): number {
  return Math.floor(Math.random() * max)
}

function pickFrom<T>(list: T[]): T {
  return list[rand(list.length)]
}

// Applies spell-specific verb overrides on top of the world's default severity
// verbs. If the spell doesn't define a verb list for the chosen severity, fall
// back to the world's combat verb set.
function resolveVerb(
  spell: SpellDef,
  worldId: string,
  damage: number,
  targetMaxHp: number,
): { severity: Severity; verb: string } {
  const base = damageVerb(damage, targetMaxHp, worldId)
  const override = spell.verbs?.[base.severity as keyof VerbSet]
  if (override && override.length > 0) {
    const v = pickFrom(override)
    return {
      severity: base.severity,
      verb: base.severity === 'critical' ? `${v}!` : v,
    }
  }
  return base
}

export function canCastSpell(character: Character, spell: SpellDef): boolean {
  if (!character.spells?.includes(spell.id)) return false
  return character.magic >= spell.magicCost
}

export function canReadScroll(character: Character, spell: SpellDef): boolean {
  return character.stats.intelligence >= spell.scrollIntRequirement
}

export interface CastContext {
  character: Character
  mob?: Mob
  world: WorldContent
  spell: SpellDef
  /** When true, the caster pays no magic cost (scroll use). */
  free?: boolean
  /** Source label for log flavor ("reads the scroll" vs "casts"). */
  source?: 'cast' | 'scroll'
}

export function castSpell(ctx: CastContext): CastResult {
  const { character, world, spell, free, source = 'cast' } = ctx
  const entries: LogEntry[] = []

  // Pay cost (skip for scroll use).
  let c: Character = character
  if (!free) {
    c = { ...c, magic: Math.max(0, c.magic - spell.magicCost) }
  }

  // Scroll use stays announced — the scroll is a held inventory item burning
  // away, and "X reads a scroll of Y" tells the player what they spent. A
  // regular cast goes straight to the effect line: the verb / heal / condition
  // entry already names the spell or its result, so a prelude was redundant.
  if (source === 'scroll') {
    const verbStart = `${c.name} reads a scroll of ${spell.name}`
    const prelude: LogEntry =
      spell.target === 'enemy' && ctx.mob
        ? {
            kind: 'narrative',
            text: `${verbStart} at the ${ctx.mob.name}.`,
            meta: { name: c.name, mobName: ctx.mob.name, spellName: spell.name },
          }
        : {
            kind: 'narrative',
            text: `${verbStart}.`,
            meta: { name: c.name, spellName: spell.name },
          }
    entries.push(prelude)
  }

  let mob = ctx.mob
  let damage = 0
  let killed = false
  let teleported = false

  const effect = spell.effect
  const el = spell.element
  switch (effect.kind) {
    case 'damage': {
      if (!mob) break
      const dmg = effect.amount
      const hpAfter = Math.max(0, mob.hp - dmg)
      const dealt = mob.hp - hpAfter
      damage = dealt
      const { severity, verb } = resolveVerb(spell, c.worldId, dealt, mob.maxHp)
      entries.push({
        kind: 'damage',
        text: `${c.name}'s ${spell.name} ${verb} the ${mob.name}.`,
        amount: dealt,
        severity,
        meta: {
          name: c.name,
          mobName: mob.name,
          element: el,
          verb,
          severity,
          spellName: spell.name,
        },
      })
      mob = { ...mob, hp: hpAfter }
      killed = hpAfter === 0
      break
    }
    case 'damage-over-time': {
      if (!mob) break
      const def = world.conditions.find((d) => d.id === effect.conditionId)
      if (def) {
        const existing = (mob.conditions ?? []).find((a) => a.id === def.id)
        const nextConds = existing
          ? (mob.conditions ?? []).map((a) =>
              a.id === def.id ? { ...a, remainingTicks: def.defaultDuration } : a,
            )
          : [
              ...(mob.conditions ?? []),
              { id: def.id, remainingTicks: def.defaultDuration },
            ]
        mob = { ...mob, conditions: nextConds }
        entries.push({
          kind: 'condition-gain',
          text: `The ${mob.name} is ${def.name.toLowerCase()}.`,
          conditionId: def.id,
          polarity: def.polarity,
          meta: {
            mobName: mob.name,
            conditionName: def.name,
            element: def.element ?? el,
          },
        })
      }
      break
    }
    case 'heal': {
      const healed = Math.min(c.maxHp - c.hp, effect.amount)
      if (healed > 0) {
        c = { ...c, hp: c.hp + healed }
        entries.push({
          kind: 'heal',
          text: `${c.name}'s ${spell.name} knits flesh together.`,
          amount: healed,
          meta: { name: c.name, element: el, spellName: spell.name },
        })
      }
      break
    }
    case 'buff': {
      const applied = applyCondition(c, world, effect.conditionId, spell.name)
      c = applied.character
      if (applied.entry) entries.push(applied.entry)
      break
    }
    case 'debuff': {
      if (!mob) break
      const def = world.conditions.find((d) => d.id === effect.conditionId)
      if (def) {
        const existing = (mob.conditions ?? []).find((a) => a.id === def.id)
        const nextConds = existing
          ? (mob.conditions ?? []).map((a) =>
              a.id === def.id ? { ...a, remainingTicks: def.defaultDuration } : a,
            )
          : [
              ...(mob.conditions ?? []),
              { id: def.id, remainingTicks: def.defaultDuration },
            ]
        mob = { ...mob, conditions: nextConds }
        entries.push({
          kind: 'condition-gain',
          text: `The ${mob.name} is ${def.name.toLowerCase()}.`,
          conditionId: def.id,
          polarity: def.polarity,
          meta: {
            mobName: mob.name,
            conditionName: def.name,
            element: def.element ?? el,
          },
        })
      }
      break
    }
    case 'teleport-safe': {
      if (c.lastSafePosition) {
        c = { ...c, position: c.lastSafePosition, hp: c.maxHp, conditions: [] }
        teleported = true
        entries.push({
          kind: 'chapter',
          text: `${c.name} vanishes — and wakes somewhere safer.`,
          meta: { name: c.name },
        })
      }
      break
    }
  }

  return { character: c, mob, entries, damage, killed, teleported }
}

// Re-export for callers that want the raw lookup.
export { getSpell }
