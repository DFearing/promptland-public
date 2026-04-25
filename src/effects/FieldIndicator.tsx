import { useEffect, useRef, useState } from 'react'
import type { FieldFxEvent, FieldId } from './types'

interface Props {
  events: FieldFxEvent[]
  field: FieldId
  enabled: boolean
}

interface ActiveFloater {
  id: string
  delta: number
  /**
   * Small horizontal jitter so multiple floaters in the same tick don't stack
   * perfectly on top of each other.
   */
  offsetX: number
}

export default function FieldIndicator({ events, field, enabled }: Props) {
  const seenRef = useRef<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveFloater[]>([])

  useEffect(() => {
    if (!enabled) return
    const fresh = events.filter((e) => e.field === field && !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)
    setActive((prev) => [
      ...prev,
      ...fresh.map((e) => ({
        id: e.id,
        delta: e.delta,
        offsetX: Math.round((Math.random() - 0.5) * 16),
      })),
    ])
  }, [events, field, enabled])

  const handleEnd = (id: string) => {
    setActive((prev) => prev.filter((f) => f.id !== id))
  }

  if (!enabled) return null

  return (
    <span className="fx-float" aria-hidden="true">
      {active.map((f) => {
        const positive = f.delta > 0
        const sign = positive ? '+' : '−'
        const magnitude = Math.abs(f.delta)
        return (
          <span
            key={f.id}
            className={
              'fx-float__item' +
              (positive ? ' fx-float__item--up' : ' fx-float__item--down')
            }
            style={{ ['--fx-x' as string]: `${f.offsetX}px` }}
            onAnimationEnd={() => handleEnd(f.id)}
          >
            {sign}
            {magnitude}
          </span>
        )
      })}

      <style>{`
        .fx-float {
          position: absolute;
          right: 0;
          top: 50%;
          width: 0;
          height: 0;
          pointer-events: none;
        }
        .fx-float__item {
          position: absolute;
          right: 0;
          top: 0;
          transform: translate(var(--fx-x, 0px), -50%);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          letter-spacing: 0.04em;
          white-space: nowrap;
          text-shadow: 0 0 6px currentColor, 0 1px 0 rgba(0, 0, 0, 0.6);
          will-change: transform, opacity;
          opacity: 0;
        }
        .fx-float__item--up {
          color: var(--good);
          animation: fx-float-up 1000ms ease-out forwards;
        }
        .fx-float__item--down {
          color: var(--bad);
          animation: fx-float-down 900ms ease-out forwards;
        }
        @keyframes fx-float-up {
          0%   { opacity: 0;    transform: translate(var(--fx-x, 0px), -50%); }
          12%  { opacity: 1;    transform: translate(var(--fx-x, 0px), -120%); }
          100% { opacity: 0;    transform: translate(var(--fx-x, 0px), -340%); }
        }
        @keyframes fx-float-down {
          0%   { opacity: 0;    transform: translate(var(--fx-x, 0px), -50%); }
          12%  { opacity: 1;    transform: translate(var(--fx-x, 0px), 20%); }
          100% { opacity: 0;    transform: translate(var(--fx-x, 0px), 220%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fx-float__item--up, .fx-float__item--down { animation-duration: 500ms; }
        }
      `}</style>
    </span>
  )
}
