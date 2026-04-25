import { useEffect, useId, useRef, useState } from 'react'
import type { Character, LevelUpRecord } from '../character'
import { resolveTitle, titleIndexForLevel, xpToNextLevel } from '../character'
import { rarityColor, rarityLabel, skullsFor } from '../items'
import { formatRelative } from '../util/time'
import { getWorldContent, getWorldManifest } from '../worlds'
import type { Subject } from './LogPopoverContent'

type SubjectClickHandler = (
  subject: Subject,
  e: React.MouseEvent<HTMLButtonElement>,
) => void

interface Props {
  open: boolean
  character: Character
  onClose: () => void
  /** When provided, best-item and baddest-enemy render as buttons that pop
   *  up the same item/mob popovers the log uses. Caller is responsible for
   *  rendering the popover itself. */
  onSubjectClick?: SubjectClickHandler
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ${sec % 60}s`
  const hrs = Math.floor(min / 60)
  return `${hrs}h ${min % 60}m`
}

interface Entry {
  kind: 'creation' | 'level'
  at: number
  record?: LevelUpRecord
  previousAt: number
  previousGold: number
}

function buildEntries(character: Character): Entry[] {
  const entries: Entry[] = []
  entries.push({
    kind: 'creation',
    at: character.createdAt,
    previousAt: character.createdAt,
    previousGold: 0,
  })
  let prevAt = character.createdAt
  let prevGold = 0
  for (const r of character.levelUps) {
    entries.push({
      kind: 'level',
      at: r.at,
      record: r,
      previousAt: prevAt,
      previousGold: prevGold,
    })
    prevAt = r.at
    prevGold = r.goldAtLevelUp ?? prevGold
  }
  return entries
}

export default function LevelingDialog({
  open,
  character,
  onClose,
  onSubjectClick,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [expanded, setExpanded] = useState<number | null>(null)
  const manifest = getWorldManifest(character.worldId)
  const creationVerb = manifest?.creationVerb ?? 'Born'
  const content = getWorldContent(character.worldId)

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

  const entries = buildEntries(character)

  return (
    <div
      className="lvld"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="lvld__card" role="document">
        <span className="lvld__corner lvld__corner--tl" aria-hidden="true">┏</span>
        <span className="lvld__corner lvld__corner--tr" aria-hidden="true">┓</span>
        <span className="lvld__corner lvld__corner--bl" aria-hidden="true">┗</span>
        <span className="lvld__corner lvld__corner--br" aria-hidden="true">┛</span>

        <div className="lvld__header">
          <span id={titleId} className="lvld__title">
            {character.name} — Leveling
          </span>
        </div>
        <div className="lvld__body">
          <ul className="lvld__list">
            {entries.map((entry, i) => {
              const isExpanded = expanded === i
              if (entry.kind === 'creation') {
                const birthTitle = resolveTitle(character, 0).text
                return (
                  <li key={i} className="lvld__item lvld__item--creation">
                    <button
                      type="button"
                      className="lvld__row"
                      onClick={() => setExpanded(isExpanded ? null : i)}
                    >
                      <span className="lvld__tag">{creationVerb}</span>
                      {birthTitle && (
                        <span className="lvld__title" title="Starting title for this world">
                          {birthTitle}
                        </span>
                      )}
                      <span className="lvld__rel">{formatRelative(entry.at)}</span>
                    </button>
                    {isExpanded && (
                      <div className="lvld__detail">
                        <div>
                          <span className="lvld__k">Created</span>
                          <span className="lvld__v">{new Date(entry.at).toLocaleString()}</span>
                        </div>
                        {birthTitle && (
                          <div>
                            <span className="lvld__k">Title</span>
                            <span className="lvld__v">{birthTitle}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              }
              const r = entry.record!
              const xpGained = r.xpGained ?? xpToNextLevel(r.from)
              const playtime = entry.at - entry.previousAt
              const goldDelta = (r.goldAtLevelUp ?? 0) - entry.previousGold
              const best = r.bestItem
              const enemy = r.baddestEnemy
              const titleIdx = titleIndexForLevel(r.to)
              const earnedTitle =
                titleIdx != null ? resolveTitle(character, titleIdx).text : null
              return (
                <li key={i} className="lvld__item">
                  <button
                    type="button"
                    className="lvld__row"
                    onClick={() => setExpanded(isExpanded ? null : i)}
                  >
                    <span className="lvld__tag lvld__tag--level">
                      Lv {r.from} → {r.to}
                    </span>
                    {earnedTitle && (
                      <span className="lvld__title" title="New title earned at this level">
                        {earnedTitle}
                      </span>
                    )}
                    <span className="lvld__rel">{formatRelative(entry.at)}</span>
                  </button>
                  {isExpanded && (
                    <div className="lvld__detail">
                      {earnedTitle && (
                        <div>
                          <span className="lvld__k">Title</span>
                          <span className="lvld__v">{earnedTitle}</span>
                        </div>
                      )}
                      <div>
                        <span className="lvld__k">Playtime</span>
                        <span className="lvld__v">{formatDuration(playtime)}</span>
                      </div>
                      <div>
                        <span className="lvld__k">XP gained</span>
                        <span className="lvld__v lvld__v--xp">{xpGained}</span>
                      </div>
                      <div>
                        <span className="lvld__k">Gold collected</span>
                        <span className="lvld__v lvld__v--gold">
                          {goldDelta > 0 ? `+${goldDelta}` : goldDelta}
                        </span>
                      </div>
                      {(() => {
                        const g = r.gains
                        if (!g) return null
                        const parts: string[] = []
                        if (g.hp > 0) parts.push(`+${g.hp} HP`)
                        if (g.mp > 0) parts.push(`+${g.mp} MP`)
                        if (g.statText) parts.push(g.statText)
                        if (parts.length === 0) return null
                        return (
                          <div>
                            <span className="lvld__k">Gains</span>
                            <span className="lvld__v lvld__v--gains">
                              {parts.join(' · ')}
                            </span>
                          </div>
                        )
                      })()}
                      <div>
                        <span className="lvld__k">Best item</span>
                        {best ? (
                          (() => {
                            const color = rarityColor(best.rarity)
                            const def = content?.items.find((it) => it.name === best.name)
                            const inner = (
                              <>
                                {best.name}{' '}
                                <span className="lvld__rarity">
                                  ({rarityLabel(best.rarity)})
                                </span>
                              </>
                            )
                            if (onSubjectClick && def) {
                              return (
                                <button
                                  type="button"
                                  className="lvld__v lvld__v--link"
                                  style={{ color }}
                                  onClick={(e) =>
                                    onSubjectClick(
                                      { kind: 'item', id: def.id, name: def.name },
                                      e,
                                    )
                                  }
                                >
                                  {inner}
                                </button>
                              )
                            }
                            return (
                              <span className="lvld__v" style={{ color }}>
                                {inner}
                              </span>
                            )
                          })()
                        ) : (
                          <span className="lvld__v lvld__v--muted">—</span>
                        )}
                      </div>
                      <div>
                        <span className="lvld__k">Baddest enemy</span>
                        {enemy ? (
                          (() => {
                            const color = rarityColor(enemy.rarity)
                            const inner = (
                              <>
                                {enemy.name}
                                {skullsFor(enemy.rarity)}{' '}
                                <span className="lvld__rarity">
                                  ({enemy.xpReward} XP)
                                </span>
                              </>
                            )
                            if (onSubjectClick) {
                              return (
                                <button
                                  type="button"
                                  className="lvld__v lvld__v--link"
                                  style={{ color }}
                                  onClick={(e) =>
                                    onSubjectClick(
                                      { kind: 'mob', name: enemy.name },
                                      e,
                                    )
                                  }
                                >
                                  {inner}
                                </button>
                              )
                            }
                            return (
                              <span className="lvld__v" style={{ color }}>
                                {inner}
                              </span>
                            )
                          })()
                        ) : (
                          <span className="lvld__v lvld__v--muted">none slain</span>
                        )}
                      </div>
                      <div>
                        <span className="lvld__k">Exact time</span>
                        <span className="lvld__v">{new Date(entry.at).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="lvld__actions">
          <button
            type="button"
            ref={closeRef}
            className="lvld__btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        .lvld {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-4);
        }
        .lvld__card {
          position: relative;
          width: 100%;
          max-width: 600px;
          max-height: 80vh;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .lvld__corner {
          position: absolute;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          color: var(--line-3);
          pointer-events: none;
          user-select: none;
        }
        .lvld__corner--tl { top: -6px; left: -4px; }
        .lvld__corner--tr { top: -6px; right: -4px; }
        .lvld__corner--bl { bottom: -6px; left: -4px; }
        .lvld__corner--br { bottom: -6px; right: -4px; }
        .lvld__header { border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-2); }
        .lvld__title { font-family: var(--font-display); font-size: var(--text-xl); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-hot); text-shadow: var(--glow-md); }
        .lvld__body { font-family: var(--font-body); font-size: var(--text-sm); overflow-y: auto; min-height: 0; }
        .lvld__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
        .lvld__item { border: 1px solid var(--line-1); }
        .lvld__row { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: var(--sp-2) var(--sp-3); background: transparent; border: none; color: var(--fg-1); font: inherit; cursor: pointer; }
        .lvld__row:hover, .lvld__row:focus-visible { background: var(--bg-2); outline: none; }
        .lvld__tag { font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .lvld__tag--level { color: var(--accent-hot); }
        .lvld__title { flex: 1; min-width: 0; margin: 0 var(--sp-3); font-family: var(--font-display); font-size: var(--text-sm); font-style: italic; color: var(--warn); letter-spacing: 0.04em; text-shadow: var(--glow-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
        .lvld__rel { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); }
        .lvld__detail { padding: var(--sp-2) var(--sp-3) var(--sp-3); border-top: 1px solid var(--line-1); background: var(--bg-inset); display: grid; grid-template-columns: 140px 1fr; gap: 2px var(--sp-3); font-family: var(--font-mono); font-size: var(--text-xs); }
        .lvld__detail > div { display: contents; }
        .lvld__k { color: var(--fg-3); letter-spacing: 0.08em; text-transform: uppercase; }
        .lvld__v { color: var(--fg-1); font-variant-numeric: tabular-nums; }
        .lvld__v--xp { color: #ffffff; }
        .lvld__v--gold { color: #ffb040; text-shadow: 0 0 4px rgba(255, 176, 64, 0.35); }
        .lvld__v--gains { color: var(--good); text-shadow: 0 0 4px rgba(124, 214, 124, 0.35); }
        .lvld__v--muted { color: var(--fg-3); font-style: italic; }
        .lvld__v--link {
          /* justify-self keeps a short button flush-left with the other
             value spans in the grid; text-align overrides the user-agent
             center-alignment that buttons pick up by default. Plain text
             styling — rarity color alone carries the link affordance. */
          justify-self: start;
          text-align: left;
          display: inline;
          background: transparent;
          border: none;
          padding: 0;
          font: inherit;
          color: inherit;
          cursor: pointer;
          text-decoration: none;
        }
        .lvld__v--link:focus-visible {
          outline: none;
        }
        .lvld__rarity { color: var(--fg-3); font-variant-caps: all-small-caps; letter-spacing: 0.06em; }
        .lvld__item--creation .lvld__tag { color: var(--magic); }
        .lvld__actions { display: flex; justify-content: flex-end; padding-top: var(--sp-2); border-top: 1px solid var(--line-1); }
        .lvld__btn { padding: 6px var(--sp-4); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: var(--glow-sm); transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt); }
        .lvld__btn:hover, .lvld__btn:focus-visible { outline: none; background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
      `}</style>
    </div>
  )
}
