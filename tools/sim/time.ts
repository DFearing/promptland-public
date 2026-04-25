import { TICK_MS, type GameState } from '../../src/game/state'
import { tickSpeedMult } from '../../src/themes'
import type { TickSpeedId } from '../../src/themes/types'

// Mirrors App.tsx:449's cadence computation. Given a tick's state and the
// character's active tickSpeed, returns the in-game ms that tick consumed.
export function tickDurationMs(state: GameState['kind'], speedId: TickSpeedId): number {
  const mult = tickSpeedMult(speedId)
  return Math.max(100, Math.round(TICK_MS[state] / mult))
}
