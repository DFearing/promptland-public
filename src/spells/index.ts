export type {
  SpellDef,
  SpellEffect,
  SpellLevel,
  SpellTarget,
  SpellTargetKind,
  SpellVerbs,
} from './types'
export { WORLD_SPELLS, getSpell, getSpellList, registerGeneratedSpell } from './library'
export { castSpell, canCastSpell, canReadScroll, type CastResult } from './cast'
export {
  generateSpellForLevel,
  isMagicUser,
  spellUnlocksAt,
  unlocksForLevel,
  type SpellUnlockResult,
} from './progression'
