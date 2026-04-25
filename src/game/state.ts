import type { Mob } from '../mobs'
import type { Position } from '../areas'
import type { Drive } from './drives'

/**
 * `using-room` represents the character interacting with the current room —
 * a beat that deserves its own tick rather than happening inline with the
 * move that brought them there. v1 only carries 'satisfy' (satiate a drive
 * from the room's amenities), but the shape is deliberately open so shops,
 * portals, and interactions can slot in without reshaping the state.
 */
export type UsingAction =
  | { kind: 'satisfy'; drives: Drive[] }
  | { kind: 'traverse-portal'; destination: Position }
  | { kind: 'sell' }
  /** Offers unwanted inventory at a shrine for a modest gold return.
   *  Fallback for overloaded characters who haven't made it to a shop
   *  — narrative fit (the gods accept offerings), mechanical relief
   *  (weight drive goes down, character lightens up). Fires when the
   *  explore tick lands on a shrine with weight at threshold. */
  | { kind: 'sacrifice' }
  /** Portal Hub selection — the player stepped on a portalHub tile and
   *  must choose between forging a new path (LLM gen) or revisiting a
   *  previously generated destination. The dialog is rendered in App. */
  | { kind: 'portal-hub-select'; roomKey: string }

/** Optional bookkeeping carried on rest / meditate states so the tick
 *  handler can scale restoration by streak length and emit a single
 *  end-of-session summary instead of per-tick chatter. Fields default
 *  sensibly when absent so pre-feature saves / dev force-rest callers
 *  don't have to opt in. */
export interface RestStreak {
  /** Ticks elapsed inside this rest/meditate sequence. Increments *after*
   *  the current tick restores, so a streak of 0 means "first tick". */
  ticksElapsed?: number
  /** Cumulative HP restored across the session so far. */
  hpRestored?: number
  /** Cumulative MP restored across the session so far. */
  mpRestored?: number
  /** Tick count at which the next filler log line should fire. Randomized
   *  on state entry and re-rolled each time a filler lands, so the
   *  cadence stays irregular (every 3-5 ticks). */
  nextFillerAt?: number
}

export type GameState =
  | { kind: 'exploring' }
  | ({ kind: 'resting'; ticksLeft: number } & RestStreak)
  | ({ kind: 'meditating'; ticksLeft: number } & RestStreak)
  | {
      kind: 'fighting'
      mob: Mob
      /** Opening-attack bonus for one side. Decrements each tick until 0,
       *  at which point normal alternating combat resumes. `side` is the
       *  ambusher; the other side skips its action while ticks remain.
       *  `reason: 'stealth'` flags rogue/ranger first-round stealth strikes
       *  — the first fight tick grants bonus damage and a guaranteed
       *  on-hit poison for rogues. */
      ambush?: {
        side: 'character' | 'mob'
        ticksLeft: number
        reason?: 'stealth'
      }
      /** When set, this fight is a gateway-guardian encounter spawned to
       *  mask LLM area generation latency. The value is the exit room key
       *  (e.g. "areaId::x,y,z") that triggered generation. On mob defeat
       *  the transition flow checks whether generation has completed; on
       *  player death the tile stays ungenerated and standard respawn
       *  applies. */
      gatewayExitKey?: string
    }
  | { kind: 'using-room'; action: UsingAction }
  | {
      kind: 'generating-area'
      /** Room key identifying the exit room that triggered generation. */
      exitRoomKey: string
      /** Countdown ticks while the LLM works. */
      ticksLeft: number
    }

export const INITIAL_STATE: GameState = { kind: 'exploring' }

// Base cadence per state, in ms. Each state gets its own feel:
//   - resting / meditating are fast — they're meant to feel like a quick
//     breather between beats, not a multi-second downtime.
//   - exploring is medium — the reader gets room to process each move
//     but the character keeps moving at a readable pace.
//   - fighting is slow — the biggest source of drama, every swing and
//     counter deserves space to land before the next tick fires.
//   - using-room sits between exploring and fighting; a one-beat action
//     (sell, drink, traverse).
//   - generating-area reflects LLM latency expectation, not gameplay.
// The Settings "Tick speed" control multiplies these — 1× plays at
// these values, 2× halves them, 0.5× doubles them.
export const TICK_MS: Record<GameState['kind'], number> = {
  exploring: 2000,
  resting: 1000,
  meditating: 1000,
  fighting: 2800,
  'using-room': 1600,
  'generating-area': 2000,
}
