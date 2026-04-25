import type { Rarity } from '../items'
import type { LogEntry } from '../log'
import type { Severity } from './verbs'

export interface AttackLogParams {
  /** `'char-to-mob'` reads as `${charName} ${verb} the ${mobName}`; the
   *  reverse builds `The ${mobName} ${verb} ${charName}`. Sample and tick
   *  share this so the two directions can't drift apart. */
  direction: 'char-to-mob' | 'mob-to-char'
  characterName: string
  mobName: string
  verb: string
  severity: Severity
  amount: number
  /** Raw attack roll and total defense feed the (ATK − DEF) breakdown
   *  the log renderer surfaces when "Log numbers" is on. */
  attackPower: number
  defense: number
  /** Character's equipped weapon, when present. Appends "with ${weaponName}"
   *  to char→mob lines. Mob-to-char lines ignore this. */
  weaponName?: string
  /** Level-delta swing multiplier applied after `(ATK − DEF)`. Surfaces
   *  as a trailing `· ×0.48 swing` segment on the damage tag when not
   *  ~1.0, so the logged breakdown reconciles with the final DMG. */
  scaleMult?: number
  /** Mob rarity so the log renderer can paint the mob name with rarity
   *  color (stars prefix) instead of blanket red. */
  mobRarity?: Rarity
}

/** Builds a `damage` LogEntry with the same text + meta shape every tick-
 *  path damage emission uses. Extracted so the dev sample log and the
 *  live combat loop can't drift on wording or meta. */
export function formatAttackLog(p: AttackLogParams): LogEntry {
  const text =
    p.direction === 'char-to-mob'
      ? p.weaponName
        ? `${p.characterName} ${p.verb} the ${p.mobName} with ${p.weaponName}.`
        : `${p.characterName} ${p.verb} the ${p.mobName}.`
      : `The ${p.mobName} ${p.verb} ${p.characterName}.`
  return {
    kind: 'damage',
    text,
    amount: p.amount,
    severity: p.severity,
    meta: {
      name: p.characterName,
      mobName: p.mobName,
      verb: p.verb,
      severity: p.severity,
      ...(p.direction === 'char-to-mob' && p.weaponName
        ? { itemName: p.weaponName }
        : {}),
      attackPower: p.attackPower,
      defense: p.defense,
      ...(p.scaleMult !== undefined ? { scaleMult: p.scaleMult } : {}),
      ...(p.mobRarity ? { mobRarity: p.mobRarity } : {}),
    },
  }
}
