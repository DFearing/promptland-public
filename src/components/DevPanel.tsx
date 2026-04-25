import { useEffect } from 'react'
import type { ConditionDef } from '../conditions'

export type DevCommand =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'tick-once' }
  | { kind: 'level-up' }
  | { kind: 'spawn-fight' }
  | { kind: 'die' }
  | { kind: 'heal-full' }
  | { kind: 'drain-drives' }
  | { kind: 'max-drives' }
  | { kind: 'add-gold' }
  | { kind: 'apply-condition'; conditionId: string }
  | { kind: 'clear-conditions' }

interface Props {
  paused: boolean
  onCommand: (cmd: DevCommand) => void
  conditions?: ConditionDef[]
}

interface Button {
  cmd: DevCommand
  label: string
  danger?: boolean
  disabled?: boolean
}

export default function DevPanel({ paused, onCommand, conditions }: Props) {
  // Auto-pause when the panel mounts (tab opened). Idempotent pause handles
  // React 18 strict-mode's double effect fire; resuming is explicit.
  useEffect(() => {
    onCommand({ kind: 'pause' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buttons: Button[] = [
    { cmd: paused ? { kind: 'resume' } : { kind: 'pause' }, label: paused ? 'Resume' : 'Pause' },
    { cmd: { kind: 'tick-once' }, label: 'Tick once', disabled: !paused },
    { cmd: { kind: 'level-up' }, label: 'Level up' },
    { cmd: { kind: 'spawn-fight' }, label: 'Spawn fight' },
    { cmd: { kind: 'die' }, label: 'Die', danger: true },
    { cmd: { kind: 'heal-full' }, label: 'Heal full' },
    { cmd: { kind: 'max-drives' }, label: 'Max drives' },
    { cmd: { kind: 'drain-drives' }, label: 'Drain drives' },
    { cmd: { kind: 'add-gold' }, label: '+10 gold' },
  ]

  return (
    <div className="dev">
      <section className="dev__section">
        <div className="dev__header">
          <h2 className="dev__title">Developer</h2>
          <span className={'dev__status' + (paused ? ' dev__status--paused' : '')}>
            {paused ? 'Paused' : 'Running'}
          </span>
        </div>
        <p className="dev__note">Shortcuts for exercising the tick, combat, drives, and death flows.</p>
      </section>

      <section className="dev__section">
        <div className="dev__grid">
          {buttons.map((b, i) => (
            <button
              key={i}
              type="button"
              className={
                'dev__btn' +
                (b.danger ? ' dev__btn--danger' : '') +
                (b.disabled ? ' dev__btn--disabled' : '')
              }
              disabled={b.disabled}
              onClick={() => onCommand(b.cmd)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {conditions && conditions.length > 0 && (
        <section className="dev__section">
          <h3 className="dev__subtitle">Apply condition</h3>
          <div className="dev__grid">
            {conditions.map((c) => (
              <button
                key={c.id}
                type="button"
                className={
                  'dev__btn dev__btn--cond ' +
                  (c.polarity === 'buff' ? 'dev__btn--buff' : 'dev__btn--debuff')
                }
                title={c.description}
                onClick={() => onCommand({ kind: 'apply-condition', conditionId: c.id })}
              >
                {c.name}
              </button>
            ))}
            <button
              type="button"
              className="dev__btn"
              onClick={() => onCommand({ kind: 'clear-conditions' })}
            >
              Clear all
            </button>
          </div>
        </section>
      )}

      <style>{`
        .dev { display: flex; flex-direction: column; gap: var(--sp-4); flex: 1; min-height: 0; overflow-y: auto; }
        .dev__section { display: flex; flex-direction: column; gap: var(--sp-2); }
        .dev__header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
        .dev__title { margin: 0; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-2); }
        .dev__status {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-2);
          padding: 2px var(--sp-2);
          border: 1px dashed var(--line-2);
        }
        .dev__status--paused {
          color: var(--warn);
          border-style: solid;
          border-color: var(--warn);
          text-shadow: var(--glow-sm);
        }
        .dev__note { margin: 0; font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); line-height: 1.5; }

        .dev__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--sp-1); }
        .dev__btn {
          padding: 6px var(--sp-2);
          background: var(--bg-inset);
          border: 1px solid var(--line-2);
          color: var(--fg-1);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: border-color var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt);
        }
        .dev__btn:hover:not(:disabled), .dev__btn:focus-visible {
          outline: none;
          border-color: var(--line-3);
          color: var(--accent-hot);
          text-shadow: var(--glow-sm);
        }
        .dev__btn--danger { color: var(--bad); border-color: var(--bad); }
        .dev__btn--danger:hover:not(:disabled) { color: var(--bad); border-color: var(--bad); text-shadow: var(--glow-sm); }
        .dev__btn--buff { color: var(--good); border-color: var(--good); }
        .dev__btn--buff:hover:not(:disabled) { color: var(--good); border-color: var(--good); text-shadow: var(--glow-sm); }
        .dev__btn--debuff { color: var(--warn); border-color: var(--warn); }
        .dev__btn--debuff:hover:not(:disabled) { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .dev__btn:disabled, .dev__btn--disabled { opacity: 0.35; cursor: not-allowed; }
        .dev__subtitle { margin: 0; font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
      `}</style>
    </div>
  )
}
