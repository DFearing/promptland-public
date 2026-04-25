import type { ActiveCondition } from '../conditions'
import { ElementOverlay, type ElementFxEvent } from '../effects'
import type { Mob } from '../mobs'
import { rarityColor, rarityLabel, defeatLingerMs } from '../items'
import type { WorldContent } from '../worlds'

interface Props {
  mob: Mob
  /** Rendering as the lingering post-defeat card: mob is dead, HP bar drains
   *  fully, and the panel gets a shake/fade treatment. */
  defeated?: boolean
  world?: WorldContent
  elementEvents?: ElementFxEvent[]
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export default function CombatTargetPanel({ mob, defeated, world, elementEvents }: Props) {
  const ratio = defeated ? 0 : mob.maxHp > 0 ? clamp01(mob.hp / mob.maxHp) : 0
  const conditionDefs = new Map((world?.conditions ?? []).map((c) => [c.id, c]))
  const activeConds: Array<
    ActiveCondition & { name: string; description: string; polarity: 'buff' | 'debuff' }
  > = defeated
    ? []
    : (mob.conditions ?? []).flatMap((a) => {
        const def = conditionDefs.get(a.id)
        if (!def) return []
        return [{ ...a, name: def.name, description: def.description, polarity: def.polarity }]
      })

  const defeatDurMs = defeated ? defeatLingerMs(mob.rarity) : 0
  return (
    <div
      className={'target' + (defeated ? ' target--defeated' : '')}
      role="complementary"
      aria-label={defeated ? 'Defeated target' : 'Combat target'}
      style={defeated ? { ['--fx-defeat-dur' as string]: `${defeatDurMs}ms` } : undefined}
    >
      <div className="target__head">
        <span className="target__label">
          {defeated ? 'Defeated' : `Target · ${rarityLabel(mob.rarity)}`}
        </span>
        <span
          className="target__name"
          style={{ color: rarityColor(mob.rarity) }}
        >
          {mob.name}
        </span>
      </div>
      <div className="target__hp-row">
        <span className="target__hp-tag">HP</span>
        <div
          className="target__hp"
          data-tip={defeated ? 'Defeated' : `${mob.hp} / ${mob.maxHp}`}
        >
          <div className="target__hp-fill" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
      {activeConds.length > 0 && (
        <ul className="target__conds">
          {activeConds.map((c) => (
            <li
              key={c.id}
              className={
                'target__cond ' +
                (c.polarity === 'buff' ? 'target__cond--buff' : 'target__cond--debuff')
              }
              data-tip={c.description}
            >
              <span className="target__cond-name">{c.name}</span>
              <span className="target__cond-ticks">{c.remainingTicks}t</span>
            </li>
          ))}
        </ul>
      )}
      {!defeated && mob.resist && Object.keys(mob.resist).length > 0 && (
        <ul className="target__resists">
          {Object.entries(mob.resist).map(([family, value]) => {
            // Positive entry → resistance (green-ish stripe), negative →
            // weakness (warn). Magnitude formatted as a percent so the
            // reader doesn't have to mentally translate `0.5` into "half."
            // Cap rendered range at 100 % even if a content author goes
            // higher; the engine clamps the multiplier the same way.
            if (!value) return null
            const isWeak = value < 0
            const pct = Math.min(100, Math.round(Math.abs(value) * 100))
            const label =
              value >= 1 ? 'IMMUNE' : `${pct}% ${isWeak ? 'WEAK' : 'RESIST'}`
            return (
              <li
                key={family}
                className={
                  'target__resist' +
                  (isWeak ? ' target__resist--weak' : ' target__resist--resist')
                }
                data-tip={`${family} damage: ${label.toLowerCase()}`}
              >
                <span className="target__resist-elem">{family}</span>
                <span className="target__resist-value">{label}</span>
              </li>
            )
          })}
        </ul>
      )}
      {mob.description && <p className="target__desc">{mob.description}</p>}
      {elementEvents && !defeated && <ElementOverlay events={elementEvents} target="mob" />}

      <style>{`
        .target {
          position: relative;
          background: var(--bg-1);
          border: 1px solid var(--bad);
          box-shadow: 0 0 12px rgba(0, 0, 0, 0.4), 0 0 8px var(--bad);
          padding: var(--sp-2) var(--sp-3);
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          flex-shrink: 0;
        }
        .target__head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--sp-3);
          border-bottom: 1px solid var(--line-1);
          padding-bottom: var(--sp-1);
        }
        .target__label {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--fg-3);
        }
        .target__name {
          font-family: var(--font-display);
          font-size: var(--text-lg);
          letter-spacing: 0.04em;
          color: var(--bad);
          text-shadow: var(--glow-sm);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .target__hp-row {
          display: grid;
          grid-template-columns: 3.5ch 1fr;
          gap: var(--sp-2);
          align-items: center;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .target__hp-tag {
          font-family: var(--font-display);
          color: var(--bad);
          font-size: var(--text-sm);
          letter-spacing: 0.08em;
        }
        .target__hp {
          height: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
          box-shadow: var(--shadow-inset);
          overflow: hidden;
        }
        .target__hp-fill {
          height: 100%;
          background: var(--bad);
          box-shadow: var(--glow-sm);
          transition: width var(--dur-base) var(--ease-crt);
        }
        .target__conds {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .target__cond {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1px 6px;
          border: 1px solid var(--line-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
        }
        .target__cond--buff { color: var(--good); border-color: var(--good); text-shadow: var(--glow-sm); }
        .target__cond--debuff { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .target__cond-name { text-transform: uppercase; letter-spacing: 0.06em; }
        .target__cond-ticks { color: var(--fg-3); font-variant-numeric: tabular-nums; text-shadow: none; }
        /* Resists row mirrors .target__conds layout but with its own
           palette: dimmed accent for resistances (mob shrugs damage off
           — a quiet "noted" cue, not an active buff), warn for
           weaknesses so the reader sees "press here." */
        .target__resists {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .target__resist {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 1px 6px;
          border: 1px solid var(--line-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
        }
        .target__resist--resist { color: var(--fg-3); border-color: var(--line-3); }
        .target__resist--weak { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .target__resist-elem { text-transform: uppercase; letter-spacing: 0.06em; }
        .target__resist-value { color: inherit; font-variant-numeric: tabular-nums; }
        .target__desc {
          margin: 0;
          font-family: var(--font-body);
          font-size: var(--text-xs);
          line-height: 1.4;
          color: var(--fg-2);
          font-style: italic;
          /* Three-line clamp so long flavor text doesn't push the panel
             height around between encounters. Full description is on the
             target popover if the reader wants the rest. */
          display: -webkit-box;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* Defeated linger — quick shake, then slow fade. Duration comes from
           --fx-defeat-dur (set per rarity by the owner), so a legendary sits
           on screen several times longer than a common. Animation end is the
           signal the owner uses to release the lingering card; the owner
           also has a matching max-duration timer in case animationend misses. */
        .target--defeated {
          animation: target-defeat var(--fx-defeat-dur, 1800ms) ease-out forwards;
          pointer-events: none;
        }
        .target--defeated .target__name { text-decoration: line-through; opacity: 0.7; }
        .target--defeated .target__label { color: var(--bad); }
        /* Keyframes use percentages so the shake stays quick and the fade
           stretches to fill whatever total duration is chosen. The shake
           lives entirely in the first ~18% of the animation; the rest is
           grayscale drift + opacity fall-off. */
        @keyframes target-defeat {
          0%   { transform: translateX(0); filter: none; opacity: 1; }
          3%   { transform: translateX(-4px); }
          7%   { transform: translateX(4px); }
          11%  { transform: translateX(-3px); }
          15%  { transform: translateX(2px); }
          18%  { transform: translateX(0); filter: grayscale(0.2); opacity: 1; }
          100% { transform: translateX(0); filter: grayscale(0.9); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .target--defeated { animation-duration: 900ms; }
        }
      `}</style>
    </div>
  )
}
