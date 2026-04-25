export type {
  Character,
  DeathRecord,
  Equipped,
  InventoryItem,
  LevelUpRecord,
  StatBlock,
} from './types'
export { describeCharacter, type CharacterDisplay } from './display'
export { BASE_HP, maxHpFor, xpToNextLevel } from './stats'
export { makeDefaults, migrateCharacter } from './defaults'
