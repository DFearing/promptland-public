import { useCallback, useEffect, useRef, useState } from 'react'
import { roomKey } from '../areas'
import type { Character } from '../character'
import type { ConditionDef } from '../conditions'
import type { ElementKind, ElementTarget, FieldId } from '../effects'
import { RARITIES, rarityColor, rarityLabel, type Rarity } from '../items'
import {
  SOUND_EVENT_KINDS,
  SOUND_EVENT_LABELS,
  type SoundEventKind,
} from '../sound'
import {
  THEMES,
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeId,
} from '../themes'
import type { Area } from '../areas'
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
  | 'rare-area'
  | 'new-mob'
  | 'new-item'

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
  | { kind: 'set-ticks'; value: number }
  | { kind: 'apply-condition'; conditionId: string }
  | { kind: 'clear-conditions' }
  | { kind: 'sell-items' }
  | { kind: 'sacrifice-items' }
  | { kind: 'move-direction'; dx: number; dy: number; dz: number }
  | { kind: 'reset-location' }
  | { kind: 'travel-to-area'; areaId: string }
  | { kind: 'travel-to-portal-hub' }
  | { kind: 'purge-generated-areas' }
  | { kind: 'force-rest' }
  | { kind: 'force-meditate' }
  | { kind: 'clear-log' }
  | { kind: 'log-samples' }
  | { kind: 'save' }
  | { kind: 'fx-fullscreen'; fx: FullscreenFxKind }
  | { kind: 'fx-field'; field: FieldId; delta: number }
  | { kind: 'fx-element'; element: ElementKind; target: ElementTarget }
  | { kind: 'play-sound'; event: SoundEventKind }

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
  | 'piety'
  | 'favor'

interface Props {
  paused: boolean
  character: Character
  world?: WorldContent
  onCommand: (cmd: DevCommand) => void
  onClose: () => void
  conditions?: ConditionDef[]
}

type Tab = 'control' | 'set' | 'fx' | 'sound' | 'area' | 'system'

const FULLSCREEN_FX_LABELS: Record<FullscreenFxKind, string> = {
  'level-up': 'Level up',
  death: 'Death',
  'damage-taken': 'Damage taken',
  'damage-dealt': 'Damage dealt',
  'heal-self': 'Heal self',
  loot: 'Loot',
  'enter-fight': 'Enter fight',
  'new-area': 'New area',
  'rare-area': 'Rare area',
  'new-mob': 'New mob',
  'new-item': 'New item',
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
const POS_KEY = 'promptland.devPanel.pos'
const TAB_KEY = 'promptland.devPanel.tab'
const AREA_BANDS_KEY = 'promptland.devPanel.areaBands'

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
      { kind: 'single', field: 'favor', label: 'Favor' },
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
      { kind: 'single', field: 'piety', label: 'Piety' },
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
  chromejack:     { bg: '#11111a', fg: '#fcee0a', shadow: '0 0 6px rgba(0,240,255,0.4)' },
  lcars:          { bg: '#07070a', fg: '#ff9966', shadow: '0 0 6px rgba(255,153,102,0.3)' },
  channel:        { bg: '#222529', fg: '#d1d2d3', shadow: '0 0 6px rgba(54,197,240,0.3)' },
  newsroom:       { bg: '#e3ded3', fg: '#1a1814' },
  // Custom preview uses the default custom palette as a static swatch.
  // Live-tracking the user's actual custom colors would require
  // rendering through CSS vars, which the dev panel's preview grid
  // doesn't do — so the preview reads as "a generic user palette".
  custom:         { bg: '#050706', fg: '#a8ffb0', shadow: '0 0 6px rgba(76,255,106,0.4)' },
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
    case 'piety': return Math.round(c.drives.piety ?? 0)
    case 'favor': return Math.round(c.favor ?? 0)
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
      raw === 'control' ||
      raw === 'set' ||
      raw === 'fx' ||
      raw === 'sound' ||
      raw === 'area' ||
      raw === 'system'
    ) {
      return raw
    }
    // Migrate old tab ids from before the System/Control/Cond reshuffle so
    // existing users don't land on a removed tab and see nothing. Theme
    // moved into the bottom of System.
    if (raw === 'play') return 'control'
    if (raw === 'spawn' || raw === 'log' || raw === 'theme') return 'system'
    if (raw === 'cond') return 'set'
    // 'gen' tab was moved into Settings → LLM in PR #94. Route saved tab
    // values forward to System so the panel doesn't open empty.
    if (raw === 'gen') return 'system'
  } catch {
    // ignore
  }
  return 'control'
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

// Coarse tier buckets used by the Area tab accordion. Tight enough to read
// at a glance, wide enough that each band usually has a couple of entries.
const AREA_BANDS: Array<{ order: number; label: string; test: (lvl: number | undefined) => boolean }> = [
  { order: 1, label: 'Lvl 1–5', test: (l) => typeof l === 'number' && l <= 5 },
  { order: 2, label: 'Lvl 6–10', test: (l) => typeof l === 'number' && l > 5 && l <= 10 },
  { order: 3, label: 'Lvl 11–15', test: (l) => typeof l === 'number' && l > 10 && l <= 15 },
  { order: 4, label: 'Lvl 16–20', test: (l) => typeof l === 'number' && l > 15 && l <= 20 },
  { order: 5, label: 'Lvl 21–30', test: (l) => typeof l === 'number' && l > 20 && l <= 30 },
  { order: 6, label: 'Lvl 31+', test: (l) => typeof l === 'number' && l > 30 },
  { order: 99, label: 'Lvl ?', test: (l) => typeof l !== 'number' },
]

function areaBandFor(level: number | undefined): { order: number; label: string } {
  for (const band of AREA_BANDS) {
    if (band.test(level)) return { order: band.order, label: band.label }
  }
  return { order: 99, label: 'Lvl ?' }
}

// Short relative-time label for area cards. `formatRelative` in util/time is
// a touch long for a card footer ("3 minutes ago"); this returns "3m ago"
// style stamps so the row stays tight.
function compactRelative(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 14) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 8) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

interface AreaTabProps {
  world: WorldContent | undefined
  character: Character
  openBands: Set<string>
  toggleBand: (label: string) => void
  onCommand: (cmd: DevCommand) => void
}

function AreaTab({ world, character, openBands, toggleBand, onCommand }: AreaTabProps) {
  const rawAreas =
    world?.areas && world.areas.length > 0
      ? world.areas
      : world
        ? [world.startingArea]
        : []
  const sorted = [...rawAreas].sort((a, b) => {
    const ao = areaBandFor(a.level).order
    const bo = areaBandFor(b.level).order
    if (ao !== bo) return ao - bo
    const al = typeof a.level === 'number' ? a.level : Infinity
    const bl = typeof b.level === 'number' ? b.level : Infinity
    if (al !== bl) return al - bl
    return a.name.localeCompare(b.name)
  })
  const groups: Array<{ label: string; areas: Area[] }> = []
  for (const area of sorted) {
    const band = areaBandFor(area.level)
    const last = groups[groups.length - 1]
    if (last && last.label === band.label) {
      last.areas.push(area)
    } else {
      groups.push({ label: band.label, areas: [area] })
    }
  }
  const currentAreaId = character.position.areaId
  // Seed the accordion with the band containing the character's current area
  // so the first render shows something useful even if the user has never
  // expanded anything. Treat an empty set as "auto-open the current band";
  // once the user explicitly collapses all, they stay collapsed.
  const autoOpenLabel =
    openBands.size === 0
      ? groups.find((g) => g.areas.some((a) => a.id === currentAreaId))?.label
      : undefined
  const isOpen = (label: string) =>
    openBands.has(label) || label === autoOpenLabel
  const hasPortalHub = sorted.some((a) =>
    Object.values(a.rooms).some((r) => r.portalHub === true),
  )

  return (
    <div className="dev__areas">
      <div className="dev__area-actions">
        <button
          type="button"
          className="dev__btn dev__btn--compact"
          disabled={!hasPortalHub}
          data-tip={
            hasPortalHub
              ? 'Travel to the portal hub'
              : 'No portal hub in this world'
          }
          onClick={() => onCommand({ kind: 'travel-to-portal-hub' })}
        >
          Travel to portal hub
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="dev__empty">No areas loaded for this world.</div>
      ) : (
        groups.map((g) => {
          const open = isOpen(g.label)
          return (
            <div key={g.label} className="dev__area-group">
              <button
                type="button"
                className="dev__accordion-head"
                aria-expanded={open}
                onClick={() => toggleBand(g.label)}
              >
                <span className="dev__accordion-arrow" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span className="dev__accordion-label">{g.label}</span>
                <span className="dev__accordion-count">{g.areas.length}</span>
              </button>
              {open && (
                <div className="dev__area-cards">
                  {g.areas.map((a) => {
                    const active = a.id === currentAreaId
                    const rarity = a.rarity ?? 'common'
                    const roomCount = Object.keys(a.rooms).length
                    const lvl = typeof a.level === 'number' ? a.level : '?'
                    const generatedAt = a.generatedAt
                    const isAuthored = typeof generatedAt !== 'number'
                    return (
                      <div
                        key={a.id}
                        className={'dev__area-card' + (active ? ' dev__area-card--active' : '')}
                      >
                        <div className="dev__area-card-head">
                          <span
                            className="dev__area-card-name"
                            style={{ color: rarityColor(rarity) }}
                          >
                            {a.name}
                          </span>
                          <span className="dev__area-card-lvl">Lvl {lvl}</span>
                        </div>
                        <div className="dev__area-card-meta">
                          <span
                            className={'dev__area-card-rarity dev__rbtn--' + rarity}
                          >
                            {rarityLabel(rarity)}
                          </span>
                          <span className="dev__area-card-rooms">
                            {roomCount} room{roomCount === 1 ? '' : 's'}
                          </span>
                          <span className="dev__area-card-age">
                            {isAuthored
                              ? 'Authored'
                              : compactRelative(generatedAt)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={
                            'dev__btn dev__btn--compact' +
                            (active ? ' dev__btn--active' : '')
                          }
                          disabled={active}
                          data-tip={
                            active
                              ? 'Character is already here'
                              : `Travel to ${a.name}`
                          }
                          onClick={() =>
                            onCommand({ kind: 'travel-to-area', areaId: a.id })
                          }
                        >
                          {active ? 'You are here' : 'Travel'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
      <button
        type="button"
        className="dev__btn dev__btn--danger"
        data-tip="Delete every LLM-generated area from the entity cache for this world, plus its exit-to-area graph. Authored areas are untouched."
        onClick={() => onCommand({ kind: 'purge-generated-areas' })}
      >
        Purge generated areas
      </button>
    </div>
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

  // --- Area-accordion sub-state -----------------------------------------
  // Remember which level bands are open on the Area tab. Persisted across
  // tab switches (and across sessions) so a user who lives in 6–10 doesn't
  // re-open it every time. `null` until first load so we know to seed with
  // the band that contains the character's current area.
  const [openBands, setOpenBands] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(AREA_BANDS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((v): v is string => typeof v === 'string'))
        }
      }
    } catch {
      // ignore
    }
    return new Set<string>()
  })
  const toggleBand = useCallback((label: string) => {
    setOpenBands((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try {
        localStorage.setItem(AREA_BANDS_KEY, JSON.stringify([...next]))
      } catch {
        // ignore
      }
      return next
    })
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

  // Two-click arming for the Die button. Click once to arm → label flips to
  // "Confirm?" for 2s; a second click within that window actually kills the
  // character. Cheap guard against fat-finger deaths in the dev panel.
  const [dieArmed, setDieArmed] = useState(false)

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

  // Ticks lives outside the SetField enum because it's a lifetime counter,
  // not a character stat — it has no max pair, doesn't fit any of the
  // Vitals / Progression / Drives groupings by meaning, and gets dispatched
  // through its own command kind. Keeping it in a dedicated draft cell
  // avoids bloating the SetField union just to hang one dev knob off it.
  const [tickDraft, setTickDraft] = useState<string>(() =>
    String(character.ticks ?? 0),
  )
  const applyTickDraft = () => {
    const n = Number(tickDraft)
    if (!Number.isFinite(n)) return
    onCommand({ kind: 'set-ticks', value: n })
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
    { id: 'control', label: 'CTRL' },
    { id: 'set', label: 'Set' },
    { id: 'fx', label: 'FX' },
    { id: 'sound', label: 'SND' },
    { id: 'area', label: 'Area' },
    { id: 'system', label: 'SYS' },
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
        <button
          type="button"
          className={'dev__status' + (paused ? ' dev__status--paused' : '')}
          aria-pressed={paused}
          aria-label={paused ? 'Resume ticks' : 'Pause ticks'}
          data-tip={paused ? 'Click to resume' : 'Click to pause'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onCommand(paused ? { kind: 'resume' } : { kind: 'pause' })}
        >
          <span className="dev__status-glyph" aria-hidden="true">
            {paused ? '▶' : '❚❚'}
          </span>
          <span className="dev__status-label">{paused ? 'Paused' : 'Running'}</span>
        </button>
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
        {tab === 'control' && (() => {
          // Probe each compass + vertical direction against the current area's
          // rooms so the D-pad can dim directions that would no-op.
          const pos = character.position
          const area =
            world?.areas?.find((a) => a.id === pos.areaId) ?? world?.startingArea
          const canMove = (dx: number, dy: number, dz: number): boolean => {
            if (!area) return false
            return area.rooms[roomKey(pos.x + dx, pos.y + dy, pos.z + dz)] != null
          }
          const dbtn = (dx: number, dy: number, dz: number, glyph: string, tip: string, extra = '') => {
            const valid = canMove(dx, dy, dz)
            return (
              <button
                type="button"
                className={'dev__dbtn' + (extra ? ' ' + extra : '') + (valid ? '' : ' dev__dbtn--muted')}
                data-tip={tip}
                disabled={!valid}
                onClick={() => onCommand({ kind: 'move-direction', dx, dy, dz })}
              >
                {glyph}
              </button>
            )
          }
          return (
          <>
            <div className="dev__move">
              <div className="dev__dpad-wrap">
                <div className="dev__dpad">
                  {dbtn(-1, -1, 0, '↖', 'Northwest')}
                  {dbtn(0, -1, 0, '↑', 'North')}
                  {dbtn(1, -1, 0, '↗', 'Northeast')}
                  {dbtn(-1, 0, 0, '←', 'West')}
                  <span className="dev__dbtn dev__dbtn--label">Move</span>
                  {dbtn(1, 0, 0, '→', 'East')}
                  {dbtn(-1, 1, 0, '↙', 'Southwest')}
                  {dbtn(0, 1, 0, '↓', 'South')}
                  {dbtn(1, 1, 0, '↘', 'Southeast')}
                </div>
                <div className="dev__dpad-z">
                  {dbtn(0, 0, 1, 'U', 'Up a floor', 'dev__dbtn--z')}
                  {dbtn(0, 0, -1, 'D', 'Down a floor', 'dev__dbtn--z')}
                </div>
              </div>
            </div>
            <div className="dev__grid">
              <button
                type="button"
                className="dev__btn"
                disabled={!paused}
                onClick={() => onCommand({ kind: 'tick-once' })}
                data-tip={paused ? 'Advance one tick' : 'Pause from the toolbar title first'}
              >
                Tick once
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'level-up' })}>
                Level up
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'spawn-fight' })}>
                Spawn fight
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'heal-full' })}>
                Heal full
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'force-rest' })}>
                Rest
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'force-meditate' })}>
                Meditate
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'max-drives' })}>
                Max drives
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'drain-drives' })}>
                Drain drives
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'sell-items' })}>
                Sell items
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'sacrifice-items' })}>
                Sacrifice items
              </button>
              <button
                type="button"
                className="dev__btn"
                data-tip="Force a save immediately, regardless of cadence"
                onClick={() => onCommand({ kind: 'save' })}
              >
                Save
              </button>
              <button
                type="button"
                className="dev__btn"
                data-tip="Teleport back to the world's starting room"
                onClick={() => onCommand({ kind: 'reset-location' })}
              >
                Reset location
              </button>
              <button
                type="button"
                className={'dev__btn dev__btn--danger' + (dieArmed ? ' dev__btn--armed' : '')}
                onClick={() => {
                  if (dieArmed) {
                    setDieArmed(false)
                    onCommand({ kind: 'die' })
                  } else {
                    setDieArmed(true)
                    window.setTimeout(() => setDieArmed(false), 2000)
                  }
                }}
              >
                {dieArmed ? 'Confirm?' : 'Die'}
              </button>
            </div>
          </>
          )
        })()}

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
            {/* Ticks lives outside the SetField groups — it's a lifetime
                counter, not a stat — but the Set tab is the natural home
                for "override this character value" knobs, so it gets its
                own tiny section here at the bottom. Useful for jumping a
                character past an auto-ramp threshold or winding back to
                replay a save cadence. */}
            <div className="dev__value-group">
              <div className="dev__row-label dev__value-group-title">
                Timeline
              </div>
              <div className="dev__value-row">
                <span
                  className="dev__value-label"
                  data-tip={`Live: ${character.ticks ?? 0}`}
                >
                  Ticks
                </span>
                <NumStepper
                  value={tickDraft}
                  onChange={setTickDraft}
                  onCommit={applyTickDraft}
                  step={100}
                  aria-label="Ticks"
                />
                <button
                  type="button"
                  className="dev__btn dev__btn--compact"
                  onClick={applyTickDraft}
                >
                  Set
                </button>
              </div>
            </div>
            {conditions && conditions.length > 0 && (
              <div className="dev__value-group">
                <div className="dev__row-label dev__value-group-title">
                  Conditions
                </div>
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
              </div>
            )}
          </div>
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

        {tab === 'system' && (
          <div className="dev__system">
            <div className="dev__row-label dev__fx-heading">Spawn</div>
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

            <div className="dev__row-label dev__fx-heading">Log</div>
            <div className="dev__grid">
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'clear-log' })}>
                Clear log
              </button>
              <button type="button" className="dev__btn" onClick={() => onCommand({ kind: 'log-samples' })}>
                Sample log
              </button>
            </div>

            <div className="dev__row-label dev__fx-heading">Theme</div>
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
          </div>
        )}

        {tab === 'sound' && (
          <div className="dev__fx-grid">
            {SOUND_EVENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="dev__btn dev__btn--compact"
                onClick={() => onCommand({ kind: 'play-sound', event: k })}
                data-tip={`Play ${SOUND_EVENT_LABELS[k]}`}
              >
                {SOUND_EVENT_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        {tab === 'area' && (
          <AreaTab
            world={world}
            character={character}
            openBands={openBands}
            toggleBand={toggleBand}
            onCommand={onCommand}
          />
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
        /* Status doubles as the pause/resume button — clicking toggles the
           game tick. Sits in the title bar but stopPropagation on mousedown
           so a click here does not start a drag. Running = dashed border +
           play glyph; Paused = solid warn border + ❚❚ glyph. */
        .dev__status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          line-height: 1;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-2);
          padding: 3px var(--sp-2);
          background: transparent;
          border: 1px dashed var(--line-2);
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt);
        }
        .dev__status:hover, .dev__status:focus-visible {
          outline: none;
          color: var(--accent-hot);
          border-color: var(--accent-hot);
          border-style: solid;
          text-shadow: var(--glow-sm);
        }
        .dev__status--paused {
          color: var(--warn);
          border-style: solid;
          border-color: var(--warn);
          text-shadow: var(--glow-sm);
        }
        .dev__status--paused:hover, .dev__status--paused:focus-visible {
          color: var(--warn);
          border-color: var(--warn);
        }
        .dev__status-glyph { font-size: 10px; line-height: 1; }
        .dev__status-label { font-variant-numeric: tabular-nums; }
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
        .dev__btn--armed { background: var(--bad); color: var(--bg-0); text-shadow: none; }
        .dev__btn--armed:hover:not(:disabled) { background: var(--bad); color: var(--bg-0); text-shadow: none; }
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

        .dev__move { display: flex; flex-direction: column; align-items: center; gap: var(--sp-1); padding: var(--sp-3) 0; }
        .dev__dpad-wrap { display: flex; align-items: center; gap: var(--sp-3); }
        .dev__dpad { display: grid; grid-template-columns: repeat(3, 40px); gap: 3px; }
        .dev__dpad-z { display: grid; grid-template-columns: 40px; gap: 3px; }
        .dev__dbtn {
          aspect-ratio: 1 / 1;
          border: 1px solid var(--line-1);
          background: var(--bg-inset);
          color: var(--fg-2);
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .dev__dbtn:hover { background: var(--bg-1); color: var(--accent-hot); }
        .dev__dbtn--z { font-size: var(--text-sm); }
        .dev__dbtn--spacer { background: transparent; border-color: transparent; cursor: default; }
        .dev__dbtn--spacer:hover { background: transparent; color: inherit; }
        .dev__dbtn--muted { opacity: 0.28; cursor: not-allowed; }
        .dev__dbtn--muted:hover { background: var(--bg-inset); color: var(--fg-2); }
        .dev__dbtn--label {
          background: transparent;
          border-color: transparent;
          cursor: default;
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--fg-3);
        }
        .dev__dbtn--label:hover { background: transparent; color: var(--fg-3); }

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
        .dev__rbtn--common { color: var(--rarity-common); }
        .dev__rbtn--uncommon { color: var(--rarity-uncommon); }
        .dev__rbtn--rare { color: var(--rarity-rare); }
        .dev__rbtn--epic { color: var(--rarity-epic); }
        .dev__rbtn--legendary { color: var(--rarity-legendary); }
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

        .dev__areas { display: flex; flex-direction: column; gap: var(--sp-2); }
        .dev__area-group { display: flex; flex-direction: column; gap: 4px; }
        .dev__area-group-label {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--fg-3);
          padding: var(--sp-1) 0 2px;
        }
        /* (lvl N) follows the button's text color (via currentColor) so
           both the active and inactive states stay legible without a
           second contrast decision. Tabular-nums keeps the digits aligned
           across rows. */
        .dev__area-lvl { color: currentColor; font-variant-numeric: tabular-nums; opacity: 0.75; }
        /* Active-area button — picks up the accent outline+tint rather
           than the danger-red armed style, which put white-ish text on
           red at the level badge. Still clearly "this is where you are"
           without fighting the rest of the tab's color language. */
        .dev__btn--active {
          border-color: var(--accent-hot);
          color: var(--accent-hot);
          box-shadow: inset 0 0 0 1px var(--accent-hot);
          text-shadow: var(--glow-sm);
        }
        .dev__empty { color: var(--fg-3); font-style: italic; padding: var(--sp-2); text-align: center; }

        /* Level-band accordion row. Looks like a pressable header with an
           open/closed arrow, the band label, and a small count badge on the
           right. Aligns with the Settings > Effects accordion styling so the
           dev panel reads with the same visual language. */
        .dev__accordion-head {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: var(--sp-2);
          width: 100%;
          padding: 4px var(--sp-2);
          background: var(--bg-inset);
          border: 1px solid var(--line-2);
          color: var(--fg-2);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: border-color var(--dur-fast) var(--ease-crt),
                      color var(--dur-fast) var(--ease-crt);
        }
        .dev__accordion-head:hover { border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .dev__accordion-arrow { font-family: var(--font-mono); color: var(--fg-3); width: 10px; text-align: center; }
        .dev__accordion-label { text-align: left; }
        .dev__accordion-count {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          background: var(--bg-2);
          border: 1px solid var(--line-1);
          padding: 0 var(--sp-1);
          font-variant-numeric: tabular-nums;
        }

        /* Per-area card — replaces the plain button row. Shows the area
           name in its rarity color, a level badge, then a meta line with
           rarity + room count + generation age. Travel button anchors the
           card's bottom-right. Active card gets the accent glow. */
        .dev__area-cards { display: flex; flex-direction: column; gap: var(--sp-1); margin-top: 4px; }
        .dev__area-card {
          display: grid;
          gap: 4px;
          padding: var(--sp-2);
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
        }
        .dev__area-card--active {
          border-color: var(--accent-hot);
          box-shadow: inset 0 0 0 1px var(--accent-hot);
        }
        .dev__area-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--sp-2);
        }
        .dev__area-card-name {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-shadow: 0 0 4px currentColor;
          /* Long names truncate rather than wrap the card into two lines. */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .dev__area-card-lvl {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .dev__area-card-meta {
          display: flex;
          gap: var(--sp-2);
          flex-wrap: wrap;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
        }
        .dev__area-card-rarity {
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .dev__area-card-rooms,
        .dev__area-card-age {
          font-variant-numeric: tabular-nums;
        }

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
