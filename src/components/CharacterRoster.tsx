import { useState } from 'react'
import type { Character } from '../character'
import { describeCharacter } from '../character'
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
                title="Delete all characters"
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
              return (
                <li key={character.id} className="roster__row">
                  <button
                    type="button"
                    className="roster__play"
                    onClick={() => onPlay(character)}
                  >
                    <span className="roster__name">{character.name}</span>
                    <span className="roster__sub">
                      {subtitle}
                      {d.worldName ? ` — ${d.worldName}` : ''}
                    </span>
                    <span className="roster__when">
                      Last played {FORMATTER.format(updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="roster__delete"
                    onClick={() => handleDelete(character)}
                    aria-label={`Delete ${character.name}`}
                    title="Delete"
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
        .roster__card { width: 100%; max-width: 640px; background: var(--bg-1); border: 1px solid var(--line-2); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-4); }
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
        .roster__play { flex: 1; text-align: left; padding: var(--sp-3) var(--sp-3); background: var(--bg-1); border: 1px solid var(--line-1); color: var(--fg-1); cursor: pointer; display: flex; flex-direction: column; gap: 2px; font: inherit; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .roster__play:hover { border-color: var(--line-3); background: var(--bg-2); }
        .roster__name { font-family: var(--font-display); font-size: var(--text-xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .roster__sub { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); }
        .roster__when { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); margin-top: 2px; font-variant-numeric: tabular-nums; }
        .roster__delete { width: 40px; background: transparent; border: 1px solid var(--line-1); color: var(--fg-3); cursor: pointer; font-size: var(--text-xl); line-height: 1; font-family: var(--font-display); }
        .roster__delete:hover { border-color: var(--bad); color: var(--bad); background: var(--bg-2); }
      `}</style>
    </div>
  )
}
