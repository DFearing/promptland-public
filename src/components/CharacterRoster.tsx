import { useState } from 'react'
import type { Character } from '../character'
import { describeCharacter, formatActorName } from '../character'
import { TICK_MS } from '../game'
import { formatDuration, formatRelative } from '../util/time'
import { getWorldContent } from '../worlds'
import ConfirmDialog from './ConfirmDialog'

export interface RosterEntry {
  character: Character
  updatedAt: number
}

interface Props {
  entries: RosterEntry[]
  onPlay: (character: Character) => void
  onNew: () => void
  onDelete: (id: string) => void
  onResetAll: () => Promise<void> | void
}

const FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// Width of the LED tick counter in digits. "88888" is enough to cover ~27
// hours of continuous play at a 1.4s tick; the "88888" ghost is rendered
// behind the value so unused segments show as dim off-pixels.
const TICK_DIGITS = 5

function formatTicks(n: number): { text: string; ghost: string } {
  const clamped = Math.max(0, Math.floor(n))
  const capped = clamped > 99999 ? 99999 : clamped
  const text = String(capped).padStart(TICK_DIGITS, '0')
  const ghost = '8'.repeat(TICK_DIGITS)
  return { text, ghost }
}

type Pending =
  | { kind: 'delete-one'; character: Character }
  | { kind: 'reset-all' }
  | null

export default function CharacterRoster({ entries, onPlay, onNew, onDelete, onResetAll }: Props) {
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
  const [pending, setPending] = useState<Pending>(null)

  const handleDelete = (c: Character) => {
    setPending({ kind: 'delete-one', character: c })
  }

  const handleResetAll = () => {
    if (entries.length === 0) return
    setPending({ kind: 'reset-all' })
  }

  const confirm = () => {
    if (!pending) return
    if (pending.kind === 'delete-one') {
      onDelete(pending.character.id)
    } else {
      void onResetAll()
    }
    setPending(null)
  }

  const cancel = () => setPending(null)

  return (
    <div className="roster">
      <div className="roster__card">
        <header className="roster__header">
          <h1>Characters</h1>
          <div className="roster__header-actions">
            {entries.length > 0 && (
              <button
                type="button"
                className="roster__btn roster__btn--danger"
                onClick={handleResetAll}
                data-tip="Delete all characters"
              >
                Reset all
              </button>
            )}
            <button type="button" className="roster__btn roster__btn--primary" onClick={onNew}>
              [+] New character
            </button>
          </div>
        </header>

        {sorted.length === 0 ? (
          <p className="roster__empty">No one has lived here yet.</p>
        ) : (
          <ul className="roster__list">
            {sorted.map(({ character, updatedAt }) => {
              const d = describeCharacter(character)
              const subtitle = [d.speciesName, d.className].filter(Boolean).join(' · ')
              const ticks = formatTicks(character.ticks ?? 0)
              // Display name follows the in-game title/name policy — title
              // leads early ("Wayfarer Hiro"), then flips behind the name
              // at the legendary threshold ("Hiro the Warlord"). Same
              // helper that the milestone log lines use, so the roster
              // surfaces the character the same way the game does.
              const displayName = formatActorName(character, 'log-milestone')
              // Resolve the area the character is currently in, so the
              // roster card reads as "where did I leave them?". World
              // content is rehydrated before the roster mounts, so
              // generated areas are present here too. Falls back silently
              // if the area can't be resolved (legacy save, deleted area).
              const area = getWorldContent(character.worldId)?.areas?.find(
                (a) => a.id === character.position.areaId,
              )
              const areaName = area?.name
              // Room name layered after the area so the line reads
              // "Whispering Glade — Mossy Atrium" — the area is the
              // larger anchor, the room is where they paused. Falls
              // back silently if the room key isn't in the area
              // (legacy / removed rooms).
              const roomKeyHere = `${character.position.x},${character.position.y},${character.position.z}`
              const roomName = area?.rooms?.[roomKeyHere]?.name
              return (
                <li key={character.id} className="roster__row">
                  <button
                    type="button"
                    className="roster__play"
                    onClick={() => onPlay(character)}
                  >
                    <span
                      className="roster__ticks"
                      data-tip={`${character.ticks ?? 0} ticks lived (~${formatDuration(
                        (character.ticks ?? 0) * TICK_MS.exploring,
                      )})`}
                    >
                      <span className="roster__ticks-ghost" aria-hidden="true">{ticks.ghost}</span>
                      <span className="roster__ticks-val">{ticks.text}</span>
                    </span>
                    <span className="roster__name">{displayName}</span>
                    <span className="roster__sub">
                      Lv {character.level}
                      {subtitle ? ` · ${subtitle}` : ''}
                      {d.worldName ? ` — ${d.worldName}` : ''}
                    </span>
                    {areaName && (
                      <span className="roster__where">
                        {areaName}
                        {roomName ? ` — ${roomName}` : ''}
                      </span>
                    )}
                    <span className="roster__when">
                      Last played {FORMATTER.format(updatedAt)}
                      <span className="roster__when-ago">
                        {' · '}{formatRelative(updatedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="roster__delete"
                    onClick={() => handleDelete(character)}
                    aria-label={`Delete ${character.name}`}
                    data-tip="Delete"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pending?.kind === 'delete-one'}
        title="Delete character"
        body={
          pending?.kind === 'delete-one' ? (
            <>
              <strong>{pending.character.name}</strong>'s story will be lost.
              This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirm}
        onCancel={cancel}
      />
      <ConfirmDialog
        open={pending?.kind === 'reset-all'}
        title="Delete all characters"
        body={
          <>
            All {entries.length} {entries.length === 1 ? 'character' : 'characters'} will be lost.
            This cannot be undone.
          </>
        }
        confirmLabel="Delete all"
        tone="danger"
        onConfirm={confirm}
        onCancel={cancel}
      />

      <style>{`
        .roster { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--sp-7) var(--sp-4); background: var(--bg-0); }
        .roster__card { width: 100%; max-width: 740px; background: var(--bg-1); border: 1px solid var(--line-2); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-4); }
        .roster__header { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-3); }
        .roster__header h1 { margin: 0; font-family: var(--font-display); font-size: var(--text-3xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .roster__header-actions { display: flex; gap: var(--sp-1); align-items: center; }
        .roster__btn { padding: 6px 14px; background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-2); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: var(--glow-sm); transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .roster__btn:hover { background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
        .roster__btn--primary { background: var(--bg-2); color: var(--accent-hot); border-color: var(--line-3); }
        .roster__btn--danger { border-color: var(--bad); color: var(--bad); text-shadow: none; }
        .roster__btn--danger:hover { background: var(--bg-2); border-color: var(--bad); color: var(--bad); text-shadow: var(--glow-sm); }
        .roster__empty { margin: var(--sp-2) 0; color: var(--fg-3); font-style: italic; }
        .roster__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-1); overflow-y: auto; min-height: 0; }
        .roster__row { display: flex; gap: var(--sp-1); }
        /* The right padding reserves a lane for the center-right tick
           counter so no text row (name, subtitle, "when") runs underneath
           it at any card width. Bumped from 132px → 188px after the
           counter grew 1.5×. */
        .roster__play { flex: 1; text-align: left; padding: var(--sp-3) 188px var(--sp-3) var(--sp-3); background: var(--bg-1); border: 1px solid var(--line-1); color: var(--fg-1); cursor: pointer; display: flex; flex-direction: column; gap: 2px; font: inherit; position: relative; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .roster__play:hover { border-color: var(--line-3); background: var(--bg-2); }
        .roster__name { font-family: var(--font-display); font-size: var(--text-xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .roster__sub { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); }
        /* Where-line — area + room. Same family/scale as the "when"
           line so the two pieces of secondary info stack as a pair,
           but no tabular-nums (the slot below) since this isn't
           numeric. */
        .roster__where { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); }
        .roster__when { margin-top: 4px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); font-variant-numeric: tabular-nums; }
        .roster__when-ago { color: var(--fg-2); }
        .roster__delete { width: 40px; background: transparent; border: 1px solid var(--line-1); color: var(--fg-3); cursor: pointer; font-size: var(--text-xl); line-height: 1; font-family: var(--font-display); }
        .roster__delete:hover { border-color: var(--bad); color: var(--bad); background: var(--bg-2); }

        /* Retro 7-seg-style tick counter, pinned to the center-right of the
           character card — vertically centered so it reads as a status
           readout alongside the name/subtitle stack. The "ghost" layer
           renders the full-lit display in a dim green behind the live
           value, so unused digits read as off segments — the classic
           LED-calculator look. */
        .roster__ticks {
          position: absolute;
          top: 50%;
          right: var(--sp-3);
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px var(--sp-3);
          background: #000;
          border: 1px solid var(--line-1);
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.9);
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          font-size: calc(var(--text-md) * 1.5);
          letter-spacing: 0.14em;
          line-height: 1;
          cursor: default;
        }
        .roster__ticks-ghost {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(120, 255, 120, 0.08);
          letter-spacing: inherit;
          pointer-events: none;
        }
        .roster__ticks-val {
          position: relative;
          color: #9effa0;
          text-shadow: 0 0 4px #4cff6a, 0 0 8px rgba(80, 255, 120, 0.45);
        }
      `}</style>
    </div>
  )
}
