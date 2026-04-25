import type { ReactNode } from 'react'

interface Props {
  title?: string
  /** Inline control rendered immediately after the title text — e.g. a
   *  pin/lock toggle that belongs with the panel identity rather than with
   *  the meta slot on the right. */
  titleExtra?: ReactNode
  meta?: ReactNode
  children: ReactNode
  noPad?: boolean
  className?: string
}

export default function Panel({ title, titleExtra, meta, children, noPad, className }: Props) {
  return (
    <div className={'panel' + (className ? ' ' + className : '')}>
      {title !== undefined && (
        <div className="panel__header">
          <span className="panel__title-group">
            <span className="panel__title">{title}</span>
            {titleExtra}
          </span>
          {meta && <span className="panel__meta">{meta}</span>}
        </div>
      )}
      <div className={'panel__body' + (noPad ? ' panel__body--nopad' : '')}>
        {children}
      </div>

      <style>{`
        .panel { background: var(--bg-1); border: 1px solid var(--line-2); display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%; }
        .panel__header { display: flex; justify-content: space-between; align-items: center; padding: 6px var(--sp-3); border-bottom: 1px solid var(--line-1); flex-shrink: 0; }
        .panel__title-group { display: inline-flex; align-items: center; gap: var(--sp-4); }
        .panel__title { font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); }
        .panel__meta { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.12em; }
        .panel__body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; padding: var(--sp-3); }
        .panel__body--nopad { padding: 0; }
      `}</style>
    </div>
  )
}
