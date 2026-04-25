import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { Effects } from '../themes'
import type { EffectEvent } from './types'

interface Props {
  events: EffectEvent[]
  effects: Effects
}

interface ActiveFx {
  id: string
  kind: EffectEvent['kind']
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

export default function EffectsOverlay({ events, effects }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveFx[]>([])

  useEffect(() => {
    const fresh = events.filter((e) => !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)

    const renderable = fresh.filter((e) => {
      if (e.kind === 'level-up' || e.kind === 'death' || e.kind === 'damage-taken') {
        return effects.flashes
      }
      return false
    })
    if (renderable.length > 0) {
      setActive((prev) => [...prev, ...renderable.map((e) => ({ id: e.id, kind: e.kind }))])
    }

    if (effects.confetti) {
      for (const e of fresh) {
        if (e.kind === 'level-up') fireConfetti()
      }
    }
  }, [events, effects.flashes, effects.confetti])

  const handleEnd = (id: string) => {
    setActive((prev) => prev.filter((fx) => fx.id !== id))
  }

  return (
    <div className="fx-overlay" aria-hidden="true">
      {active.map((fx) => {
        if (fx.kind === 'damage-taken') {
          return (
            <div
              key={fx.id}
              className="fx-flash fx-flash--damage"
              onAnimationEnd={() => handleEnd(fx.id)}
            />
          )
        }
        if (fx.kind === 'level-up') {
          return (
            <div key={fx.id} className="fx-cluster">
              <div className="fx-flash fx-flash--levelup" />
              <div
                className="fx-banner fx-banner--levelup"
                onAnimationEnd={() => handleEnd(fx.id)}
              >
                Level Up
              </div>
            </div>
          )
        }
        if (fx.kind === 'death') {
          return (
            <div key={fx.id} className="fx-cluster">
              <div className="fx-vignette fx-vignette--death" />
              <div
                className="fx-banner fx-banner--death"
                onAnimationEnd={() => handleEnd(fx.id)}
              >
                Defeated
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
          background: radial-gradient(ellipse at center, transparent 50%, var(--bad) 130%);
          animation: fx-damage 340ms ease-out forwards;
        }
        @keyframes fx-damage {
          0%   { opacity: 0; }
          15%  { opacity: 0.85; }
          100% { opacity: 0; }
        }

        .fx-flash--levelup {
          background: radial-gradient(ellipse at center, var(--accent-hot) 0%, transparent 70%);
          animation: fx-levelup-flash 900ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-levelup-flash {
          0%   { opacity: 0; transform: scale(0.9); }
          20%  { opacity: 0.55; transform: scale(1.05); }
          100% { opacity: 0; transform: scale(1.15); }
        }

        .fx-vignette { position: absolute; inset: 0; mix-blend-mode: multiply; }
        .fx-vignette--death {
          background: radial-gradient(ellipse at center, transparent 15%, rgba(0, 0, 0, 0.3) 55%, #000 120%);
          animation: fx-death 2400ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-death {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          75%  { opacity: 1; }
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
          color: var(--accent-hot);
          text-shadow: var(--glow-lg), 0 0 32px var(--accent);
          animation: fx-banner-levelup 1800ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-banner-levelup {
          0%   { opacity: 0; transform: translateY(12px) scale(0.8); letter-spacing: 0.02em; }
          20%  { opacity: 1; transform: translateY(0) scale(1.05); letter-spacing: 0.18em; }
          40%  { transform: translateY(0) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-12px) scale(1); }
        }
        .fx-banner--death {
          color: var(--bad);
          text-shadow: 0 0 18px var(--bad), 0 0 2px #000;
          animation: fx-banner-death 2400ms ease-out forwards;
          opacity: 0;
        }
        @keyframes fx-banner-death {
          0%   { opacity: 0; transform: scale(1.2); }
          20%  { opacity: 1; transform: scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .fx-flash, .fx-vignette, .fx-banner { animation-duration: 600ms; }
          .fx-banner { animation-timing-function: linear; }
        }
      `}</style>
    </div>
  )
}
