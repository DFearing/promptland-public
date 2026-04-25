import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div
      className="confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="confirm__card" role="document">
        <span className="confirm__corner confirm__corner--tl" aria-hidden="true">┏</span>
        <span className="confirm__corner confirm__corner--tr" aria-hidden="true">┓</span>
        <span className="confirm__corner confirm__corner--bl" aria-hidden="true">┗</span>
        <span className="confirm__corner confirm__corner--br" aria-hidden="true">┛</span>

        <div className="confirm__header">
          <span id={titleId} className="confirm__title">{title}</span>
        </div>
        <div className="confirm__body">{body}</div>
        <div className="confirm__actions">
          <button
            type="button"
            ref={cancelRef}
            className="confirm__btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              'confirm__btn confirm__btn--primary' +
              (tone === 'danger' ? ' confirm__btn--danger' : '')
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        .confirm {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-4);
        }
        .confirm__card {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .confirm__corner {
          position: absolute;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          color: var(--line-3);
          pointer-events: none;
          user-select: none;
        }
        .confirm__corner--tl { top: -6px; left: -4px; }
        .confirm__corner--tr { top: -6px; right: -4px; }
        .confirm__corner--bl { bottom: -6px; left: -4px; }
        .confirm__corner--br { bottom: -6px; right: -4px; }

        .confirm__header {
          border-bottom: 1px solid var(--line-1);
          padding-bottom: var(--sp-2);
        }
        .confirm__title {
          font-family: var(--font-display);
          font-size: var(--text-xl);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }

        .confirm__body {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--fg-1);
        }

        .confirm__actions {
          display: flex;
          gap: var(--sp-2);
          justify-content: flex-end;
          padding-top: var(--sp-2);
          border-top: 1px solid var(--line-1);
        }
        .confirm__btn {
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
        .confirm__btn:hover,
        .confirm__btn:focus-visible {
          outline: none;
          background: var(--bg-2);
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }
        .confirm__btn--primary {
          background: var(--bg-2);
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }
        .confirm__btn--danger {
          border-color: var(--bad);
          color: var(--bad);
          text-shadow: none;
        }
        .confirm__btn--danger:hover,
        .confirm__btn--danger:focus-visible {
          background: var(--bg-2);
          border-color: var(--bad);
          color: var(--bad);
          text-shadow: var(--glow-sm);
        }
      `}</style>
    </div>
  )
}
