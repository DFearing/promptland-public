import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Global tooltip layer. Mount it once at the app root and any element in the
// tree with a `data-tip="..."` attribute gets a themed tooltip on hover or
// focus. Intentionally avoids the native `title` attribute so we don't double
// up with OS-rendered tooltips.
//
// Dismiss behavior:
//   - Leaving the anchor starts a 1s grace timer before the tooltip hides.
//   - The tooltip itself is hoverable — moving into it cancels the timer and
//     holds the card open until the pointer leaves. Leaving the tooltip
//     restarts the same grace timer.
//   - Focus-driven tooltips show instantly and hide instantly on blur.
//   - Escape dismisses any live tooltip.

interface AnchorTip {
  el: HTMLElement
  text: string
  /** Optional accent color for the tooltip — read from `data-tip-color`.
   *  Accepts any CSS color string (including `var(--rarity-rare)`).
   *  Tints the tooltip text and border so the floating card carries the
   *  same identity as the anchor it points at. */
  color?: string
}

interface RenderedTip {
  text: string
  rect: DOMRect
  color?: string
}

interface Placement {
  top: number
  left: number
  placement: 'below' | 'above'
  visible: boolean
}

const SHOW_DELAY_MS = 700
const HIDE_GRACE_MS = 150
const MARGIN = 8

function findTipAnchor(target: EventTarget | null): AnchorTip | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('[data-tip]')
  if (!(el instanceof HTMLElement)) return null
  const text = el.dataset.tip
  if (!text) return null
  const color = el.dataset.tipColor
  return color ? { el, text, color } : { el, text }
}

export default function TooltipLayer() {
  const [tip, setTip] = useState<RenderedTip | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  // Anchor we're currently tracking — either the one scheduled to show or the
  // one the visible tooltip belongs to. Shared across listeners so a pointer
  // leaving the anchor into the tooltip doesn't mis-schedule a dismiss.
  const currentRef = useRef<AnchorTip | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const clearShow = () => {
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
    }
    const clearHide = () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }

    const popoverOpen = () => document.body.classList.contains('has-popover')

    const scheduleShow = (anchor: AnchorTip) => {
      clearShow()
      clearHide()
      currentRef.current = anchor
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null
        const current = currentRef.current
        if (!current || !current.el.isConnected) return
        // Popover owns the dialog slot while it's open — swallow the
        // tooltip so the two don't render on top of each other.
        if (popoverOpen()) return
        setTip({
          text: current.text,
          rect: current.el.getBoundingClientRect(),
          color: current.color,
        })
      }, SHOW_DELAY_MS)
    }

    const scheduleHide = () => {
      clearHide()
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null
        currentRef.current = null
        clearShow()
        setTip(null)
        setPlacement(null)
      }, HIDE_GRACE_MS)
    }

    const hideNow = () => {
      clearShow()
      clearHide()
      currentRef.current = null
      setTip(null)
      setPlacement(null)
    }

    const onPointerOver = (e: PointerEvent) => {
      const anchor = findTipAnchor(e.target)
      if (!anchor) return
      // Re-entering the same anchor (or a child of it) cancels any pending
      // hide; the tooltip stays as-is.
      if (currentRef.current?.el === anchor.el) {
        clearHide()
        return
      }
      scheduleShow(anchor)
    }

    const onPointerOut = (e: PointerEvent) => {
      const current = currentRef.current
      if (!current) return
      const next = e.relatedTarget as Node | null
      // Moving between children of the same anchor doesn't count as leaving.
      if (next && current.el.contains(next)) return
      // Moving into the tooltip keeps it alive; the tooltip's own
      // onPointerEnter will cancel the hide we're about to schedule.
      // (We still schedule it — if the pointer actually left the system, the
      // tooltip's onPointerEnter won't fire and the timer runs.)
      scheduleHide()
    }

    const onFocusIn = (e: FocusEvent) => {
      const anchor = findTipAnchor(e.target)
      if (!anchor) return
      clearShow()
      clearHide()
      currentRef.current = anchor
      if (popoverOpen()) return
      setTip({
        text: anchor.text,
        rect: anchor.el.getBoundingClientRect(),
        color: anchor.color,
      })
    }

    const onFocusOut = () => hideNow()
    const onScroll = () => {
      const current = currentRef.current
      if (!current || !current.el.isConnected) return
      setTip((prev) => (prev ? { ...prev, rect: current.el.getBoundingClientRect() } : prev))
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideNow()
    }
    document.addEventListener('keydown', onKey)

    // When a popover opens mid-hover the tooltip can already be visible.
    // Watch the body's class list so we can dismiss it the moment the
    // popover takes over.
    const observer = new MutationObserver(() => {
      if (popoverOpen()) hideNow()
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => {
      clearShow()
      clearHide()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip) return
    const el = tooltipRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    const anchorCenter = tip.rect.left + tip.rect.width / 2
    let left = Math.round(anchorCenter - w / 2)
    left = Math.max(MARGIN, Math.min(vw - w - MARGIN, left))

    const spaceBelow = vh - tip.rect.bottom
    const spaceAbove = tip.rect.top
    const below = spaceBelow >= h + MARGIN || spaceBelow >= spaceAbove
    const top = below
      ? Math.min(vh - h - MARGIN, tip.rect.bottom + MARGIN)
      : Math.max(MARGIN, tip.rect.top - h - MARGIN)

    setPlacement({ top, left, placement: below ? 'below' : 'above', visible: true })
  }, [tip])

  const onTooltipEnter = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const onTooltipLeave = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      currentRef.current = null
      setTip(null)
      setPlacement(null)
    }, HIDE_GRACE_MS)
  }

  if (!tip) return null

  const style: React.CSSProperties = placement
    ? { top: `${placement.top}px`, left: `${placement.left}px`, visibility: 'visible' }
    : { top: '-9999px', left: '-9999px', visibility: 'hidden' }
  if (tip.color) {
    style.color = tip.color
    style.borderColor = tip.color
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className="tooltip"
      role="tooltip"
      style={style}
      onPointerEnter={onTooltipEnter}
      onPointerLeave={onTooltipLeave}
    >
      {tip.text}
      <style>{`
        .tooltip {
          position: fixed;
          background: var(--bg-2);
          color: var(--fg-1);
          border: 1px solid var(--line-3);
          padding: 4px var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          line-height: 1.45;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), var(--glow-sm);
          /* Hoverable so the user can park on the card to keep it open. */
          pointer-events: auto;
          z-index: 80;
          max-width: 280px;
          white-space: pre-wrap;
          animation: tooltip-fade 120ms var(--ease-crt) both;
        }
        @keyframes tooltip-fade {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tooltip { animation-duration: 1ms; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
