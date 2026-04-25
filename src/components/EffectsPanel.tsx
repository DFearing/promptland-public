import type { Character } from '../character'
import { DRIVES, DRIVE_MAX, topDrive, type Drive } from '../game'

interface Props {
  character: Character
}

const LABELS: Record<Drive, string> = {
  hunger: 'Hunger',
  fatigue: 'Fatigue',
  greed: 'Greed',
  curiosity: 'Curiosity',
}

const SHORT: Record<Drive, string> = {
  hunger: 'HUN',
  fatigue: 'FAT',
  greed: 'GRD',
  curiosity: 'CUR',
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export default function EffectsPanel({ character }: Props) {
  const goal = topDrive(character.drives)

  return (
    <div className="eff">
      <section className="eff__section">
        <h2 className="eff__title">Drives</h2>
        <div className="eff__bars">
          {DRIVES.map((d) => {
            const value = character.drives[d]
            const ratio = clamp01(value / DRIVE_MAX)
            const isGoal = d === goal
            return (
              <div
                key={d}
                className={'eff__bar-row' + (isGoal ? ' eff__bar-row--goal' : '')}
                title={isGoal ? `${LABELS[d]} (current goal)` : LABELS[d]}
              >
                <span className="eff__bar-label">{SHORT[d]}</span>
                <div className="eff__bar">
                  <div
                    className={`eff__bar-fill eff__bar-fill--${d}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
                <span className="eff__bar-val">{Math.round(value)}</span>
                <span className="eff__goal-tag" aria-hidden="true">{isGoal ? 'GOAL' : ''}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="eff__section">
        <h2 className="eff__title">Ailments</h2>
        <p className="eff__empty">No ailments.</p>
      </section>

      <style>{`
        .eff { display: flex; flex-direction: column; gap: var(--sp-4); flex: 1; min-height: 0; overflow-y: auto; }
        .eff__section { display: flex; flex-direction: column; gap: var(--sp-2); }
        .eff__title { margin: 0; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-2); }

        .eff__bars { display: flex; flex-direction: column; gap: var(--sp-1); }
        .eff__bar-row { display: grid; grid-template-columns: 44px 1fr 28px 44px; gap: var(--sp-2); align-items: center; font-family: var(--font-mono); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
        .eff__bar-label { font-family: var(--font-display); color: var(--fg-2); letter-spacing: 0.08em; font-size: var(--text-sm); }
        .eff__bar-val { color: var(--fg-2); text-align: right; }
        .eff__goal-tag { font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.1em; color: var(--accent-hot); text-shadow: var(--glow-sm); text-align: right; }
        .eff__bar-row--goal .eff__bar-label { color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .eff__bar { height: 10px; background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); overflow: hidden; }
        .eff__bar-fill { height: 100%; transition: width var(--dur-base) var(--ease-crt); box-shadow: var(--glow-sm); }
        .eff__bar-fill--hunger { background: var(--warn); }
        .eff__bar-fill--fatigue { background: var(--magic); }
        .eff__bar-fill--greed { background: var(--good); }
        .eff__bar-fill--curiosity { background: var(--speech, var(--accent)); }

        .eff__empty { margin: 0; color: var(--fg-3); font-style: italic; font-family: var(--font-body); font-size: var(--text-sm); }
      `}</style>
    </div>
  )
}
