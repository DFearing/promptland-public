import { useEffect, useId, useRef } from 'react'

export interface HistoryItem {
  at: number
  text: string
}

interface Props {
  open: boolean
  title: string
  items: HistoryItem[]
  emptyText?: string
  onClose: () => void
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export default function HistoryDialog({ open, title, items, emptyText, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="hist"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="hist__card" role="document">
        <span className="hist__corner hist__corner--tl" aria-hidden="true">┏</span>
        <span className="hist__corner hist__corner--tr" aria-hidden="true">┓</span>
        <span className="hist__corner hist__corner--bl" aria-hidden="true">┗</span>
        <span className="hist__corner hist__corner--br" aria-hidden="true">┛</span>

        <div className="hist__header">
          <span id={titleId} className="hist__title">{title}</span>
        </div>
        <div className="hist__body">
          {items.length === 0 ? (
            <p className="hist__empty">{emptyText ?? 'Nothing yet.'}</p>
          ) : (
            <ul className="hist__list">
              {items.map((entry, i) => (
                <li key={i} className="hist__item">
                  <span className="hist__time">{formatTimestamp(entry.at)}</span>
                  <span className="hist__text">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hist__actions">
          <button
            type="button"
            ref={closeRef}
            className="hist__btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        .hist {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-4);
        }
        .hist__card {
          position: relative;
          width: 100%;
          max-width: 560px;
          max-height: 80vh;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .hist__corner {
          position: absolute;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          color: var(--line-3);
          pointer-events: none;
          user-select: none;
        }
        .hist__corner--tl { top: -6px; left: -4px; }
        .hist__corner--tr { top: -6px; right: -4px; }
        .hist__corner--bl { bottom: -6px; left: -4px; }
        .hist__corner--br { bottom: -6px; right: -4px; }

        .hist__header { border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-2); }
        .hist__title { font-family: var(--font-display); font-size: var(--text-xl); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-hot); text-shadow: var(--glow-md); }

        .hist__body { font-family: var(--font-body); font-size: var(--text-sm); line-height: 1.6; color: var(--fg-1); overflow-y: auto; min-height: 0; }
        .hist__empty { margin: 0; color: var(--fg-3); font-style: italic; }
        .hist__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
        .hist__item { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-3); align-items: baseline; padding-bottom: var(--sp-2); border-bottom: 1px solid var(--line-1); }
        .hist__item:last-child { border-bottom: none; padding-bottom: 0; }
        .hist__time { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); letter-spacing: 0.08em; white-space: nowrap; }
        .hist__text { color: var(--fg-1); }

        .hist__actions { display: flex; justify-content: flex-end; padding-top: var(--sp-2); border-top: 1px solid var(--line-1); }
        .hist__btn { padding: 6px var(--sp-4); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: var(--glow-sm); transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt); }
        .hist__btn:hover, .hist__btn:focus-visible { outline: none; background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
      `}</style>
    </div>
  )
}
