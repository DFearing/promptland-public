import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { DeathRecord, LevelUpRecord } from '../character'
import { xpToNextLevel } from '../character'
import { rarityColor, rarityLabel, skullsFor } from '../items'
import type { Effects } from '../themes'
import {
  DEATH_DURATION_CONFIG,
  LEVEL_UP_DURATION_CONFIG,
  deathDurationMs,
  levelUpDurationMs,
} from './durations'
import type { EffectEvent } from './types'

interface Props {
  events: EffectEvent[]
  effects: Effects
  /** Monotonically-increasing counter. Each bump tears down every active
   *  and queued fullscreen effect instantly (no fade). Used when the
   *  player navigates to the roster or opens Settings — the current
   *  banner must vanish with the play surface, not keep animating over
   *  an unrelated screen. Incrementing it also marks the current
   *  `events` array as already-seen so returning to play doesn't replay
   *  whatever was mid-flight. */
  interruptCounter?: number
  /** Fired when a blocking fullscreen effect is dismissed — either by its
   *  own animation ending or by the user clicking Continue. App.tsx uses
   *  this to clear the tick-pause so the game resumes immediately on
   *  early dismissal instead of waiting out the scripted pause duration. */
  onBlockingDismiss?: () => void
  /** Fired when the user hovers over / leaves a blocking card. While
   *  hovered the card's CSS animations pause (so it stays on screen) and
   *  App.tsx blocks tick resume until the mouse leaves. */
  onBlockingHoverChange?: (hovered: boolean) => void
}

interface ActiveFx {
  id: string
  kind: EffectEvent['kind']
  /** 0–1 intensity used by damage/heal flashes. */
  intensity?: number
  /** Level-up / death card on-screen duration, chosen per level or
   *  death-count. Drives the card's CSS animation via --fx-*-dur. */
  durationMs?: number
  levelUp?: {
    record: LevelUpRecord
    previousAt: number
    previousGold: number
  }
  death?: {
    record: DeathRecord | undefined
  }
  /** Area name used by the new-area fullscreen banner. */
  name?: string
  /** Area rarity — drives the new-area banner variant. Rare+ renders a
   *  distinct "Rare Area Discovered" card in the rarity color. */
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ${sec % 60}s`
  const hrs = Math.floor(min / 60)
  return `${hrs}h ${min % 60}m`
}

function readCssColor(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  return value || fallback
}

function fireConfetti(): void {
  const palette = [
    readCssColor('--accent-hot', '#ffd27a'),
    readCssColor('--accent', '#e4a657'),
    readCssColor('--good', '#7cd67c'),
    readCssColor('--magic', '#c084fc'),
    readCssColor('--speech', '#ffe58a'),
  ]
  const defaults = {
    spread: 70,
    startVelocity: 45,
    ticks: 80,
    gravity: 1,
    colors: palette,
    disableForReducedMotion: true,
  }
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.2, y: 0.7 }, angle: 60 })
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.8, y: 0.7 }, angle: 120 })
  confetti({ ...defaults, particleCount: 40, origin: { x: 0.5, y: 0.3 }, spread: 140 })
}

// Fireworks-style bursts — several staggered pops across the mid-upper
// screen, using canvas-confetti's star shape and a full 360° spread so
// each burst reads as a radial firework rather than a directional spray.
// Scheduled with setTimeout so the bursts arrive over ~1.4s, overlapping
// the level-up card's opening beats (card fade-in peaks around 400ms).
function fireFireworks(): void {
  const palette = [
    readCssColor('--accent-hot', '#ffd27a'),
    readCssColor('--accent', '#e4a657'),
    readCssColor('--good', '#7cd67c'),
    readCssColor('--magic', '#c084fc'),
  ]
  // (x-fraction, y-fraction, delay ms, palette-subset-index pairs)
  const bursts: Array<{ x: number; y: number; delay: number; color: string }> = [
    { x: 0.25, y: 0.35, delay: 60,  color: palette[0] },
    { x: 0.75, y: 0.30, delay: 280, color: palette[3] },
    { x: 0.5,  y: 0.22, delay: 520, color: palette[2] },
    { x: 0.18, y: 0.28, delay: 820, color: palette[1] },
    { x: 0.82, y: 0.40, delay: 1100, color: palette[0] },
  ]
  for (const b of bursts) {
    setTimeout(() => {
      // Tail/spark — smaller, shorter-lived dots that trail after the pop.
      confetti({
        particleCount: 18,
        startVelocity: 22,
        spread: 360,
        ticks: 50,
        gravity: 1.1,
        decay: 0.92,
        scalar: 0.7,
        origin: { x: b.x, y: b.y },
        colors: [b.color, palette[(palette.indexOf(b.color) + 2) % palette.length]],
        disableForReducedMotion: true,
      })
      // Main burst — star-shaped particles, radial 360° spread for the
      // classic firework silhouette.
      confetti({
        particleCount: 45,
        startVelocity: 32,
        spread: 360,
        ticks: 90,
        gravity: 0.9,
        decay: 0.94,
        scalar: 1.1,
        shapes: ['star'],
        origin: { x: b.x, y: b.y },
        colors: palette,
        disableForReducedMotion: true,
      })
    }, b.delay)
  }
}

// Maps "amount relative to maxHp" into a 0..1 intensity. A grazing 5% hit
// barely whispers; a one-shot ≥80% hit fills the screen. Square root keeps
// the low end visible without turning mid-range into near-max.
function intensityFor(amount: number, maxHp: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxHp) || maxHp <= 0) return 0
  const ratio = Math.max(0, Math.min(1, amount / maxHp))
  return Math.sqrt(ratio)
}

// Fullscreen card-style effects that fully take over the foreground.
// Only one of these plays at a time; new arrivals queue behind whatever's
// currently on screen. Non-listed kinds (damage-taken, heal-self) are rim
// flashes that co-render fine and bypass the queue.
const BLOCKING_KINDS = new Set<EffectEvent['kind']>([
  'level-up',
  'death',
  'new-area',
  'llm-connected',
  'generating-area',
  'new-mob',
  'new-item',
])

const isBlocking = (fx: ActiveFx): boolean => BLOCKING_KINDS.has(fx.kind)

// "How close did you come" quip for the death card, keyed off the mob's
// remaining HP fraction. Five buckets so the phrasing changes distinctly
// as the player gets closer to winning the fight they lost.
function howCloseQuip(remainingHp: number, maxHp: number): string {
  if (maxHp <= 0) return ''
  const ratio = Math.max(0, Math.min(1, remainingHp / maxHp))
  if (ratio >= 0.85) return 'It barely broke a sweat.'
  if (ratio >= 0.6) return 'You landed a few, but it was never close.'
  if (ratio >= 0.35) return 'You traded blows — a real fight.'
  if (ratio >= 0.15) return "You almost had it. One more exchange."
  if (ratio > 0) return 'A breath from victory. A single swing short.'
  return 'You took it down with you.'
}

export default function EffectsOverlay({
  events,
  effects,
  interruptCounter,
  onBlockingDismiss,
  onBlockingHoverChange,
}: Props) {
  // Hover handlers shared by both blocking cards — bound once so the
  // mousenter/leave references are stable across renders.
  const onCardEnter = () => onBlockingHoverChange?.(true)
  const onCardLeave = () => onBlockingHoverChange?.(false)
  const seenRef = useRef<Set<string>>(new Set())
  const primedRef = useRef(false)
  const [active, setActive] = useState<ActiveFx[]>([])
  // Queue of blocking fullscreen effects waiting for the current one to
  // finish. FIFO — first queued, first played.
  const [queue, setQueue] = useState<ActiveFx[]>([])
  // Mirror refs of active / queue so the main derive effect can make an
  // admit-vs-hold decision WITHOUT reading either via the updater arg.
  // React 18's StrictMode intentionally double-invokes state updaters,
  // which turned the previous nested `setQueue` inside the `setActive`
  // updater into a duplicate-schedule bug: each blocking effect past the
  // first landed in the queue two or three times and then played back
  // the same number of times. Refs give the outer effect the post-
  // commit snapshot without adding `active`/`queue` to the dep array
  // (which would re-fire on every handleEnd tear-down).
  const activeRef = useRef<ActiveFx[]>(active)
  const queueRef = useRef<ActiveFx[]>(queue)
  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { queueRef.current = queue }, [queue])

  // Mark whatever's already in the queue at mount as seen, without rendering
  // any of it — the saved-game backlog must not replay on page load. Done as
  // a layout-time effect (mount-only) so the first real event derived after
  // mount, even one fired in the same render pass, still flows through.
  useEffect(() => {
    if (primedRef.current) return
    primedRef.current = true
    for (const e of events) seenRef.current.add(e.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Navigating away from the play surface (roster, Settings) bumps
  // `interruptCounter`. Tear down every active and queued fullscreen
  // effect instantly — no fade — and mark the current `events` array as
  // seen so the derive pass below doesn't re-admit whatever was in
  // flight when the player returns. Skips on initial mount.
  const lastInterruptRef = useRef<number | undefined>(interruptCounter)
  useEffect(() => {
    if (interruptCounter === undefined) return
    if (lastInterruptRef.current === interruptCounter) return
    lastInterruptRef.current = interruptCounter
    // Mark everything currently in props.events as seen so the derive
    // effect below treats them as backlog — they won't re-admit.
    for (const e of events) seenRef.current.add(e.id)
    setActive([])
    setQueue([])
    activeRef.current = []
    queueRef.current = []
  }, [interruptCounter, events])

  const fs = effects.fullscreen
  const fsOn = fs.enabled
  useEffect(() => {
    if (!primedRef.current) return
    const fresh = events.filter((e) => !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)

    const renderable: ActiveFx[] = []
    for (const e of fresh) {
      if (!fsOn) continue
      if (e.kind === 'level-up' && fs.levelUpBanner) {
        renderable.push({
          id: e.id,
          kind: e.kind,
          durationMs: levelUpDurationMs(e.record.to),
          levelUp: {
            record: e.record,
            previousAt: e.previousAt,
            previousGold: e.previousGold,
          },
        })
      } else if (e.kind === 'death' && fs.death) {
        renderable.push({
          id: e.id,
          kind: e.kind,
          durationMs: deathDurationMs(e.deathCount),
          death: { record: e.record },
        })
      } else if (e.kind === 'damage-taken' && fs.damage) {
        renderable.push({ id: e.id, kind: e.kind, intensity: intensityFor(e.amount, e.maxHp) })
      } else if (e.kind === 'heal-self' && fs.heal) {
        renderable.push({ id: e.id, kind: e.kind, intensity: intensityFor(e.amount, e.maxHp) })
      } else if (e.kind === 'new-area' && fs.newArea) {
        renderable.push({ id: e.id, kind: e.kind, name: e.name, rarity: e.rarity })
      } else if (e.kind === 'llm-connected') {
        renderable.push({ id: e.id, kind: e.kind })
      } else if (e.kind === 'generating-area') {
        renderable.push({ id: e.id, kind: e.kind })
      } else if (e.kind === 'new-mob') {
        renderable.push({ id: e.id, kind: e.kind, name: e.name })
      } else if (e.kind === 'new-item') {
        renderable.push({ id: e.id, kind: e.kind, name: e.name })
      }
    }
    // Admit-on-arrival semantics: flags are evaluated here, not at render
    // time, so an effect that toggles mid-flight doesn't retroactively
    // hide or reveal already-admitted items. This rules out the "derive
    // during render" refactor the rule suggests.
    //
    // Blocking kinds (card-style banners) serialize: at most one plays at
    // a time. New blocking arrivals line up behind whatever's currently
    // on screen; non-blocking rim flashes always play immediately.
    if (renderable.length > 0) {
      const nonBlocking = renderable.filter((fx) => !isBlocking(fx))
      let blocking = renderable.filter(isBlocking)

      // Level-up dedup: when a new level-up arrives, drop any older
      // level-ups still queued AND dismiss an active level-up so the
      // newest takes over. Multi-level grants (dev-panel "set XP",
      // chained XP rewards that cross several level boundaries) would
      // otherwise spam the FIFO with stale "Lv N → N+1" cards before
      // the player ever sees the final level. Other blocking kinds
      // (death, new-area) keep FIFO semantics — only level-ups dedup.
      const newLevelUps = blocking.filter((fx) => fx.kind === 'level-up')
      if (newLevelUps.length > 0) {
        const latest = newLevelUps[newLevelUps.length - 1]
        blocking = blocking.filter(
          (fx) => fx.kind !== 'level-up' || fx === latest,
        )
        if (queueRef.current.some((fx) => fx.kind === 'level-up')) {
          queueRef.current = queueRef.current.filter(
            (fx) => fx.kind !== 'level-up',
          )
          setQueue((q) => q.filter((fx) => fx.kind !== 'level-up'))
        }
        const activeLU = activeRef.current.find((fx) => fx.kind === 'level-up')
        if (activeLU) {
          // Mirror handleEnd: drop the active card and clear the
          // host's tick-pause so the new card admits cleanly.
          activeRef.current = activeRef.current.filter(
            (fx) => fx.id !== activeLU.id,
          )
          setActive((prev) => prev.filter((fx) => fx.id !== activeLU.id))
          onBlockingDismiss?.()
        }
      }

      // Decide admit-vs-hold OUTSIDE any setState updater so StrictMode's
      // double-invocation can't duplicate side effects. A pending queue
      // counts as "in flight" — promoting a late blocking arrival past
      // items already waiting would break the FIFO contract.
      const inFlight =
        activeRef.current.some(isBlocking) || queueRef.current.length > 0
      const admit: ActiveFx[] = [...nonBlocking]
      const hold: ActiveFx[] = []
      if (inFlight) {
        hold.push(...blocking)
      } else if (blocking.length > 0) {
        admit.push(blocking[0])
        hold.push(...blocking.slice(1))
      }
      if (admit.length > 0) {
        setActive((prev) => [...prev, ...admit])
      }
      if (hold.length > 0) {
        setQueue((q) => [...q, ...hold])
      }
    }

    if (fsOn) {
      for (const e of fresh) {
        if (e.kind === 'level-up') {
          // Two layered effects on the same event: the side-spray confetti
          // sets the first frame, then staggered firework bursts pop over
          // the next ~1.4s so the card-reveal has motion backing it the
          // whole way in. Both respect canvas-confetti's reduced-motion
          // guard via the `disableForReducedMotion` flag. Always-on —
          // level-up is the single biggest payoff moment and got its own
          // carve-out from the per-effect toggles.
          fireConfetti()
          fireFireworks()
        }
      }
    }
    // onBlockingDismiss is referenced by the level-up dedup branch
    // above (when an active card is evicted, the host's tick-pause
    // gets cleared mirroring handleEnd's behavior). Including it in
    // deps so React Hook lint is happy — parent re-renders that swap
    // the callback identity will re-run this effect, but the
    // seenRef-based dedup makes that idempotent.
  }, [events, fsOn, fs.levelUpBanner, fs.death, fs.damage, fs.heal, fs.newArea, onBlockingDismiss])

  const handleEnd = (id: string) => {
    // Capture whether this effect was blocking BEFORE we tear it down, so
    // we can signal the host to clear its tick-pause. Called after
    // setActive so React batches the state commit before the caller
    // observes the change.
    const wasBlocking = activeRef.current.some(
      (fx) => fx.id === id && isBlocking(fx),
    )
    setActive((prev) => prev.filter((fx) => fx.id !== id))
    if (wasBlocking) onBlockingDismiss?.()
  }

  // Promote the next queued blocking effect the moment there's no blocking
  // one on screen. Kept as an effect (not inlined into handleEnd) so the
  // two state updates compose cleanly and don't misbehave under strict
  // mode's double-invoked updaters.
  useEffect(() => {
    if (queue.length === 0) return
    if (active.some(isBlocking)) return
    const [next, ...rest] = queue
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(rest)
    setActive((prev) => [...prev, next])
  }, [queue, active])

  return (
    <div className="fx-overlay" aria-hidden="true">
      {active.map((fx) => {
        if (fx.kind === 'level-up') {
          const rec = fx.levelUp?.record
          const previousAt = fx.levelUp?.previousAt ?? rec?.at ?? 0
          const previousGold = fx.levelUp?.previousGold ?? 0
          const playtime = rec ? rec.at - previousAt : 0
          const xpGained = rec?.xpGained ?? (rec ? xpToNextLevel(rec.from) : 0)
          const goldGained = rec ? (rec.goldAtLevelUp ?? previousGold) - previousGold : 0
          const best = rec?.bestItem
          const enemy = rec?.baddestEnemy
          const durationMs = fx.durationMs ?? LEVEL_UP_DURATION_CONFIG.defaultDurationMs
          return (
            <div key={fx.id} className="fx-cluster fx-cluster--levelup">
              <div className="fx-flash fx-flash--levelup" />
              <div
                className="fx-levelup-card"
                style={{ ['--fx-levelup-dur' as string]: `${durationMs}ms` }}
                onAnimationEnd={(e) => {
                  // Card's own fade-out animation is the longest — end when
                  // the card finishes.
                  if (e.target === e.currentTarget) handleEnd(fx.id)
                }}
                onMouseEnter={onCardEnter}
                onMouseLeave={onCardLeave}
              >
                <div className="fx-levelup-celebration">🎉</div>
                <div className="fx-banner fx-banner--levelup">Level Up</div>
                {rec && (
                  <div className="fx-levelup-sub">
                    {rec.to}
                  </div>
                )}
                {rec && (
                  <dl className="fx-levelup-stats">
                    <div>
                      <dt>Playtime</dt>
                      <dd>{formatDuration(playtime)}</dd>
                    </div>
                    <div>
                      <dt>XP gained</dt>
                      <dd className="fx-levelup-xp">{xpGained}</dd>
                    </div>
                    <div>
                      <dt>Gold</dt>
                      <dd className="fx-levelup-gold">
                        {goldGained > 0 ? `+${goldGained}` : goldGained < 0 ? `${goldGained}` : '0'}
                      </dd>
                    </div>
                    <div>
                      <dt>Deaths</dt>
                      <dd className="fx-levelup-deaths">{rec.deathsThisLevel ?? 0}</dd>
                    </div>
                    {(() => {
                      const g = rec.gains
                      if (!g) return null
                      const parts: string[] = []
                      if (g.hp > 0) parts.push(`+${g.hp} HP`)
                      if (g.mp > 0) parts.push(`+${g.mp} MP`)
                      if (g.statText) parts.push(g.statText)
                      if (parts.length === 0) return null
                      return (
                        <div>
                          <dt>Gains</dt>
                          <dd className="fx-levelup-gains">{parts.join(' · ')}</dd>
                        </div>
                      )
                    })()}
                    {rec.learnedSpells && rec.learnedSpells.length > 0 && (
                      <div>
                        <dt>Spells learned</dt>
                        <dd className="fx-levelup-spells">
                          {rec.learnedSpells.map((s, i) => (
                            <span
                              key={s.id}
                              className={`fx-levelup-spell fx-levelup-spell--lv${s.level}`}
                            >
                              {s.name}
                              {i < rec.learnedSpells!.length - 1 ? ' · ' : ''}
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Best item</dt>
                      <dd>
                        {best ? (
                          <span style={{ color: rarityColor(best.rarity) }}>
                            {best.name}
                            <span className="fx-levelup-tier">
                              {' '}
                              · {rarityLabel(best.rarity)}
                            </span>
                          </span>
                        ) : (
                          <span className="fx-levelup-muted">nothing found</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Baddest enemy</dt>
                      <dd>
                        {enemy ? (
                          <span style={{ color: rarityColor(enemy.rarity) }}>
                            {enemy.name}
                            {skullsFor(enemy.rarity)}
                            <span className="fx-levelup-tier"> · {enemy.xpReward} XP</span>
                          </span>
                        ) : (
                          <span className="fx-levelup-muted">none slain</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
                <button
                  type="button"
                  className="fx-levelup-continue"
                  onClick={() => handleEnd(fx.id)}
                >
                  Continue
                </button>
              </div>
            </div>
          )
        }
        if (fx.kind === 'death') {
          const durationMs = fx.durationMs ?? DEATH_DURATION_CONFIG.defaultDurationMs
          const rec = fx.death?.record
          const killer = rec?.mobName
          const haveHpSnapshot =
            rec?.mobRemainingHp != null && rec?.mobMaxHp != null && rec.mobMaxHp > 0
          const quip = haveHpSnapshot
            ? howCloseQuip(rec.mobRemainingHp!, rec.mobMaxHp!)
            : ''
          return (
            <div
              key={fx.id}
              className="fx-cluster"
              style={{ ['--fx-death-dur' as string]: `${durationMs}ms` }}
            >
              <div className="fx-vignette fx-vignette--death" />
              <div
                className="fx-death-stack"
                onMouseEnter={onCardEnter}
                onMouseLeave={onCardLeave}
              >
                <div
                  className="fx-banner fx-banner--death"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) handleEnd(fx.id)
                  }}
                >
                  <span className="fx-death-skull fx-death-skull--flank" aria-hidden="true">
                    💀
                  </span>
                  <span className="fx-death-word">Defeated</span>
                  <span className="fx-death-skull fx-death-skull--flank" aria-hidden="true">
                    💀
                  </span>
                </div>
                <div className="fx-death-big" aria-hidden="true">💀</div>
                {(killer || quip) && (
                  <div className="fx-death-panel">
                    {killer && (
                      <div className="fx-death-killer">
                        Cut down by <span className="fx-death-mob">{killer}</span>
                      </div>
                    )}
                    {haveHpSnapshot && (
                      <div className="fx-death-hp">
                        Opponent remaining:{' '}
                        <span className="fx-death-hp-val">
                          {rec!.mobRemainingHp} / {rec!.mobMaxHp} HP
                        </span>
                      </div>
                    )}
                    {quip && <div className="fx-death-quip">{quip}</div>}
                  </div>
                )}
                <button
                  type="button"
                  className="fx-death-continue"
                  onClick={() => handleEnd(fx.id)}
                >
                  Continue
                </button>
              </div>
            </div>
          )
        }
        if (fx.kind === 'damage-taken') {
          // Peak opacity and spread both scale with intensity so a trivial hit
          // is a subtle rim flash and a near-lethal strike is a hard slam.
          const intensity = fx.intensity ?? 0.5
          const peak = 0.25 + intensity * 0.65
          return (
            <div key={fx.id} className="fx-cluster">
              <div
                className="fx-flash fx-flash--damage"
                style={{
                  ['--fx-peak' as string]: peak.toFixed(3),
                  ['--fx-spread' as string]: `${Math.round(40 + intensity * 90)}%`,
                }}
                onAnimationEnd={() => handleEnd(fx.id)}
              />
            </div>
          )
        }
        if (fx.kind === 'heal-self') {
          const intensity = fx.intensity ?? 0.4
          const peak = 0.2 + intensity * 0.55
          return (
            <div key={fx.id} className="fx-cluster">
              <div
                className="fx-flash fx-flash--heal"
                style={{
                  ['--fx-peak' as string]: peak.toFixed(3),
                  ['--fx-spread' as string]: `${Math.round(50 + intensity * 80)}%`,
                }}
                onAnimationEnd={() => handleEnd(fx.id)}
              />
            </div>
          )
        }
        if (fx.kind === 'new-area') {
          const isRare =
            fx.rarity === 'rare' ||
            fx.rarity === 'epic' ||
            fx.rarity === 'legendary'
          const rareColor = isRare ? rarityColor(fx.rarity!) : undefined
          const rareLabel = isRare ? `${rarityLabel(fx.rarity!)} Area Discovered` : 'New Area'
          return (
            <div key={fx.id} className={'fx-cluster fx-newarea' + (isRare ? ' fx-newarea--rare' : '')}>
              <div className="fx-newarea-scrim" />
              <div
                className="fx-newarea-card"
                style={isRare ? { ['--fx-rare-color' as string]: rareColor } : undefined}
                onAnimationEnd={(e) => {
                  // Only release when the card's own animation ends — the
                  // scrim runs a shorter fade, and inner elements animate
                  // independently. Filtering by target keeps us from
                  // tearing down early.
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-newarea-rule" />
                <div className="fx-newarea-label">{rareLabel}</div>
                <div className="fx-newarea-name">
                  <span className="fx-newarea-glyph">✦</span>
                  <span className="fx-newarea-title">{fx.name}</span>
                  <span className="fx-newarea-glyph">✦</span>
                </div>
                <div className="fx-newarea-rule" />
              </div>
            </div>
          )
        }
        if (fx.kind === 'llm-connected') {
          return (
            <div key={fx.id} className="fx-cluster fx-llmc">
              <div className="fx-llmc-scrim" />
              <div
                className="fx-llmc-card"
                onAnimationEnd={(e) => {
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-llmc-rule" />
                <div className="fx-llmc-label">LLM</div>
                <div className="fx-llmc-name">
                  <span className="fx-llmc-glyph">▶</span>
                  <span className="fx-llmc-title">Connected</span>
                  <span className="fx-llmc-glyph">◀</span>
                </div>
                <div className="fx-llmc-rule" />
              </div>
            </div>
          )
        }
        if (fx.kind === 'generating-area') {
          return (
            <div key={fx.id} className="fx-cluster fx-genarea">
              <div className="fx-genarea-scrim" />
              <div
                className="fx-genarea-card"
                onAnimationEnd={(e) => {
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-genarea-rule" />
                <div className="fx-genarea-label">Exploring</div>
                <div className="fx-genarea-name">
                  <span className="fx-genarea-title">Charting unknown paths...</span>
                </div>
                <div className="fx-genarea-rule" />
              </div>
            </div>
          )
        }
        if (fx.kind === 'new-mob') {
          return (
            <div key={fx.id} className="fx-cluster fx-discovery">
              <div className="fx-discovery-scrim" />
              <div
                className="fx-discovery-card fx-discovery-card--mob"
                onAnimationEnd={(e) => {
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-discovery-label">First Encounter</div>
                <div className="fx-discovery-name">{fx.name}</div>
              </div>
            </div>
          )
        }
        if (fx.kind === 'new-item') {
          return (
            <div key={fx.id} className="fx-cluster fx-discovery">
              <div className="fx-discovery-scrim" />
              <div
                className="fx-discovery-card fx-discovery-card--item"
                onAnimationEnd={(e) => {
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-discovery-label">New Discovery</div>
                <div className="fx-discovery-name">{fx.name}</div>
              </div>
            </div>
          )
        }
        return null
      })}

      <style>{`
        .fx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }

        .fx-cluster { position: absolute; inset: 0; }

        .fx-flash { position: absolute; inset: 0; mix-blend-mode: screen; }

        .fx-flash--damage {
          background: radial-gradient(ellipse at center, transparent var(--fx-spread, 70%), var(--bad) 130%);
          animation: fx-damage 420ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-damage {
          0%   { opacity: 0; }
          15%  { opacity: var(--fx-peak, 0.85); }
          100% { opacity: 0; }
        }

        .fx-flash--heal {
          background: radial-gradient(ellipse at center, var(--good) -20%, transparent var(--fx-spread, 70%));
          animation: fx-heal 620ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-heal {
          0%   { opacity: 0; }
          25%  { opacity: var(--fx-peak, 0.7); }
          100% { opacity: 0; }
        }

        .fx-flash--levelup {
          background: radial-gradient(ellipse at center, var(--accent-hot) 0%, transparent 70%);
          animation: fx-levelup-flash 1600ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-levelup-flash {
          0%   { opacity: 0; transform: scale(0.9); }
          15%  { opacity: 0.55; transform: scale(1.05); }
          55%  { opacity: 0.15; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.15); }
        }

        .fx-cluster--levelup { display: flex; align-items: center; justify-content: center; }
        .fx-levelup-card {
          position: relative;
          z-index: 2;
          min-width: 440px;
          max-width: min(560px, 92vw);
          padding: var(--sp-5) var(--sp-6) var(--sp-4);
          background: rgba(8, 10, 12, 0.96);
          border: 2px solid var(--accent-hot);
          box-shadow: 0 0 40px rgba(255, 210, 122, 0.5),
                      inset 0 0 22px rgba(255, 210, 122, 0.15);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          color: var(--fg-1);
          text-align: center;
          animation: fx-levelup-card var(--fx-levelup-dur, 5200ms) ease-out forwards;
          opacity: 0;
          pointer-events: none;
          font-family: var(--font-body);
        }
        /* Keyframes use percentages so in/out fades scale with the total
           duration set via --fx-levelup-dur per event. The long hold between
           16% and 85% stretches with longer durations, letting notable
           milestone levels sit on screen. */
        @keyframes fx-levelup-card {
          0%   { opacity: 0; transform: translateY(16px) scale(0.92); }
          8%   { opacity: 1; transform: translateY(0) scale(1.02); }
          16%  { transform: translateY(0) scale(1); }
          85%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(1); }
        }
        .fx-levelup-celebration {
          font-size: 52px;
          line-height: 1;
          filter: drop-shadow(0 0 18px rgba(255, 210, 122, 0.6));
          animation: fx-levelup-celebrate 1200ms ease-in-out infinite alternate;
        }
        @keyframes fx-levelup-celebrate {
          0%   { transform: scale(1) rotate(-4deg); }
          100% { transform: scale(1.08) rotate(4deg); }
        }
        .fx-levelup-sub {
          font-family: var(--font-display);
          font-size: calc(var(--text-xl) * 2);
          letter-spacing: 0.08em;
          color: var(--fg-1);
        }
        .fx-levelup-stats {
          margin: var(--sp-2) 0 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px var(--sp-3);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          text-align: left;
          width: 100%;
        }
        .fx-levelup-stats > div { display: contents; }
        .fx-levelup-stats dt {
          color: var(--fg-3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-size: var(--text-xs);
          padding-top: 2px;
        }
        .fx-levelup-stats dd {
          margin: 0;
          font-variant-numeric: tabular-nums;
          color: var(--fg-1);
        }
        .fx-levelup-xp { color: #ffffff !important; }
        .fx-levelup-gold { color: #ffb040 !important; text-shadow: 0 0 4px rgba(255, 176, 64, 0.35); }
        .fx-levelup-gains { color: var(--good) !important; text-shadow: 0 0 4px rgba(124, 214, 124, 0.35); }
        .fx-levelup-tier { color: var(--fg-3); font-variant-caps: all-small-caps; letter-spacing: 0.06em; }
        .fx-levelup-muted { color: var(--fg-3); font-style: italic; }
        /* Learned-spell list — paints each name in its rarity-tier color
           (tier-1 uses the UI green via --rarity-uncommon for legibility,
           same as the spellbook tooltip). Inline · separators keep it
           compact when multiple spells unlock on the same level. */
        .fx-levelup-spells {
          display: inline;
          font-variant-numeric: normal;
        }
        .fx-levelup-spell { font-weight: 500; }
        .fx-levelup-spell--lv1 { color: var(--rarity-uncommon); }
        .fx-levelup-spell--lv2 { color: var(--rarity-uncommon); }
        .fx-levelup-spell--lv3 { color: var(--rarity-rare); }
        .fx-levelup-spell--lv4 { color: var(--rarity-epic); }
        .fx-levelup-spell--lv5 { color: var(--rarity-legendary); text-shadow: 0 0 4px currentColor; }
        /* Continue button — lets the impatient skip the card. Overrides the
           overlay's pointer-events:none so clicks land on the button but
           not on anything behind it. Fades in shortly after the card is
           readable so it doesn't compete with the opening beats. */
        .fx-levelup-continue {
          margin-top: var(--sp-4);
          align-self: center;
          padding: var(--sp-2) var(--sp-5);
          background: transparent;
          color: var(--fg-2);
          border: 1px solid var(--line-2);
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          pointer-events: auto;
          opacity: 0;
          animation: fx-levelup-continue-in 400ms ease-out 600ms forwards;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .fx-levelup-continue:hover,
        .fx-levelup-continue:focus-visible {
          color: var(--accent-hot);
          border-color: var(--accent-hot);
          background: rgba(255, 255, 255, 0.04);
          outline: none;
          text-shadow: var(--glow-sm);
        }
        @keyframes fx-levelup-continue-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 0.75; transform: translateY(0); }
        }

        .fx-vignette { position: absolute; inset: 0; }
        /* Death vignette goes full black at peak — the player is dead,
           the game behind it should disappear entirely. The opacity
           animation still fades the vignette in and back out so the
           transition is smooth; peak hold is pure #000 with no
           gradient falloff. */
        .fx-vignette--death {
          background: #000;
          animation: fx-death var(--fx-death-dur, 4200ms) ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-death {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          82%  { opacity: 1; }
          100% { opacity: 0; }
        }

        .fx-banner {
          position: absolute; left: 0; right: 0; top: 38%;
          text-align: center;
          font-family: var(--font-display);
          font-size: var(--text-display);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .fx-banner--levelup {
          position: static;
          color: var(--accent-hot);
          text-shadow: var(--glow-lg), 0 0 32px var(--accent);
          font-size: var(--text-2xl, 32px);
          letter-spacing: 0.18em;
          animation: fx-levelup-banner 1400ms ease-out 80ms both;
        }
        /* Banner pops in slightly after the card — the 80ms delay lets the
           card's own fade-in seat first, then the "LEVEL UP" text punches
           with a brief zoom-and-settle that lines up with the first
           firework burst (~60ms) and the audio sparkle tail. */
        @keyframes fx-levelup-banner {
          0%   { opacity: 0; transform: scale(1.6); letter-spacing: 0.40em; filter: blur(3px); }
          25%  { opacity: 1; transform: scale(1.12); letter-spacing: 0.22em; filter: blur(0); }
          60%  { transform: scale(1); letter-spacing: 0.18em; }
          100% { opacity: 1; transform: scale(1); letter-spacing: 0.18em; filter: blur(0); }
        }
        /* Death banner: stacked on top of a big centered skull. The
           top-percentage shifts the whole cluster upward so the word and
           skull share roughly the middle third of the viewport. */
        .fx-death-stack {
          position: absolute;
          left: 0;
          right: 0;
          top: 25%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-3);
          animation: fx-death-stack var(--fx-death-dur, 4200ms) ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-death-stack {
          0%   { opacity: 0; transform: translateY(-12px) scale(1.15); }
          14%  { opacity: 1; transform: translateY(0) scale(1); }
          82%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(6px) scale(1); }
        }
        .fx-banner--death {
          position: static;
          color: var(--bad);
          text-shadow: 0 0 24px var(--bad), 0 0 48px var(--bad), 0 0 2px #000;
          font-size: calc(var(--text-display, 48px) * 1.4);
          letter-spacing: 0.22em;
          display: inline-flex;
          align-items: center;
          gap: var(--sp-3);
          animation: fx-banner-death var(--fx-death-dur, 4200ms) ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-banner-death {
          0%   { opacity: 0; transform: scale(1.3); filter: blur(2px); }
          14%  { opacity: 1; transform: scale(1); filter: blur(0); }
          82%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .fx-death-word { display: inline-block; }
        /* Flanking skulls sit on the red banner; drop-shadow in the mob
           "bad" color binds the Unicode glyph to the theme palette without
           swapping assets. */
        .fx-death-skull--flank {
          font-size: 0.85em;
          line-height: 1;
          filter: drop-shadow(0 0 10px var(--bad));
        }
        .fx-death-big {
          font-size: clamp(96px, 16vw, 180px);
          line-height: 1;
          color: #fff;
          filter: drop-shadow(0 0 18px rgba(255, 255, 255, 0.65))
                  drop-shadow(0 0 32px var(--bad));
        }
        /* Death stack receives mouse events so hover can pause the
           animations (see fx-cluster:has rule below). pointer-events:auto
           is scoped to the stack only so the vignette around it stays
           non-interactive and clicks behind the overlay still reach the
           game (though the tick-pause blocks any game activity anyway). */
        .fx-death-stack { pointer-events: auto; }
        /* Killer / HP / quip panel, stacked below the big skull.
           Shares the death banner's somber tone — muted fg on a
           semi-opaque inset so the red banner still dominates. The
           panel rides the fx-death-stack's opacity animation via
           animation-fill-mode, so it fades in and out with the rest. */
        .fx-death-panel {
          /* Push the details panel well below the big skull so it
             lands roughly at viewport center — separates the somber
             "Defeated" beat at the top from the factual recap below. */
          margin-top: 16vh;
          max-width: 560px;
          padding: var(--sp-3) var(--sp-5);
          background: rgba(8, 10, 12, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--fg-2);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .fx-death-killer { color: var(--fg-2); letter-spacing: 0.04em; }
        .fx-death-mob {
          color: var(--bad);
          font-weight: 700;
          text-shadow: 0 0 6px rgba(220, 80, 80, 0.35);
        }
        .fx-death-hp {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.04em;
        }
        .fx-death-hp-val { color: var(--fg-1); }
        .fx-death-quip {
          color: var(--fg-1);
          font-style: italic;
          margin-top: 2px;
          letter-spacing: 0.02em;
        }
        /* Death Continue button — same visual language as the level-up
           version but tuned for the somber backdrop. Same fade-in delay
           so it doesn't compete with the banner's entry animation. */
        .fx-death-continue {
          margin-top: var(--sp-3);
          padding: var(--sp-2) var(--sp-5);
          background: transparent;
          color: var(--fg-2);
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          pointer-events: auto;
          opacity: 0;
          animation: fx-levelup-continue-in 400ms ease-out 700ms forwards;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .fx-death-continue:hover,
        .fx-death-continue:focus-visible {
          color: var(--bad);
          border-color: var(--bad);
          background: rgba(255, 255, 255, 0.04);
          outline: none;
        }
        /* Hover-pause — freezing the level-up card and the death stack
           when the user rests their cursor on them. :hover propagates
           from descendants, so hovering the stats / buttons inside the
           card keeps the pause active. The :has() selector on the
           cluster pauses the death vignette (a previous sibling of the
           stack) when the stack is hovered — it can't be reached via
           sibling combinators. */
        .fx-levelup-card:hover,
        .fx-levelup-card:hover *,
        .fx-death-stack:hover,
        .fx-death-stack:hover *,
        .fx-cluster:has(.fx-death-stack:hover) .fx-vignette--death {
          animation-play-state: paused !important;
        }
        /* Force full opacity on the animating elements when hovered.
           animation-play-state: paused alone freezes at whatever
           opacity the keyframe was mid-transition to — hovering during
           the fade-in or fade-out tail leaves the card dim. Override
           so anything hovered reads as fully visible regardless of
           where in the animation the cursor landed. Targets only the
           elements whose own keyframes drive opacity; children
           (Continue button, sparkles, etc.) keep their own entry
           animations. */
        .fx-levelup-card:hover,
        .fx-death-stack:hover,
        .fx-death-stack:hover .fx-banner--death,
        .fx-cluster:has(.fx-death-stack:hover) .fx-vignette--death {
          opacity: 1 !important;
        }

        /* New-area banner — fullscreen reveal that fades a dim scrim over
           the game and slides a big display-faced card into the middle.
           Total dwell ~2.2s. The card's own animation end drives cleanup;
           the scrim is shorter and fires first. */
        .fx-newarea { pointer-events: none; }
        .fx-newarea-scrim {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at center,
            rgba(0, 0, 0, 0.55) 0%,
            rgba(0, 0, 0, 0.35) 55%,
            transparent 90%);
          animation: fx-newarea-scrim 2200ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-newarea-scrim {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .fx-newarea-card {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-4) var(--sp-6, 24px);
          color: var(--accent-hot);
          text-align: center;
          animation: fx-newarea-card 2200ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-newarea-card {
          0%   { opacity: 0; transform: translate(-50%, -42%) scale(0.92); letter-spacing: 0.02em; }
          18%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); letter-spacing: 0.18em; }
          82%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); letter-spacing: 0.18em; }
          100% { opacity: 0; transform: translate(-50%, -54%) scale(1.02); letter-spacing: 0.22em; }
        }
        .fx-newarea-rule {
          width: min(60vw, 520px);
          height: 1px;
          background: linear-gradient(
            to right,
            transparent,
            var(--accent) 20%,
            var(--accent-hot) 50%,
            var(--accent) 80%,
            transparent
          );
          box-shadow: 0 0 8px var(--accent);
          opacity: 0.85;
        }
        .fx-newarea-label {
          font-family: var(--font-mono);
          font-size: clamp(12px, 1.4vw, 16px);
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--fg-1);
          opacity: 0.85;
          text-shadow: var(--glow-sm);
        }
        .fx-newarea-name {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(16px, 3vw, 32px);
          font-family: var(--font-display);
          font-size: clamp(48px, 8vw, 96px);
          line-height: 1;
          text-transform: uppercase;
          font-weight: 500;
          text-shadow: var(--glow-lg);
        }
        .fx-newarea-glyph {
          color: var(--accent);
          font-size: 0.8em;
          opacity: 0.9;
          animation: fx-newarea-glyph-spin 2200ms ease-in-out;
        }
        @keyframes fx-newarea-glyph-spin {
          0%   { transform: rotate(0deg); opacity: 0; }
          18%  { transform: rotate(180deg); opacity: 0.9; }
          100% { transform: rotate(360deg); opacity: 0; }
        }
        .fx-newarea-title {
          color: var(--accent-hot);
        }

        /* Rare+ area discovery — repaints the label, rule, glyphs, and
           title in the area's rarity color so an epic area reads
           instantly as a bigger deal than an ordinary new-area banner. */
        .fx-newarea--rare .fx-newarea-card { color: var(--fx-rare-color, var(--accent-hot)); }
        .fx-newarea--rare .fx-newarea-label {
          color: var(--fx-rare-color, var(--fg-1));
          opacity: 1;
        }
        .fx-newarea--rare .fx-newarea-title {
          color: var(--fx-rare-color, var(--accent-hot));
          text-shadow: var(--glow-lg), 0 0 24px var(--fx-rare-color, transparent);
        }
        .fx-newarea--rare .fx-newarea-glyph {
          color: var(--fx-rare-color, var(--accent));
        }
        .fx-newarea--rare .fx-newarea-rule {
          background: linear-gradient(
            to right,
            transparent,
            var(--fx-rare-color, var(--accent)) 20%,
            var(--fx-rare-color, var(--accent-hot)) 50%,
            var(--fx-rare-color, var(--accent)) 80%,
            transparent
          );
          box-shadow: 0 0 10px var(--fx-rare-color, var(--accent));
        }

        /* LLM-connected banner — same structure as new-area but in the
           "good" green palette so it reads as a system/status confirm. */
        .fx-llmc { pointer-events: none; }
        .fx-llmc-scrim {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at center,
            rgba(0, 0, 0, 0.88) 0%,
            rgba(0, 0, 0, 0.72) 55%,
            rgba(0, 0, 0, 0.35) 90%);
          animation: fx-llmc-scrim 2700ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-llmc-scrim {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .fx-llmc-card {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-4) var(--sp-6, 24px);
          color: var(--good);
          text-align: center;
          animation: fx-llmc-card 2700ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-llmc-card {
          0%   { opacity: 0; transform: translate(-50%, -44%) scale(0.94); letter-spacing: 0.02em; }
          18%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); letter-spacing: 0.16em; }
          78%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); letter-spacing: 0.16em; }
          100% { opacity: 0; transform: translate(-50%, -54%) scale(1.02); letter-spacing: 0.20em; }
        }
        .fx-llmc-rule {
          width: min(60vw, 440px);
          height: 1px;
          background: linear-gradient(
            to right,
            transparent,
            var(--good) 20%,
            var(--good) 80%,
            transparent
          );
          box-shadow: 0 0 8px var(--good);
          opacity: 0.7;
        }
        .fx-llmc-label {
          font-family: var(--font-mono);
          font-size: clamp(12px, 1.4vw, 16px);
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--fg-1);
          opacity: 0.8;
          text-shadow: 0 0 8px var(--good);
        }
        .fx-llmc-name {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(16px, 3vw, 28px);
          font-family: var(--font-display);
          font-size: clamp(40px, 7vw, 80px);
          line-height: 1;
          text-transform: uppercase;
          font-weight: 500;
          text-shadow: 0 0 24px var(--good), 0 0 48px rgba(155,245,122,0.35);
        }
        .fx-llmc-glyph {
          color: var(--good);
          font-size: 0.6em;
          opacity: 0.8;
        }
        .fx-llmc-title {
          color: var(--good);
        }

        /* Generating-area banner — pulsing variant of new-area in magic palette */
        .fx-genarea { pointer-events: none; }
        .fx-genarea-scrim {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at center,
            rgba(0, 0, 0, 0.65) 0%,
            rgba(0, 0, 0, 0.45) 55%,
            transparent 90%);
          animation: fx-genarea-scrim 800ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-genarea-scrim {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .fx-genarea-card {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-4) var(--sp-6, 24px);
          color: var(--magic, #c084fc);
          text-align: center;
          animation: fx-genarea-card 800ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-genarea-card {
          0%   { opacity: 0; transform: translate(-50%, -42%) scale(0.92); }
          20%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
          100% { opacity: 0; transform: translate(-50%, -54%) scale(1.02); }
        }
        .fx-genarea-rule {
          width: min(60vw, 440px);
          height: 1px;
          background: linear-gradient(
            to right,
            transparent,
            var(--magic, #c084fc) 20%,
            var(--magic, #c084fc) 80%,
            transparent
          );
          box-shadow: 0 0 8px var(--magic, #c084fc);
          opacity: 0.7;
        }
        .fx-genarea-label {
          font-family: var(--font-mono);
          font-size: clamp(12px, 1.4vw, 16px);
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--fg-1);
          opacity: 0.8;
          text-shadow: 0 0 8px var(--magic, #c084fc);
        }
        .fx-genarea-name {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(16px, 3vw, 28px);
          font-family: var(--font-display);
          font-size: clamp(28px, 5vw, 56px);
          line-height: 1;
          font-weight: 500;
          text-shadow: 0 0 24px var(--magic, #c084fc), 0 0 48px rgba(192, 132, 252, 0.35);
          animation: none;
        }
        @keyframes fx-genarea-pulse {
          0%   { opacity: 0.7; transform: scale(1); }
          100% { opacity: 1; transform: scale(1.03); }
        }
        .fx-genarea-title { color: var(--magic, #c084fc); }

        /* Discovery banners — brief 1.5s overlay for new mobs/items */
        .fx-discovery { pointer-events: none; }
        .fx-discovery-scrim {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 40% at center,
            rgba(0, 0, 0, 0.45) 0%,
            transparent 80%);
          animation: fx-discovery-scrim 1500ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-discovery-scrim {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .fx-discovery-card {
          position: absolute;
          left: 50%;
          top: 38%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-1);
          padding: var(--sp-2) var(--sp-4);
          text-align: center;
          animation: fx-discovery-card 1500ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-discovery-card {
          0%   { opacity: 0; transform: translate(-50%, -44%) scale(0.9); }
          18%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
          75%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
          100% { opacity: 0; transform: translate(-50%, -54%) scale(1.02); }
        }
        .fx-discovery-card--mob {
          color: var(--bad, #e55);
          text-shadow: 0 0 12px var(--bad, #e55);
        }
        .fx-discovery-card--item {
          color: var(--accent-hot, #ffd27a);
          text-shadow: 0 0 12px var(--accent, #e4a657);
        }
        .fx-discovery-label {
          font-family: var(--font-mono);
          font-size: clamp(10px, 1.2vw, 14px);
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--fg-1);
          opacity: 0.8;
        }
        .fx-discovery-name {
          font-family: var(--font-display);
          font-size: clamp(24px, 5vw, 48px);
          line-height: 1;
          font-weight: 500;
        }

        @media (prefers-reduced-motion: reduce) {
          .fx-flash, .fx-vignette, .fx-banner, .fx-death-stack { animation-duration: 900ms; }
          .fx-banner, .fx-death-stack { animation-timing-function: linear; }
          /* Reduced motion: strip the banner zoom/blur keyframes so the
             Level Up text just fades in cleanly without scale/letter-spacing
             animation. Duration already shortened by the .fx-banner rule. */
          .fx-banner--levelup { animation: none; }
          .fx-levelup-celebration { animation: none; }
          .fx-newarea-card, .fx-newarea-scrim, .fx-newarea-glyph {
            animation-duration: 1800ms;
            animation-timing-function: linear;
          }
          .fx-llmc-card, .fx-llmc-scrim {
            animation-duration: 2100ms;
            animation-timing-function: linear;
          }
          .fx-genarea-card, .fx-genarea-scrim {
            animation-duration: 800ms;
            animation-timing-function: linear;
          }
          .fx-genarea-name { animation: none; }
          .fx-discovery-card, .fx-discovery-scrim {
            animation-duration: 1200ms;
            animation-timing-function: linear;
          }
        }
      `}</style>
    </div>
  )
}
