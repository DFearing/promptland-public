import { useState } from 'react'
import type { Character } from '../character'
import { describeCharacter, xpToNextLevel } from '../character'
import { FieldIndicator, type FieldFxEvent } from '../effects'
import { getWorldContent, getWorldManifest } from '../worlds'
import HistoryDialog from './HistoryDialog'

interface Props {
  character: Character
  fieldEvents: FieldFxEvent[]
  fieldIndicatorsEnabled: boolean
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export default function SheetPanel({ character, fieldEvents, fieldIndicatorsEnabled }: Props) {
  const d = describeCharacter(character)
  const world = getWorldManifest(character.worldId)
  const subtitle = [d.speciesName, d.className].filter(Boolean).join(' · ')
  const xpTarget = xpToNextLevel(character.level)
  const hpRatio = character.maxHp > 0 ? clamp01(character.hp / character.maxHp) : 0
  const magicRatio = character.maxMagic > 0 ? clamp01(character.magic / character.maxMagic) : 0
  const xpRatio = xpTarget > 0 ? clamp01(character.xp / xpTarget) : 0

  const magicAbbr = world?.magicAbbreviation ?? 'MAG'
  const magicLabel = world?.magicName ?? 'Magic'
  const currencyLabel = world?.currencyName ?? 'Gold'

  const content = getWorldContent(character.worldId)
  const conditionDefs = new Map((content?.conditions ?? []).map((c) => [c.id, c]))
  const activeConds = (character.conditions ?? []).flatMap((a) => {
    const def = conditionDefs.get(a.id)
    if (!def) return []
    return [{ ...a, def }]
  })

  const [showLevels, setShowLevels] = useState(false)
  const levelItems = character.levelUps.map((e) => ({
    at: e.at,
    text: `Level ${e.from} → ${e.to}.`,
  }))

  return (
    <div className="sheet">
      <header className="sheet__header">
        <div className="sheet__title">
          <span className="sheet__name">{character.name}</span>
          <span className="sheet__subtitle">{subtitle || 'unknown'}</span>
        </div>
        <button
          type="button"
          className="sheet__level"
          title="See leveling history"
          onClick={() => setShowLevels(true)}
        >
          Lv {character.level}
        </button>
      </header>
      <HistoryDialog
        open={showLevels}
        title={`${character.name} — Leveling`}
        items={levelItems}
        emptyText="No levels earned yet."
        onClose={() => setShowLevels(false)}
      />

      <section className="sheet__bars">
        <div className="sheet__bar-row">
          <span className="sheet__bar-label">HP</span>
          <div className="sheet__bar">
            <div className="sheet__bar-fill sheet__bar-fill--hp" style={{ width: `${hpRatio * 100}%` }} />
          </div>
          <span className="sheet__bar-val">{character.hp} / {character.maxHp}</span>
          <FieldIndicator events={fieldEvents} field="hp" enabled={fieldIndicatorsEnabled} />
        </div>
        <div className="sheet__bar-row" title={magicLabel}>
          <span className="sheet__bar-label sheet__bar-label--magic">{magicAbbr}</span>
          <div className="sheet__bar">
            <div className="sheet__bar-fill sheet__bar-fill--magic" style={{ width: `${magicRatio * 100}%` }} />
          </div>
          <span className="sheet__bar-val">{character.magic} / {character.maxMagic}</span>
          <FieldIndicator events={fieldEvents} field="magic" enabled={fieldIndicatorsEnabled} />
        </div>
        <div className="sheet__bar-row">
          <span className="sheet__bar-label">XP</span>
          <div className="sheet__bar">
            <div className="sheet__bar-fill sheet__bar-fill--xp" style={{ width: `${xpRatio * 100}%` }} />
          </div>
          <span className="sheet__bar-val">{character.xp} / {xpTarget}</span>
          <FieldIndicator events={fieldEvents} field="xp" enabled={fieldIndicatorsEnabled} />
        </div>
      </section>

      <section className="sheet__attrs">
        <div><dt>STR</dt><dd>{character.stats.strength}</dd></div>
        <div><dt>DEX</dt><dd>{character.stats.dexterity}</dd></div>
        <div><dt>CON</dt><dd>{character.stats.constitution}</dd></div>
        <div><dt>INT</dt><dd>{character.stats.intelligence}</dd></div>
        <div><dt>WIS</dt><dd>{character.stats.wisdom}</dd></div>
        <div><dt>CHA</dt><dd>{character.stats.charisma}</dd></div>
      </section>

      <div className="sheet__gold">
        <span className="sheet__gold-label">{currencyLabel}</span>
        <span className="sheet__gold-val">{character.gold}</span>
        <FieldIndicator events={fieldEvents} field="gold" enabled={fieldIndicatorsEnabled} />
      </div>

      {activeConds.length > 0 && (
        <section className="sheet__conds">
          <h2 className="sheet__conds-title">Conditions</h2>
          <ul className="sheet__conds-list">
            {activeConds.map((c) => {
              const cls =
                'sheet__cond ' +
                (c.def.polarity === 'buff' ? 'sheet__cond--buff' : 'sheet__cond--debuff')
              return (
                <li key={c.id} className={cls} title={c.def.description}>
                  <span className="sheet__cond-name">{c.def.name}</span>
                  <span className="sheet__cond-ticks">{c.remainingTicks}t</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <style>{`
        .sheet { display: flex; flex-direction: column; gap: var(--sp-3); flex: 1; min-height: 0; overflow-y: auto; }

        .sheet__header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-2); border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-2); }
        .sheet__title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .sheet__name { font-family: var(--font-display); font-size: var(--text-xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sheet__subtitle { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; }
        .sheet__level { flex-shrink: 0; padding: 2px var(--sp-2); background: var(--bg-2); border: 1px solid var(--line-3); color: var(--accent-hot); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: var(--glow-sm); font-variant-numeric: tabular-nums; cursor: pointer; transition: background var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt); }
        .sheet__level:hover, .sheet__level:focus-visible { outline: none; background: var(--bg-3); text-shadow: var(--glow-md); }

        .sheet__bars { display: flex; flex-direction: column; gap: var(--sp-1); }
        .sheet__bar-row { position: relative; display: grid; grid-template-columns: 36px 1fr auto; gap: var(--sp-2); align-items: center; font-family: var(--font-mono); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
        .sheet__bar-label { font-family: var(--font-display); color: var(--fg-2); letter-spacing: 0.08em; font-size: var(--text-sm); }
        .sheet__bar-label--magic { color: var(--magic); text-shadow: var(--glow-sm); }
        .sheet__bar-val { color: var(--fg-2); min-width: 56px; text-align: right; }
        .sheet__bar { height: 10px; background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); overflow: hidden; }
        .sheet__bar-fill { height: 100%; transition: width var(--dur-base) var(--ease-crt); box-shadow: var(--glow-sm); }
        .sheet__bar-fill--hp { background: var(--good); }
        .sheet__bar-fill--magic { background: var(--magic); }
        .sheet__bar-fill--xp { background: var(--warn); }

        .sheet__attrs { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-1); padding: var(--sp-2); background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); }
        .sheet__attrs div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .sheet__attrs dt { font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); }
        .sheet__attrs dd { margin: 0; font-family: var(--font-mono); font-size: var(--text-md); font-weight: 500; color: var(--fg-1); font-variant-numeric: tabular-nums; }

        .sheet__gold { position: relative; display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px; }
        .sheet__gold-label { font-family: var(--font-body); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; font-size: var(--text-xs); }
        .sheet__gold-val { font-family: var(--font-mono); color: var(--warn); font-variant-numeric: tabular-nums; font-size: var(--text-sm); text-shadow: var(--glow-sm); }

        .sheet__conds { display: flex; flex-direction: column; gap: var(--sp-1); }
        .sheet__conds-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
        .sheet__conds-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-1); }
        .sheet__cond { display: inline-flex; align-items: center; gap: var(--sp-1); padding: 2px var(--sp-2); border: 1px solid var(--line-2); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.04em; }
        .sheet__cond--buff { color: var(--good); border-color: var(--good); text-shadow: var(--glow-sm); }
        .sheet__cond--debuff { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .sheet__cond-name { text-transform: uppercase; letter-spacing: 0.08em; }
        .sheet__cond-ticks { color: var(--fg-3); font-variant-numeric: tabular-nums; text-shadow: none; }
      `}</style>
    </div>
  )
}
