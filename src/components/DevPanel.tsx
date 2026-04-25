import { useCallback, useEffect, useRef, useState } from 'react'
import type { Character } from '../character'
import type { ConditionDef } from '../conditions'
import type { ElementKind, ElementTarget, FieldId } from '../effects'
import { RARITIES, type Rarity } from '../items'
import {
  THEMES,
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeId,
} from '../themes'
import type { WorldContent } from '../worlds'

export type FullscreenFxKind =
  | 'level-up'
  | 'death'
  | 'damage-taken'
  | 'damage-dealt'
  | 'heal-self'
  | 'loot'
  | 'enter-fight'
  | 'new-area'

export type DevCommand =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'tick-once' }
  | { kind: 'level-up' }
  | { kind: 'spawn-fight' }
  | { kind: 'spawn-fight-at'; mobId: string; rarity: Rarity }
  | { kind: 'die' }
  | { kind: 'heal-full' }
  | { kind: 'drain-drives' }
  | { kind: 'max-drives' }
  | { kind: 'add-gold'; amount: number }
  | { kind: 'give-item'; itemId: string; rarity: Rarity }
  | { kind: 'set-value'; field: SetField; value: number }
  | { kind: 'apply-condition'; conditionId: string }
  | { kind: 'clear-conditions' }
  | { kind: 'clear-log' }
  | { kind: 'log-samples' }
  | { kind: 'fx-fullscreen'; fx: FullscreenFxKind }
  | { kind: 'fx-field'; field: FieldId; delta: number }
  | { kind: 'fx-element'; element: ElementKind; target: ElementTarget }

export type SetField =
  | 'hp'
  | 'maxHp'
  | 'xp'
  | 'magic'
  | 'maxMagic'
  | 'gold'
  | 'level'
  | 'hunger'
  | 'fatigue'
  | 'greed'
  | 'curiosity'
  | 'weight'

interface Props {
  paused: boolean
  character: Character
  world?: WorldContent
  onCommand: (cmd: DevCommand) => void
  onClose: () => void
  conditions?: ConditionDef[]
}

type Tab = 'play' | 'spawn' | 'set' | 'cond' | 'fx' | 'theme'

const FULLSCREEN_FX_LABELS: Record<FullscreenFxKind, string> = {
  'level-up': 'Level up',
  death: 'Death',
  'damage-taken': 'Damage taken',
  'damage-dealt': 'Damage dealt',
  'heal-self': 'Heal self',
  loot: 'Loot',
  'enter-fight': 'Enter fight',
  'new-area': 'New area',
}

const FIELD_FX_LABELS: Record<FieldId, string> = {
  hp: 'HP',
  magic: 'MP',
  xp: 'XP',
  gold: 'Gold',
}

const ELEMENT_FX: readonly ElementKind[] = [
  'fire',
  'ice',
  'electric',
  'earth',
  'hack',
] as const

interface Pos {
  x: number
  y: number
}

const INITIAL_OFFSET = 16
const PANEL_WIDTH = 385
const POS_KEY = 'understudy.devPanel.pos'
const TAB_KEY = 'understudy.devPanel.tab'

type ValueRow =
  | { kind: 'single'; field: SetField; label: string }
  | { kind: 'paired'; label: string; current: SetField; max: SetField }

// Fields are grouped so the Set tab reads as three tight sections rather
// than one long undifferentiated list. HP and Magic merge their current +
// max pair into one row — max is applied first so the current-value clamp
// respects the new ceiling. Ordering inside each group follows the
// character sheet. `weight` is read-only (computed from inventory) but
// lives in the draft map for display parity; the submit path ignores it.
const VALUE_FIELD_GROUPS: Array<{ title: string; rows: ValueRow[] }> = [
  {
    title: 'Vitals',
    rows: [
      { kind: 'paired', label: 'HP', current: 'hp', max: 'maxHp' },
      { kind: 'paired', label: 'Magic', current: 'magic', max: 'maxMagic' },
    ],
  },
  {
    title: 'Progression',
    rows: [
      { kind: 'single', field: 'level', label: 'Level' },
      { kind: 'single', field: 'xp', label: 'XP' },
      { kind: 'single', field: 'gold', label: 'Gold' },
    ],
  },
  {
    title: 'Drives',
    rows: [
      { kind: 'single', field: 'hunger', label: 'Hunger' },
      { kind: 'single', field: 'fatigue', label: 'Fatigue' },
      { kind: 'single', field: 'greed', label: 'Greed' },
      { kind: 'single', field: 'curiosity', label: 'Curiosity' },
      { kind: 'single', field: 'weight', label: 'Weight' },
    ],
  },
]

// Flat list of every SetField referenced by VALUE_FIELD_GROUPS — used to
// seed the draft map so each editable field has a starting string value.
const VALUE_FIELDS: SetField[] = VALUE_FIELD_GROUPS.flatMap((g) =>
  g.rows.flatMap((r): SetField[] =>
    r.kind === 'single' ? [r.field] : [r.current, r.max],
  ),
)

// Minimal preview palette per theme so the picker can render each name in the
// style of the theme without instantiating it. Keep in lockstep with the
// tokens defined in design/colors_and_type.css + src/themes/extra.css.
const THEME_PREVIEW: Record<ThemeId, { bg: string; fg: string; shadow?: string }> = {
  mud:            { bg: '#0a110d', fg: '#c4ffcb', shadow: '0 0 6px rgba(168,255,176,0.4)' },
  'mud-classic':  { bg: '#000000', fg: '#7bff88', shadow: '0 0 6px rgba(123,255,136,0.55)' },
  amber:    { bg: '#140d05', fg: '#ffe0a8', shadow: '0 0 6px rgba(255,204,102,0.4)' },
  phosphor: { bg: '#10101a', fg: '#ffffff' },
  neon:     { bg: '#15151c', fg: '#e9d5ff', shadow: '0 0 6px rgba(192,132,252,0.4)' },
  cyber:    { bg: '#0a0a1e', fg: '#ff9de8', shadow: '0 0 6px rgba(255,61,248,0.4)' },
  vacuum:   { bg: '#07132a', fg: '#b8ecff', shadow: '0 0 6px rgba(94,214,255,0.4)' },
  vellum:   { bg: '#ece1c0', fg: '#a82c00' },
  paper:    { bg: '#ffffff', fg: '#101010' },
}

function currentValue(c: Character, field: SetField): number {
  switch (field) {
    case 'hp': return c.hp
    case 'maxHp': return c.maxHp
    case 'xp': return c.xp
    case 'magic': return c.magic
    case 'maxMagic': return c.maxMagic
    case 'gold': return c.gold
    case 'level': return c.level
    case 'hunger': return Math.round(c.drives.hunger)
    case 'fatigue': return Math.round(c.drives.fatigue)
    case 'greed': return Math.round(c.drives.greed)
    case 'curiosity': return Math.round(c.drives.curiosity)
    case 'weight': return Math.round(c.drives.weight)
  }
}

function clampToViewport(p: Pos, w: number, h: number): Pos {
  if (typeof window === 'undefined') return p
  const maxX = Math.max(0, window.innerWidth - w)
  const maxY = Math.max(0, window.innerHeight - h)
  return {
    x: Math.max(0, Math.min(p.x, maxX)),
    y: Math.max(0, Math.min(p.y, maxY)),
  }
}

function loadSavedPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Pos>
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    // ignore
  }
  return null
}

function savePos(p: Pos): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    // ignore
  }
}

function loadSavedTab(): Tab {
  try {
    const raw = localStorage.getItem(TAB_KEY)
    if (
      raw === 'play' ||
      raw === 'spawn' ||
      raw === 'set' ||
      raw === 'cond' ||
      raw === 'fx' ||
      raw === 'theme'
    ) {
      return raw
    }
  } catch {
    // ignore
  }
  return 'play'
}

function saveTab(t: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, t)
  } catch {
    // ignore
  }
}

interface NumStepperProps {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  step?: number
  'aria-label'?: string
}

// Themed replacement for <input type="number"> with its native spinners.
// The native controls don't respect our palette (white Chrome arrows on a
// black CRT panel), so we hide them and render our own ▲/▼ stack next to
// the field. Enter on the input commits via `onCommit` to match the Set
// button's behavior.
function NumStepper({
  value,
  onChange,
  onCommit,
  step = 1,
  ...aria
}: NumStepperProps) {
  const bump = (delta: number) => {
    const n = Number(value)
    const base = Number.isFinite(n) ? n : 0
    onChange(String(Math.round(base + delta)))
  }
  return (
    <span className="dev__num">
      <input
        type="number"
        className="dev__num-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit()
        }}
        aria-label={aria['aria-label']}
      />
      <span className="dev__num-steppers" aria-hidden="true">
        <button
          type="button"
          className="dev__num-btn dev__num-btn--up"
          tabIndex={-1}
          onClick={() => bump(step)}
        >
          ▲
        </button>
        <button
          type="button"
          className="dev__num-btn dev__num-btn--down"
          tabIndex={-1}
          onClick={() => bump(-step)}
        >
          ▼
        </button>
      </span>
    </span>
  )
}

export default function DevPanel({
  paused,
  character,
  world,
  onCommand,
  onClose,
  conditions,
}: Props) {
  useEffect(() => {
    onCommand({ kind: 'pause' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ origin: Pos; start: Pos } | null>(null)

  const [pos, setPos] = useState<Pos>(() => {
    if (typeof window === 'undefined') return { x: 16, y: 56 }
    const saved = loadSavedPos()
    if (saved) return clampToViewport(saved, PANEL_WIDTH, 240)
    return {
      x: Math.max(0, window.innerWidth - PANEL_WIDTH - INITIAL_OFFSET),
      y: 56,
    }
  })

  const [tab, setTabState] = useState<Tab>(() => loadSavedTab())
  const setTab = (t: Tab) => {
    setTabState(t)
    saveTab(t)
  }
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme())
  const pickTheme = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
    saveTheme(id)
  }

  const onHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.dev__close')) return
    e.preventDefault()
    dragRef.current = {
      origin: { x: e.clientX, y: e.clientY },
      start: { ...pos },
    }
    document.body.style.userSelect = 'none'
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const next: Pos = {
      x: d.start.x + (e.clientX - d.origin.x),
      y: d.start.y + (e.clientY - d.origin.y),
    }
    const el = panelRef.current
    const w = el?.offsetWidth ?? PANEL_WIDTH
    const h = el?.offsetHeight ?? 240
    setPos(clampToViewport(next, w, h))
  }, [])

  const onMouseUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    document.body.style.userSelect = ''
    setPos((p) => {
      savePos(p)
      return p
    })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  useEffect(() => {
    const onResize = () => {
      const el = panelRef.current
      const w = el?.offsetWidth ?? PANEL_WIDTH
      const h = el?.offsetHeight ?? 240
      setPos((p) => clampToViewport(p, w, h))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // --- Spawn sub-state ---------------------------------------------------
  const [spawnRarity, setSpawnRarity] = useState<Rarity>('common')
  const [spawnMobId, setSpawnMobId] = useState<string | null>(null)
  const [spawnItemId, setSpawnItemId] = useState<string | null>(null)

  // Fall back to the first option when the current selection isn't valid for
  // the current world (e.g. switching characters). Computed at render so we
  // don't need a setState-inside-useEffect dance.
  const effectiveMobId =
    (spawnMobId && world?.mobs.some((m) => m.id === spawnMobId) ? spawnMobId : null) ??
    world?.mobs[0]?.id ??
    ''
  const effectiveItemId =
    (spawnItemId && world?.items.some((i) => i.id === spawnItemId) ? spawnItemId : null) ??
    world?.items[0]?.id ??
    ''

  // --- Gold slider -------------------------------------------------------
  const [goldAmount, setGoldAmount] = useState<number>(25)

  // --- Character value editors ------------------------------------------
  const [valueDrafts, setValueDrafts] = useState<Record<SetField, string>>(() => {
    const acc = {} as Record<SetField, string>
    for (const field of VALUE_FIELDS) {
      acc[field] = String(currentValue(character, field))
    }
    return acc
  })
  const updateDraft = (field: SetField, value: string) =>
    setValueDrafts((prev) => ({ ...prev, [field]: value }))
  const applyDraft = (field: SetField) => {
    const n = Number(valueDrafts[field])
    if (!Number.isFinite(n)) return
    onCommand({ kind: 'set-value', field, value: n })
  }
  // Apply a paired row (current + max). Max lands first so the current-value
  // handler (which clamps to character.maxX) uses the new ceiling when the
  // follow-up set-value for the current field runs. Each branch only
  // dispatches if its draft is a valid number.
  const applyPair = (currentField: SetField, maxField: SetField) => {
    const maxDraft = Number(valueDrafts[maxField])
    const curDraft = Number(valueDrafts[currentField])
    if (Number.isFinite(maxDraft)) {
      onCommand({ kind: 'set-value', field: maxField, value: maxDraft })
    }
    if (Number.isFinite(curDraft)) {
      onCommand({ kind: 'set-value', field: currentField, value: curDraft })
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'play', label: 'Play' },
    { id: 'spawn', label: 'Spawn' },
    { id: 'set', label: 'Set' },
    ...(conditions && conditions.length > 0
      ? [{ id: 'cond' as const, label: 'Cond' }]
      : []),
    { id: 'fx', label: 'FX' },
    { id: 'theme', label: 'Theme' },
  ]

  return (
    <div
      ref={panelRef}
      className="dev"
      role="dialog"
      aria-label="Developer tools"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      <div className="dev__bar" onMouseDown={onHeaderMouseDown}>
        <span className="dev__drag-grip" aria-hidden="true">⋮⋮</span>
        <span className="dev__title">Developer</span>
        <span className={'dev__status' + (paused ? ' dev__status--paused' : '')}>
          {paused ? 'Paused' : 'Running'}
        </span>
        <button
          type="button"
          className="dev__close"
          aria-label="Close dev tools"
          data-tip="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="dev__tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={'dev__tab' + (tab === t.id ? ' dev__tab--active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dev__scroll">
        {tab === 'play' && (
          <>
            <div className="dev__grid">
              <button
                type="button"
                className="dev__btn"
                onClick={() => onCommand(paused ? { kind: 'resume' } : { kind: 'pause' })}
              >
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                className="dev__btn"
                disabled={!paused}
                onClick={() => onCommand({ kind: 'tick-once' })}
              >
                Tick once
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'level-up' })}>
                Level up
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'spawn-fight' })}>
                Spawn fight
              </button>
              <button
                type="button"
                className="dev__btn dev__btn--danger"
                onClick={() => onCommand({ kind: 'die' })}
              >
                Die
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'heal-full' })}>
                Heal full
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'max-drives' })}>
                Max drives
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'drain-drives' })}>
                Drain drives
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'clear-log' })}>
                Clear log
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'log-samples' })}>
                Sample log
              </button>
            </div>
            <div className="dev__row">
              <span className="dev__row-label">Gold</span>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={goldAmount}
                onChange={(e) => setGoldAmount(Number(e.target.value))}
                aria-label="Gold amount"
              />
              <span className="dev__slider-val">+{goldAmount}</span>
              <button
                type="button"
                className="dev__btn dev__btn--compact"
                onClick={() => onCommand({ kind: 'add-gold', amount: goldAmount })}
              >
                Add
              </button>
            </div>
          </>
        )}

        {tab === 'spawn' && (
          <>
            <div className="dev__rarity-row">
              {RARITIES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={'dev__rbtn dev__rbtn--' + r + (spawnRarity === r ? ' dev__rbtn--sel' : '')}
                  onClick={() => setSpawnRarity(r)}
                  data-tip={r}
                >
                  {r}
                </button>
              ))}
            </div>
            {world && world.mobs.length > 0 && (
              <div className="dev__row">
                <span className="dev__row-label">Mob</span>
                <select
                  className="dev__select"
                  value={effectiveMobId}
                  onChange={(e) => setSpawnMobId(e.target.value)}
                >
                  {world.mobs.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dev__btn dev__btn--compact"
                  disabled={!effectiveMobId}
                  onClick={() =>
                    onCommand({ kind: 'spawn-fight-at', mobId: effectiveMobId, rarity: spawnRarity })
                  }
                >
                  Fight
                </button>
              </div>
            )}
            {world && world.items.length > 0 && (
              <div className="dev__row">
                <span className="dev__row-label">Item</span>
                <select
                  className="dev__select"
                  value={effectiveItemId}
                  onChange={(e) => setSpawnItemId(e.target.value)}
                >
                  {world.items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="dev__btn dev__btn--compact"
                  disabled={!effectiveItemId}
                  onClick={() =>
                    onCommand({ kind: 'give-item', itemId: effectiveItemId, rarity: spawnRarity })
                  }
                >
                  Give
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'set' && (
          <div className="dev__values">
            {VALUE_FIELD_GROUPS.map((group) => (
              <div key={group.title} className="dev__value-group">
                <div className="dev__row-label dev__value-group-title">
                  {group.title}
                </div>
                {group.rows.map((row) => {
                  if (row.kind === 'paired') {
                    const liveCur = currentValue(character, row.current)
                    const liveMax = currentValue(character, row.max)
                    return (
                      <div
                        key={`${row.current}-${row.max}`}
                        className="dev__value-row dev__value-row--pair"
                      >
                        <span
                          className="dev__value-label"
                          data-tip={`Live: ${liveCur} / ${liveMax}`}
                        >
                          {row.label}
                        </span>
                        <NumStepper
                          value={valueDrafts[row.current]}
                          onChange={(v) => updateDraft(row.current, v)}
                          onCommit={() => applyPair(row.current, row.max)}
                          aria-label={`${row.label} current`}
                        />
                        <span className="dev__value-sep">/</span>
                        <NumStepper
                          value={valueDrafts[row.max]}
                          onChange={(v) => updateDraft(row.max, v)}
                          onCommit={() => applyPair(row.current, row.max)}
                          aria-label={`${row.label} max`}
                        />
                        <button
                          type="button"
                          className="dev__btn dev__btn--compact"
                          onClick={() => applyPair(row.current, row.max)}
                        >
                          Set
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div key={row.field} className="dev__value-row">
                      <span className="dev__value-label">{row.label}</span>
                      <NumStepper
                        value={valueDrafts[row.field]}
                        onChange={(v) => updateDraft(row.field, v)}
                        onCommit={() => applyDraft(row.field)}
                        aria-label={row.label}
                      />
                      <button
                        type="button"
                        className="dev__btn dev__btn--compact"
                        onClick={() => applyDraft(row.field)}
                      >
                        Set
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {tab === 'cond' && conditions && conditions.length > 0 && (
          <>
            <div className="dev__grid">
              {conditions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={
                    'dev__btn dev__btn--cond ' +
                    (c.polarity === 'buff' ? 'dev__btn--buff' : 'dev__btn--debuff')
                  }
                  data-tip={c.description}
                  onClick={() => onCommand({ kind: 'apply-condition', conditionId: c.id })}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="dev__btn"
              onClick={() => onCommand({ kind: 'clear-conditions' })}
            >
              Clear all
            </button>
          </>
        )}

        {tab === 'fx' && (
          <>
            <div className="dev__row-label dev__fx-heading">Fullscreen</div>
            <div className="dev__fx-grid">
              {(Object.keys(FULLSCREEN_FX_LABELS) as FullscreenFxKind[]).map((fx) => (
                <button
                  key={fx}
                  type="button"
                  className="dev__btn dev__btn--compact"
                  onClick={() => onCommand({ kind: 'fx-fullscreen', fx })}
                >
                  {FULLSCREEN_FX_LABELS[fx]}
                </button>
              ))}
            </div>
            <div className="dev__row-label dev__fx-heading">Field +N / −N</div>
            <div className="dev__fx-fields">
              {(Object.keys(FIELD_FX_LABELS) as FieldId[]).map((f) => (
                <div key={f} className="dev__fx-field-row">
                  <span className="dev__row-label">{FIELD_FX_LABELS[f]}</span>
                  <button
                    type="button"
                    className="dev__btn dev__btn--compact"
                    onClick={() => onCommand({ kind: 'fx-field', field: f, delta: 5 })}
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    className="dev__btn dev__btn--compact"
                    onClick={() => onCommand({ kind: 'fx-field', field: f, delta: -5 })}
                  >
                    −5
                  </button>
                </div>
              ))}
            </div>
            <div className="dev__row-label dev__fx-heading">Elemental overlay</div>
            <div className="dev__fx-elements">
              {ELEMENT_FX.map((el) => (
                <div key={el} className="dev__fx-element-row">
                  <span className="dev__row-label">{el.toUpperCase()}</span>
                  <button
                    type="button"
                    className="dev__btn dev__btn--compact"
                    onClick={() =>
                      onCommand({ kind: 'fx-element', element: el, target: 'character' })
                    }
                  >
                    On player
                  </button>
                  <button
                    type="button"
                    className="dev__btn dev__btn--compact"
                    onClick={() =>
                      onCommand({ kind: 'fx-element', element: el, target: 'mob' })
                    }
                  >
                    On mob
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'theme' && (
          <div className="dev__themes">
            {THEMES.map((t) => {
              const preview = THEME_PREVIEW[t.id]
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  className={'dev__theme' + (active ? ' dev__theme--active' : '')}
                  onClick={() => pickTheme(t.id)}
                  style={{
                    background: preview.bg,
                    color: preview.fg,
                    textShadow: preview.shadow ?? 'none',
                  }}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .dev {
          position: fixed;
          width: ${PANEL_WIDTH}px;
          max-height: 80vh;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55), var(--glow-md);
          z-index: 50;
          display: flex;
          flex-direction: column;
          user-select: text;
        }
        .dev__bar {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: center;
          gap: var(--sp-2);
          padding: 4px var(--sp-2) 4px var(--sp-1);
          background: var(--bg-2);
          border-bottom: 1px solid var(--line-2);
          cursor: grab;
          flex-shrink: 0;
        }
        .dev__bar:active { cursor: grabbing; }
        .dev__drag-grip { color: var(--fg-3); font-family: var(--font-mono); font-size: var(--text-md); padding: 0 2px; letter-spacing: -2px; }
        .dev__title { font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.12em; text-transform: uppercase; color: var(--warn); text-shadow: var(--glow-sm); }
        .dev__status { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); padding: 2px var(--sp-2); border: 1px dashed var(--line-2); }
        .dev__status--paused { color: var(--warn); border-style: solid; border-color: var(--warn); text-shadow: var(--glow-sm); }
        .dev__close { width: 22px; height: 22px; padding: 0; background: transparent; border: 1px solid var(--line-2); color: var(--fg-2); cursor: pointer; font-family: var(--font-mono); font-size: var(--text-base); line-height: 1; transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt); }
        .dev__close:hover, .dev__close:focus-visible { outline: none; color: var(--bad); border-color: var(--bad); text-shadow: var(--glow-sm); }

        .dev__tabs { display: flex; background: var(--bg-0); border-bottom: 1px solid var(--line-2); flex-shrink: 0; padding: 0 var(--sp-1); }
        .dev__tab {
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 5px var(--sp-2);
          background: transparent;
          color: var(--fg-3);
          border: 1px solid transparent;
          border-bottom: none;
          margin-bottom: -1px;
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt);
        }
        .dev__tab:hover { color: var(--fg-1); }
        .dev__tab--active { color: var(--warn); border-color: var(--line-2); border-bottom: 1px solid var(--bg-1); background: var(--bg-1); text-shadow: var(--glow-sm); }

        .dev__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2); }

        .dev__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-1); }
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
        .dev__btn--compact { padding: 4px var(--sp-2); font-size: var(--text-xs); }
        .dev__btn--danger { color: var(--bad); border-color: var(--bad); }
        .dev__btn--danger:hover:not(:disabled) { color: var(--bad); border-color: var(--bad); text-shadow: var(--glow-sm); }
        .dev__btn--buff { color: var(--good); border-color: var(--good); }
        .dev__btn--buff:hover:not(:disabled) { color: var(--good); border-color: var(--good); text-shadow: var(--glow-sm); }
        .dev__btn--debuff { color: var(--warn); border-color: var(--warn); }
        .dev__btn--debuff:hover:not(:disabled) { color: var(--warn); border-color: var(--warn); text-shadow: var(--glow-sm); }
        .dev__btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .dev__row {
          display: grid;
          grid-template-columns: 44px 1fr auto auto;
          gap: var(--sp-2);
          align-items: center;
        }
        .dev__row-label { font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-3); }
        .dev__row input[type="range"] { accent-color: var(--accent-hot); min-width: 0; }
        .dev__slider-val { font-family: var(--font-mono); font-size: var(--text-xs); color: #ffb040; font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; text-shadow: 0 0 4px rgba(255, 176, 64, 0.35); }

        .dev__rarity-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; }
        .dev__rbtn {
          padding: 3px 6px;
          border: 1px solid var(--line-2);
          background: var(--bg-inset);
          color: var(--fg-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .dev__rbtn:hover { border-color: var(--line-3); }
        .dev__rbtn--common { color: #c8c8c8; }
        .dev__rbtn--uncommon { color: #5fd45f; }
        .dev__rbtn--rare { color: #5aa7ff; }
        .dev__rbtn--epic { color: #c084fc; }
        .dev__rbtn--legendary { color: #ffb040; }
        .dev__rbtn--sel { box-shadow: inset 0 0 0 1px currentColor; border-color: currentColor; text-shadow: 0 0 4px currentColor; }

        .dev__select { background: var(--bg-inset); color: var(--fg-1); border: 1px solid var(--line-2); padding: 3px var(--sp-1); font-family: var(--font-mono); font-size: var(--text-xs); outline: none; min-width: 0; }
        .dev__select:focus { border-color: var(--line-3); }

        .dev__values { display: flex; flex-direction: column; gap: var(--sp-2); }
        /* Each group is a small section with a header label and tight row
           list beneath. The extra vertical gap between groups makes the
           Vitals / Progression / Drives boundaries read at a glance. */
        .dev__value-group { display: flex; flex-direction: column; gap: 2px; }
        .dev__value-group-title {
          padding-bottom: 2px;
          border-bottom: 1px dashed var(--line-1);
          margin-bottom: 2px;
        }
        /* Flex layout instead of grid — paired rows have two steppers + a
           separator, single rows have one stepper + a live-value readout,
           and both end with a Set button. Flex lets each row compose its
           own middle without fighting a shared column template. */
        .dev__value-row {
          display: flex;
          align-items: stretch;
          gap: var(--sp-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        /* Label width fits "Curiosity" (longest drive name) at reduced
           letter-spacing. The margin-right stacks with the row's gap so the
           label never touches the input on any row, short or long. */
        .dev__value-label {
          width: 76px;
          flex-shrink: 0;
          align-self: center;
          margin-right: var(--sp-1);
          color: var(--fg-2);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dev__value-sep {
          align-self: center;
          color: var(--fg-3);
          padding: 0 2px;
          flex-shrink: 0;
        }
        /* With the stepper now fixed-width, rows have empty space after the
           label. Push the empty space to sit between the label and the
           input cluster so the stepper + Set button group flushes right.
           The adjacent-sibling combinator reliably targets the stepper
           directly after the label — a first-of-type selector would miss
           the stepper because the label is also a span. For paired rows
           this still catches the first stepper; the second stepper +
           separator + Set button ride along on the right. */
        .dev__value-label + .dev__num {
          margin-left: auto;
        }
        /* Themed number stepper. Wraps the input and our custom ▲/▼ stack
           in a shared border so they look like one control; the native
           spinners are hidden because they don't respect the CRT palette.
           Fixed width sized for 6 digits + ▲/▼ stack — wider than needed
           for common values but comfortable for Max HP / XP / Gold once
           they stretch into six figures. Steppers still sit on the right;
           everything else on the row can flow past the stepper cluster. */
        .dev__num {
          position: relative;
          display: flex;
          align-items: stretch;
          flex: 0 0 auto;
          width: calc(6ch + 24px);
          border: 1px solid var(--line-2);
          background: var(--bg-inset);
        }
        .dev__num:focus-within { border-color: var(--line-3); }
        .dev__num-input {
          flex: 1 1 auto;
          min-width: 0;
          width: 100%;
          background: transparent;
          color: var(--fg-1);
          border: none;
          padding: 2px var(--sp-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          font-variant-numeric: tabular-nums;
          /* Right-align so digits grow from the thousands column into the
             ones column — matches how the numbers read on the sheet. */
          text-align: right;
          outline: none;
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .dev__num-input::-webkit-inner-spin-button,
        .dev__num-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
          appearance: none;
          margin: 0;
        }
        .dev__num-steppers {
          display: flex;
          flex-direction: column;
          border-left: 1px solid var(--line-1);
          flex-shrink: 0;
        }
        .dev__num-btn {
          width: 16px;
          flex: 1 1 0;
          background: var(--bg-2);
          border: none;
          padding: 0;
          color: var(--fg-3);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 8px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .dev__num-btn + .dev__num-btn { border-top: 1px solid var(--line-1); }
        .dev__num-btn:hover {
          color: var(--accent-hot);
          background: var(--bg-3);
          text-shadow: var(--glow-sm);
        }
        .dev__num-btn:active { background: var(--bg-inset); }

        .dev__fx-heading { margin-top: var(--sp-2); padding: 0; border: none; background: transparent; color: var(--fg-3); }
        .dev__fx-heading:first-child { margin-top: 0; }
        .dev__fx-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
        .dev__fx-fields { display: flex; flex-direction: column; gap: 4px; }
        .dev__fx-field-row { display: grid; grid-template-columns: 48px 1fr 1fr; gap: 4px; align-items: center; }
        .dev__fx-elements { display: flex; flex-direction: column; gap: 4px; }
        .dev__fx-element-row { display: grid; grid-template-columns: 64px 1fr 1fr; gap: 4px; align-items: center; }

        .dev__themes { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-1); }
        .dev__theme {
          padding: 10px var(--sp-3);
          border: 1px solid var(--line-2);
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.08em;
          cursor: pointer;
          text-align: center;
          transition: border-color var(--dur-fast) var(--ease-crt), transform var(--dur-fast) var(--ease-crt);
        }
        .dev__theme:hover { border-color: var(--line-3); transform: translateY(-1px); }
        .dev__theme--active { outline: 2px solid var(--warn); outline-offset: -2px; }
      `}</style>
    </div>
  )
}
