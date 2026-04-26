export type {
  ActiveBlessing,
  Character,
  DeathRecord,
  Equipped,
  InventoryItem,
  ItemAcquisition,
  JournalEntry,
  JournalEntryKind,
  JournalEntryMeta,
  LevelSegment,
  LevelUpLearnedSpell,
  LevelUpRecord,
  SavedRecord,
  StatBlock,
} from './types'
export { formatActorName, type ActorContext } from './actorName'
export { describeCharacter, type CharacterDisplay } from './display'
export { BASE_HP, castingStatValue, maxHpFor, maxMagicFor, xpToNextLevel } from './stats'
export { makeDefaults, migrateCharacter } from './defaults'
export {
  LAST_AUTHORED_TITLE_INDEX,
  currentTitle,
  currentTitleIndex,
  levelForTitleIndex,
  resolveTitle,
  titleIndexForLevel,
  type TitleResolution,
  type TitleSource,
} from './titles'
