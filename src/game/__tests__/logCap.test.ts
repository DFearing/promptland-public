import { describe, expect, it } from 'vitest'
import { LOG_CAP, LOG_CAP_SOFT, append, trim } from '../logCap'
import type { LogEntry } from '../../log'

function entry(i: number): LogEntry {
  return { kind: 'narrative', text: `entry-${i}` }
}

function makeLog(n: number): LogEntry[] {
  const out: LogEntry[] = []
  for (let i = 0; i < n; i++) out.push(entry(i))
  return out
}

describe('logCap.append — under cap', () => {
  it('grows the log when below LOG_CAP', () => {
    const log = makeLog(5)
    const next = append(log, entry(99))
    expect(next.length).toBe(6)
    expect(next[5]).toEqual(entry(99))
  })

  it('preserves order — older entries first', () => {
    const log = makeLog(3)
    const next = append(log, entry(99))
    expect(next[0].text).toBe('entry-0')
    expect(next[1].text).toBe('entry-1')
    expect(next[2].text).toBe('entry-2')
    expect(next[3].text).toBe('entry-99')
  })

  it('does not mutate the input array', () => {
    const log = makeLog(5)
    const original = [...log]
    append(log, entry(99))
    expect(log).toEqual(original)
  })
})

describe('logCap.append — between LOG_CAP and LOG_CAP_SOFT', () => {
  it('continues to grow past LOG_CAP without slicing', () => {
    const log = makeLog(LOG_CAP) // exactly at cap
    const next = append(log, entry(999))
    // Old behavior would have evicted entry-0; new amortized behavior
    // lets the log grow to LOG_CAP_SOFT.
    expect(next.length).toBe(LOG_CAP + 1)
    expect(next[0].text).toBe('entry-0') // oldest still present
    expect(next[LOG_CAP].text).toBe('entry-999')
  })

  it('grows up to LOG_CAP_SOFT - 1 without slicing', () => {
    const log = makeLog(LOG_CAP_SOFT - 1)
    const next = append(log, entry(9999))
    expect(next.length).toBe(LOG_CAP_SOFT)
    expect(next[0].text).toBe('entry-0')
  })
})

describe('logCap.append — bulk slice at LOG_CAP_SOFT', () => {
  it('slices back to LOG_CAP on the first append at the soft cap', () => {
    const log = makeLog(LOG_CAP_SOFT) // saturated soft cap
    const next = append(log, entry(99999))
    expect(next.length).toBe(LOG_CAP)
    // The oldest LOG_CAP_SOFT - LOG_CAP + 1 entries are dropped; entries
    // [LOG_CAP_SOFT - LOG_CAP + 1 .. LOG_CAP_SOFT - 1] survive, then the
    // new entry is appended.
    const firstKept = LOG_CAP_SOFT - LOG_CAP + 1
    expect(next[0].text).toBe(`entry-${firstKept}`)
    expect(next[LOG_CAP - 1].text).toBe('entry-99999')
  })
})

describe('logCap.trim', () => {
  it('returns the same array when at or under cap', () => {
    const log = makeLog(LOG_CAP)
    const trimmed = trim(log)
    expect(trimmed).toBe(log) // reference equality matters for runTick short-circuits
  })

  it('returns the same array when below cap', () => {
    const log = makeLog(50)
    const trimmed = trim(log)
    expect(trimmed).toBe(log)
  })

  it('slices to LOG_CAP when over cap', () => {
    const log = makeLog(LOG_CAP + 50)
    const trimmed = trim(log)
    expect(trimmed.length).toBe(LOG_CAP)
    expect(trimmed[0].text).toBe('entry-50')
    expect(trimmed[LOG_CAP - 1].text).toBe(`entry-${LOG_CAP + 49}`)
  })

  it('slices to LOG_CAP when at LOG_CAP_SOFT', () => {
    const log = makeLog(LOG_CAP_SOFT)
    const trimmed = trim(log)
    expect(trimmed.length).toBe(LOG_CAP)
    expect(trimmed[0].text).toBe(`entry-${LOG_CAP_SOFT - LOG_CAP}`)
  })
})

describe('logCap — amortization invariants', () => {
  it('many appends followed by trim equals classic O(N) eviction', () => {
    // Walk forward through many appends, trimming periodically (mimics
    // runTick's pattern). The final log must equal what classic
    // per-append slicing would produce: the most recent LOG_CAP entries
    // out of all appended values.
    let amortized: LogEntry[] = []
    let classic: LogEntry[] = []
    const total = LOG_CAP * 3 + 7
    for (let i = 0; i < total; i++) {
      amortized = append(amortized, entry(i))
      classic = classic.length >= LOG_CAP
        ? [...classic.slice(1), entry(i)]
        : [...classic, entry(i)]
    }
    // Trim the amortized log to make it observable-equivalent.
    const observed = trim(amortized)
    expect(observed.length).toBe(LOG_CAP)
    expect(classic.length).toBe(LOG_CAP)
    expect(observed.map((e) => e.text)).toEqual(classic.map((e) => e.text))
  })
})
