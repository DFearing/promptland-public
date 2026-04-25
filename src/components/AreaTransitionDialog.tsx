import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface Action {
  label: string
  onClick: () => void
  /** When true, this button renders as the primary CTA. */
  primary?: boolean
}

interface Props {
  open: boolean
  title: string
  body: ReactNode
  actions: Action[]
  onDismiss: () => void
}

/**
 * Shared base for area-transition gate dialogs (NoLLMDialog,
 * FirstTimeDialog). Clones the ConfirmDialog's visual language — dark
 * backdrop, CRT box-corners, z-index 1000 — but supports an arbitrary
 * action list rather than the fixed confirm/cancel pair.
 */
export default function AreaTransitionDialog({
  open,
  title,
  body,
  actions,
  onDismiss,
}: Props) {
  const firstBtnRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    firstBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) {
    return null
  }

  return (
    <div
      className="area-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onDismiss()
        }
      }}
    >
      <div className="area-gate__card" role="document">
        <span className="area-gate__corner area-gate__corner--tl" aria-hidden="true">{'┏'}</span>
        <span className="area-gate__corner area-gate__corner--tr" aria-hidden="true">{'┓'}</span>
        <span className="area-gate__corner area-gate__corner--bl" aria-hidden="true">{'┗'}</span>
        <span className="area-gate__corner area-gate__corner--br" aria-hidden="true">{'┛'}</span>

        <div className="area-gate__header">
          <span id={titleId} className="area-gate__title">{title}</span>
        </div>
        <div className="area-gate__body">{body}</div>
        <div className="area-gate__actions">
          {actions.map((action, i) => (
            <button
              key={action.label}
              type="button"
              ref={i === 0 ? firstBtnRef : undefined}
              className={
                'area-gate__btn' +
                (action.primary ? ' area-gate__btn--primary' : '')
              }
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .area-gate {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-4);
        }
        .area-gate__card {
          position: relative;
          width: 100%;
          max-width: 480px;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .area-gate__corner {
          position: absolute;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          color: var(--line-3);
          pointer-events: none;
          user-select: none;
        }
        .area-gate__corner--tl { top: -6px; left: -4px; }
        .area-gate__corner--tr { top: -6px; right: -4px; }
        .area-gate__corner--bl { bottom: -6px; left: -4px; }
        .area-gate__corner--br { bottom: -6px; right: -4px; }

        .area-gate__header {
          border-bottom: 1px solid var(--line-1);
          padding-bottom: var(--sp-2);
        }
        .area-gate__title {
          font-family: var(--font-display);
          font-size: var(--text-xl);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }

        .area-gate__body {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--fg-1);
        }

        .area-gate__actions {
          display: flex;
          gap: var(--sp-2);
          justify-content: flex-end;
          flex-wrap: wrap;
          padding-top: var(--sp-2);
          border-top: 1px solid var(--line-1);
        }
        .area-gate__btn {
          padding: 6px var(--sp-4);
          background: var(--bg-1);
          border: 1px solid var(--line-2);
          color: var(--fg-1);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-shadow: var(--glow-sm);
          transition:
            border-color var(--dur-fast) var(--ease-crt),
            background var(--dur-fast) var(--ease-crt),
            color var(--dur-fast) var(--ease-crt);
        }
        .area-gate__btn:hover,
        .area-gate__btn:focus-visible {
          outline: none;
          background: var(--bg-2);
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }
        .area-gate__btn--primary {
          background: var(--bg-2);
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }
      `}</style>
    </div>
  )
}
