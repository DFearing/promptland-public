import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { LevelUpRecord } from '../character'
import { xpToNextLevel } from '../character'
import { rarityColor, rarityLabel, skullsFor } from '../items'
import type { Effects } from '../themes'
import type { EffectEvent } from './types'

interface Props {
  events: EffectEvent[]
  effects: Effects
}

interface ActiveFx {
  id: string
  kind: EffectEvent['kind']
  /** 0–1 intensity used by damage/heal flashes. */
  intensity?: number
  /** Level-up card on-screen duration, chosen per level reached. */
  durationMs?: number
  levelUp?: {
    record: LevelUpRecord
    previousAt: number
    previousGold: number
  }
  /** Area name used by the new-area fullscreen banner. */
  name?: string
}

// Per-level on-screen durations for the level-up card. Tuned in code so
// notable milestones linger longer than routine levels.
const LEVEL_UP_DURATION_CONFIG = {
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

function levelUpDurationMs(level: number): number {
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

// Maps "amount relative to maxHp" into a 0..1 intensity. A grazing 5% hit
// barely whispers; a one-shot ≥80% hit fills the screen. Square root keeps
// the low end visible without turning mid-range into near-max.
function intensityFor(amount: number, maxHp: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxHp) || maxHp <= 0) return 0
  const ratio = Math.max(0, Math.min(1, amount / maxHp))
  return Math.sqrt(ratio)
}

export default function EffectsOverlay({ events, effects }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const primedRef = useRef(false)
  const [active, setActive] = useState<ActiveFx[]>([])

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
        renderable.push({ id: e.id, kind: e.kind })
      } else if (e.kind === 'damage-taken' && fs.damage) {
        renderable.push({ id: e.id, kind: e.kind, intensity: intensityFor(e.amount, e.maxHp) })
      } else if (e.kind === 'heal-self' && fs.heal) {
        renderable.push({ id: e.id, kind: e.kind, intensity: intensityFor(e.amount, e.maxHp) })
      } else if (e.kind === 'new-area' && fs.newArea) {
        renderable.push({ id: e.id, kind: e.kind, name: e.name })
      } else if (e.kind === 'llm-connected') {
        renderable.push({ id: e.id, kind: e.kind })
      }
    }
    if (renderable.length > 0) setActive((prev) => [...prev, ...renderable])

    if (fsOn && fs.levelUpConfetti) {
      for (const e of fresh) {
        if (e.kind === 'level-up') fireConfetti()
      }
    }
  }, [events, fsOn, fs.levelUpBanner, fs.death, fs.damage, fs.heal, fs.levelUpConfetti, fs.newArea])

  const handleEnd = (id: string) => {
    setActive((prev) => prev.filter((fx) => fx.id !== id))
  }

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
              >
                <div className="fx-levelup-celebration">🎉</div>
                <div className="fx-banner fx-banner--levelup">Level Up</div>
                {rec && (
                  <div className="fx-levelup-sub">
                    Lv {rec.from} → {rec.to}
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
                        {goldGained > 0 ? `+${goldGained}` : goldGained < 0 ? `${goldGained}` : '—'}
                      </dd>
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
                          <span className="fx-levelup-muted">—</span>
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
              </div>
            </div>
          )
        }
        if (fx.kind === 'death') {
          return (
            <div key={fx.id} className="fx-cluster">
              <div className="fx-vignette fx-vignette--death" />
              <div className="fx-death-stack">
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
          return (
            <div key={fx.id} className="fx-cluster fx-newarea">
              <div className="fx-newarea-scrim" />
              <div
                className="fx-newarea-card"
                onAnimationEnd={(e) => {
                  // Only release when the card's own animation ends — the
                  // scrim runs a shorter fade, and inner elements animate
                  // independently. Filtering by target keeps us from
                  // tearing down early.
                  if (e.currentTarget === e.target) handleEnd(fx.id)
                }}
              >
                <div className="fx-newarea-rule" />
                <div className="fx-newarea-label">New Area</div>
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
          font-size: var(--text-lg);
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

        .fx-vignette { position: absolute; inset: 0; }
        /* Death vignette slams to near-black so the Defeated banner sits on
           a somber, unambiguous stage. Duration and peak opacity are
           deliberately higher than damage/heal flashes — this is a beat
           worth sitting with. */
        .fx-vignette--death {
          background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.82) 55%, #000 120%);
          animation: fx-death 4200ms ease-out forwards;
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
        }
        /* Death banner: stacked on top of a big centered skull. The
           top-percentage shifts the whole cluster upward so the word and
           skull share roughly the middle third of the viewport. */
        .fx-death-stack {
          position: absolute;
          left: 0;
          right: 0;
          top: 30%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-3);
          animation: fx-death-stack 4200ms ease-out forwards;
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
          animation: fx-banner-death 4200ms ease-out forwards;
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

        @media (prefers-reduced-motion: reduce) {
          .fx-flash, .fx-vignette, .fx-banner, .fx-death-stack { animation-duration: 900ms; }
          .fx-banner, .fx-death-stack { animation-timing-function: linear; }
          .fx-newarea-card, .fx-newarea-scrim, .fx-newarea-glyph {
            animation-duration: 1800ms;
            animation-timing-function: linear;
          }
          .fx-llmc-card, .fx-llmc-scrim {
            animation-duration: 2100ms;
            animation-timing-function: linear;
          }
        }
      `}</style>
    </div>
  )
}
