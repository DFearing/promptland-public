import { useMemo, useState } from 'react'
import type { Character, InventoryItem } from '../character'
import { makeDefaults, maxHpFor } from '../character'
import { uuid } from '../util/uuid'
import { WORLD_MANIFESTS, getWorldManifest, hasWorldContent } from '../worlds'
import type { WorldManifest } from '../worlds'

type Step = 'world' | 'species' | 'gender' | 'class' | 'name'

interface Draft {
  worldId?: string
  speciesId?: string
  genderId?: string
  classId?: string
  name: string
}

const STEPS: Step[] = ['world', 'species', 'gender', 'class', 'name']

const STEP_TITLE: Record<Step, string> = {
  world: 'Choose a world',
  species: 'Choose a species',
  gender: 'Choose a gender',
  class: 'Choose a class',
  name: 'Name them',
}

interface Props {
  onComplete: (character: Character) => void
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
      case 'gender': return !!draft.genderId
      case 'class': return !!draft.classId
      case 'name': return draft.name.trim().length > 0
    }
  })()

  const advance = () => {
    if (!canAdvance) return
    if (step === 'name' && world && draft.speciesId && draft.genderId && draft.classId) {
      const classDef = world.classes.find((c) => c.id === draft.classId)
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
      const maxMagic = classDef.startingMaxMagic
      const createdAt = Date.now()
      onComplete({
        ...makeDefaults(world.id),
        id: uuid(),
        name: draft.name.trim(),
        worldId: world.id,
        worldVersion: world.version,
        speciesId: draft.speciesId,
        genderId: draft.genderId,
        classId: draft.classId,
        createdAt,
        level: 1,
        xp: 0,
        hp: Math.max(1, Math.ceil(maxHp * 0.6)),
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
      })
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
                <span className="cc__step-num">{i + 1}</span>
                <span className="cc__step-label">{STEP_TITLE[s]}</span>
              </li>
            ))}
          </ol>
        </header>

        <main className="cc__body">
          <h1 className="cc__title">{STEP_TITLE[step]}</h1>

          {step === 'world' && (
            <ul className="cc__options">
              {WORLD_MANIFESTS.map((w) => {
                const ready = hasWorldContent(w.id)
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
                      onClick={() => pickAndNext({ worldId: w.id, speciesId: undefined, genderId: undefined, classId: undefined })}
                    >
                      <strong>
                        {w.name}
                        {!ready && <span className="cc__pending"> — coming soon</span>}
                      </strong>
                      <span>{w.description}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {step === 'species' && world && (
            <ul className="cc__options">
              {world.species.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={'cc__option' + (draft.speciesId === s.id ? ' cc__option--selected' : '')}
                    onClick={() => pickAndNext({ speciesId: s.id })}
                  >
                    <strong>{s.name}</strong>
                    <span>{s.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'gender' && world && (
            <ul className="cc__options cc__options--compact">
              {world.genders.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={'cc__option' + (draft.genderId === g.id ? ' cc__option--selected' : '')}
                    onClick={() => pickAndNext({ genderId: g.id })}
                  >
                    <strong>{g.name}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {step === 'class' && world && (
            <ul className="cc__options">
              {world.classes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={'cc__option' + (draft.classId === c.id ? ' cc__option--selected' : '')}
                    onClick={() => pickAndNext({ classId: c.id })}
                  >
                    <strong>{c.name}</strong>
                    <span>{c.description}</span>
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
        .cc__step { display: flex; align-items: center; gap: var(--sp-1); padding: 3px var(--sp-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); background: transparent; border: 1px solid var(--line-1); text-transform: uppercase; letter-spacing: 0.08em; }
        .cc__step-num { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: var(--bg-inset); color: var(--fg-2); font-weight: 600; font-size: var(--text-xs); border: 1px solid var(--line-1); }
        .cc__step--current { color: var(--accent-hot); border-color: var(--line-3); text-shadow: var(--glow-sm); }
        .cc__step--current .cc__step-num { background: var(--bg-3); color: var(--accent-hot); border-color: var(--line-3); }
        .cc__step--done { color: var(--fg-2); }
        .cc__body { padding: var(--sp-6); flex: 1; min-height: 0; overflow-y: auto; }
        .cc__title { margin: 0 0 var(--sp-4); font-family: var(--font-display); font-size: var(--text-2xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .cc__options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-2); }
        .cc__options--compact { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
        .cc__option { width: 100%; text-align: left; padding: var(--sp-3) var(--sp-4); background: var(--bg-inset); border: 1px solid var(--line-1); color: var(--fg-1); cursor: pointer; display: flex; flex-direction: column; gap: 3px; font: inherit; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .cc__option:hover { border-color: var(--line-3); background: var(--bg-2); }
        .cc__option strong { font-family: var(--font-display); font-weight: 400; font-size: var(--text-lg); letter-spacing: 0.04em; color: var(--fg-1); }
        .cc__option span { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-3); }
        .cc__option--selected { border-color: var(--line-3); background: var(--bg-3); }
        .cc__option--selected strong { color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .cc__option--disabled { opacity: 0.45; cursor: not-allowed; }
        .cc__option--disabled:hover { border-color: var(--line-1); background: var(--bg-inset); }
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
