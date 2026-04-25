import type { Character, DeathRecord, LevelUpRecord } from '../character'
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
  | {
      id: string
      kind: 'death'
      /** Lifetime death count after this death is appended. Drives the
       *  death-banner duration — first few deaths linger, routine deaths
       *  tick by, every 100th gets a milestone beat. */
      deathCount: number
      /** Latest death record — drives the card's killer + "how close"
       *  quip. Optional because the dev-command / Sound-tab preview paths
       *  synthesize a bare death event without a record. */
      record?: DeathRecord
    }
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
  prevStateKind: GameState['kind']
  /** Log entries freshly appended this tick. Caller is responsible for
   *  computing the diff via Set-identity (`nextLog.filter(e => !prevSet.has(e))`)
   *  rather than a length-based slice — once the log reaches its cap, every
   *  append evicts an older entry and length-based diffs silently drop the
   *  new one, which would make damage/level-up events go missing mid-session. */
  newLogEntries: readonly LogEntry[]
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
