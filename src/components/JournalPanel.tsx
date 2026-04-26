import { useMemo, useState, type ReactNode } from 'react'
import type { Character, JournalEntry, JournalEntryKind } from '../character'
import type { WorldContent } from '../worlds'
import type { Subject } from './LogPopoverContent'

type SubjectClickHandler = (
  subject: Subject,
  e: React.MouseEvent<HTMLButtonElement>,
) => void

interface Props {
  character: Character
  world?: WorldContent
  /** Called when a level-up entry's level number is clicked. Receives the
   *  level the character reached at that event so the caller can open the
   *  level history pre-expanded to the matching row. */
  onLevelClick?: (level: number) => void
  /** Called when an inline room / mob / item link is clicked. Caller is
   *  responsible for rendering the popover itself. Mirrors the contract
   *  LogPanel and LevelingDialog use so one popover host upstream
   *  (CharacterTabs) handles all three surfaces. */
  onSubjectClick?: SubjectClickHandler
}

/** Group entries by area, preserving chronological order within each
 *  group and ordering the groups by first-discovery time so the
 *  player's journey reads top-down. */
interface AreaGroup {
  areaId: string
  areaName: string
  areaLevel?: number
  firstSeenAt: number
  entries: JournalEntry[]
}

function groupEntries(character: Character, world?: WorldContent): AreaGroup[] {
  const byArea: Record<string, AreaGroup> = {}
  for (const entry of character.journal ?? []) {
    const g = byArea[entry.areaId]
    if (g) {
      g.entries.push(entry)
      if (entry.at < g.firstSeenAt) g.firstSeenAt = entry.at
    } else {
      const area = world?.areas?.find((a) => a.id === entry.areaId)
      byArea[entry.areaId] = {
        areaId: entry.areaId,
        areaName: area?.name ?? entry.areaId,
        areaLevel: area?.level,
        firstSeenAt: entry.at,
        entries: [entry],
      }
    }
  }
  return Object.values(byArea)
    .map((g) => ({ ...g, entries: [...g.entries].sort((a, b) => a.at - b.at) }))
    .sort((a, b) => a.firstSeenAt - b.firstSeenAt)
}

/** Journal entries get composed with trailing periods (matches prose
 *  grammar in the source code), but in the panel we want them to read
 *  like a diary — no period at the end of the short one-liner. Strip
 *  before rendering rather than changing every emission site. */
function stripTrailingPeriod(text: string): string {
  return text.replace(/[.!]+$/u, '')
}

/** Short relative-time string for the entry list. Uses wall-clock
 *  deltas since the character is mostly played in real time — turning
 *  the `at` into "2h ago" reads as "the character spent two hours
 *  before this". */
function relativeTime(at: number): string {
  const delta = Date.now() - at
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  const days = Math.floor(delta / 86_400_000)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** Short ASCII glyph per entry kind — matches the design-system
 *  dingbat convention (◯ visited, ✦ rare, ↑ level, † death, ✺ spell). */
const GLYPH: Record<JournalEntryKind, string> = {
  'area-discovered': '◯',
  'mob-first-defeat': '✦',
  'boss-defeat': '☠',
  'item-first-loot': '◆',
  'level-up': '↑',
  'spell-learned': '✺',
  death: '†',
  'death-save': '✶',
  'favor-tier-up': '✦',
}

interface Span {
  start: number
  end: number
  render: (key: number) => ReactNode
}

/** Turn a journal entry's plain text into a list of nodes where known
 *  meta substrings (mob, item, room, level number) are replaced with
 *  inline link buttons. Matches LogPanel's token convention so the
 *  same glow-on-hover affordance lands here too. */
function renderEntryText(
  entry: JournalEntry,
  text: string,
  world: WorldContent | undefined,
  onSubjectClick?: SubjectClickHandler,
  onLevelClick?: (level: number) => void,
): ReactNode {
  const spans: Span[] = []
  const meta = entry.meta

  const pushSpan = (substring: string, render: Span['render']): void => {
    if (!substring) return
    const idx = text.indexOf(substring)
    if (idx < 0) return
    // Overlap guard — skip if this range is already claimed by an
    // earlier higher-priority span (rare, but e.g. an item named after
    // a mob could double-match).
    for (const s of spans) {
      if (idx < s.end && idx + substring.length > s.start) return
    }
    spans.push({ start: idx, end: idx + substring.length, render })
  }

  if (meta?.spellName) {
    const spellName = meta.spellName
    pushSpan(spellName, (key) => (
      <span key={key} className="journal__spell">
        {spellName}
      </span>
    ))
  }
  if (meta?.mobName && onSubjectClick) {
    const mobName = meta.mobName
    pushSpan(mobName, (key) => (
      <button
        key={key}
        type="button"
        className="journal__link journal__link--mob"
        onClick={(e) => onSubjectClick({ kind: 'mob', name: mobName }, e)}
      >
        {mobName}
      </button>
    ))
  }
  if (meta?.itemName && meta.itemId && onSubjectClick) {
    const itemName = meta.itemName
    const itemId = meta.itemId
    pushSpan(itemName, (key) => (
      <button
        key={key}
        type="button"
        className="journal__link journal__link--item"
        onClick={(e) =>
          onSubjectClick({ kind: 'item', id: itemId, name: itemName }, e)
        }
      >
        {itemName}
      </button>
    ))
  }
  if (meta?.roomName && onSubjectClick && world) {
    const area =
      world.areas?.find((a) => a.id === entry.areaId) ?? world.startingArea
    const match = Object.entries(area?.rooms ?? {}).find(
      ([, r]) => r.name === meta.roomName,
    )
    if (match) {
      const [roomKey] = match
      const roomName = meta.roomName
      const areaId = entry.areaId
      pushSpan(roomName, (key) => (
        <button
          key={key}
          type="button"
          className="journal__link journal__link--room"
          onClick={(e) =>
            onSubjectClick(
              { kind: 'room', areaId, roomKey, name: roomName },
              e,
            )
          }
        >
          {roomName}
        </button>
      ))
    }
  }
  if (entry.kind === 'level-up' && meta?.toLevel != null && onLevelClick) {
    const lvlStr = String(meta.toLevel)
    // Anchor the match on "level <N>" so stray digits elsewhere in the
    // sentence can't steal the underline. Start offset skips the word
    // "level " so only the number becomes a link.
    const prefix = 'level '
    const needle = prefix + lvlStr
    const idx = text.toLowerCase().indexOf(needle.toLowerCase())
    if (idx >= 0) {
      const start = idx + prefix.length
      const end = start + lvlStr.length
      const toLevel = meta.toLevel
      // push manually so we get exact start/end, not indexOf-of-lvlStr
      // which could match a substring earlier in the text.
      const overlaps = spans.some((s) => start < s.end && end > s.start)
      if (!overlaps) {
        spans.push({
          start,
          end,
          render: (key) => (
            <button
              key={key}
              type="button"
              className="journal__link journal__link--level"
              data-tip="Open level history"
              onClick={() => onLevelClick(toLevel)}
            >
              {lvlStr}
            </button>
          ),
        })
      }
    }
  }

  if (spans.length === 0) return text

  spans.sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let cursor = 0
  let k = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    if (span.start > cursor) {
      out.push(
        <span key={`t${k}`}>{text.slice(cursor, span.start)}</span>,
      )
    }
    out.push(span.render(k++))
    cursor = span.end
  }
  if (cursor < text.length) {
    out.push(<span key={`t${k}`}>{text.slice(cursor)}</span>)
  }
  return out
}

export default function JournalPanel({
  character,
  world,
  onLevelClick,
  onSubjectClick,
}: Props) {
  const groups = useMemo(() => groupEntries(character, world), [character, world])
  // Expand the most-recently-touched area by default; others collapsed.
  const initialExpanded = useMemo(() => {
    const set = new Set<string>()
    if (groups.length === 0) return set
    const latest = [...groups].sort((a, b) => {
      const aLast = a.entries[a.entries.length - 1]?.at ?? a.firstSeenAt
      const bLast = b.entries[b.entries.length - 1]?.at ?? b.firstSeenAt
      return bLast - aLast
    })[0]
    set.add(latest.areaId)
    return set
  }, [groups])
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded)

  const toggle = (areaId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(areaId)) next.delete(areaId)
      else next.add(areaId)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="journal journal--empty">
        <p>No journal entries yet. Start exploring.</p>
        <style>{`
          .journal--empty {
            padding: var(--sp-4);
            text-align: center;
            color: var(--fg-3);
            font-family: var(--font-body);
            font-size: var(--text-sm);
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="journal">
      {groups.map((g) => {
        const isOpen = expanded.has(g.areaId)
        const lvl = typeof g.areaLevel === 'number' ? ` · Lv ${g.areaLevel}` : ''
        return (
          <section key={g.areaId} className="journal__area">
            <button
              type="button"
              className={'journal__area-head' + (isOpen ? ' journal__area-head--open' : '')}
              aria-expanded={isOpen}
              onClick={() => toggle(g.areaId)}
            >
              <span className="journal__chevron" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className="journal__area-name">{g.areaName}</span>
              <span className="journal__area-meta">
                {g.entries.length} event{g.entries.length === 1 ? '' : 's'}{lvl}
              </span>
            </button>
            {isOpen && (
              <ol className="journal__entries">
                {g.entries.map((e, i) => (
                  <li
                    key={i}
                    className={`journal__entry journal__entry--${e.kind}`}
                  >
                    <span className="journal__glyph" aria-hidden="true">
                      {GLYPH[e.kind]}
                    </span>
                    <div className="journal__entry-body">
                      <div className="journal__entry-text">
                        {renderEntryText(
                          e,
                          stripTrailingPeriod(e.text),
                          world,
                          onSubjectClick,
                          onLevelClick,
                        )}
                      </div>
                      <div className="journal__entry-time">{relativeTime(e.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}

      <style>{`
        .journal {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
        }
        .journal__area {
          display: flex;
          flex-direction: column;
          background: var(--bg-0);
          border: 1px solid var(--line-1);
        }
        .journal__area-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--fg-2);
          text-align: left;
          transition: color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .journal__area-head:hover {
          color: var(--accent-hot);
          background: var(--bg-1);
        }
        .journal__area-head--open { color: var(--fg-1); border-bottom: 1px solid var(--line-1); }
        .journal__chevron {
          flex-shrink: 0;
          width: 12px;
          color: var(--fg-3);
          font-family: var(--font-mono);
        }
        .journal__area-name { flex: 1; min-width: 0; }
        .journal__area-meta {
          flex-shrink: 0;
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          text-transform: none;
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
        }
        .journal__entries {
          list-style: none;
          padding: var(--sp-1) 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        /* Journal-entry style: glyph column on the left, body stacks
           the entry text and a subordinate time line below it. The
           time reads as a diary stamp, not a tabular field — quieter
           and structurally below rather than aligned-right. */
        .journal__entry {
          display: grid;
          grid-template-columns: 24px 1fr;
          gap: 0 var(--sp-2);
          padding: var(--sp-1) var(--sp-3);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--fg-2);
          line-height: 1.5;
        }
        .journal__glyph {
          grid-column: 1;
          grid-row: 1 / span 2;
          color: var(--fg-3);
          font-family: var(--font-mono);
          text-align: center;
          padding-top: 2px;
        }
        .journal__entry-body {
          grid-column: 2;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .journal__entry-text { min-width: 0; }
        .journal__entry-time {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.04em;
          opacity: 0.75;
        }
        /* Inline link buttons inside the entry text. Journal-specific
           style per product call: no underline, no hover treatment. The
           color alone carries the token identity and the cursor:pointer
           is the only affordance the link needs. Keeps the diary prose
           reading like prose rather than a page of hyperlinks. */
        .journal__link {
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          cursor: pointer;
          color: inherit;
          text-decoration: none;
        }
        .journal__link:hover,
        .journal__link:focus-visible {
          outline: none;
          text-decoration: none;
          text-shadow: none;
        }
        .journal__link--mob { color: var(--bad); }
        .journal__link--item { color: var(--good); }
        .journal__link--room { color: var(--fg-1); }
        .journal__link--level { color: var(--accent-hot); font-variant-numeric: tabular-nums; }
        /* Spell name span — non-interactive (no popover yet) so just a
           color tint that matches the LogPanel's --spell token, with a
           subtle glow to read as magical. */
        .journal__spell { color: var(--mp); text-shadow: 0 0 3px currentColor; font-weight: 500; }
        /* Per-kind color accents — pull the glyph toward the semantic
           token so scanning the left edge gives a quick map of what
           happened where. */
        .journal__entry--area-discovered .journal__glyph { color: var(--good); }
        .journal__entry--mob-first-defeat .journal__glyph { color: var(--accent-hot); }
        .journal__entry--boss-defeat .journal__glyph { color: var(--warn); text-shadow: var(--glow-sm); }
        .journal__entry--item-first-loot .journal__glyph { color: var(--magic); }
        .journal__entry--level-up .journal__glyph { color: var(--good); }
        .journal__entry--spell-learned .journal__glyph { color: var(--mp); text-shadow: var(--glow-sm); }
        .journal__entry--death .journal__glyph { color: var(--bad); }
      `}</style>
    </div>
  )
}
