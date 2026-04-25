import type { Character, LevelUpRecord } from '../character'
import type { LogEntry } from '../log'
import type { GameState } from '../game'

export type EffectEvent =
  | {
      id: string
      kind: 'level-up'
      record: LevelUpRecord
      previousAt: number
      /** Gold the character had at the previous level-up (or 0 at creation). */
      previousGold: number
    }
  | { id: string; kind: 'death' }
  | { id: string; kind: 'damage-taken'; amount: number; maxHp: number }
  | { id: string; kind: 'damage-dealt'; amount: number }
  | { id: string; kind: 'heal-self'; amount: number; maxHp: number }
  | { id: string; kind: 'loot' }
  | { id: string; kind: 'enter-fight' }
  | {
      id: string
      kind: 'new-area'
      name: string
      /** Rarity tier of the area. Drives the banner variant — rare+ gets
       *  a "Rare Area Discovered" treatment. Defaults to 'common'. */
      rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
    }
  | { id: string; kind: 'llm-connected' }
  | { id: string; kind: 'gold-windfall'; amount: number }
  | { id: string; kind: 'gold-jackpot'; amount: number }
  | { id: string; kind: 'new-mob'; name: string }
  | { id: string; kind: 'new-item'; name: string }
  | { id: string; kind: 'generating-area' }

export interface EffectContext {
  prevLogLength: number
  prevStateKind: GameState['kind']
  nextLog: LogEntry[]
  nextStateKind: GameState['kind']
  characterName: string
  /** Full character post-tick; used to look up the LevelUpRecord payload. */
  character: Character
}

export type FieldId = 'hp' | 'magic' | 'xp' | 'gold'

export interface FieldFxEvent {
  id: string
  field: FieldId
  delta: number
}

export type ElementKind = 'fire' | 'ice' | 'electric' | 'earth' | 'hack'

export type ElementTarget = 'character' | 'mob'

export interface ElementFxEvent {
  id: string
  target: ElementTarget
  element: ElementKind
}
