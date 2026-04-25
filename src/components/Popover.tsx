import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  /** Viewport rect of the element that triggered the popover. */
  anchor: DOMRect | null
  onClose: () => void
  children: ReactNode
}

const POPOVER_MIN_WIDTH = 280
const POPOVER_MAX_WIDTH = 480
const MARGIN = 8
const MAX_HEIGHT = 360
// How long the popover sticks around before auto-dismissing itself when the
// pointer isn't actively on it. Matches the tooltip cadence: quick enough that
// stale popovers don't pile up, generous enough for the reader to glance away
// and return. Cancelled as soon as the pointer enters the panel.
const AUTO_DISMISS_MS = 1500

export default function Popover({ open, anchor, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dismissTimerRef = useRef<number | null>(null)

  const cancelDismiss = () => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }

  const scheduleDismiss = () => {
    cancelDismiss()
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null
      onClose()
    }, AUTO_DISMISS_MS)
  }

  useEffect(() => {
    if (!open) return
    // Flag the document body so TooltipLayer (and anyone else who cares) can
    // suppress hovers while a popover owns the dialog slot. Matches the
    // z-index ordering: the popover sits at 1100; tooltips are a lower
    // stacking layer and would otherwise render alongside it.
    document.body.classList.add('has-popover')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const el = panelRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) onClose()
    }
    // Dismiss behavior is pointer-position driven. Starting a timer on open
    // fires the popover away even when the user is still parked on the
    // trigger reading the card. Instead, each pointermove checks whether
    // the pointer is still over the anchor rect or the panel; only when it
    // leaves both does the grace countdown start. If the user clicks and
    // never moves the mouse, the popover stays up indefinitely (Escape or
    // an outside click still close it).
    const inRect = (x: number, y: number, r: DOMRect) =>
      x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    const onMove = (e: PointerEvent) => {
      const onAnchor = anchor != null && inRect(e.clientX, e.clientY, anchor)
      const panel = panelRef.current
      const onPanel =
        panel != null && inRect(e.clientX, e.clientY, panel.getBoundingClientRect())
      if (onAnchor || onPanel) {
        cancelDismiss()
      } else if (dismissTimerRef.current == null) {
        scheduleDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointermove', onMove)
    // Defer the outside-click listener by one task so the click that opened
    // the popover doesn't immediately dismiss it.
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true)
    }, 0)
    return () => {
      document.body.classList.remove('has-popover')
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointermove', onMove)
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointerDown, true)
      cancelDismiss()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, anchor])

  if (!open || !anchor || typeof document === 'undefined') return null

  // Vertical placement: below if there's room, otherwise above.
  const viewportH = window.innerHeight
  const viewportW = window.innerWidth
  const flipUp = anchor.bottom + MARGIN + MAX_HEIGHT > viewportH
  // Horizontal: align to anchor's left edge, clamp to viewport.
  let left = anchor.left
  if (left + POPOVER_MAX_WIDTH > viewportW - MARGIN) {
    left = viewportW - POPOVER_MAX_WIDTH - MARGIN
  }
  if (left < MARGIN) left = MARGIN

  const style: React.CSSProperties = flipUp
    ? { left, bottom: viewportH - anchor.top + MARGIN }
    : { left, top: anchor.bottom + MARGIN }

  return createPortal(
    <div
      ref={panelRef}
      className="popover"
      role="dialog"
      aria-modal="false"
      style={style}
    >
      {children}

      <style>{`
        .popover {
          position: fixed;
          min-width: ${POPOVER_MIN_WIDTH}px;
          max-width: ${POPOVER_MAX_WIDTH}px;
          width: max-content;
          max-height: ${MAX_HEIGHT}px;
          overflow-y: auto;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55), var(--glow-md);
          /* Above modals (z: 1000) so a popover triggered from inside the
             leveling / deaths dialog renders on top of it. */
          z-index: 1100;
          padding: var(--sp-4);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.55;
          color: var(--fg-1);
        }
        .popover__title {
          margin: 0 0 var(--sp-2);
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-shadow: var(--glow-sm);
        }
        .popover__title--room { color: var(--magic); }
        .popover__title--mob { color: var(--bad); }
        .popover__title--item { color: var(--good); }
        .popover__title--name { color: var(--accent); }
        .popover__title--effect { color: var(--speech); }
        .popover__title--dead { color: var(--fg-3); text-decoration: line-through; text-shadow: none; }
        .popover__meta--dead { color: var(--bad); text-shadow: var(--glow-sm); font-weight: bold; }
        .popover__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .popover__list-row { display: flex; justify-content: space-between; gap: var(--sp-2); padding: 2px 0; border-bottom: 1px solid var(--line-1); font-family: var(--font-mono); font-size: var(--text-xs); }
        .popover__list-row:last-child { border-bottom: none; }
        .popover__list-name { color: var(--fg-1); }
        .popover__list-slot { color: var(--fg-3); font-size: var(--text-xs); font-variant-caps: all-small-caps; letter-spacing: 0.06em; }
        .popover__list-val { color: var(--good); font-variant-numeric: tabular-nums; text-shadow: var(--glow-sm); }
        .popover__body {
          margin: 0 0 var(--sp-2);
          color: var(--fg-1);
        }
        .popover__meta {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin: 0 0 var(--sp-2);
        }
        /* Stat bonuses — sits on its own line below the level/rarity/weight
           meta line, styled slightly brighter so the numbers stand out. */
        .popover__meta--bonuses {
          color: var(--fg-2);
          text-shadow: var(--glow-sm);
          text-transform: none;
          letter-spacing: 0.04em;
        }
        /* Acquisition footer — sits below the description, dimmer + italic so
           it reads as a side note rather than a primary fact about the item. */
        .popover__meta--acquired {
          text-transform: none;
          font-style: italic;
          color: var(--fg-3);
          letter-spacing: 0.02em;
          margin-top: var(--sp-1);
        }
        .popover__actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--sp-2);
          padding-top: var(--sp-2);
          border-top: 1px solid var(--line-1);
        }
        .popover__btn {
          padding: 4px var(--sp-3);
          background: var(--bg-1);
          border: 1px solid var(--line-2);
          color: var(--fg-1);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: border-color var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt);
        }
        .popover__btn:hover, .popover__btn:focus-visible {
          outline: none;
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-sm);
        }
      `}</style>
    </div>,
    document.body,
  )
}
