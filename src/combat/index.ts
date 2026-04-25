export {
  DAMAGE_FAMILIES,
  SEVERITIES,
  damageVerb,
  getVerbs,
  isEmphatic,
  pickVerb,
  severityOf,
  type DamageFamily,
  type Severity,
  type VerbSet,
} from './verbs'
export { deathClause, deathSentence, pickDeathPredicate } from './death'
export { KILL_LINES_BY_FAMILY, pickCombinedKillLine } from './killLines'
export { formatAttackLog, type AttackLogParams } from './narrative'
export { levelScaleIncoming, levelScaleOutgoing } from './scaling'
