import type { Mob } from '../mobs'

export type GameState =
  | { kind: 'exploring' }
  | { kind: 'resting'; ticksLeft: number }
  | { kind: 'fighting'; mob: Mob }

export const INITIAL_STATE: GameState = { kind: 'exploring' }

export const TICK_MS: Record<GameState['kind'], number> = {
  exploring: 1500,
  resting: 1000,
  fighting: 900,
}
