import { useEffect, useState } from 'react'

/** Total generation timeout budget in milliseconds. */
export const GEN_TIMEOUT_MS = 120_000
/** Interval between countdown display updates. */
const COUNTDOWN_INTERVAL_MS = 1_000

interface Props {
  /** Epoch ms when the finding-path phase started. Used to compute
   *  remaining time for the countdown display. */
  startedAt: number
  /** Called when the countdown reaches zero — signals the parent to
   *  flag the tile as no-gen and transition to exploring. */
  onTimeout: () => void
}

/**
 * Fullscreen overlay shown when the player defeats a gateway guardian but
 * LLM area generation is still running. Displays a spinner and a
 * countdown (seconds remaining out of the 120s budget). When the timer
 * expires, `onTimeout` fires so the parent can flag the tile and bail.
 *
 * Rendered conditionally in App.tsx when `state.kind === 'generating-area'`
 * and we arrived from a gateway fight (vs. from the initial explore tick).
 */
export default function FindingPathOverlay({ startedAt, onTimeout }: Props) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((GEN_TIMEOUT_MS - (Date.now() - startedAt)) / 1_000)),
  )

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, Math.ceil((GEN_TIMEOUT_MS - elapsed) / 1_000))
      setRemaining(left)
      if (left <= 0) {
        clearInterval(id)
        onTimeout()
      }
    }, COUNTDOWN_INTERVAL_MS)

    return () => clearInterval(id)
  }, [startedAt, onTimeout])

  return (
    <div className="findpath" aria-live="polite">
      <div className="findpath__scrim" />
      <div className="findpath__card">
        <div className="findpath__spinner" aria-hidden="true" />
        <div className="findpath__label">Finding a path...</div>
        <div className="findpath__countdown">
          {remaining}s remaining
        </div>
      </div>

      <style>{`
        .findpath {
          position: fixed;
          inset: 0;
          z-index: 45;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .findpath__scrim {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at center,
            rgba(0, 0, 0, 0.72) 0%,
            rgba(0, 0, 0, 0.55) 55%,
            rgba(0, 0, 0, 0.3) 90%);
        }
        .findpath__card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-5) var(--sp-6, 24px);
          color: var(--magic, #c084fc);
          text-align: center;
        }
        .findpath__spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(192, 132, 252, 0.2);
          border-top-color: var(--magic, #c084fc);
          border-radius: 50%;
          animation: findpath-spin 1s linear infinite;
        }
        @keyframes findpath-spin {
          to { transform: rotate(360deg); }
        }
        .findpath__label {
          font-family: var(--font-display);
          font-size: clamp(24px, 4vw, 40px);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-shadow: 0 0 24px var(--magic, #c084fc),
                       0 0 48px rgba(192, 132, 252, 0.35);
          animation: findpath-pulse 1200ms ease-in-out infinite alternate;
        }
        @keyframes findpath-pulse {
          0%   { opacity: 0.7; }
          100% { opacity: 1; }
        }
        .findpath__countdown {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          letter-spacing: 0.1em;
          color: var(--fg-3);
          font-variant-numeric: tabular-nums;
        }
        @media (prefers-reduced-motion: reduce) {
          .findpath__spinner { animation: none; border-top-color: var(--magic, #c084fc); }
          .findpath__label { animation: none; }
        }
      `}</style>
    </div>
  )
}
