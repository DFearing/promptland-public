// Per-event on-screen durations for the blocking fullscreen cards.
// Tuned in code so notable beats linger longer than routine ones. Lives
// in its own module (not alongside EffectsOverlay) so the component file
// can stay component-only and satisfy react-refresh/only-export-components.

export const LEVEL_UP_DURATION_CONFIG = {
  /** Levels 1..earlyMaxLevel get earlyDurationMs on screen. */
  earlyMaxLevel: 4,
  earlyDurationMs: 5000,
  /** Between earlyMaxLevel and dropoffEndLevel, duration ramps down to
   *  defaultDurationMs so the very first few levels feel special without
   *  slowing the game forever. */
  dropoffEndLevel: 9,
  /** Baseline dwell time for routine levels beyond the dropoff. */
  defaultDurationMs: 2000,
  /** Multiples of 10 (but not 50) linger for this long — the 10/20/30/40
   *  "notable" levels. */
  tenMultipleDurationMs: 5000,
  /** Multiples of 50 linger longest and grow each milestone. */
  fiftyMultipleBaseDurationMs: 7000,
  /** Every additional multiple of 50 adds this many ms. */
  fiftyMultipleIncrementMs: 2000,
} as const

export function levelUpDurationMs(level: number): number {
  const c = LEVEL_UP_DURATION_CONFIG
  if (level <= 0) return c.defaultDurationMs
  if (level <= c.earlyMaxLevel) return c.earlyDurationMs
  if (level % 50 === 0) {
    const steps = level / 50
    return c.fiftyMultipleBaseDurationMs + c.fiftyMultipleIncrementMs * (steps - 1)
  }
  if (level % 10 === 0) return c.tenMultipleDurationMs
  if (level <= c.dropoffEndLevel) {
    const span = c.dropoffEndLevel - c.earlyMaxLevel
    const t = span > 0 ? (level - c.earlyMaxLevel) / span : 1
    return Math.round(
      c.earlyDurationMs + t * (c.defaultDurationMs - c.earlyDurationMs),
    )
  }
  return c.defaultDurationMs
}

// Death banner follows the same ramp-down shape as the level-up card but
// keyed off lifetime death count and with a coarser milestone cadence —
// every 100 deaths instead of every 10 levels. The first five deaths are
// worth sitting with (new character finding their floor); the next few
// ramp down so a run of unlucky deaths doesn't spend all its time on the
// defeat screen; routine deaths tick by quickly; the hundredth, two-
// hundredth, etc. pause for a beat the way milestone levels do.
export const DEATH_DURATION_CONFIG = {
  /** Deaths 1..earlyMaxCount get earlyDurationMs. */
  earlyMaxCount: 5,
  earlyDurationMs: 5000,
  /** Ramp span — deaths earlyMaxCount+1..dropoffEndCount linearly scale
   *  from earlyDurationMs down to defaultDurationMs. */
  dropoffEndCount: 10,
  /** Baseline dwell for routine deaths past the ramp. Slightly heavier
   *  than the level-up default — death is the weightier beat. */
  defaultDurationMs: 2500,
  /** Multiples of 100 (100, 200, 300, …) linger for a milestone beat. */
  hundredMultipleDurationMs: 5000,
} as const

export function deathDurationMs(deathCount: number): number {
  const c = DEATH_DURATION_CONFIG
  if (deathCount <= 0) return c.defaultDurationMs
  if (deathCount <= c.earlyMaxCount) return c.earlyDurationMs
  if (deathCount % 100 === 0) return c.hundredMultipleDurationMs
  if (deathCount <= c.dropoffEndCount) {
    const span = c.dropoffEndCount - c.earlyMaxCount
    const t = span > 0 ? (deathCount - c.earlyMaxCount) / span : 1
    return Math.round(
      c.earlyDurationMs + t * (c.defaultDurationMs - c.earlyDurationMs),
    )
  }
  return c.defaultDurationMs
}
