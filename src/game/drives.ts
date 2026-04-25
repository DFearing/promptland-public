export type Drive = 'hunger' | 'fatigue' | 'greed' | 'curiosity'

export interface Drives {
  hunger: number
  fatigue: number
  greed: number
  curiosity: number
}

export const ZERO_DRIVES: Drives = {
  hunger: 0,
  fatigue: 0,
  greed: 0,
  curiosity: 0,
}

export const DRIVE_MAX = 100
export const DRIVE_THRESHOLD = 35

export const DRIVES: readonly Drive[] = ['hunger', 'fatigue', 'greed', 'curiosity'] as const

export function grow(d: Drives, delta: Partial<Drives>): Drives {
  return {
    hunger: Math.min(DRIVE_MAX, d.hunger + (delta.hunger ?? 0)),
    fatigue: Math.min(DRIVE_MAX, d.fatigue + (delta.fatigue ?? 0)),
    greed: Math.min(DRIVE_MAX, d.greed + (delta.greed ?? 0)),
    curiosity: Math.min(DRIVE_MAX, d.curiosity + (delta.curiosity ?? 0)),
  }
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

