import { useMemo, useState } from 'react'
import type { Character } from '../character'
import { currentTitle, xpToNextLevel } from '../character'
import { FieldIndicator, type FieldFxEvent } from '../effects'
import {
  DRIVES,
  DRIVE_MAX,
  bonusBreakdowns,
  topDrive,
  type BonusBreakdown,
  type Drive,
} from '../game'
import type { Effects } from '../themes'
import { getWorldContent, getWorldManifest } from '../worlds'
import LevelingDialog from './LevelingDialog'
import LogPopoverContent, { type Subject } from './LogPopoverContent'
import Popover from './Popover'

const DRIVE_LABELS: Record<Drive, string> = {
  hunger: 'Hunger',
  fatigue: 'Fatigue',
  greed: 'Greed',
  curiosity: 'Curiosity',
  weight: 'Weight',
}

// Short explanatory text surfaced as the drive's tooltip. Kept here rather
// than in game/drives.ts so UI copy stays with the UI.
const DRIVE_DESCRIPTIONS: Record<Drive, string> = {
  hunger:
    'Rises steadily as time passes. Satisfied by eating at an inn or any room that sates hunger.',
  fatigue:
    'Rises with activity, falls with rest. Resting at a safe room clears it fastest.',
  greed:
    'A craving for loot. Satisfied by pocketing gold or by looting a defeated enemy.',
  curiosity:
    'Urge to see new places. Satisfied by stepping into a room for the first time.',
  weight:
    'Computed from inventory weight vs. carrying capacity (base 20 + STR modifier). Satisfied by selling at a shop.',
}

// Stat tooltips describe what each stat does today. Stats that aren't wired
// into mechanics yet are flagged so the UI doesn't promise behaviour the game
// doesn't ship.
const STAT_TIPS = {
  strength: 'Strength — raw physical power. Adds to melee attack damage.',
  dexterity:
    'Dexterity — agility and reflexes. Reduces incoming melee damage (evasion bonus).',
  constitution: 'Constitution — toughness. Each point adds 2 to max HP.',
  intelligence:
    'Intelligence — reasoning. Gates scroll use (each scroll has an INT requirement) and powers spells.',
  wisdom: 'Wisdom — intuition and willpower. Reserved for future mechanics (saves, divine magic).',
  charisma:
    'Charisma — force of personality. Reserved for future mechanics (shop prices, social checks).',
} as const

interface Props {
  character: Character
  fieldEvents: FieldFxEvent[]
  fields: Effects['fields']
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

const SEG_COUNT = 20

function SegBar({ ratio, segClass, color }: { ratio: number; segClass?: string; color?: string }) {
  const filled = Math.round(ratio * SEG_COUNT)
  return (
    <>
      {Array.from({ length: SEG_COUNT }, (_, i) => {
        const on = i < filled
        return (
          <div
            key={i}
            className={`sheet__seg${on && segClass ? ` ${segClass}` : ''}`}
            style={on && color ? { background: color } : undefined}
          />
        )
      })}
    </>
  )
}

// Keeps big HP/MP/XP readable without wrapping the bar row. Values at or below
// 9,999 render as-is; from 10K up we truncate to one decimal of the matching
// unit (10.2K, 1.3M, 4B). Sheet reserves enough column width for "999M / 999M"
// at the larger text scales.
function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs < 10_000) return String(Math.round(n))
  const sign = n < 0 ? '-' : ''
  const units: Array<[number, string]> = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const v = abs / size
      const text = v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')
      return `${sign}${text}${suffix}`
    }
  }
  return String(Math.round(n))
}

export default function SheetPanel({ character, fieldEvents, fields }: Props) {
  const world = getWorldManifest(character.worldId)
  const xpTarget = xpToNextLevel(character.level)
  const hpRatio = character.maxHp > 0 ? clamp01(character.hp / character.maxHp) : 0
  const magicRatio = character.maxMagic > 0 ? clamp01(character.magic / character.maxMagic) : 0
  const xpRatio = xpTarget > 0 ? clamp01(character.xp / xpTarget) : 0

  const magicAbbr = world?.magicAbbreviation ?? 'MAG'
  const magicLabel = world?.magicName ?? 'Magic'
  const currencyLabel = world?.currencyName ?? 'Gold'

  const species = world?.species.find((s) => s.id === character.speciesId)
  const charClass = world?.classes.find((c) => c.id === character.classId)
  const title = currentTitle(character)
  const titleTip = title.text
    ? 'Based on class and level'
    : 'Title pending — the archive is composing one.'

  const hpTip = `Hit Points — reaches 0 and you fall, then respawn at the last safe room.`
  const magicTip = `${magicLabel} — spent casting spells. Refills on rest, potions, or scrolls.`
  const xpTip = `Experience toward level ${character.level + 1}. Resets on level-up (target: ${xpTarget}).`

  const content = getWorldContent(character.worldId)
  const conditionDefs = new Map((content?.conditions ?? []).map((c) => [c.id, c]))
  const activeConds = (character.conditions ?? []).flatMap((a) => {
    const def = conditionDefs.get(a.id)
    if (!def) return []
    return [{ ...a, def }]
  })

  const goalDrive = topDrive(character.drives)

  const [showLevels, setShowLevels] = useState(false)
  const [popover, setPopover] = useState<
    { subject: Subject; anchor: DOMRect } | null
  >(null)

  // Look up content inside the memo so the dep list is just `character`.
  // `content` is a module-level registry reference that the React Compiler
  // flags as potentially mutable even though it's effectively immutable.
  const bonuses = useMemo(
    () => {
      const c = getWorldContent(character.worldId)
      return c ? bonusBreakdowns(character, c) : null
    },
    [character],
  )

  // Derived combat stats. Mirrors the formulas in tick.ts/fight():
  //  - ATK = STR mod + attack bonus from gear & buffs
  //  - DEF = defense bonus from gear & buffs + DEX mod (DEX cuts incoming hits)
  //  - MATK = INT mod (spells don't roll vs. INT yet, but it gates scrolls and
  //          tracks spell potential — exposing it now keeps the panel honest
  //          about what powers magic in this build)
  //  - MDEF = WIS mod (reserved for save / resist mechanics on the roadmap)
  const statMod = (n: number) => Math.floor((n - 10) / 2)
  const stats = character.stats
  const atkTotal = Math.max(0, statMod(stats.strength)) + (bonuses?.attack.total ?? 0)
  const defTotal = Math.max(0, statMod(stats.dexterity)) + (bonuses?.defense.total ?? 0)
  const matkTotal = Math.max(0, statMod(stats.intelligence))
  const mdefTotal = Math.max(0, statMod(stats.wisdom))
  const COMBAT_TIPS = {
    atk: 'Attack — adds to melee damage. STR mod + equipped attack bonuses.',
    matk: 'Magic Attack — drives spell potency and scroll-use gating. Currently shows your INT mod; spell damage will scale with this in a future revision.',
    def: 'Defense — reduces incoming melee damage. DEX mod (evasion) + equipped defense bonuses.',
    mdef:
      'Magic Defense — willpower vs. hostile magic. Currently shows your WIS mod; saves and resists will draw from it as the spell mechanics expand.',
  } as const

  const openStatPopover = (
    statLabel: string,
    breakdown: BonusBreakdown,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setPopover({
      subject: { kind: 'stat-bonus', stat: statLabel, breakdown },
      anchor: e.currentTarget.getBoundingClientRect(),
    })
  }

  const statRow = (
    key:
      | 'strength'
      | 'dexterity'
      | 'constitution'
      | 'intelligence'
      | 'wisdom'
      | 'charisma',
    abbr: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
  ) => {
    const base = character.stats[key]
    const b = bonuses?.[key]
    const total = b?.total ?? 0
    return (
      <div key={key}>
        <dt data-tip={STAT_TIPS[key]}>{abbr}</dt>
        <dd>
          <span className="sheet__stat-base">{base}</span>
          {total > 0 && (
            <button
              type="button"
              className="sheet__stat-bonus"
              data-tip={`${total} from equipped gear — click for breakdown`}
              onClick={(e) => openStatPopover(abbr, b!, e)}
            >
              (+{total})
            </button>
          )}
        </dd>
      </div>
    )
  }

  return (
    <div className="sheet">
      <header className="sheet__header">
        <div className="sheet__title">
          <span className="sheet__name">{character.name}</span>
          {title.text && (
            <span className="sheet__honorific" data-tip={titleTip}>{title.text}</span>
          )}
          <span className="sheet__subtitle">
            {species ? (
              <span data-tip={species.description}>{species.name}</span>
            ) : (
              <span>unknown</span>
            )}
            {species && charClass ? <span className="sheet__subtitle-sep"> · </span> : null}
            {charClass ? (
              <span data-tip={charClass.description}>{charClass.name}</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          className="sheet__level"
          data-tip="See leveling history"
          onClick={() => setShowLevels(true)}
        >
          Lv {character.level}
        </button>
      </header>
      <LevelingDialog
        open={showLevels}
        character={character}
        onClose={() => setShowLevels(false)}
        onSubjectClick={(subject, e) =>
          setPopover({ subject, anchor: e.currentTarget.getBoundingClientRect() })
        }
      />
      <Popover
        open={popover != null}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
      >
        {popover && (
          <LogPopoverContent
            subject={popover.subject}
            ctx={{
              character,
              areas: content?.areas ?? (content ? [content.startingArea] : undefined),
              mobs: content?.mobs,
              items: content?.items,
            }}

          />
        )}
      </Popover>

      <section className="sheet__bars">
        <div className="sheet__bar-row" data-tip={hpTip}>
          <span className="sheet__bar-label sheet__bar-label--hp">HP</span>
          <div className="sheet__bar">
            <SegBar ratio={hpRatio} segClass="sheet__seg--hp" />
          </div>
          <span className="sheet__bar-val sheet__bar-val--hp">{formatCompact(character.hp)} / {formatCompact(character.maxHp)}</span>
          <FieldIndicator events={fieldEvents} field="hp" enabled={fields.hp} durationMs={fields.durationMs} />
        </div>
        <div className="sheet__bar-row" data-tip={magicTip}>
          <span className="sheet__bar-label sheet__bar-label--magic">{magicAbbr}</span>
          <div className="sheet__bar">
            <SegBar ratio={magicRatio} segClass="sheet__seg--magic" />
          </div>
          <span className="sheet__bar-val sheet__bar-val--magic">{formatCompact(character.magic)} / {formatCompact(character.maxMagic)}</span>
          <FieldIndicator events={fieldEvents} field="magic" enabled={fields.magic} durationMs={fields.durationMs} />
        </div>
        <div className="sheet__bar-row sheet__bar-row--xp" data-tip={xpTip}>
          <span className="sheet__bar-label sheet__bar-label--xp">XP</span>
          <div className="sheet__bar">
            <SegBar ratio={xpRatio} segClass="sheet__seg--xp" />
          </div>
          <span className="sheet__bar-val sheet__bar-val--xp">{formatCompact(character.xp)} / {formatCompact(xpTarget)}</span>
          <FieldIndicator events={fieldEvents} field="xp" enabled={fields.xp} durationMs={fields.durationMs} />
        </div>
      </section>

      <section className="sheet__attrs">
        {statRow('strength', 'STR')}
        {statRow('dexterity', 'DEX')}
        {statRow('constitution', 'CON')}
        {statRow('intelligence', 'INT')}
        {statRow('wisdom', 'WIS')}
        {statRow('charisma', 'CHA')}
      </section>

      <section className="sheet__combat" aria-label="Combat stats">
        <div data-tip={COMBAT_TIPS.atk}>
          <dt>ATK</dt>
          <dd>{atkTotal}</dd>
        </div>
        <div data-tip={COMBAT_TIPS.matk}>
          <dt>MATK</dt>
          <dd>{matkTotal}</dd>
        </div>
        <div data-tip={COMBAT_TIPS.def}>
          <dt>DEF</dt>
          <dd>{defTotal}</dd>
        </div>
        <div data-tip={COMBAT_TIPS.mdef}>
          <dt>MDEF</dt>
          <dd>{mdefTotal}</dd>
        </div>
      </section>

      <section className="sheet__drives">
        <h2 className="sheet__drives-title">Drives</h2>
        <div className="sheet__drives-grid">
          {DRIVES.map((d) => {
            const value = character.drives[d]
            const ratio = clamp01(value / DRIVE_MAX)
            const isGoal = d === goalDrive
            const pct = Math.round(ratio * 100)
            const goalSuffix = isGoal ? '  ·  Current goal — the next move is picked to ease this.' : ''
            const tip = `${DRIVE_LABELS[d]} — ${pct}% full.  ${DRIVE_DESCRIPTIONS[d]}${goalSuffix}`
            const heatColor =
              d === 'weight' || d === 'hunger' || d === 'fatigue'
                ? ratio < 0.5
                  ? 'var(--good)'
                  : ratio < 0.7
                    ? 'var(--warn)'
                    : ratio < 0.9
                      ? 'var(--verb-emph, #ff8a3d)'
                      : 'var(--bad)'
                : undefined
            return (
              <div
                key={d}
                className={'sheet__drive' + (isGoal ? ' sheet__drive--goal' : '')}
                data-tip={tip}
              >
                <span className="sheet__drive-label">{isGoal ? '> ' : ''}{DRIVE_LABELS[d]}</span>
                <div className="sheet__drive-gauge">
                  <SegBar ratio={ratio} segClass={`sheet__seg--drive-${d}`} color={heatColor} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="sheet__gold">
        <span className="sheet__gold-label">{currencyLabel}</span>
        <span className="sheet__gold-val">{character.gold}</span>
        <FieldIndicator events={fieldEvents} field="gold" enabled={fields.gold} durationMs={fields.durationMs} />
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
                <li key={c.id} className={cls} data-tip={c.def.description}>
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
        .sheet__name { font-family: var(--font-display); font-size: var(--text-xl); color: var(--player, var(--accent-hot)); text-shadow: 0 0 4px currentColor; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sheet__honorific { font-family: var(--font-display); font-size: var(--text-sm); color: var(--warn); letter-spacing: 0.06em; text-shadow: var(--glow-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; }
        .sheet__subtitle { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; }
        .sheet__level { flex-shrink: 0; padding: 2px var(--sp-2); background: var(--bg-2); border: 1px solid var(--line-3); color: var(--accent-hot); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; text-transform: uppercase; text-shadow: var(--glow-sm); font-variant-numeric: tabular-nums; cursor: pointer; transition: background var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt); }
        .sheet__level:hover, .sheet__level:focus-visible { outline: none; background: var(--bg-3); text-shadow: var(--glow-md); }

        .sheet__bars { display: flex; flex-direction: column; gap: var(--sp-1); }
        /* Fixed ch-based columns keep the label, bar, and value aligned across
           all three rows. The value column is wide enough for "999M / 999M"
           without wrapping. */
        .sheet__bar-row { position: relative; display: grid; grid-template-columns: 3.5ch 1fr 14ch; gap: var(--sp-2); align-items: center; font-family: var(--font-mono); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
        .sheet__bar-label { font-family: var(--font-mono); color: var(--fg-2); letter-spacing: 0.04em; font-size: var(--text-xs); font-variant-numeric: tabular-nums; text-align: left; }
        .sheet__bar-label--hp { color: var(--hp); text-shadow: var(--glow-sm); }
        .sheet__bar-label--magic { color: var(--mp); text-shadow: var(--glow-sm); }
        .sheet__bar-label--xp { color: var(--xp, #ffffff); }
        .sheet__bar-val { color: var(--fg-2); text-align: right; white-space: nowrap; }
        .sheet__bar-val--hp { color: var(--hp); text-shadow: var(--glow-sm); }
        .sheet__bar-val--magic { color: var(--mp); text-shadow: var(--glow-sm); }
        .sheet__bar-val--xp { color: var(--xp, #ffffff); }
        .sheet__bar { display: flex; gap: 2px; padding: 1px; height: 10px; background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); }
        .sheet__seg { flex: 1; height: 100%; background: var(--bg-0); }
        .sheet__seg--hp { background: var(--hp); box-shadow: var(--glow-sm); }
        .sheet__seg--magic { background: var(--mp); box-shadow: var(--glow-sm); }
        .sheet__seg--xp { background: var(--xp, #ffffff); box-shadow: 0 0 4px rgba(255,255,255,0.35); }
        .sheet__seg--drive-hunger { background: var(--warn); box-shadow: var(--glow-sm); }
        .sheet__seg--drive-fatigue { background: var(--magic); box-shadow: var(--glow-sm); }
        .sheet__seg--drive-greed { background: var(--good); box-shadow: var(--glow-sm); }
        .sheet__seg--drive-curiosity { background: var(--speech, var(--accent)); box-shadow: var(--glow-sm); }
        .sheet__seg--drive-weight { background: var(--fg-2); box-shadow: var(--glow-sm); }

        .sheet__attrs { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-1); padding: var(--sp-2); background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); }
        /* Combat stats sit between the attribute block and the drive grid.
           Four columns of derived ATK / MATK / DEF / MDEF — small inline
           label/value pairs so they don't compete with the bigger stat grid. */
        .sheet__combat { margin: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-1); padding: var(--sp-2); background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); }
        .sheet__combat div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .sheet__combat dt { font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); }
        .sheet__combat dd { margin: 0; font-family: var(--font-mono); font-size: var(--text-md); font-weight: 500; color: var(--fg-1); font-variant-numeric: tabular-nums; }
        .sheet__attrs div { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .sheet__attrs dt { font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); }
        .sheet__attrs dd { margin: 0; display: inline-flex; align-items: baseline; gap: 4px; font-family: var(--font-mono); font-size: var(--text-md); font-weight: 500; color: var(--fg-1); font-variant-numeric: tabular-nums; }
        .sheet__stat-base { color: var(--fg-1); }
        .sheet__stat-bonus {
          background: transparent;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--good);
          cursor: pointer;
          text-shadow: var(--glow-sm);
          font-size: var(--text-xs);
        }
        .sheet__stat-bonus:hover,
        .sheet__stat-bonus:focus-visible { outline: none; text-shadow: var(--glow-md); }

        .sheet__gold { position: relative; display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px; }
        .sheet__gold-label { font-family: var(--font-body); color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.1em; font-size: var(--text-xs); }
        .sheet__gold-val { font-family: var(--font-mono); color: var(--warn); font-variant-numeric: tabular-nums; font-size: var(--text-sm); text-shadow: var(--glow-sm); }
        .sheet__level-xp { color: var(--fg-1); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

        .sheet__conds { display: flex; flex-direction: column; gap: var(--sp-1); }
        .sheet__conds-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
        .sheet__conds-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-1); }
        .sheet__cond { display: inline-flex; align-items: center; gap: var(--sp-1); padding: 2px var(--sp-2); border: 1px solid var(--line-2); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.04em; }
        .sheet__cond--buff { color: var(--good); border-color: var(--good); text-shadow: var(--glow-sm); }
        .sheet__cond--debuff { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .sheet__cond-name { text-transform: uppercase; letter-spacing: 0.08em; }
        .sheet__cond-ticks { color: var(--fg-3); font-variant-numeric: tabular-nums; text-shadow: none; }

        .sheet__drives { display: flex; flex-direction: column; gap: var(--sp-1); }
        .sheet__drives-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
        .sheet__drives-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-1) var(--sp-3); }
        .sheet__drive { display: grid; grid-template-rows: auto 10px; gap: 3px; min-width: 0; }
        .sheet__drive-label { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-2); text-transform: uppercase; letter-spacing: 0.08em; }
        .sheet__drive--goal .sheet__drive-label { color: var(--accent-hot); }
        .sheet__drive-gauge { display: flex; gap: 2px; padding: 1px; height: 10px; background: var(--bg-inset); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); }
      `}</style>
    </div>
  )
}
