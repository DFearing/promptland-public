export type Drive = 'hunger' | 'fatigue' | 'greed' | 'curiosity' | 'weight' | 'piety'

export interface Drives {
  hunger: number
  fatigue: number
  greed: number
  curiosity: number
  weight: number
  piety: number
}

export const ZERO_DRIVES: Drives = {
  hunger: 0,
  fatigue: 0,
  greed: 0,
  curiosity: 0,
  weight: 0,
  piety: 0,
}

export const DRIVE_MAX = 100
export const DRIVE_THRESHOLD = 35

export const DRIVES: readonly Drive[] = ['hunger', 'fatigue', 'greed', 'curiosity', 'weight', 'piety'] as const

// Drives that accumulate via grow(). Weight + piety are computed, not grown
// — weight from inventory mass (see weight.ts), piety from favor + blessing
// state (see favor.ts::shrinePull).
const GROWABLE: readonly Drive[] = ['hunger', 'fatigue', 'greed', 'curiosity'] as const

export function grow(d: Drives, delta: Partial<Drives>): Drives {
  const out = { ...d }
  for (const k of GROWABLE) {
    out[k] = Math.min(DRIVE_MAX, d[k] + (delta[k] ?? 0))
  }
  return out
}

export function satisfy(d: Drives, which: Drive[]): Drives {
  const out = { ...d }
  for (const k of which) out[k] = 0
  return out
}

export function topDrive(d: Drives): Drive | null {
  let best: Drive | null = null
  let bestV = DRIVE_THRESHOLD - 1
  for (const k of DRIVES) {
    if (d[k] > bestV) {
      bestV = d[k]
      best = k
    }
  }
  return best
}

