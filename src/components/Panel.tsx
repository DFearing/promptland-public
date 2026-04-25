import type { ReactNode } from 'react'

interface Props {
  title?: string
  /** Inline control rendered immediately after the title text — e.g. a
   *  pin/lock toggle that belongs with the panel identity rather than with
   *  the meta slot on the right. */
  titleExtra?: ReactNode
  /** Optional line rendered below the title, styled identically to the
   *  meta slot (mono, uppercase, muted). Used when a panel needs a
   *  secondary chip that belongs with the title's column rather than
   *  across from it — e.g. the Room panel's rarity + level under "ROOM". */
  subtitle?: ReactNode
  meta?: ReactNode
  children: ReactNode
  noPad?: boolean
  className?: string
}

export default function Panel({ title, titleExtra, subtitle, meta, children, noPad, className }: Props) {
  return (
    <div className={'panel' + (className ? ' ' + className : '')}>
      {title !== undefined && (
        <div className="panel__header">
          <span className="panel__title-col">
            <span className="panel__title-group">
              <span className="panel__title">{title}</span>
              {titleExtra}
            </span>
            {subtitle && <span className="panel__subtitle">{subtitle}</span>}
          </span>
          {meta && <span className="panel__meta">{meta}</span>}
        </div>
      )}
      <div className={'panel__body' + (noPad ? ' panel__body--nopad' : '')}>
        {children}
      </div>

      <style>{`
        .panel { background: var(--bg-1); border: 1px solid var(--line-2); display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; }
        /* position: relative anchors the absolutely-positioned meta below.
           The meta floats over the header's right edge so it doesn't
           split the row 50/50 with the title column — the title-col
           gets the full header width to draw into and the meta overlays
           the right side. */
        .panel__header { display: flex; justify-content: space-between; align-items: center; padding: 6px var(--sp-3); border-bottom: 1px solid var(--line-1); flex-shrink: 0; gap: var(--sp-3); position: relative; }
        /* Title column stacks the title row and an optional subtitle, so
           panels that need a second chip get a natural "below the title"
           slot without forcing the meta chip to share that column. flex:1
           lets it claim the full header width now that the meta is
           floated out of flow. */
        .panel__title-col { display: inline-flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
        .panel__title-group { display: inline-flex; align-items: center; gap: var(--sp-4); }
        .panel__title { font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); }
        /* Subtitle adopts meta styling intentionally so the two slots read
           as the same typographic "chip" family — one below the title,
           one across from it. */
        .panel__subtitle { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.12em; line-height: 1.2; }
        /* Meta is taken out of flex flow and absolutely pinned to the
           right edge of the header, vertically centered. top:50% +
           translateY(-50%) centers regardless of the meta's height, so
           single-line metas (LogPanel) and stacked metas (RoomDescPanel,
           MapPanel) both balance against the title column on the left. */
        .panel__meta { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.12em; position: absolute; top: 50%; right: var(--sp-3); transform: translateY(-50%); }
        .panel__body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; padding: var(--sp-3); }
        .panel__body--nopad { padding: 0; }
      `}</style>
    </div>
  )
}
