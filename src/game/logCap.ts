import type { LogEntry } from '../log'

/** Hard cap on the rolling log buffer at observable boundaries (the
 *  Playing returned by `runTick`). UI consumers can rely on
 *  `log.length <= LOG_CAP` without virtualization. */
export const LOG_CAP = 200

/** Soft cap inside a tick. `append()` lets the log grow up to this size
 *  before evicting in bulk, then `trim()` brings it back down to LOG_CAP
 *  at end of tick. Amortizes the eviction cost from O(N) per append to
 *  O(1) per append (one bulk slice every LOG_CAP appends).
 *
 *  Set to 2× the hard cap so a single tick's log spurt — even an
 *  unusual one (combat fatality + multi-item drop + auto-equip + level-
 *  up + journal entries) — fits without forcing a mid-tick slice. */
export const LOG_CAP_SOFT = LOG_CAP * 2

/** Append `entry` onto `log`. Allocates a new array — callers treat the
 *  input as immutable. Lets the log grow up to LOG_CAP_SOFT; a single
 *  bulk slice at LOG_CAP_SOFT brings it back down to LOG_CAP. The bulk
 *  slice cost is amortized across LOG_CAP appends, so per-append cost
 *  stays O(1) on the hot path.
 *
 *  Callers MUST run `trim()` at observable boundaries (e.g. before
 *  returning Playing from runTick) so the external contract
 *  `log.length <= LOG_CAP` holds. */
export function append(log: LogEntry[], entry: LogEntry): LogEntry[] {
  if (log.length < LOG_CAP_SOFT) {
    return [...log, entry]
  }
  // Bulk slice — drop everything except the most recent (LOG_CAP - 1)
  // entries, then push the new entry. Single allocation.
  return [...log.slice(log.length - LOG_CAP + 1), entry]
}

/** Bring a log buffer back to the observable cap. Returns the same
 *  array reference when already at or under cap so caller code can
 *  short-circuit identity checks (e.g. runTick's journal diff
 *  early-out). */
export function trim(log: LogEntry[]): LogEntry[] {
  return log.length <= LOG_CAP ? log : log.slice(log.length - LOG_CAP)
}
