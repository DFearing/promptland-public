import type { StatBlock } from './types'

export const BASE_HP = 10

export function maxHpFor(stats: StatBlock): number {
  return BASE_HP + stats.constitution * 2
}

export function xpToNextLevel(level: number): number {
  return level * 100
}
