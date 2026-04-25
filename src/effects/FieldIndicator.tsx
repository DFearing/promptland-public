import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FieldFxEvent, FieldId } from './types'

interface Props {
  events: FieldFxEvent[]
  field: FieldId
  enabled: boolean
  /** Animation duration in milliseconds for each floating delta. */
  durationMs: number
}

interface ActiveFloater {
  id: string
  delta: number
  offsetX: number
  /** Viewport coords captured at spawn time (anchor's right edge / vert-center). */
  anchorX: number
  anchorY: number
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

export default function FieldIndicator({ events, field, enabled, durationMs }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const primedRef = useRef(false)
  const [active, setActive] = useState<ActiveFloater[]>([])
  const effectiveMs = prefersReducedMotion() ? Math.min(durationMs, 500) : durationMs

  useEffect(() => {
    if (!enabled) return
    // First run after mount: treat every event already in the buffer as "already
    // seen" so we never animate a backlog that accumulated while a different
    // tab was active. Only events that arrive after this render will animate.
    if (!primedRef.current) {
      primedRef.current = true
      for (const e of events) seenRef.current.add(e.id)
      return
    }
    const fresh = events.filter((e) => e.field === field && !seenRef.current.has(e.id))
    if (fresh.length === 0) return
    for (const e of fresh) seenRef.current.add(e.id)
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const anchorX = rect.right
    const anchorY = rect.top + rect.height / 2
    setActive((prev) => [
      ...prev,
      ...fresh.map((e) => ({
        id: e.id,
        delta: e.delta,
        offsetX: Math.round((Math.random() - 0.5) * 16),
        anchorX,
        anchorY,
      })),
    ])
  }, [events, field, enabled])

  const handleEnd = (id: string) => {
    setActive((prev) => prev.filter((f) => f.id !== id))
  }

  if (!enabled) return null

  const floaters =
    active.length > 0 && typeof document !== 'undefined'
      ? createPortal(
          <div className="fx-float-portal" aria-hidden="true">
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
                  style={{
                    left: `${f.anchorX}px`,
                    top: `${f.anchorY}px`,
                    ['--fx-x' as string]: `${f.offsetX}px`,
                    animationDuration: `${effectiveMs}ms`,
                  }}
                  onAnimationEnd={() => handleEnd(f.id)}
                >
                  {sign}
                  {magnitude}
                </span>
              )
            })}

            <style>{`
              .fx-float-portal {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 35;
                overflow: visible;
              }
              .fx-float__item {
                position: fixed;
                transform: translate(calc(var(--fx-x, 0px) - 100%), -50%);
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
                0%   { opacity: 0; transform: translate(calc(var(--fx-x, 0px) - 100%), -50%); }
                12%  { opacity: 1; transform: translate(calc(var(--fx-x, 0px) - 100%), -120%); }
                100% { opacity: 0; transform: translate(calc(var(--fx-x, 0px) - 100%), -340%); }
              }
              @keyframes fx-float-down {
                0%   { opacity: 0; transform: translate(calc(var(--fx-x, 0px) - 100%), -50%); }
                12%  { opacity: 1; transform: translate(calc(var(--fx-x, 0px) - 100%), 20%); }
                100% { opacity: 0; transform: translate(calc(var(--fx-x, 0px) - 100%), 220%); }
              }
              @media (prefers-reduced-motion: reduce) {
                .fx-float__item--up, .fx-float__item--down { animation-duration: 500ms; }
              }
            `}</style>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span
        ref={anchorRef}
        className="fx-float-anchor"
        aria-hidden="true"
      />
      {floaters}
      <style>{`
        .fx-float-anchor {
          position: absolute;
          right: 0;
          top: 50%;
          width: 0;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </>
  )
}
