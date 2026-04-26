import { bench, describe } from 'vitest'
import { type Character, type InventoryItem, makeDefaults, maxHpFor, maxMagicFor } from '../../character'
import { mulberry32 } from '../../rng'
import { getWorldContent, getWorldManifest } from '../../worlds'
import { INITIAL_STATE } from '../state'
import type { GameState } from '../state'
import { type Playing, runTick } from '../tick'

// =============================================================================
// Tick benchmark — self-contained harness for comparing tick performance
// against `main`.
//
// HOW TO USE
// ----------
//   1. On `main` (or whatever baseline branch):
//        git checkout main
//        cp src/game/__tests__/tick.bench.ts /tmp/tick.bench.ts  # if not present
//        cp /tmp/tick.bench.ts src/game/__tests__/tick.bench.ts  # restore
//        npm run bench > /tmp/bench-main.txt
//   2. On the refactor branch:
//        git checkout refactor/tick-extract-coordinators
//        npm run bench > /tmp/bench-refactor.txt
//   3. Diff the ops/sec columns.
//
// The harness deliberately doesn't depend on any test fixtures that might
// move/rename across branches — the character factory and the world load
// are inlined here so the file works as a drop-in on either branch. The
// scenarios themselves only call `runTick` + a small set of stable public
// constructors (`makeDefaults`, `maxHpFor`, `getWorldContent`,
// `getWorldManifest`, `INITIAL_STATE`, `mulberry32`).
//
// DETERMINISM
// -----------
// Date.now() and Math.random() are pinned for the duration of the bench.
// runTick draws all randomness from `character.rngState`, so a given
// (seed, world) pair replays bit-exactly — every iteration of every bench
// runs identical work. Wall-clock noise stays out of the measurement.
// =============================================================================

const FROZEN_TIME = 1_700_000_000_000
const PINNED_RNG_SEED = 0xc0ffee_01

const originalDateNow = Date.now
const originalMathRandom = Math.random
Date.now = () => FROZEN_TIME
Math.random = mulberry32(0xfeed_face)

// Note: Date.now and Math.random remain pinned for the entire bench
// process — the harness intentionally does not restore them, since the
// process exits when the bench is done. Both `originalDateNow` and
// `originalMathRandom` are kept around only to guarantee the references
// aren't garbage-collected mid-bench, which would invalidate the
// stub when V8 inlines the indirect call.
void originalDateNow
void originalMathRandom

function makeStartingCharacter(): Character {
  const world = getWorldManifest('fantasy')
  if (!world) throw new Error('fantasy manifest missing')
  const klass = world.classes.find((c) => c.id === 'warrior')
  if (!klass) throw new Error('warrior class missing')
  const stats = { ...klass.startingStats }
  const inventory: InventoryItem[] = klass.startingInventory.map((t, i) => ({
    id: `inv-${i}`,
    name: t.name,
    description: t.description,
    quantity: t.quantity,
    level: 1,
    acquired: { at: FROZEN_TIME, source: 'starting' },
  }))
  const maxHp = maxHpFor(stats)
  const maxMagic =
    klass.magicAffinity !== undefined
      ? maxMagicFor(stats, klass.magicAffinity, klass.castingStat)
      : (klass.startingMaxMagic ?? 0)
  const defaults = makeDefaults('fantasy')
  return {
    ...defaults,
    id: 'pinned-char',
    name: 'Hiro',
    worldId: world.id,
    worldVersion: world.version,
    speciesId: 'human',
    classId: 'warrior',
    createdAt: FROZEN_TIME,
    level: 1,
    xp: 0,
    hp: Math.max(1, Math.ceil(maxHp * 0.6)),
    maxHp,
    magic: maxMagic,
    maxMagic,
    stats,
    inventory,
    spells: [...(klass.startingSpells ?? [])],
    segment: { startedAt: FROZEN_TIME, startGold: 0 },
    tickSpeed: '50',
    tickSpeedAuto: false,
    rngState: PINNED_RNG_SEED,
    journal: [],
  }
}

function freshPlaying(): Playing {
  return {
    character: makeStartingCharacter(),
    log: [],
    state: INITIAL_STATE,
  }
}

// Replay a fixed number of ticks against the fantasy world. Returns the
// final Playing so the bench can prove work was actually done — and
// catches any "the optimizer dropped the loop" hot-path surprises.
function runScripted(playing: Playing, ticks: number): Playing {
  const world = getWorldContent('fantasy')
  if (!world) throw new Error('fantasy content missing')
  let p = playing
  for (let i = 0; i < ticks; i++) {
    p = runTick(p, world)
  }
  return p
}

// Pre-rolled "warm" Playing snapshots at known offsets — most ticks of a
// real run aren't tick-zero, and the early game is unrepresentative
// (no equipment, low XP, no chest, fewer log entries to filter).
// Computing these once outside `bench()` keeps each iteration's setup
// out of the timing.
function warmTo(ticks: number): Playing {
  return runScripted(freshPlaying(), ticks)
}

const WARM_50 = warmTo(50) // typical mid-explore state with some history
const WARM_200 = warmTo(200) // log buffer near cap, several level-ups in
const WARM_500 = warmTo(500) // long-running character, deeper systems exercised

// The bench scenarios exercise the tick loop at three depths:
//   - cold: empty log, level-1 character, no equipment past starting kit
//   - warm-50: ~50 ticks in — first explore loops, drives accumulating
//   - warm-200: ~200 ticks in — log buffer near LOG_CAP, evictions firing
//   - warm-500: ~500 ticks in — multiple level-ups, broader inventory
//
// Each scenario times K runTick() calls so the per-call cost dominates
// any per-iteration overhead from the benchmark harness.
//
// `time` is the budget per scenario (ms); higher = lower variance but
// slower run. `iterations` caps the number of samples (vitest's bench
// runs until either time elapses or iterations is hit, whichever comes
// first). Tuned so a full suite finishes in well under 30 seconds.

const BENCH_OPTIONS = { time: 1500, iterations: 100 } as const

describe('runTick — cold start', () => {
  bench(
    'cold: 1 tick from a fresh character',
    () => {
      runScripted(freshPlaying(), 1)
    },
    BENCH_OPTIONS,
  )

  bench(
    'cold: 50 ticks from a fresh character',
    () => {
      runScripted(freshPlaying(), 50)
    },
    BENCH_OPTIONS,
  )
})

describe('runTick — warm 50-tick character', () => {
  bench(
    'warm-50: 1 tick',
    () => {
      runTick(WARM_50, getWorldContent('fantasy')!)
    },
    BENCH_OPTIONS,
  )

  bench(
    'warm-50: 50 more ticks',
    () => {
      runScripted(WARM_50, 50)
    },
    BENCH_OPTIONS,
  )
})

describe('runTick — warm 200-tick character (log buffer at cap)', () => {
  bench(
    'warm-200: 1 tick',
    () => {
      runTick(WARM_200, getWorldContent('fantasy')!)
    },
    BENCH_OPTIONS,
  )

  bench(
    'warm-200: 100 more ticks',
    () => {
      runScripted(WARM_200, 100)
    },
    BENCH_OPTIONS,
  )
})

describe('runTick — warm 500-tick character (deep state)', () => {
  bench(
    'warm-500: 1 tick',
    () => {
      runTick(WARM_500, getWorldContent('fantasy')!)
    },
    BENCH_OPTIONS,
  )

  bench(
    'warm-500: 100 more ticks',
    () => {
      runScripted(WARM_500, 100)
    },
    BENCH_OPTIONS,
  )
})

// State-conditioned scenarios — find a tick where the character is in
// each state of interest (resting / fighting / using-room) and time
// just that one-step transition. This isolates per-state-handler
// cost so a regression in `fight()` doesn't hide behind cheaper
// `explore()` ticks in an aggregate average.
//
// We scan up to MAX_SCAN ticks looking for each state; whichever ones
// don't naturally surface in that window are silently skipped (the
// bench file remains green). On the pinned seed the warrior reliably
// hits all three within the first few hundred ticks.

function findStateSnapshot(
  start: Playing,
  target: GameState['kind'],
  maxScan: number = 800,
): Playing | null {
  const world = getWorldContent('fantasy')
  if (!world) return null
  let p = start
  for (let i = 0; i < maxScan; i++) {
    if (p.state.kind === target) return p
    p = runTick(p, world)
  }
  return p.state.kind === target ? p : null
}

const FIGHTING_SNAPSHOT = findStateSnapshot(freshPlaying(), 'fighting')
const RESTING_SNAPSHOT = findStateSnapshot(freshPlaying(), 'resting')

describe('runTick — per-state slices', () => {
  if (FIGHTING_SNAPSHOT) {
    bench(
      'fighting: 1 tick',
      () => {
        runTick(FIGHTING_SNAPSHOT, getWorldContent('fantasy')!)
      },
      BENCH_OPTIONS,
    )
  }
  if (RESTING_SNAPSHOT) {
    bench(
      'resting: 1 tick',
      () => {
        runTick(RESTING_SNAPSHOT, getWorldContent('fantasy')!)
      },
      BENCH_OPTIONS,
    )
  }
})

// =============================================================================
// Targeted hot-path scenarios — isolate specific bottlenecks so optimizations
// have a bench they can move directly. Each scenario is constructed to
// stress one allocation pattern rather than measure end-to-end cost.
// =============================================================================

// LOG_CAP eviction stress — sit in the busiest tick state we can find
// (typically resting/meditating with rapid filler emission OR exploring
// with many drive-shift / NPC / encounter lines). At log.length ≥ 200
// every append() copies the entire 200-element array. Cumulative cost
// over a long run is dominated by this slice.
const LOG_FULL_SNAPSHOT = (() => {
  const world = getWorldContent('fantasy')
  if (!world) return null
  let p = freshPlaying()
  // Walk forward until log fills. Most starting characters fill the log
  // within ~80-120 ticks given the pinned seed (each tick emits 1-3
  // entries on average).
  for (let i = 0; i < 400; i++) {
    p = runTick(p, world)
    if (p.log.length >= 200) return p
  }
  return p
})()

describe('hot-path: log eviction stress', () => {
  if (LOG_FULL_SNAPSHOT) {
    bench(
      'log-full: 1 tick (every append evicts)',
      () => {
        runTick(LOG_FULL_SNAPSHOT, getWorldContent('fantasy')!)
      },
      BENCH_OPTIONS,
    )

    bench(
      'log-full: 100 more ticks',
      () => {
        runScripted(LOG_FULL_SNAPSHOT, 100)
      },
      BENCH_OPTIONS,
    )
  }
})

// Deep-inventory weight recompute — every explore tick that doesn't
// short-circuit calls `stampWeight`, which walks the full inventory
// and maps each item's archetype. The cost is ~O(inventory.length ×
// log(items.length)). A character with a large inventory pays this on
// every explore tick.
const DEEP_INVENTORY_SNAPSHOT = (() => {
  const base = WARM_500
  const world = getWorldContent('fantasy')
  if (!world) return null
  // Pad the inventory with synthetic stack entries pointing to real
  // archetypes. We pick the first 20 item ids and create 5 quantity-1
  // copies each — 100 entries total.
  const fill: InventoryItem[] = []
  for (let i = 0; i < Math.min(20, world.items.length); i++) {
    const archetype = world.items[i]
    for (let q = 0; q < 5; q++) {
      fill.push({
        id: `bench-fill-${i}-${q}`,
        archetypeId: archetype.id,
        name: archetype.name,
        quantity: 1,
        level: 1,
        acquired: { at: FROZEN_TIME, source: 'starting' },
      })
    }
  }
  return {
    ...base,
    character: {
      ...base.character,
      inventory: [...base.character.inventory, ...fill],
    },
  }
})()

describe('hot-path: deep inventory weight recompute', () => {
  if (DEEP_INVENTORY_SNAPSHOT) {
    bench(
      'deep-inv: 1 tick',
      () => {
        runTick(DEEP_INVENTORY_SNAPSHOT, getWorldContent('fantasy')!)
      },
      BENCH_OPTIONS,
    )

    bench(
      'deep-inv: 100 more ticks',
      () => {
        runScripted(DEEP_INVENTORY_SNAPSHOT, 100)
      },
      BENCH_OPTIONS,
    )
  }
})
