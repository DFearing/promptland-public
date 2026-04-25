import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import Panel from './Panel'
import type { Character } from '../character'
import type { GameState } from '../game'
import type { LogEntry, LogMeta } from '../log'
import HistoryDialog from './HistoryDialog'

interface Props {
  character: Character
  entries?: LogEntry[]
  state?: GameState
  paused?: boolean
  onSelectRoom?: (areaId: string, roomKey: string) => void
}

function describeState(state?: GameState): string {
  if (!state) return ''
  switch (state.kind) {
    case 'exploring': return 'Exploring'
    case 'resting': return 'Resting'
    case 'fighting': return `Fighting: ${state.mob.name}`
  }
}

function sampleEntries(name: string): LogEntry[] {
  return [
    { kind: 'chapter', text: `${name} stirs.` },
    { kind: 'narrative', text: `${name} stands at the edge of an unnamed place.` },
    { kind: 'narrative', text: 'A faint breeze carries the scent of somewhere else.' },
    { kind: 'system', text: 'Someone, somewhere, is watching her do this. She does not know.' },
  ]
}

interface HighlightPart {
  match: string
  render: (matched: string) => ReactNode
}

function buildParts(
  meta: LogMeta,
  onSelectRoom?: (areaId: string, roomKey: string) => void,
): HighlightPart[] {
  const parts: HighlightPart[] = []
  if (meta.name) {
    parts.push({
      match: meta.name,
      render: (t) => <span className="logp__tok logp__tok--name">{t}</span>,
    })
  }
  if (meta.mobName) {
    parts.push({
      match: meta.mobName,
      render: (t) => <span className="logp__tok logp__tok--mob">{t}</span>,
    })
  }
  if (meta.itemName) {
    parts.push({
      match: meta.itemName,
      render: (t) => <span className="logp__tok logp__tok--item">{t}</span>,
    })
  }
  if (meta.conditionName) {
    parts.push({
      match: meta.conditionName,
      render: (t) => <span className="logp__tok logp__tok--cond">{t}</span>,
    })
    const lowered = meta.conditionName.toLowerCase()
    if (lowered !== meta.conditionName) {
      parts.push({
        match: lowered,
        render: (t) => <span className="logp__tok logp__tok--cond">{t}</span>,
      })
    }
  }
  if (meta.direction) {
    parts.push({
      match: meta.direction,
      render: (t) => <span className="logp__tok logp__tok--dir">{t}</span>,
    })
  }
  if (meta.roomName) {
    const areaId = meta.areaId
    const roomKey = meta.roomKey
    const canClick = !!areaId && !!roomKey && !!onSelectRoom
    parts.push({
      match: meta.roomName,
      render: (t) =>
        canClick ? (
          <button
            type="button"
            className="logp__tok logp__tok--room logp__tok--link"
            title="Show on map"
            onClick={() => onSelectRoom!(areaId!, roomKey!)}
          >
            {t}
          </button>
        ) : (
          <span className="logp__tok logp__tok--room">{t}</span>
        ),
    })
  }
  return parts
}

function Highlight({
  text,
  meta,
  onSelectRoom,
}: {
  text: string
  meta?: LogMeta
  onSelectRoom?: (areaId: string, roomKey: string) => void
}) {
  if (!meta) return <>{text}</>
  const parts = buildParts(meta, onSelectRoom)
  if (parts.length === 0) return <>{text}</>

  const chunks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    let bestIdx = text.length
    let bestPart: HighlightPart | null = null
    for (const part of parts) {
      if (!part.match) continue
      const idx = text.indexOf(part.match, i)
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx
        bestPart = part
      }
    }
    if (!bestPart) {
      chunks.push(<Fragment key={key++}>{text.slice(i)}</Fragment>)
      break
    }
    if (bestIdx > i) {
      chunks.push(<Fragment key={key++}>{text.slice(i, bestIdx)}</Fragment>)
    }
    const matched = text.slice(bestIdx, bestIdx + bestPart.match.length)
    chunks.push(<Fragment key={key++}>{bestPart.render(matched)}</Fragment>)
    i = bestIdx + bestPart.match.length
  }
  return <>{chunks}</>
}

function LogLine({
  entry,
  onSelectRoom,
}: {
  entry: LogEntry
  onSelectRoom?: (areaId: string, roomKey: string) => void
}) {
  const meta = 'meta' in entry ? entry.meta : undefined

  switch (entry.kind) {
    case 'narrative':
      return (
        <p className="logp__line logp__line--narrative">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )

    case 'system':
      return (
        <p className="logp__line logp__line--system">
          <span className="logp__prefix">&gt;</span>
          {entry.text}
        </p>
      )

    case 'chapter':
      return (
        <p className="logp__line logp__line--chapter">
          <span className="logp__prefix">—</span>
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )

    case 'area':
      return (
        <p className="logp__line logp__line--chapter">
          <span className="logp__prefix">—</span>
          New area: {entry.text}
        </p>
      )

    case 'dialogue':
      return (
        <p className="logp__line logp__line--dialogue">
          <span className="logp__prefix">"</span>
          {entry.speaker ? <span className="logp__speaker">{entry.speaker}: </span> : null}
          {entry.text}
        </p>
      )

    case 'damage':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
          {typeof entry.amount === 'number' ? (
            <span className="logp__tag"> (−{entry.amount} HP)</span>
          ) : null}
        </p>
      )

    case 'heal':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
          {typeof entry.amount === 'number' ? (
            <span className="logp__tag"> (+{entry.amount} HP)</span>
          ) : null}
        </p>
      )

    case 'loot':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )

    case 'consume': {
      const tag = entry.effect === 'heal' ? `+${entry.amount} HP` : `+${entry.amount} MP`
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
          <span className="logp__tag"> ({tag})</span>
        </p>
      )
    }

    case 'equip':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )

    case 'death-loss':
      return (
        <p className="logp__line logp__line--loss">
          <span className="logp__prefix">·</span>
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )

    case 'condition-gain': {
      const cls =
        'logp__line ' +
        (entry.polarity === 'buff' ? 'logp__line--buff' : 'logp__line--debuff')
      return (
        <p className={cls}>
          <span className="logp__prefix">+</span>
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )
    }

    case 'condition-tick':
      return (
        <p className="logp__line logp__line--debuff">
          <span className="logp__prefix">·</span>
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
          {entry.amount > 0 ? <span className="logp__tag"> (−{entry.amount} HP)</span> : null}
        </p>
      )

    case 'condition-end':
      return (
        <p className="logp__line logp__line--cond-end">
          <span className="logp__prefix">−</span>
          <Highlight text={entry.text} meta={meta} onSelectRoom={onSelectRoom} />
        </p>
      )
  }
}

export default function LogPanel({ character, entries, state, paused, onSelectRoom }: Props) {
  const lines = entries ?? sampleEntries(character.name)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showDeaths, setShowDeaths] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const life = character.deaths.length + 1
  const deathItems = character.deaths.map((d) => ({
    at: d.at,
    text: d.roomName ? `${d.cause} in the ${d.roomName}.` : `${d.cause}.`,
  }))

  const stateLabel = paused ? 'Paused' : describeState(state)

  const metaNode = (
    <span className="logp__meta">
      {stateLabel && (
        <span className={'logp__state' + (paused ? ' logp__state--paused' : '')}>
          {stateLabel}
        </span>
      )}
      <button
        type="button"
        className="logp__lives"
        title="See death history"
        onClick={() => setShowDeaths(true)}
      >
        Life {life}
      </button>
    </span>
  )

  return (
    <Panel title="Log" meta={metaNode} className="scanlines flicker">
      <HistoryDialog
        open={showDeaths}
        title={`${character.name} — Deaths`}
        items={deathItems}
        emptyText="Still alive."
        onClose={() => setShowDeaths(false)}
      />
      <div className="logp" ref={scrollRef}>
        {lines.map((entry, i) => (
          <LogLine key={i} entry={entry} onSelectRoom={onSelectRoom} />
        ))}
        <p className="logp__line logp__line--tail cursor">
          <span className="logp__invis">.</span>
        </p>
      </div>
      <style>{`
        .logp {
          flex: 1;
          overflow-y: auto;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: var(--leading-log);
          color: var(--fg-1);
          min-height: 0;
          padding-right: var(--sp-1);
        }
        .logp__line { margin: 0 0 var(--sp-1) 0; }
        .logp__prefix {
          display: inline-block;
          width: 1.5em;
          font-family: var(--font-mono);
          color: var(--fg-3);
        }
        .logp__line--narrative { color: var(--fg-1); }
        .logp__line--action { color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .logp__line--system {
          color: var(--fg-2);
          font-style: italic;
        }
        .logp__line--system .logp__prefix { color: var(--fg-2); }
        .logp__line--chapter {
          color: var(--accent-hot);
          text-shadow: var(--glow-sm);
          letter-spacing: 0.02em;
          margin-top: var(--sp-2);
        }
        .logp__line--chapter .logp__prefix { color: var(--accent); }
        .logp__line--dialogue { color: var(--speech); }
        .logp__line--dialogue .logp__prefix { color: var(--speech); }
        .logp__line--loss { color: var(--warn); font-style: italic; }
        .logp__line--loss .logp__prefix { color: var(--warn); }
        .logp__line--buff { color: var(--good); }
        .logp__line--buff .logp__prefix { color: var(--good); }
        .logp__line--debuff { color: var(--warn); }
        .logp__line--debuff .logp__prefix { color: var(--warn); }
        .logp__line--cond-end { color: var(--fg-2); font-style: italic; }
        .logp__line--cond-end .logp__prefix { color: var(--fg-3); }
        .logp__tok--cond { color: var(--magic); font-style: italic; }
        .logp__speaker {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--fg-2);
        }
        .logp__tag {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          color: var(--accent-hot);
        }
        .logp__tok--name { color: var(--accent); font-weight: 500; }
        .logp__tok--dir { color: var(--speech); font-variant-caps: all-small-caps; letter-spacing: 0.05em; }
        .logp__tok--mob { color: var(--bad); }
        .logp__tok--room { color: var(--magic); }
        .logp__tok--item { color: var(--accent-hot); font-style: italic; }
        .logp__tok--link {
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          color: var(--magic);
          cursor: pointer;
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 2px;
        }
        .logp__tok--link:hover, .logp__tok--link:focus-visible {
          outline: none;
          text-shadow: var(--glow-sm);
          text-decoration-style: solid;
        }
        .logp__line--tail { margin: 0; color: var(--fg-3); }
        .logp__invis { opacity: 0; }
        .logp__meta { display: inline-flex; align-items: center; gap: var(--sp-2); }
        .logp__state {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-2);
          padding: 2px var(--sp-2);
          border: 1px dashed var(--line-2);
        }
        .logp__state--paused {
          color: var(--warn);
          border-style: solid;
          border-color: var(--warn);
          text-shadow: var(--glow-sm);
        }
        .logp__lives {
          background: var(--bg-2);
          border: 1px solid var(--line-2);
          padding: 2px var(--sp-2);
          color: var(--fg-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt);
        }
        .logp__lives:hover, .logp__lives:focus-visible {
          outline: none;
          color: var(--accent-hot);
          border-color: var(--line-3);
          text-shadow: var(--glow-sm);
        }
      `}</style>
    </Panel>
  )
}
