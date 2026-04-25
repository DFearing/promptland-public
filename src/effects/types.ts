import type { LogEntry } from '../log'
import type { GameState } from '../game'

export type EffectEvent =
  | { id: string; kind: 'level-up' }
  | { id: string; kind: 'death' }
  | { id: string; kind: 'damage-taken'; amount: number }
  | { id: string; kind: 'damage-dealt'; amount: number }
  | { id: string; kind: 'loot' }
  | { id: string; kind: 'enter-fight' }

export interface EffectContext {
  prevLogLength: number
  prevStateKind: GameState['kind']
  nextLog: LogEntry[]
  nextStateKind: GameState['kind']
  characterName: string
}

export type FieldId = 'hp' | 'magic' | 'xp' | 'gold'

export interface FieldFxEvent {
  id: string
  field: FieldId
  delta: number
}
