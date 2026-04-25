// Mulberry32 — cheap, well-distributed, deterministic 32-bit PRNG.
// Shared across game-state randomness, area shape generation, and the
// sim runner. UI/FX code stays on Math.random.

/** Raw mulberry32 factory — returns a () => [0, 1) stepper seeded by
 *  the given integer. Used by shapeGen (which wants a bare function,
 *  not an Rng instance) and as the core of the Rng class. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stateful PRNG wrapper around mulberry32. Carries its own 32-bit
 *  state so each character can own an independent stream. State can
 *  be serialized (save/load) and cloned (prediction). */
export class Rng {
  private state: number

  private constructor(state: number) {
    this.state = state >>> 0
  }

  static fromSeed(seed: number): Rng {
    return new Rng(seed)
  }

  static fromState(state: number): Rng {
    return new Rng(state)
  }

  /** Returns a float in [0, 1). Advances the internal state. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns an integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }

  /** Returns an integer in [1, sides]. */
  roll(sides: number): number {
    return 1 + this.nextInt(sides)
  }

  /** Picks a uniformly random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('Rng.pick called on empty array')
    }
    return arr[this.nextInt(arr.length)]
  }

  /** Returns true with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Weighted selection. Entries are [value, weight] pairs. */
  weighted<T>(entries: Array<[T, number]>): T {
    const total = entries.reduce((acc, [, w]) => acc + w, 0)
    let r = this.next() * total
    for (const [value, weight] of entries) {
      r -= weight
      if (r <= 0) return value
    }
    return entries[entries.length - 1][0]
  }

  /** Export the current state for serialization. */
  save(): number {
    return this.state >>> 0
  }

  /** Create an independent copy with the same state. */
  clone(): Rng {
    return new Rng(this.state)
  }

  /**
   * Creates a fresh `Rng` seeded from the platform's crypto-quality random
   * source. Use this from non-tick contexts (dev panel actions, sample-log
   * generators, tests that don't pin a seed) where reproducibility isn't
   * required and a one-shot random stream is what you actually want.
   *
   * Game logic inside the tick loop should NOT call this — the tick rehydrates
   * the character's persisted `rngState` so the same save plays back identically.
   */
  static random(): Rng {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    return Rng.fromSeed(seed)
  }
}
