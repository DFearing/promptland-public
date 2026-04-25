import { formatActorName, type Character } from '../character'
import { damageVerb, levelScaleOutgoing, type Severity, type VerbSet } from '../combat'
import { applyCondition, applyMobCondition } from '../conditions'
import { combatBonuses } from '../game/equip'
import { healAdverb } from '../game/intensity'
import { scrollAmountMultiplier, type ScrollLevel } from '../items'
import type { DamageSeverity, LogEntry } from '../log'
import { mobMagicDefense, mobResistMultiplier, type Mob } from '../mobs'
import type { Rng } from '../rng'
import type { WorldContent } from '../worlds'
import { getSpell } from './library'
import type { SpellDef } from './types'

export interface CombinedKillCandidate {
  severity: DamageSeverity
  attackPower?: number
  defense?: number
  scaleMult?: number
}

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
  /** When set, the spell killed the mob with a severe / critical
   *  strike and the standard damage entry was suppressed — the caller
   *  should pass this through to `resolveMobDefeat`'s combinedKill
   *  option so the kill is announced as a single combined line
   *  instead of an attack + defeat pair. */
  combinedKillCandidate?: CombinedKillCandidate
}

function statMod(stat: number): number {
  return Math.floor((stat - 10) / 2)
}

// Applies spell-specific verb overrides on top of the world's default severity
// verbs. Resolution order:
//   1. Spell's own `verbs` map (author-provided per-severity overrides) —
//      wins if present, best flavor control.
//   2. Family verbs keyed off the spell's `element` (fire → FIRE_VERBS,
//      ice → ICE_VERBS, etc.). Makes fireballs scorch, shocks zap.
//   3. World's generic severity-tier verb set.
function resolveVerb(
  spell: SpellDef,
  worldId: string,
  damage: number,
  targetMaxHp: number,
  rng: Rng,
): { severity: Severity; verb: string } {
  const base = damageVerb(damage, targetMaxHp, worldId, spell.element, rng)
  const override = spell.verbs?.[base.severity as keyof VerbSet]
  if (override && override.length > 0) {
    const v = rng.pick(override)
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
  /** Scroll power level (I-V) — set when `source === 'scroll'`. Multiplies
   *  the spell's printed `effect.amount` for damage / heal effects. Absent
   *  ⇒ Level I (1.0×) baseline, matching learned-spell casting. */
  scrollLevel?: ScrollLevel
  /** Per-character PRNG for deterministic replay. */
  rng: Rng
}

export function castSpell(ctx: CastContext): CastResult {
  const { character, world, spell, free, source = 'cast', scrollLevel, rng } = ctx
  const entries: LogEntry[] = []
  // Scrolls multiply the spell's printed amount by their tier (Level I = 1×).
  // Learned-spell casts always behave as Level I — the multiplier is a
  // scroll-only power axis, not a general buff.
  const scrollMult =
    source === 'scroll' && scrollLevel ? scrollAmountMultiplier(scrollLevel) : 1

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
    const verbStart = `${formatActorName(c, 'log')} reads a scroll of ${spell.name}`
    const prelude: LogEntry =
      spell.target === 'enemy' && ctx.mob
        ? {
            kind: 'narrative',
            text: `${verbStart} at the ${ctx.mob.name}.`,
            meta: {
              name: c.name,
              mobName: ctx.mob.name,
              mobRarity: ctx.mob.rarity,
              spellName: spell.name,
            },
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
  let combinedKillCandidate: CombinedKillCandidate | undefined

  const effect = spell.effect
  const el = spell.element
  switch (effect.kind) {
    case 'damage': {
      if (!mob) break
      // MATK / MDEF formula — mirrors physical melee (tick.ts, fight()) so
      // magic and melee scale by the same rules:
      //   matkRoll  = roll(4) + mod(INT) + magicAttackBonus + spell.amount
      //   baseDmg   = matkRoll − mob's magicDefense (or floor(level/3))
      //   finalDmg  = max(1, round(baseDmg × levelScaleOutgoing))
      //
      // `spell.amount` is treated as the spell's inherent "weapon" power —
      // Fireball carries more punch than Magic Missile via its base alone,
      // then the caster's INT and gear stack on top. Level-delta scaling
      // matches physical so a green-con caster hits reliably and a
      // red-con caster gets punished.
      const bonuses = combatBonuses(c, world)
      const magicAttackBonus = bonuses.magicAttack ?? 0
      const levelDelta = c.level - mob.level
      const outgoingMult = levelScaleOutgoing(levelDelta)
      const rollVal = rng.roll(4)
      const scaledAmount = Math.round(effect.amount * scrollMult)
      const matkRoll =
        rollVal + statMod(c.stats.intelligence) + magicAttackBonus + scaledAmount
      const mdef = mobMagicDefense(mob)
      const baseDmg = matkRoll - mdef
      // Element resist applies after the level scale so a fire-immune mob
      // takes 0 from Fireball regardless of caster level. Spells with no
      // declared element (Magic Missile, Psi-Bolt) get a multiplier of 1
      // and pass through untouched.
      const resistMult = mobResistMultiplier(mob, spell.element)
      const dealt = Math.max(1, Math.round(baseDmg * outgoingMult * resistMult))
      const hpAfter = Math.max(0, mob.hp - dealt)
      damage = hpAfter === 0 ? mob.hp : dealt
      const { severity, verb } = resolveVerb(spell, c.worldId, damage, mob.maxHp, rng)
      // Severe / critical kills collapse into a single combined entry
      // emitted by `resolveMobDefeat`. Suppress the standard damage
      // entry so the log doesn't read "Hiro's Fireball scorches the
      // Goblin." then "Hiro reduces the Goblin to a smear of ash."
      // back-to-back. Lighter-tier or non-killing spells keep the
      // standard entry.
      const willKill = hpAfter === 0
      const isFinisher = willKill && (severity === 'severe' || severity === 'critical')
      if (isFinisher) {
        combinedKillCandidate = {
          severity,
          attackPower: matkRoll,
          defense: mdef,
          scaleMult: outgoingMult,
        }
      } else {
        entries.push({
          kind: 'damage',
          text: `${c.name}'s ${spell.name} ${verb} the ${mob.name}.`,
          amount: damage,
          severity,
          meta: {
            name: c.name,
            mobName: mob.name,
            mobRarity: mob.rarity,
            element: el,
            verb,
            severity,
            spellName: spell.name,
            attackPower: matkRoll,
            defense: mdef,
            scaleMult: outgoingMult,
          },
        })
      }
      mob = { ...mob, hp: hpAfter }
      killed = hpAfter === 0
      break
    }
    case 'damage-over-time': {
      if (!mob) break
      // Snapshot the caster's INT-derived scaling into the active
      // condition: dotDamageBonus pumps per-tick bite, durationBonus
      // (halved) extends the DoT window. Half-rate on duration keeps
      // a 14-INT Mage from doubling tick counts — the bite scales
      // faster than the window so raw damage, not attrition, is the
      // reward for high INT.
      const intMod = Math.max(0, statMod(c.stats.intelligence))
      const applied = applyMobCondition(
        mob,
        world,
        effect.conditionId,
        {
          name: c.name,
          spellName: spell.name,
          dotDamageBonus: intMod,
          durationBonus: Math.floor(intMod / 2),
        },
        el,
      )
      mob = applied.mob
      if (applied.entry) entries.push(applied.entry)
      break
    }
    case 'heal': {
      // Heals gain `mod(INT)` on top of the spell's flat amount so a
      // Cleric's stat investment shows up in the HP restored — capped
      // by missing HP as before so overheal still doesn't waste the
      // bonus.
      const intMod = Math.max(0, statMod(c.stats.intelligence))
      const scaledAmount = Math.round(effect.amount * scrollMult)
      const healed = Math.min(c.maxHp - c.hp, scaledAmount + intMod)
      if (healed > 0) {
        c = { ...c, hp: c.hp + healed }
        entries.push({
          kind: 'heal',
          text: `${c.name}'s ${spell.name} knits flesh ${healAdverb(
            healed,
            c.maxHp,
          )}.`,
          amount: healed,
          meta: { name: c.name, element: el, spellName: spell.name },
        })
      }
      break
    }
    case 'buff': {
      // Buffs get duration scaling only — no damage-per-tick concept on
      // this side of the system. A 14-INT caster's "blessed" lasts
      // `defaultDuration + 1` ticks.
      const intMod = Math.max(0, statMod(c.stats.intelligence))
      const applied = applyCondition(c, world, effect.conditionId, spell.name, {
        durationBonus: Math.floor(intMod / 2),
      })
      c = applied.character
      if (applied.entry) entries.push(applied.entry)
      break
    }
    case 'debuff': {
      if (!mob) break
      // Debuffs mirror buffs — duration-only scaling. No DoT bonus here
      // (debuff conditions don't define `damagePerTick`; the helper
      // ignores the bonus for non-DoT kinds anyway).
      const intMod = Math.max(0, statMod(c.stats.intelligence))
      const applied = applyMobCondition(
        mob,
        world,
        effect.conditionId,
        {
          name: c.name,
          spellName: spell.name,
          durationBonus: Math.floor(intMod / 2),
        },
        el,
      )
      mob = applied.mob
      if (applied.entry) entries.push(applied.entry)
      break
    }
    case 'teleport-safe': {
      if (c.lastSafePosition) {
        c = { ...c, position: c.lastSafePosition, hp: c.maxHp, conditions: [] }
        teleported = true
        // Two-sentence form so the reader sees (1) who cast (2) what spell
        // (3) what effect — the prior text hid the cast itself, so an
        // AI-auto-cast Recall looked like something the world did *to*
        // the character rather than a choice the character made.
        entries.push({
          kind: 'chapter',
          text: `${formatActorName(c, 'log')} casts ${spell.name}. ${formatActorName(c, 'log')} vanishes — and wakes somewhere safer.`,
          meta: { name: c.name, spellName: spell.name },
        })
      }
      break
    }
  }

  return {
    character: c,
    mob,
    entries,
    damage,
    killed,
    teleported,
    combinedKillCandidate,
  }
}

// Re-export for callers that want the raw lookup.
export { getSpell }
