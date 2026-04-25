import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INITIAL_STATE } from '../../src/game/state'
import { runTick, type Playing } from '../../src/game/tick'
import { getWorldContent } from '../../src/worlds'
import { makeStartingCharacter, type StartingCharacterSpec } from './character'
import { tickDurationMs } from './time'

interface Goal {
  level: number
  medianMinutes: number
  toleranceMinutes: number
}

interface Config {
  startingCharacter: StartingCharacterSpec
  goals: Goal[]
  seeds: number
  maxTicks?: number
}

interface LevelUpObservation {
  level: number
  ticks: number
  ms: number
}

// One simulated run: ticks until either the last goal level is reached or we
// hit the per-run tick cap. Math.random is patched once per seed so the whole
// run draws from a single continuous stream, which matches real play and
// avoids the statistical artifacts of per-tick reseeding.
function runOnce(config: Config, seed: number): LevelUpObservation[] {
  const topLevel = config.goals.reduce((m, g) => Math.max(m, g.level), 1)
  const maxTicks = config.maxTicks ?? 10_000
  const character = makeStartingCharacter(config.startingCharacter, seed)
  const world = getWorldContent(character.worldId)
  if (!world) throw new Error(`No world content for ${character.worldId}`)

  const observations: LevelUpObservation[] = []
  let playing: Playing = { character, log: [], state: INITIAL_STATE }
  let elapsedMs = 0
  let lastLevel = playing.character.level

  for (let i = 0; i < maxTicks; i++) {
    // Tick wall duration is based on the state + speed we ENTER the tick
    // with — mirrors App.tsx:449's setInterval cadence.
    elapsedMs += tickDurationMs(playing.state.kind, playing.character.tickSpeed)
    playing = runTick(playing, world)

    if (playing.character.level > lastLevel) {
      // An XP bomb can cross multiple levels in one tick — attribute all
      // of them to this tick time.
      for (let l = lastLevel + 1; l <= playing.character.level; l++) {
        observations.push({ level: l, ticks: i + 1, ms: elapsedMs })
      }
      lastLevel = playing.character.level
      if (lastLevel >= topLevel) break
    }
  }
  return observations
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]
}

function msToMinutes(ms: number): number {
  return ms / 60_000
}

async function main(): Promise<void> {
  const configPath = resolve(process.argv[2] ?? 'tools/sim/goals.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as Config

  console.log(
    `Running ${config.seeds} seeds × up to ${config.maxTicks ?? 10_000} ticks`,
  )
  console.log(
    `Starting character: ${config.startingCharacter.world}/${config.startingCharacter.species}/${config.startingCharacter.class}`,
  )
  console.log('')
  const startedAt = Date.now()

  // Each seed gets its own deterministic sub-seed so re-running is bit-exact.
  const allObservations: LevelUpObservation[] = []
  for (let s = 0; s < config.seeds; s++) {
    const seed = (0x9e3779b1 ^ (s * 0x85ebca77)) >>> 0
    const obs = runOnce(config, seed)
    for (const o of obs) allObservations.push(o)
  }

  // Bucket by level, compute stats.
  const byLevel = new Map<number, number[]>()
  for (const o of allObservations) {
    const list = byLevel.get(o.level) ?? []
    list.push(o.ms)
    byLevel.set(o.level, list)
  }

  // Print table.
  const headers = ['Level', 'Target (min)', 'Reach %', 'p25', 'p50', 'p75', 'p90', 'Verdict']
  const rows: string[][] = []
  for (const goal of config.goals) {
    const mses = (byLevel.get(goal.level) ?? []).slice().sort((a, b) => a - b)
    const reached = mses.length
    const reachPct = (reached / config.seeds) * 100
    const p25 = msToMinutes(percentile(mses, 25))
    const p50 = msToMinutes(percentile(mses, 50))
    const p75 = msToMinutes(percentile(mses, 75))
    const p90 = msToMinutes(percentile(mses, 90))
    const lo = goal.medianMinutes - goal.toleranceMinutes
    const hi = goal.medianMinutes + goal.toleranceMinutes
    let verdict = '✓'
    if (reachPct < 50) verdict = '✗ < 50% reach'
    else if (!Number.isFinite(p50) || p50 < lo || p50 > hi) verdict = '✗ p50 off'
    else if (Number.isFinite(p90) && p90 > hi * 1.5) verdict = '~ p90 long tail'

    rows.push([
      String(goal.level),
      `${goal.medianMinutes} ±${goal.toleranceMinutes}`,
      reachPct.toFixed(0) + '%',
      Number.isFinite(p25) ? p25.toFixed(1) : '—',
      Number.isFinite(p50) ? p50.toFixed(1) : '—',
      Number.isFinite(p75) ? p75.toFixed(1) : '—',
      Number.isFinite(p90) ? p90.toFixed(1) : '—',
      verdict,
    ])
  }

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  )
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
  console.log(headers.map((h, i) => pad(h, widths[i])).join('  '))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c, widths[i])).join('  '))
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('')
  console.log(`${config.seeds} seeds simulated in ${elapsedSec}s.`)

  // Exit non-zero on any verdict that starts with ✗ so CI can use it.
  const failed = rows.some((r) => r[r.length - 1].startsWith('✗'))
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
