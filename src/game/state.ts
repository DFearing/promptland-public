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

export type GameState =
  | { kind: 'exploring' }
  | { kind: 'resting'; ticksLeft: number }
  | { kind: 'meditating'; ticksLeft: number }
  | {
      kind: 'fighting'
      mob: Mob
      /** Opening-attack bonus for one side. Decrements each tick until 0,
       *  at which point normal alternating combat resumes. `side` is the
       *  ambusher; the other side skips its action while ticks remain. */
      ambush?: { side: 'character' | 'mob'; ticksLeft: number }
    }
  | { kind: 'using-room'; action: UsingAction }

export const INITIAL_STATE: GameState = { kind: 'exploring' }

// Base cadence per state, in ms. Slower than the original prototype values
// so the log has room to breathe and the player can read each line before
// the next tick fires. The Settings "Tick speed" control multiplies this —
// 1× plays at these values, 2× halves them, 0.5× doubles them.
export const TICK_MS: Record<GameState['kind'], number> = {
  exploring: 2400,
  resting: 1800,
  meditating: 1800,
  fighting: 1400,
  'using-room': 1800,
}
