import {
  pickCombinedKillLine,
  pickDeathPredicate,
  type DamageFamily,
} from '../combat'
import type { ItemDef, Rarity } from '../items'
import type { DamageSeverity, LogEntry } from '../log'
import type { Mob } from '../mobs'
import type { Rng } from '../rng'
import { focusAdverb, restAdverb } from './intensity'

/** Mob self-heal line — fires when a wounded mob spends a heal charge
 *  instead of attacking. Used by both character-round and mob-ambush
 *  branches in the fight loop. */
export function formatMobSelfHealLog(mobName: string, healed: number, mobRarity?: Rarity): LogEntry {
  return {
    kind: 'heal',
    text: `The ${mobName} patches itself up.`,
    amount: healed,
    meta: { mobName, ...(mobRarity ? { mobRarity } : {}) },
  }
}

export interface MobDefeatContext {
  mob: Mob
  awardedXp: number
  areaId?: string
  roomName?: string
  /** Damage family of the killing blow — fire, slash, poison, etc.
   *  When provided, ~50% of defeat lines swap in a family-flavored
   *  predicate ("is reduced to ash", "is cleaved in two", …). */
  killFamily?: DamageFamily | 'poison'
  rng: Rng
}

export interface CombinedKillContext {
  characterName: string
  mob: Mob
  awardedXp: number
  /** Family of the killing strike — drives which template pool the
   *  combined line is drawn from. Undefined falls through to generic. */
  killFamily?: DamageFamily | 'generic'
  /** Severity of the killing blow — only 'severe' / 'critical' should
   *  trigger this path, but the value is forwarded into meta so the
   *  damage tag (when log numbers are on) renders consistently. */
  severity: DamageSeverity
  /** Numbers panel breakdown — same fields the standard damage log
   *  carries so the swing tag stays readable when this combined entry
   *  is the kill record. */
  attackPower?: number
  defense?: number
  scaleMult?: number
  /** Killing weapon name — surfaced in meta so weapon popovers stay
   *  reachable from the combined entry. Optional (unarmed / spell). */
  weaponName?: string
  areaId?: string
  roomName?: string
}

/** Combined attack+kill log entry. Replaces the standard damage-line
 *  + defeat-line pair on severe / critical killing blows so a strong
 *  finish reads as one decisive moment instead of two. The picker
 *  draws from family-keyed template pools defined in
 *  `src/combat/killLines.ts` — strictly anatomy-free so generic mob
 *  bodies stay sensible. */
export function formatCombinedKillLog(ctx: CombinedKillContext): LogEntry {
  const line = pickCombinedKillLine(
    ctx.killFamily,
    ctx.characterName,
    ctx.mob.name,
  )
  return {
    kind: 'damage',
    text: `${line} (+${ctx.awardedXp} XP)`,
    amount: ctx.mob.maxHp,
    severity: ctx.severity,
    meta: {
      name: ctx.characterName,
      mobName: ctx.mob.name,
      mobId: ctx.mob.id,
      mobRarity: ctx.mob.rarity,
      curated: ctx.mob.curated === true,
      mobDefeat: true,
      xpText: `+${ctx.awardedXp} XP`,
      severity: ctx.severity,
      attackPower: ctx.attackPower,
      defense: ctx.defense,
      scaleMult: ctx.scaleMult,
      itemName: ctx.weaponName,
      areaId: ctx.areaId,
      roomName: ctx.roomName,
    },
  }
}

/** "The X falls. (+12 XP)" — emitted by `resolveMobDefeat` when a fight
 *  ends in victory. Sample log and the tick loop both route through
 *  this so the meta shape (mobId / rarity / curated flag / mobDefeat
 *  journal hook) stays identical. When `killFamily` is present, a
 *  family-flavored predicate replaces "falls" ~50% of the time. */
export function formatMobDefeatLog(ctx: MobDefeatContext): LogEntry {
  const { mob, awardedXp, areaId, roomName, killFamily, rng } = ctx
  // Coin-flip between the compact "The X falls." and a family-flavored
  // predicate ("is reduced to ash", "is cleaved in two", …). Compact
  // keeps rhythm tight for routine kills; the flavored line gives
  // spell / weapon kills their moment.
  const flavor = killFamily !== undefined && rng.chance(0.5)
  const predicate = flavor ? pickDeathPredicate(killFamily, rng) : 'falls'
  return {
    kind: 'loot',
    text: `The ${mob.name} ${predicate}. (+${awardedXp} XP)`,
    meta: {
      mobName: mob.name,
      mobId: mob.id,
      mobRarity: mob.rarity,
      curated: mob.curated === true,
      xpText: `+${awardedXp} XP`,
      mobDefeat: true,
      areaId,
      roomName,
    },
  }
}

const GOLD_VERBS = [
  'pockets',
  'snatches',
  'scoops up',
  'palms',
  'stashes',
  'squirrels away',
  'bags',
  'nabs',
  'grabs',
  'collects',
  'hoards',
  'tucks away',
] as const

/** Gold-pickup log line. `currency` is the world manifest's currency
 *  name — "gold", "credits", "rubles", etc. */
export function formatGoldPickupLog(
  characterName: string,
  amount: number,
  currency: string,
  rng: Rng,
): LogEntry {
  const goldText = `${amount} ${currency}`
  const verb = rng.pick(GOLD_VERBS)
  return {
    kind: 'loot',
    text: `${characterName} ${verb} ${goldText}.`,
    meta: { name: characterName, goldAmount: amount, goldText },
  }
}

export interface ItemPickupContext {
  characterName: string
  def: ItemDef
  rarity: Rarity
  qty: number
  areaId?: string
}

/** Item-pickup loot line. Consumables carry `potionEffect` so the
 *  renderer can paint the bracketed item in HP-red / MP-blue rather
 *  than the default rarity color. */
export function formatItemPickupLog(ctx: ItemPickupContext): LogEntry {
  const { characterName, def, rarity, qty, areaId } = ctx
  const qtySuffix = qty > 1 ? ` ×${qty}` : ''
  const potionEffect = def.kind === 'consumable' ? def.effect.kind : undefined
  return {
    kind: 'loot',
    text: `${characterName} gathers ${def.name}${qtySuffix}.`,
    meta: {
      name: characterName,
      itemId: def.id,
      itemName: def.name,
      itemRarity: rarity,
      potionEffect,
      areaId,
    },
  }
}

/** End-of-session rest summary. Qualitative adverb via `restAdverb` +
 *  a trailing "(+N HP)" parenthetical that LogPanel strips when numbers
 *  are hidden. `totalHp === 0` falls back to a no-op line so the beat
 *  still reads cleanly. */
export function formatRestSummaryLog(
  characterName: string,
  totalHp: number,
  maxHp: number,
): LogEntry {
  const text = totalHp > 0
    ? `${characterName} finishes resting, feeling ${restAdverb(totalHp, maxHp)} restored. (+${totalHp} HP)`
    : `${characterName} rises, ready to press on.`
  return {
    kind: 'narrative',
    text,
    meta: { name: characterName },
  }
}

/** End-of-session meditate summary. Mirrors the four cases in
 *  `tick.meditate`: both pools gained, MP only, HP only, or neither. */
export function formatMeditateSummaryLog(
  characterName: string,
  totalMp: number,
  maxMp: number,
  totalHp: number,
  maxHp: number,
): LogEntry {
  let text: string
  if (totalMp > 0 && totalHp > 0) {
    text =
      `${characterName}'s meditation ends, focused ${focusAdverb(totalMp, maxMp)}, ` +
      `feeling ${restAdverb(totalHp, maxHp)} restored. (+${totalMp} MP · +${totalHp} HP)`
  } else if (totalMp > 0) {
    text =
      `${characterName}'s meditation ends, focused ${focusAdverb(totalMp, maxMp)}. ` +
      `(+${totalMp} MP)`
  } else if (totalHp > 0) {
    text =
      `${characterName}'s meditation ends, feeling ${restAdverb(totalHp, maxHp)} restored. ` +
      `(+${totalHp} HP)`
  } else {
    text = `${characterName} opens their eyes, clear-headed.`
  }
  return { kind: 'narrative', text, meta: { name: characterName } }
}
