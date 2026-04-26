import { useMemo, useState } from 'react'
import type { Character, InventoryItem, StatBlock } from '../character'
import { makeDefaults, maxHpFor, maxMagicFor } from '../character'
import { uuid } from '../util/uuid'
import { WORLD_MANIFESTS, getWorldManifest, hasWorldContent } from '../worlds'
import type { SpeciesOption, WorldManifest } from '../worlds'

type Step = 'world' | 'species' | 'class' | 'name'

interface Draft {
  worldId?: string
  speciesId?: string
  classId?: string
  name: string
}

const STEPS: Step[] = ['world', 'species', 'class', 'name']

const STEP_LABEL: Record<Step, string> = {
  world: 'World',
  species: 'Species',
  class: 'Class',
  name: 'Name',
}

const STEP_TITLE: Record<Step, string> = {
  world: 'Choose a world',
  species: 'Choose a species',
  class: 'Choose a class',
  name: 'Name them',
}

// Order in which stat bonus chips render on the species card so the line
// reads STR → CHA consistently regardless of object-key insertion order.
const STAT_BUMP_ORDER: Array<{
  key: keyof StatBlock
  abbr: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
}> = [
  { key: 'strength', abbr: 'STR' },
  { key: 'dexterity', abbr: 'DEX' },
  { key: 'constitution', abbr: 'CON' },
  { key: 'intelligence', abbr: 'INT' },
  { key: 'wisdom', abbr: 'WIS' },
  { key: 'charisma', abbr: 'CHA' },
]

// Build the quick-look bonus list shown on species cards. Pulls from the
// species' per-interval statBumps (every N levels) plus the flat HP/MP-per-
// level contributions. Empty entries are filtered so cards only show what
// the species actually grants.
function speciesBonusTokens(species: SpeciesOption): string[] {
  const tokens: string[] = []
  const hpPer = species.growth?.hpPerLevel ?? 0
  const mpPer = species.growth?.mpPerLevel ?? 0
  if (hpPer) tokens.push(`${hpPer >= 0 ? '+' : ''}${hpPer} HP/lv`)
  if (mpPer) tokens.push(`${mpPer >= 0 ? '+' : ''}${mpPer} MP/lv`)
  const bumps = species.growth?.statBumps
  if (bumps) {
    for (const { key, abbr } of STAT_BUMP_ORDER) {
      const v = bumps[key]
      if (v) tokens.push(`${v >= 0 ? '+' : ''}${v} ${abbr}`)
    }
  }
  return tokens
}

interface Props {
  onComplete: (
    character: Character,
    options?: { simulateTicks?: number },
  ) => void
  onCancel?: () => void
}

export default function CharacterCreation({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>('world')
  const [draft, setDraft] = useState<Draft>({ name: '' })

  const world = useMemo<WorldManifest | undefined>(
    () => (draft.worldId ? getWorldManifest(draft.worldId) : undefined),
    [draft.worldId],
  )

  const stepIndex = STEPS.indexOf(step)

  const canAdvance = (() => {
    switch (step) {
      case 'world': return !!draft.worldId
      case 'species': return !!draft.speciesId
      case 'class': return !!draft.classId
      case 'name': return draft.name.trim().length > 0
    }
  })()

  const finalize = (
    targetWorld: WorldManifest,
    speciesId: string,
    classId: string,
    name: string,
    options: { simulateTicks?: number } = {},
  ) => {
    const classDef = targetWorld.classes.find((c) => c.id === classId)
    if (!classDef) return
    const stats = { ...classDef.startingStats }
    const startedAt = Date.now()
    const inventory: InventoryItem[] = classDef.startingInventory.map((t) => ({
      id: uuid(),
      ...t,
      level: 1,
      acquired: { at: startedAt, source: 'starting' },
    }))
    const maxHp = maxHpFor(stats)
    const maxMagic =
      classDef.magicAffinity !== undefined
        ? maxMagicFor(stats, classDef.magicAffinity, classDef.castingStat)
        : (classDef.startingMaxMagic ?? 0)
    const createdAt = Date.now()
    onComplete(
      {
        ...makeDefaults(targetWorld.id),
        id: uuid(),
        name: name.trim(),
        worldId: targetWorld.id,
        worldVersion: targetWorld.version,
        speciesId,
        classId,
        createdAt,
        level: 1,
        xp: 0,
        hp: maxHp,
        maxHp,
        magic: maxMagic,
        maxMagic,
        stats,
        inventory,
        spells: [...(classDef.startingSpells ?? [])],
        segment: { startedAt: createdAt, startGold: 0 },
        // New characters wake into a slowed world (0.5×) and ramp up to 1×
        // over their first ~150 ticks. The auto-flag lets the runtime
        // step the speed up; the topbar control flips it off when the
        // user picks a speed manually.
        tickSpeed: '50',
        tickSpeedAuto: true,
        rngState: crypto.getRandomValues(new Uint32Array(1))[0],
      },
      options,
    )
  }

  // Skip the full creation flow with a randomly-picked fantasy preset.
  // Two presets alternate so successive Quick Starts don't feel identical.
  // We also hand the new character forward with `simulateTicks: 100` so
  // they arrive lived-in — already explored a bit, maybe scuffled with a
  // rat, drives partway up the gauge — instead of a blank slate.
  const quickStart = () => {
    const fantasy = getWorldManifest('fantasy')
    if (!fantasy) return
    const presets = [
      { speciesId: 'human', classId: 'warrior', name: 'Hiro' },
      { speciesId: 'elf',   classId: 'mage',    name: 'Hiro' },
    ] as const
    const p = presets[Math.floor(Math.random() * presets.length)]
    finalize(fantasy, p.speciesId, p.classId, p.name, { simulateTicks: 500 })
  }

  const advance = () => {
    if (!canAdvance) return
    if (step === 'name' && world && draft.speciesId && draft.classId) {
      finalize(world, draft.speciesId, draft.classId, draft.name)
      return
    }
    setStep(STEPS[stepIndex + 1])
  }

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1])
  }

  const pick = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const pickAndNext = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1])
  }

  return (
    <div className="cc">
      <div className="cc__card">
        <header className="cc__header">
          <ol className="cc__steps">
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={
                  'cc__step' +
                  (i === stepIndex ? ' cc__step--current' : '') +
                  (i < stepIndex ? ' cc__step--done' : '')
                }
              >
                <span className="cc__step-num">{i + 1}.</span>
                <span className="cc__step-label">{STEP_LABEL[s]}</span>
              </li>
            ))}
          </ol>
        </header>

        <main className="cc__body">
          <div className="cc__title-row">
            <h1 className="cc__title">{STEP_TITLE[step]}</h1>
            {step === 'world' && (
              <button
                type="button"
                className="cc__quickstart"
                onClick={quickStart}
                data-tip="Drop into a fantasy game with a preset character"
              >
                Quick Start
              </button>
            )}
          </div>

          {step === 'world' && (
            <>
              <ul className="cc__options">
                {WORLD_MANIFESTS.map((w) => {
                const ready = hasWorldContent(w.id) && !w.comingSoon
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={
                        'cc__option' +
                        (draft.worldId === w.id ? ' cc__option--selected' : '') +
                        (!ready ? ' cc__option--disabled' : '')
                      }
                      disabled={!ready}
                      onClick={() => pickAndNext({ worldId: w.id, speciesId: undefined, classId: undefined })}
                    >
                      <strong>
                        {w.name}
                        {!ready && <span className="cc__pending"> (Coming Soon)</span>}
                      </strong>
                      <span>{w.description}</span>
                    </button>
                  </li>
                )
              })}
              </ul>
            </>
          )}

          {step === 'species' && world && (
            <ul className="cc__options cc__options--equal">
              {world.species.map((s) => {
                const bonuses = speciesBonusTokens(s)
                return (
                  <li key={s.id} className="cc__options-cell">
                    <button
                      type="button"
                      className={
                        'cc__option cc__option--species' +
                        (draft.speciesId === s.id ? ' cc__option--selected' : '')
                      }
                      onClick={() => pickAndNext({ speciesId: s.id })}
                    >
                      <strong>{s.name}</strong>
                      <span>{s.description}</span>
                      {bonuses.length > 0 && (
                        <span
                          className="cc__bonuses"
                          data-tip="Bonuses granted by this species on level-up"
                        >
                          {bonuses.join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {step === 'class' && world && (
            <ul className="cc__options cc__options--equal">
              {world.classes.map((c) => (
                <li key={c.id} className="cc__options-cell">
                  <button
                    type="button"
                    className={
                      'cc__option cc__option--class' +
                      (draft.classId === c.id ? ' cc__option--selected' : '')
                    }
                    onClick={() => pickAndNext({ classId: c.id })}
                  >
                    <strong>{c.name}</strong>
                    <span>{c.description}</span>
                    <div className="cc__stats">
                      <div className="cc__stats-row">
                        <span className="cc__stats-tag">Primary</span>
                        <span className="cc__stats-values">
                          {c.primaryStats.map((s) => (
                            <span key={s} className="cc__stat cc__stat--primary">{s}</span>
                          ))}
                        </span>
                      </div>
                      <div className="cc__stats-row">
                        <span className="cc__stats-tag">Secondary</span>
                        <span className="cc__stats-values">
                          <span className="cc__stat cc__stat--secondary">{c.secondaryStat}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'name' && (
            <div className="cc__name">
              <input
                autoFocus
                className="cc__name-input"
                type="text"
                placeholder="Enter a name"
                value={draft.name}
                onChange={(e) => pick({ name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') advance()
                }}
                maxLength={32}
              />
            </div>
          )}
        </main>

        <footer className="cc__footer">
          <div className="cc__footer-left">
            {onCancel && (
              <button type="button" className="cc__nav" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
          <div className="cc__footer-right">
            <button
              type="button"
              className="cc__nav"
              onClick={back}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="cc__nav cc__nav--primary"
              onClick={advance}
              disabled={!canAdvance}
            >
              {step === 'name' ? 'Begin' : 'Next'}
            </button>
          </div>
        </footer>
      </div>

      <style>{`
        .cc { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--sp-7) var(--sp-4); background: var(--bg-0); }
        .cc__card { width: 100%; max-width: 720px; background: var(--bg-1); border: 1px solid var(--line-2); display: flex; flex-direction: column; }
        .cc__header { padding: var(--sp-5) var(--sp-6) 0; }
        .cc__steps { list-style: none; display: flex; gap: var(--sp-1); margin: 0; padding: 0; flex-wrap: wrap; }
        .cc__step { display: flex; align-items: baseline; gap: var(--sp-1); padding: 3px var(--sp-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); background: transparent; border: 1px solid var(--line-1); text-transform: uppercase; letter-spacing: 0.08em; }
        .cc__step-num { color: var(--fg-2); font-weight: 600; font-size: var(--text-xs); }
        .cc__step--current { color: var(--accent-hot); border-color: var(--line-3); text-shadow: var(--glow-sm); }
        .cc__step--current .cc__step-num { color: var(--accent-hot); }
        .cc__step--done { color: var(--fg-2); }
        .cc__body { padding: var(--sp-6); flex: 1; min-height: 0; overflow-y: auto; }
        .cc__title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); margin: 0 0 var(--sp-4); }
        .cc__title { margin: 0; font-family: var(--font-display); font-size: var(--text-2xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .cc__quickstart {
          padding: 6px var(--sp-3);
          background: var(--bg-2);
          border: 1px solid var(--line-3);
          color: var(--accent-hot);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-shadow: var(--glow-md);
          transition: background var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt);
        }
        .cc__quickstart:hover { background: var(--bg-3); text-shadow: var(--glow-lg); }
        .cc__options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-2); }
        /* Class-card variant: each cell stretches to row height so the
           tallest card defines the baseline; shorter cards pad to match
           via the inner button's flex-grow / min-height. */
        .cc__options--equal { grid-auto-rows: 1fr; }
        .cc__options-cell { display: flex; height: 100%; }
        .cc__option { width: 100%; text-align: left; padding: var(--sp-3) var(--sp-4); background: var(--bg-inset); border: 1px solid var(--line-1); color: var(--fg-1); cursor: pointer; display: flex; flex-direction: column; gap: 3px; font: inherit; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .cc__option:hover { border-color: var(--line-3); background: var(--bg-2); }
        .cc__option strong { font-family: var(--font-display); font-weight: 400; font-size: var(--text-lg); letter-spacing: 0.04em; color: var(--fg-1); }
        .cc__option span { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-3); }
        .cc__option--selected { border-color: var(--line-3); background: var(--bg-3); }
        .cc__option--selected strong { color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .cc__option--disabled { opacity: 0.45; cursor: not-allowed; }
        .cc__option--disabled:hover { border-color: var(--line-1); background: var(--bg-inset); }
        /* Class + species cards stretch to fill the equal-height row, and
           their bottom-line chrome (class stats block / species bonus line)
           sticks to the bottom so cards of every description length still
           present the same at-a-glance readout. */
        .cc__option--class, .cc__option--species { flex: 1; height: 100%; }
        .cc__option--class .cc__stats { margin-top: auto; padding-top: var(--sp-2); }
        .cc__option--species .cc__bonuses { margin-top: auto; padding-top: var(--sp-2); }
        .cc__bonuses { margin-top: var(--sp-1); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-2); letter-spacing: 0.04em; }
        .cc__stats { display: flex; flex-direction: column; gap: 2px; }
        .cc__stats-row { display: flex; align-items: baseline; gap: var(--sp-2); font-family: var(--font-mono); font-size: var(--text-xs); }
        .cc__stats-tag { color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.08em; min-width: 7ch; }
        .cc__stats-values { display: inline-flex; gap: var(--sp-1); }
        .cc__stat { padding: 0 4px; border: 1px solid var(--line-2); letter-spacing: 0.06em; font-family: var(--font-mono); font-size: var(--text-xs); }
        .cc__stat--primary { color: var(--accent-hot); border-color: var(--line-3); text-shadow: var(--glow-sm); }
        .cc__stat--secondary { color: var(--fg-2); border-color: var(--line-2); }
        .cc__pending { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); letter-spacing: 0.06em; text-transform: uppercase; }
        .cc__name { display: flex; justify-content: center; padding: var(--sp-4) 0; }
        .cc__name-input { width: 100%; max-width: 360px; padding: var(--sp-3) var(--sp-3); font-family: var(--font-mono); font-size: var(--text-md); background: var(--bg-inset); color: var(--fg-1); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); outline: none; }
        .cc__name-input:focus { border-color: var(--line-3); }
        .cc__footer { padding: var(--sp-4) var(--sp-6) var(--sp-5); border-top: 1px solid var(--line-1); display: flex; justify-content: space-between; gap: var(--sp-2); }
        .cc__footer-left, .cc__footer-right { display: flex; gap: var(--sp-2); }
        .cc__nav { padding: 6px var(--sp-4); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: var(--glow-sm); transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .cc__nav:hover:not(:disabled) { background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
        .cc__nav:disabled { opacity: 0.4; cursor: not-allowed; }
        .cc__nav--primary { background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
      `}</style>
    </div>
  )
}
