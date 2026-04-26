import { useEffect, useState } from 'react'
import pkg from '../../package.json'
import {
  LLMError,
  LLM_PRESETS,
  createLLMClient,
  loadLLMConfig,
  saveLLMConfig,
  type LLMConfig,
} from '../llm'
import type { EffectEvent } from '../effects'
import type { Storage } from '../storage'
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_EVENT_DESCS,
  SOUND_EVENT_LABELS,
  SOUND_THEMES,
  loadSoundSettings,
  loadSoundTheme,
  saveSoundSettings,
  saveSoundTheme,
  soundManager,
  type SoundEventKind,
  type SoundSettings,
  type SoundThemeId,
} from '../sound'
import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_EFFECTS,
  DEFAULT_SCALE,
  DEFAULT_THEME,
  DEFAULT_TICK_SPEED,
  FIELD_DURATION_MAX_MS,
  FIELD_DURATION_MIN_MS,
  FIELD_DURATION_STEP_MS,
  SCALES,
  THEMES,
  applyCustomThemeTokens,
  applyEffects,
  applyScale,
  applyTheme,
  loadCustomTheme,
  loadEffects,
  loadScale,
  loadTheme,
  saveCustomTheme,
  saveEffects,
  saveScale,
  saveTheme,
  saveTickSpeed,
  type CustomTheme,
  type Effects,
  type ScaleId,
  type ThemeId,
} from '../themes'
import ConfirmDialog from './ConfirmDialog'
import GenerationPanel from './GenerationPanel'

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; sample: string }
  | { kind: 'error'; message: string }

interface Props {
  onResetCharacters: () => Promise<void> | void
  onLlmConnected?: () => void
  characterCount: number
  storage: Storage
  /** Called from About → "Show landing again". Undefined if the host
   *  doesn't wire it (e.g. in tests / storybook). When present, About
   *  renders a small revisit-landing button. */
  onShowLanding?: () => void
}

interface ToggleRowProps {
  title: string
  desc: string
  on: boolean
  onClick: () => void
}

function ToggleRow({ title, desc, on, onClick }: ToggleRowProps) {
  return (
    <div className="settings__toggle-row">
      <div className="settings__toggle-copy">
        <span className="settings__toggle-title">{title}</span>
        <span className="settings__toggle-desc">{desc}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={'settings__toggle' + (on ? ' settings__toggle--on' : '')}
        onClick={onClick}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  )
}

/** Build a minimal EffectEvent suitable for previewing a single sound. */
function previewEvent(kind: SoundEventKind): EffectEvent {
  const id = `preview-${kind}`
  switch (kind) {
    case 'damage-taken':
      return { id, kind, amount: 8, maxHp: 30 }
    case 'damage-dealt':
      return { id, kind, amount: 6 }
    case 'heal-self':
      return { id, kind, amount: 10, maxHp: 30 }
    case 'loot':
      return { id, kind }
    case 'level-up':
      return { id, kind, record: { at: 0, from: 1, to: 2 }, previousAt: 0, previousGold: 0 }
    case 'death':
      // Preview a first-death (long banner) so the Sound tab's preview
      // always plays the full-length version.
      return { id, kind, deathCount: 1 }
    case 'enter-fight':
      return { id, kind }
    case 'new-area':
      return { id, kind, name: 'The Sunken Chapel' }
    case 'llm-connected':
      return { id, kind }
    case 'gold-windfall':
      return { id, kind, amount: 50 }
    case 'gold-jackpot':
      return { id, kind, amount: 200 }
    case 'new-mob':
      return { id, kind, name: 'Cave Rat' }
    case 'new-item':
      return { id, kind, name: 'Bone Die' }
    case 'generating-area':
      return { id, kind }
    case 'death-save':
      return { id, kind, mobName: 'Cave Rat' }
    case 'favor-tier-up':
      return { id, kind, tier: 4, tierName: 'Anointed' }
  }
}

// Sound-event categories — each event belongs to exactly one bucket.
// Group headings and intros replace the previous per-event descriptions;
// labels + tooltips carry any extra nuance. Keeps the tab scannable
// without burying a long single-column list of toggles.
const SOUND_EVENT_CATEGORIES: {
  id: string
  label: string
  intro: string
  kinds: SoundEventKind[]
}[] = [
  {
    id: 'combat',
    label: 'Combat',
    intro: 'Damage, healing, combat start, and defeat.',
    kinds: ['damage-taken', 'damage-dealt', 'heal-self', 'enter-fight', 'death'],
  },
  {
    id: 'progress',
    label: 'Progress',
    intro: 'Level-ups, loot pickups, and gold rewards.',
    kinds: ['level-up', 'loot', 'gold-windfall', 'gold-jackpot'],
  },
  {
    id: 'discovery',
    label: 'Discovery',
    intro: 'Firsts — new areas, mobs, items, and generation.',
    kinds: ['new-area', 'new-mob', 'new-item', 'generating-area'],
  },
  {
    id: 'system',
    label: 'System',
    intro: 'Confirmation tones outside the game loop.',
    kinds: ['llm-connected'],
  },
]

// Gameplay tab used to live here for tick-speed; the per-character control
// in the topbar now owns that, so Settings has nothing left in 'gameplay'.
type SettingsTab = 'about' | 'appearance' | 'effects' | 'sound' | 'llm' | 'data'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'about', label: 'About' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'effects', label: 'Effects' },
  { id: 'sound', label: 'Sound' },
  { id: 'llm', label: 'LLM' },
  { id: 'data', label: 'Data' },
]

// localStorage key for the last-active Settings tab. First-run fallback is
// the About tab — new users land on repo + dependency info before anything
// else. Subsequent visits restore the last-used tab.
const TAB_KEY = 'promptland.settings.tab'

function loadInitialTab(): SettingsTab {
  try {
    const raw = localStorage.getItem(TAB_KEY)
    if (!raw) return 'about'
    if (TABS.some((t) => t.id === raw)) return raw as SettingsTab
  } catch {
    // fall through to default on localStorage errors
  }
  return 'about'
}

function saveTab(tab: SettingsTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // localStorage unavailable — tab memory doesn't survive reload, but
    // the component still works.
  }
}

/** Renders the vite-injected build timestamp as "· 2026-04-24 UTC (3d ago)"
 *  for the About tab's version line. Same cadence ladder as the journal's
 *  relative time — d/h/m resolution is fine for a version stamp. */
function formatBuildTime(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  const y = parsed.getUTCFullYear()
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const d = String(parsed.getUTCDate()).padStart(2, '0')
  const date = `${y}-${m}-${d} UTC`
  const diffMs = Date.now() - parsed.getTime()
  const ago = (() => {
    if (diffMs < 60_000) return 'just now'
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
    const days = Math.floor(diffMs / 86_400_000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
  })()
  return ` · Released ${date} (${ago})`
}

export default function Settings({ onResetCharacters, onLlmConnected, characterCount, storage, onShowLanding }: Props) {
  const [tab, setTab] = useState<SettingsTab>(loadInitialTab)
  const [config, setConfig] = useState<LLMConfig>(() => loadLLMConfig())
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme())
  const [customTheme, setCustomThemeState] = useState<CustomTheme>(() => loadCustomTheme())
  const [scale, setScaleState] = useState<ScaleId>(() => loadScale())
  const [effects, setEffectsState] = useState<Effects>(() => loadEffects())
  const [sound, setSoundState] = useState<SoundSettings>(() => loadSoundSettings())
  const [soundTheme, setSoundThemeState] = useState<SoundThemeId>(() => loadSoundTheme())
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  // Tracks whether the user has clicked Test connection while the API
  // key was missing. Stays false during the form-filling phase so we
  // don't preemptively scold them.
  const [keyAttempted, setKeyAttempted] = useState(false)
  const [genOpen, setGenOpen] = useState(false)

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false)

  // Auto-open the Generation block once a connection test has succeeded so the
  // user lands directly on the integration tools they unlocked. Manual toggles
  // (open or close) after that take precedence — this only fires on transition.
  useEffect(() => {
    if (test.kind === 'ok') setGenOpen(true)
  }, [test.kind])

  const update = (patch: Partial<LLMConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setSaved(false)
    setTest({ kind: 'idle' })
    // Any field edit clears the missing-key warning. Re-typing a key,
    // pasting one, or flipping Local server on all dismiss it.
    setKeyAttempted(false)
  }

  const applyPreset = (presetId: string) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    update({
      baseUrl: preset.baseUrl,
      model: preset.defaultModel ?? config.model,
      // Hosted presets (apiKeyRequired) flip Local off; local/proxy
      // presets flip it on. The user can still override by toggling
      // afterwards — applyPreset only fires on preset click.
      local: !preset.apiKeyRequired,
    })
  }

  const pickTheme = (id: ThemeId) => {
    setThemeState(id)
    applyTheme(id)
    saveTheme(id)
  }

  // Update a single token on the custom theme. Writes live to state,
  // the DOM (via applyCustomThemeTokens), and localStorage so the change
  // is immediately visible, persists on reload, and doesn't need a
  // separate "save" button. Only has effect while the custom theme is
  // active — if the user picks another theme, the inline tokens get
  // cleared by applyTheme.
  const pickCustomColor = (key: keyof CustomTheme, value: string) => {
    const next: CustomTheme = { ...customTheme, [key]: value }
    setCustomThemeState(next)
    saveCustomTheme(next)
    if (theme === 'custom') applyCustomThemeTokens(next)
  }

  // Reset the custom palette to the shipping defaults in one click.
  // Matches the Effects tab's "Reset to defaults" pattern — a common
  // escape hatch when experimenting.
  const resetCustomTheme = () => {
    setCustomThemeState({ ...DEFAULT_CUSTOM_THEME })
    saveCustomTheme({ ...DEFAULT_CUSTOM_THEME })
    if (theme === 'custom') applyCustomThemeTokens({ ...DEFAULT_CUSTOM_THEME })
  }

  const pickScale = (id: ScaleId) => {
    setScaleState(id)
    applyScale(id)
    saveScale(id)
  }

  const commitEffects = (next: Effects) => {
    setEffectsState(next)
    applyEffects(next)
    saveEffects(next)
  }

  const toggleScanlines = () => {
    commitEffects({ ...effects, scanlines: !effects.scanlines })
  }

  const toggleLogNumbers = () => {
    commitEffects({ ...effects, logNumbers: !effects.logNumbers })
  }

  const toggleFullscreen = (key: keyof Effects['fullscreen']) => {
    commitEffects({
      ...effects,
      fullscreen: { ...effects.fullscreen, [key]: !effects.fullscreen[key] },
    })
  }

  const toggleViewport = (key: keyof Effects['viewport']) => {
    commitEffects({
      ...effects,
      viewport: { ...effects.viewport, [key]: !effects.viewport[key] },
    })
  }

  const toggleField = (key: 'hp' | 'magic' | 'xp' | 'gold') => {
    commitEffects({
      ...effects,
      fields: { ...effects.fields, [key]: !effects.fields[key] },
    })
  }

  const setFieldDuration = (durationMs: number) => {
    commitEffects({
      ...effects,
      fields: { ...effects.fields, durationMs },
    })
  }

  const toggleSheetNumbers = () => {
    commitEffects({ ...effects, sheetNumbers: !effects.sheetNumbers })
  }

  const commitSound = (next: SoundSettings) => {
    setSoundState(next)
    soundManager.configure(next)
    saveSoundSettings(next)
    // The first toggle of Settings is itself a user gesture, so this is a
    // convenient spot to guarantee the AudioContext is unlocked.
    soundManager.unlock()
  }

  const toggleSoundEnabled = () => {
    commitSound({ ...sound, enabled: !sound.enabled })
  }

  const setSoundVolume = (volume: number) => {
    // Always auto-unmute on volume drag — matches the topbar slider's
    // behavior so a single gesture brings audio back regardless of
    // which surface the player uses.
    commitSound({ ...sound, volume, muted: false })
    // Trailing-debounced preview so the user hears the new level
    // without the drag spamming chimes. Shared debounce on the
    // manager means the topbar slider and this one can't double-fire.
    soundManager.previewVolume(200)
  }

  const toggleSoundEvent = (kind: SoundEventKind) => {
    commitSound({ ...sound, events: { ...sound.events, [kind]: !sound.events[kind] } })
  }

  const pickSoundTheme = (id: SoundThemeId) => {
    setSoundThemeState(id)
    soundManager.setTheme(id)
    saveSoundTheme(id)
    // Play a preview so the user hears the new theme immediately.
    soundManager.unlock()
    soundManager.play({
      id: 'theme-preview',
      kind: 'level-up',
      record: { at: 0, from: 1, to: 2 },
      previousAt: 0,
      previousGold: 0,
    })
  }

  const handleSave = () => {
    saveLLMConfig(config)
    setSaved(true)
  }

  const handleResetAll = () => {
    if (characterCount === 0) return
    setConfirmReset(true)
  }

  const doResetAll = async () => {
    setConfirmReset(false)
    await onResetCharacters()
  }

  const doResetDefaults = () => {
    setConfirmResetDefaults(false)
    // Appearance.
    setThemeState(DEFAULT_THEME)
    applyTheme(DEFAULT_THEME)
    saveTheme(DEFAULT_THEME)
    setScaleState(DEFAULT_SCALE)
    applyScale(DEFAULT_SCALE)
    saveScale(DEFAULT_SCALE)
    // Effects (deep clone so downstream state diffs trip).
    const fresh: Effects = {
      scanlines: DEFAULT_EFFECTS.scanlines,
      logNumbers: DEFAULT_EFFECTS.logNumbers,
      fullscreen: { ...DEFAULT_EFFECTS.fullscreen },
      viewport: { ...DEFAULT_EFFECTS.viewport },
      fields: { ...DEFAULT_EFFECTS.fields },
      sheetNumbers: DEFAULT_EFFECTS.sheetNumbers,
    }
    setEffectsState(fresh)
    applyEffects(fresh)
    saveEffects(fresh)
    // Sound.
    const freshSound: SoundSettings = {
      ...DEFAULT_SOUND_SETTINGS,
      events: { ...DEFAULT_SOUND_SETTINGS.events },
    }
    setSoundState(freshSound)
    soundManager.configure(freshSound)
    saveSoundSettings(freshSound)
    // Sound theme.
    setSoundThemeState('retro')
    soundManager.setTheme('retro')
    saveSoundTheme('retro')
    // Tick speed: still reset the legacy localStorage default so old saves
    // without per-character `tickSpeed` fall back to a sane value.
    saveTickSpeed(DEFAULT_TICK_SPEED)
    // LLM config is intentionally NOT reset.
  }

  const handleTest = async () => {
    // Surface the missing-key hint only after the user has attempted a
    // test — keeps the warning quiet while they're still filling out the
    // form. Short-circuits before the network call: the missing key
    // would have produced a 401/auth error anyway, so we'd rather show
    // a precise local message.
    if (!config.local && config.apiKey.trim().length === 0) {
      setKeyAttempted(true)
      return
    }
    setTest({ kind: 'running' })
    try {
      const client = createLLMClient(config)
      const res = await client.complete({
        messages: [
          { role: 'system', content: 'Reply with exactly: ok' },
          { role: 'user', content: 'ping' },
        ],
        maxTokens: 8,
        temperature: 0,
      })
      setTest({ kind: 'ok', sample: res.content.trim().slice(0, 120) || '(empty)' })
      onLlmConnected?.()
      soundManager.play({ id: 'llm-connected', kind: 'llm-connected' })
    } catch (err) {
      const message =
        err instanceof LLMError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setTest({ kind: 'error', message })
    }
  }

  const apiKeyNeeded = !config.local
  const baseReady =
    config.baseUrl.trim().length > 0 && config.model.trim().length > 0

  // Test is allowed even with a missing key — the click is what flips
  // keyAttempted, which is what surfaces the missingKeyHint. Disabling
  // the button silently would leave the user staring at a non-clickable
  // control with no explanation.
  const canTest = baseReady && test.kind !== 'running'
  const missingKeyHint =
    keyAttempted && apiKeyNeeded && config.apiKey.trim().length === 0
      ? 'This provider needs an API key.'
      : null

  return (
    <div className="settings">
      <div className="settings__card">
        <header className="settings__header">
          <h1>Settings</h1>
        </header>

        <div className="settings__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'settings__tab' + (tab === t.id ? ' settings__tab--active' : '')}
              onClick={() => {
                setTab(t.id)
                saveTab(t.id)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings__body">
          {tab === 'about' && (
            <>
              <section className="settings__section settings__about">
                <h2>Promptland</h2>
                <p className="settings__about-pitch">
                  A browser-based game that plays itself. Pick a world, pick a
                  character, watch them live. The game is algorithm-driven;
                  the LLM names the items, mobs, rooms, and areas the world is
                  built from.
                </p>
                <dl className="settings__about-meta">
                  <dt>Version</dt>
                  <dd>
                    v{pkg.version}
                    <span className="settings__about-build">{formatBuildTime(__BUILD_TIME__)}</span>
                  </dd>
                  <dt>Repository</dt>
                  <dd>
                    <a
                      href="https://github.com/DFearing/promptland"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      github.com/DFearing/promptland
                    </a>
                  </dd>
                  <dt>License</dt>
                  <dd>
                    <a
                      href="https://github.com/DFearing/promptland/blob/main/LICENSE"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      See repository LICENSE
                    </a>
                  </dd>
                </dl>
                {onShowLanding && (
                  <div className="settings__about-landing">
                    <button
                      type="button"
                      className="settings__about-landing-btn"
                      onClick={onShowLanding}
                      data-tip="Re-open the first-run pitch"
                    >
                      Show landing again
                    </button>
                  </div>
                )}
              </section>

              <section className="settings__section settings__about-ai">
                <h2>AI &amp; content generation</h2>
                <p className="settings__about-pitch">
                  Promptland uses a language model — Bring Your Own Key — to
                  generate items, mobs, rooms, and whole areas as the world
                  expands. You supply an API key or point the LLM tab at a
                  local endpoint; the game makes the calls directly from your
                  browser.
                </p>
                <ul className="settings__about-ai-list">
                  <li>
                    <strong>Names and descriptions, not gameplay.</strong>
                    The core loop — combat math, drives, damage, loot rolls
                    — is algorithmic and deterministic. The model never
                    decides a hit, a heal, or a stat. It writes the sentences
                    around the numbers and names the things you fight and
                    loot.
                  </li>
                  <li>
                    <strong>Cached per entity.</strong> Generated text is
                    stored under the entity-cache pattern and reused on
                    repeat encounters. A given mob, item, or area is
                    written once; you won't see it re-roll next tick.
                  </li>
                  <li>
                    <strong>BYOK, client-side.</strong> Keys live in your
                    browser's <code className="settings__inline-code">localStorage</code>
                    and every LLM request goes from your browser directly
                    to your chosen provider. Nothing routes through a
                    Promptland server — there isn't one.
                  </li>
                  <li>
                    <strong>Model biases apply.</strong> Generated text
                    reflects the biases and quirks of whichever model
                    you point at it, and may occasionally produce
                    unexpected or off-key output. If a line reads
                    wrong, that's the model talking.
                  </li>
                </ul>
              </section>

              <section className="settings__section">
                <h2>Documentation</h2>
                <ul className="settings__about-links">
                  <li>
                    <a
                      href="https://github.com/DFearing/promptland/blob/main/docs/GAMEPLAY.md"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Gameplay — tick states, combat, drives, worlds
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://github.com/DFearing/promptland/blob/main/docs/ARCHITECTURE.md"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Architecture — code layout, storage, LLM pipeline
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://github.com/DFearing/promptland/blob/main/docs/LLM-SETUP.md"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LLM setup — BYOK provider walkthroughs
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://github.com/DFearing/promptland/blob/main/docs/STATUS.md"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Status — what's implemented, partial, or missing
                    </a>
                  </li>
                </ul>
              </section>

              <section className="settings__section">
                <h2>Runtime dependencies</h2>
                <p className="settings__about-intro">
                  Promptland is built on these open-source libraries. Each
                  ships under its own license — follow the links for the
                  authoritative text.
                </p>
                <ul className="settings__about-deps">
                  {(Object.entries(pkg.dependencies ?? {}) as Array<[string, string]>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, version]) => (
                      <li key={name}>
                        <a
                          href={`https://www.npmjs.com/package/${name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="settings__about-dep-name">{name}</span>
                          <span className="settings__about-dep-ver">{version}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </section>

              <section className="settings__section">
                <h2>Build dependencies</h2>
                <p className="settings__about-intro">
                  Used at build/dev time only — not shipped in the bundle you
                  run.
                </p>
                <ul className="settings__about-deps">
                  {(Object.entries(pkg.devDependencies ?? {}) as Array<[string, string]>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, version]) => (
                      <li key={name}>
                        <a
                          href={`https://www.npmjs.com/package/${name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="settings__about-dep-name">{name}</span>
                          <span className="settings__about-dep-ver">{version}</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </section>

              <section className="settings__section">
                <h2>Credits</h2>
                <p className="settings__about-intro">
                  Fonts loaded at runtime from Google Fonts — VT323, IBM Plex
                  Mono, JetBrains Mono — each under the SIL Open Font License.
                  Cascadia Mono self-hosted under the same license.
                </p>
              </section>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <section className="settings__section">
                <h2>Text size</h2>
                <div className="settings__scales">
                  {SCALES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={'settings__scale' + (scale === s.id ? ' settings__scale--active' : '')}
                      onClick={() => pickScale(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings__section">
                <h2>Display</h2>
                <div className="settings__fxgrid">
                  <ToggleRow
                    title="Scanlines"
                    desc="CRT line overlay across the whole interface."
                    on={effects.scanlines}
                    onClick={toggleScanlines}
                  />
                  <ToggleRow
                    title="Log numbers"
                    desc="Show exact HP / MP / XP amounts in the log instead of descriptive words."
                    on={effects.logNumbers}
                    onClick={toggleLogNumbers}
                  />
                  <ToggleRow
                    title="Sheet numbers"
                    desc='Show the "12 / 30", "8 / 12", "125 / 300" readouts next to the HP, MP, and XP bars on the sheet. Off leaves just the bars.'
                    on={effects.sheetNumbers}
                    onClick={toggleSheetNumbers}
                  />
                </div>
              </section>

              <section className="settings__section">
                <h2>Theme</h2>
                <div className="settings__themes">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={'settings__theme' + (theme === t.id ? ' settings__theme--active' : '')}
                      onClick={() => pickTheme(t.id)}
                      data-tip={t.description}
                    >
                      <span className="settings__theme-name">{t.name}</span>
                      <span className="settings__theme-desc">{t.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              {theme === 'custom' && (
                <section className="settings__section">
                  <div className="settings__group-head">
                    <h2>Custom palette</h2>
                    <button
                      type="button"
                      className="settings__reset-btn"
                      onClick={resetCustomTheme}
                      data-tip="Reset all eight tokens to the defaults"
                    >
                      Reset
                    </button>
                  </div>
                  <p className="settings__group-desc">
                    Eight colors drive the look — the others are synthesized
                    automatically. Changes apply live.
                  </p>
                  <div className="settings__color-grid">
                    {(
                      [
                        { key: 'bg0', label: 'Background', desc: 'Page base color.' },
                        { key: 'bg1', label: 'Panel', desc: 'Panel / card backgrounds.' },
                        { key: 'fg1', label: 'Text', desc: 'Primary text + stat values.' },
                        { key: 'accentHot', label: 'Accent', desc: 'Wordmark, highlights, hover.' },
                        { key: 'hp', label: 'HP', desc: 'Health bars + damage.' },
                        { key: 'mp', label: 'MP / Magic', desc: 'Magic bars + spell lines.' },
                        { key: 'good', label: 'Good', desc: 'Heal lines + confirmations.' },
                        { key: 'bad', label: 'Bad', desc: 'Death + error states.' },
                      ] as Array<{ key: keyof CustomTheme; label: string; desc: string }>
                    ).map((entry) => (
                      <label
                        key={entry.key}
                        className="settings__color-row"
                        data-tip={entry.desc}
                      >
                        <input
                          type="color"
                          className="settings__color-input"
                          value={customTheme[entry.key]}
                          onChange={(e) => pickCustomColor(entry.key, e.target.value)}
                          aria-label={entry.label}
                        />
                        <span className="settings__color-copy">
                          <span className="settings__color-label">{entry.label}</span>
                          <span className="settings__color-hex">
                            {customTheme[entry.key].toUpperCase()}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {tab === 'effects' && (
            <>
              {/* Full-screen group — collapsed by default. Summary shows the
                  master toggle; expand to see the per-effect grid. */}
              <details className="settings__group">
                <summary className="settings__group-summary">
                  <h2>Full-screen effects</h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effects.fullscreen.enabled}
                    className={'settings__toggle' + (effects.fullscreen.enabled ? ' settings__toggle--on' : '')}
                    onClick={(e) => {
                      // Prevent the click from also toggling <details> open.
                      e.preventDefault()
                      e.stopPropagation()
                      toggleFullscreen('enabled')
                    }}
                  >
                    {effects.fullscreen.enabled ? 'On' : 'Off'}
                  </button>
                </summary>
                <p className="settings__group-desc">
                  Overlay layer covering the whole app. Per-effect toggles are ignored when the group is off.
                </p>
                <div className={'settings__fxgrid' + (effects.fullscreen.enabled ? '' : ' settings__fxgrid--dim')}>
                  <ToggleRow
                    title="Damage"
                    desc="Red radial flash scaled by damage taken."
                    on={effects.fullscreen.damage}
                    onClick={() => toggleFullscreen('damage')}
                  />
                  <ToggleRow
                    title="Heal"
                    desc="Green radial flash scaled by HP restored."
                    on={effects.fullscreen.heal}
                    onClick={() => toggleFullscreen('heal')}
                  />
                  <ToggleRow
                    title="Level-up banner"
                    desc='"Level Up" banner and gold radial flash.'
                    on={effects.fullscreen.levelUpBanner}
                    onClick={() => toggleFullscreen('levelUpBanner')}
                  />
                  <ToggleRow
                    title="Defeat"
                    desc='Red vignette and "Defeated" banner on death.'
                    on={effects.fullscreen.death}
                    onClick={() => toggleFullscreen('death')}
                  />
                  <ToggleRow
                    title="New area banner"
                    desc="Banner announcing the area name on entry. Rare+ areas get a stronger variant."
                    on={effects.fullscreen.newArea}
                    onClick={() => toggleFullscreen('newArea')}
                  />
                </div>
              </details>

              <details className="settings__group">
                <summary className="settings__group-summary">
                  <h2>Canvas effects</h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effects.viewport.enabled}
                    className={'settings__toggle' + (effects.viewport.enabled ? ' settings__toggle--on' : '')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleViewport('enabled')
                    }}
                  >
                    {effects.viewport.enabled ? 'On' : 'Off'}
                  </button>
                </summary>
                <p className="settings__group-desc">
                  Effects rendered on the character viewport — the Pixi canvas
                  where the sprite is drawn. Per-effect toggles are ignored
                  when the group is off.
                </p>
                <div className={'settings__fxgrid' + (effects.viewport.enabled ? '' : ' settings__fxgrid--dim')}>
                  <ToggleRow
                    title="Damage shockwave"
                    desc="Ripple centered on the sprite, scaled by damage."
                    on={effects.viewport.damage}
                    onClick={() => toggleViewport('damage')}
                  />
                  <ToggleRow
                    title="Heal pulse"
                    desc="Green glow on the sprite, scaled by HP restored."
                    on={effects.viewport.heal}
                    onClick={() => toggleViewport('heal')}
                  />
                  <ToggleRow
                    title="Level-up glow"
                    desc="Gold glow pulse on the sprite."
                    on={effects.viewport.levelUp}
                    onClick={() => toggleViewport('levelUp')}
                  />
                  <ToggleRow
                    title="Defeat fade"
                    desc="Sprite dims and desaturates briefly on death."
                    on={effects.viewport.death}
                    onClick={() => toggleViewport('death')}
                  />
                  <ToggleRow
                    title="Combat tension"
                    desc="Chromatic aberration and CRT lines while fighting."
                    on={effects.viewport.fightAmbient}
                    onClick={() => toggleViewport('fightAmbient')}
                  />
                </div>
              </details>

              <details className="settings__group">
                <summary className="settings__group-summary">
                  <h2>Field indicators</h2>
                  <span className="settings__group-hint">Floating +N / −N</span>
                </summary>
                <div className="settings__fxgrid">
                  <ToggleRow
                    title="HP"
                    desc="Floating +N / −N on HP changes."
                    on={effects.fields.hp}
                    onClick={() => toggleField('hp')}
                  />
                  <ToggleRow
                    title="MP / Magic"
                    desc="Floating +N / −N on magic changes."
                    on={effects.fields.magic}
                    onClick={() => toggleField('magic')}
                  />
                  <ToggleRow
                    title="XP"
                    desc="Floating +N on XP gain (skipped on level-up)."
                    on={effects.fields.xp}
                    onClick={() => toggleField('xp')}
                  />
                  <ToggleRow
                    title="Gold"
                    desc="Floating +N / −N on gold changes."
                    on={effects.fields.gold}
                    onClick={() => toggleField('gold')}
                  />
                  <div className="settings__slider-row settings__slider-row--span">
                    <div className="settings__toggle-copy">
                      <span className="settings__toggle-title">Duration</span>
                      <span className="settings__toggle-desc">
                        How long each +N / −N stays on screen.
                      </span>
                    </div>
                    <div className="settings__slider-control">
                      <input
                        type="range"
                        min={FIELD_DURATION_MIN_MS}
                        max={FIELD_DURATION_MAX_MS}
                        step={FIELD_DURATION_STEP_MS}
                        value={effects.fields.durationMs}
                        onChange={(e) => setFieldDuration(Number(e.target.value))}
                        aria-label="Field indicator duration"
                        className="settings__slider"
                      />
                      <span className="settings__slider-val">
                        {(effects.fields.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              </details>

            </>
          )}

          {tab === 'sound' && (
            <div className="settings__sound">
              <section className="settings__section">
                <div className="settings__group-head">
                  <h2>Sound</h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sound.enabled}
                    className={'settings__toggle' + (sound.enabled ? ' settings__toggle--on' : '')}
                    onClick={toggleSoundEnabled}
                  >
                    {sound.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                <p className="settings__group-desc">
                  Procedural chiptune SFX synthesized in the browser — no asset files.
                  Per-event toggles are ignored when sound is off.
                </p>
              </section>

              <div
                aria-disabled={!sound.enabled}
                style={sound.enabled ? undefined : { opacity: 0.4, pointerEvents: 'none' }}
              >
              <section className="settings__section">
                <div className="settings__slider-row">
                  <div className="settings__toggle-copy">
                    <span className="settings__toggle-title">Volume</span>
                    <span className="settings__toggle-desc">
                      Master volume for every SFX voice.
                    </span>
                  </div>
                  <div className="settings__slider-control">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={sound.volume}
                      onChange={(e) => setSoundVolume(Number(e.target.value))}
                      aria-label="Sound volume"
                      className="settings__slider"
                    />
                    <span className="settings__slider-val">
                      {Math.round(sound.volume * 100)}%
                    </span>
                  </div>
                </div>
              </section>

              <section className="settings__section">
                <h2>Sound theme</h2>
                <p className="settings__group-desc">
                  Tone recipes used for every event. Selecting a theme plays a preview.
                </p>
                <div className="settings__sound-theme-grid">
                  {SOUND_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={'settings__theme' + (soundTheme === t.id ? ' settings__theme--active' : '')}
                      onClick={() => pickSoundTheme(t.id)}
                    >
                      <span className="settings__theme-name">{t.name}</span>
                      <span className="settings__theme-desc">{t.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings__section">
                <h2>Per-event toggles</h2>
                <div
                  className={
                    'settings__sound-categories' +
                    (sound.enabled ? '' : ' settings__sound-categories--dim')
                  }
                >
                  {SOUND_EVENT_CATEGORIES.map((cat) => (
                    <div key={cat.id} className="settings__sound-cat">
                      <div className="settings__sound-cat-head">
                        <h3 className="settings__sound-cat-title">{cat.label}</h3>
                        <span className="settings__sound-cat-intro">{cat.intro}</span>
                      </div>
                      <div className="settings__sound-cat-grid">
                        {cat.kinds.map((kind) => (
                          <div
                            key={kind}
                            className="settings__sound-cell"
                            data-tip={SOUND_EVENT_DESCS[kind]}
                          >
                            <span className="settings__sound-cell-label">
                              {SOUND_EVENT_LABELS[kind]}
                            </span>
                            <div className="settings__sound-cell-actions">
                              <button
                                type="button"
                                className="settings__play-btn"
                                disabled={!sound.enabled}
                                aria-label={`Preview ${SOUND_EVENT_LABELS[kind]}`}
                                onClick={() => {
                                  soundManager.unlock()
                                  soundManager.play(previewEvent(kind))
                                }}
                              >
                                {'▶'}
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={sound.events[kind]}
                                className={
                                  'settings__toggle settings__toggle--compact' +
                                  (sound.events[kind] ? ' settings__toggle--on' : '')
                                }
                                onClick={() => toggleSoundEvent(kind)}
                              >
                                {sound.events[kind] ? 'On' : 'Off'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              </div>
            </div>
          )}

          {tab === 'llm' && (
            <>
          <section className="settings__section">
            <h2>Provider</h2>
            <div className="settings__presets">
              {LLM_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="settings__preset"
                  onClick={() => applyPreset(p.id)}
                  data-tip={p.note}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>

          <section className="settings__section">
            <ToggleRow
              title="Local server"
              desc="Drops the API key requirement. Use for Ollama, LM Studio, llama.cpp, the Claude Code proxy, or any LAN endpoint."
              on={config.local}
              onClick={() => update({ local: !config.local })}
            />
          </section>

          <section className="settings__section settings__fields">
            <label className="settings__label">
              <span>Base URL</span>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => update({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>

            {!config.local && (
              <label className="settings__label">
                <span>API key</span>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  spellCheck={false}
                  autoComplete="off"
                />
                {missingKeyHint && (
                  <span className="settings__field-hint">{missingKeyHint}</span>
                )}
                <span className="settings__field-note">
                  Stored in this browser's localStorage and sent only to the
                  endpoint above.
                </span>
              </label>
            )}

            <label className="settings__label">
              <span>Model</span>
              <input
                type="text"
                value={config.model}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="gpt-4o-mini"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
          </section>

          <section className="settings__section">
            <div className="settings__actions">
              <button
                type="button"
                className="settings__btn"
                onClick={handleTest}
                disabled={!canTest}
              >
                {test.kind === 'running' ? (
                  <>
                    <span className="settings__spinner" aria-hidden="true" />
                    Testing…
                  </>
                ) : (
                  'Test connection'
                )}
              </button>
              <button type="button" className="settings__btn" onClick={handleSave}>
                {saved ? 'Saved' : 'Save settings'}
              </button>
            </div>

            {test.kind === 'ok' && (
              <p className="settings__result settings__result--ok">
                Connected. Model replied: <code>{test.sample}</code>
              </p>
            )}
            {test.kind === 'error' && (
              <p className="settings__result settings__result--err">
                {test.message}
              </p>
            )}
          </section>

          <details
            className="settings__group"
            open={genOpen}
            onToggle={(e) => setGenOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="settings__group-summary">
              <h2>Generation</h2>
              {test.kind !== 'ok' && (
                <span className="settings__group-hint">Test connection to unlock</span>
              )}
            </summary>
            {test.kind === 'ok' ? (
              <>
                <p className="settings__group-desc">
                  Run the items, mobs, areas, and rooms generation pipeline
                  end-to-end against your LLM and ComfyUI image bridge. Same
                  inputs hit the cache on a re-run — no second network call.
                </p>
                <GenerationPanel storage={storage} />
              </>
            ) : (
              <p className="settings__group-desc">
                Test your LLM connection above to unlock the generation
                pipeline (items, mobs, areas, rooms, and the image bridge).
              </p>
            )}
          </details>
            </>
          )}

          {tab === 'data' && (
            <>
              <section className="settings__section">
                <h2>Settings</h2>
                <div className="settings__danger">
                  <div className="settings__danger-copy">
                    <span className="settings__danger-title">Reset to defaults</span>
                    <span className="settings__danger-desc">
                      Restores theme, text size, and all effect toggles. Your LLM configuration and characters are kept.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings__btn"
                    onClick={() => setConfirmResetDefaults(true)}
                  >
                    Reset
                  </button>
                </div>
              </section>

              <section className="settings__section">
                <h2>Characters</h2>
                <div className="settings__danger">
                  <div className="settings__danger-copy">
                    <span className="settings__danger-title">Reset all characters</span>
                    <span className="settings__danger-desc">
                      {characterCount === 0
                        ? 'No one to delete.'
                        : `Forgets ${characterCount} character${characterCount === 1 ? '' : 's'} from this browser. Theme and model settings are kept.`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings__btn settings__btn--danger"
                    onClick={handleResetAll}
                    disabled={characterCount === 0}
                  >
                    Reset
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Delete all characters"
        body={
          <>
            All {characterCount} {characterCount === 1 ? 'character' : 'characters'} will be lost.
            Theme and model settings are kept. This cannot be undone.
          </>
        }
        confirmLabel="Delete all"
        tone="danger"
        onConfirm={doResetAll}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmResetDefaults}
        title="Reset settings to defaults"
        body={
          <>
            Theme, text size, and all effect toggles will return to their defaults.
            Your LLM configuration and characters are kept.
          </>
        }
        confirmLabel="Reset defaults"
        onConfirm={doResetDefaults}
        onCancel={() => setConfirmResetDefaults(false)}
      />

      <style>{`
        /* Anchor the card to the top of the viewport (not vertically
           centered) so switching tabs doesn't reposition the card when
           tabs have different content heights — only the bottom edge
           moves. The card still has a max-height equal to the viewport
           minus padding; oversized tabs scroll internally. */
        .settings { min-height: 100%; display: flex; align-items: flex-start; justify-content: center; padding: var(--sp-7) var(--sp-4); background: var(--bg-0); }
        .settings__card { width: 100%; max-width: 760px; max-height: calc(100vh - var(--sp-7) * 2); background: var(--bg-1); border: 1px solid var(--line-2); display: flex; flex-direction: column; }
        .settings__header { padding: var(--sp-5) var(--sp-6) var(--sp-3); border-bottom: 1px solid var(--line-1); }
        .settings__header h1 { margin: 0; font-family: var(--font-display); font-size: var(--text-3xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .settings__tabs { display: flex; padding: 0 var(--sp-4); background: var(--bg-0); border-bottom: 1px solid var(--line-2); flex-shrink: 0; }
        .settings__tab { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; padding: 6px var(--sp-3); color: var(--fg-3); background: transparent; border: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); margin-right: -1px; margin-bottom: -1px; cursor: pointer; transition: color var(--dur-fast) var(--ease-crt); }
        .settings__tab:hover { color: var(--fg-1); }
        .settings__tab--active { color: var(--accent-hot); background: var(--bg-1); border-bottom-color: var(--bg-1); text-shadow: var(--glow-sm); z-index: 1; position: relative; }
        .settings__body { padding: var(--sp-5) var(--sp-6) var(--sp-6); overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-4); min-height: 0; }
        .settings__section { display: flex; flex-direction: column; gap: var(--sp-2); }
        .settings__fxgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-2); }
        .settings__fxgrid--dim { opacity: 0.45; }
        .settings__fxgrid .settings__toggle-row,
        .settings__fxgrid .settings__slider-row { padding: var(--sp-2) var(--sp-3); }
        .settings__fxgrid .settings__toggle-title { font-size: var(--text-md); }
        .settings__fxgrid .settings__toggle-desc { font-size: var(--text-sm); line-height: 1.7; }
        .settings__group-head { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); }
        .settings__group-head h2 { margin: 0; border-bottom: none; padding-bottom: 0; flex: 1; }
        /* Descriptive paragraphs across Settings: matched to the About tab's
           pitch styling — body font, sm, fg-2, line-height 1.7, no italics. */
        .settings__group-desc { margin: 0 0 var(--sp-2); font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); line-height: 1.7; }

        /* Collapsible effect groups — <details> + <summary>. Keeps the tab
           short by default; user expands only the group they want to tune. */
        .settings__group { border: 1px solid var(--line-1); background: var(--bg-inset); }
        .settings__group + .settings__group { margin-top: 0; }
        .settings__group > :not(summary) { padding: 0 var(--sp-3) var(--sp-3); }
        .settings__group-summary {
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-2) var(--sp-3);
          cursor: pointer;
          user-select: none;
          position: relative;
          padding-left: var(--sp-6);
        }
        .settings__group-summary::-webkit-details-marker { display: none; }
        .settings__group-summary::before {
          content: '▸';
          position: absolute;
          left: var(--sp-2);
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          transition: transform var(--dur-fast) var(--ease-crt);
        }
        .settings__group[open] > .settings__group-summary::before { transform: rotate(90deg); }
        .settings__group-summary h2 {
          margin: 0;
          border: none;
          padding: 0;
          flex: 1;
          /* Match the plain section heading — the base h2 is display-font
             and 36px which was blowing out the summary row. */
          font-family: var(--font-display);
          font-size: var(--text-lg);
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-2);
          text-shadow: none;
        }
        .settings__group-summary:hover h2 { color: var(--accent-hot); }
        .settings__group-hint { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-3); letter-spacing: 0.06em; }
        .settings__slider-row--span { grid-column: 1 / -1; }
        .settings__section h2 { margin: 0 0 var(--sp-1); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-2); text-shadow: none; border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-1); }

        .settings__themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--sp-2); }
        .settings__sound-themes { padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); display: flex; flex-direction: column; gap: var(--sp-2); }
        .settings__sound-theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--sp-1); }
        .settings__theme { padding: var(--sp-2) var(--sp-3); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; font: inherit; text-align: left; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .settings__theme:hover { background: var(--bg-2); border-color: var(--line-3); }
        .settings__theme--active { background: var(--bg-3); border-color: var(--line-3); }
        .settings__theme-name { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .settings__theme-desc { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); line-height: 1.7; }

        .settings__toggle-row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); }
        .settings__toggle-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .settings__toggle-title { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-1); }
        .settings__toggle-desc { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); line-height: 1.7; }
        .settings__toggle { padding: 4px var(--sp-3); min-width: 56px; background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-3); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .settings__toggle:hover { background: var(--bg-2); border-color: var(--line-3); }
        .settings__toggle--on { background: var(--bg-3); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .settings__toggle-actions { display: flex; align-items: center; gap: var(--sp-3); flex-shrink: 0; }
        .settings__play-btn { padding: 2px 6px; background: transparent; border: 1px solid var(--line-1); color: var(--fg-3); cursor: pointer; font-family: var(--font-mono); font-size: var(--text-sm); line-height: normal; transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt); }
        .settings__play-btn:hover:not(:disabled) { color: var(--accent-hot); border-color: var(--line-3); text-shadow: var(--glow-sm); }
        .settings__play-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .settings__slider-row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); }
        .settings__slider-control { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
        .settings__slider { -webkit-appearance: none; appearance: none; width: 160px; height: 4px; background: var(--bg-3); border: 1px solid var(--line-2); outline: none; cursor: pointer; }
        .settings__slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: var(--accent-hot); border: 1px solid var(--line-3); box-shadow: var(--glow-sm); cursor: pointer; }
        .settings__slider::-moz-range-thumb { width: 14px; height: 14px; background: var(--accent-hot); border: 1px solid var(--line-3); box-shadow: var(--glow-sm); cursor: pointer; border-radius: 0; }
        .settings__slider:focus-visible { border-color: var(--line-3); }
        .settings__slider-val { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--accent-hot); text-shadow: var(--glow-sm); font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }

        .settings__scales { display: inline-flex; border: 1px solid var(--line-2); align-self: flex-start; }
        .settings__scale { padding: 6px var(--sp-4); background: transparent; color: var(--fg-2); border: none; border-right: 1px solid var(--line-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; transition: color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .settings__scale:last-child { border-right: none; }
        .settings__scale:hover { color: var(--accent-hot); background: var(--bg-2); text-shadow: var(--glow-sm); }
        .settings__scale--active { background: var(--bg-3); color: var(--accent-hot); text-shadow: var(--glow-sm); }

        .settings__presets { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
        .settings__preset { padding: 4px var(--sp-3); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.08em; text-transform: uppercase; transition: border-color var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt); }
        .settings__preset:hover { border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-sm); }

        .settings__fields { gap: var(--sp-3); }
        .settings__label { display: flex; flex-direction: column; gap: 4px; }
        /* Form labels: dropped the uppercase + letter-spaced + display-font
           treatment so labels read like sentence-case prose, not control
           panel rocker switches. The display-uppercase look is reserved for
           h2 section headers; field labels are body-text. */
        .settings__label span { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); font-weight: 500; }
        .settings__label input,
        .settings__label select { padding: var(--sp-2) var(--sp-3); font-family: var(--font-mono); font-size: var(--text-sm); background: var(--bg-inset); color: var(--fg-1); border: 1px solid var(--line-1); border-radius: 4px; box-shadow: var(--shadow-inset); outline: none; }
        .settings__label input:focus,
        .settings__label select:focus { border-color: var(--accent); box-shadow: var(--shadow-inset), 0 0 0 2px rgba(123, 255, 136, 0.15); }
        .settings__label select { appearance: none; padding-right: calc(var(--sp-3) + 18px); background-image: linear-gradient(45deg, transparent 50%, var(--fg-2) 50%), linear-gradient(135deg, var(--fg-2) 50%, transparent 50%); background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; cursor: pointer; }
        .settings__label select:hover { border-color: var(--line-2); }
        .settings__label select option { background: var(--bg-0); color: var(--fg-1); }
        /* Inline field-level hint — sits directly under the input it
           refers to. Warn-colored so it reads as a heads-up, not an error,
           and uses the body font so it doesn't compete with the uppercase
           field label above. Selector specificity outranks
           .settings__label span so it's not pulled back into the label
           styling. */
        .settings__label .settings__field-hint {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--warn);
          line-height: 1.6;
          letter-spacing: 0;
          text-transform: none;
          margin-top: 4px;
        }
        /* Informational sibling to settings__field-hint — used for the
           privacy note under the API key field (and any other muted
           assurance text). Same selector specificity trick as
           settings__field-hint so the .settings__label span styling
           doesn't pull it into uppercase display-font. */
        .settings__label .settings__field-note {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          color: var(--fg-3);
          line-height: 1.6;
          letter-spacing: 0;
          text-transform: none;
          margin-top: 2px;
        }

        .settings__prompt { border: 1px solid var(--line-1); background: var(--bg-inset); padding: var(--sp-2) var(--sp-3); margin-top: var(--sp-2); }
        .settings__prompt > summary { cursor: pointer; font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); list-style: none; padding: 4px 0; }
        .settings__prompt > summary::-webkit-details-marker { display: none; }
        .settings__prompt > summary::before { content: '▸ '; color: var(--fg-3); }
        .settings__prompt[open] > summary::before { content: '▾ '; }
        .settings__prompt-body { display: flex; flex-direction: column; gap: var(--sp-2); padding-top: var(--sp-2); }
        .settings__prompt-editor { padding: var(--sp-2) var(--sp-3); font-family: var(--font-mono); font-size: var(--text-sm); background: var(--bg-0); color: var(--fg-1); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); outline: none; resize: vertical; min-height: 160px; line-height: 1.4; }
        .settings__prompt-editor:focus { border-color: var(--line-3); }
        .settings__prompt-preview { display: flex; flex-direction: column; gap: 4px; }
        .settings__prompt-preview-label { font-family: var(--font-display); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-3); }
        .settings__prompt-preview pre { margin: 0; padding: var(--sp-2) var(--sp-3); background: var(--bg-0); border: 1px solid var(--line-1); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-2); white-space: pre-wrap; word-break: break-word; }

        .settings__actions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
        /* Modernized button: body font sentence-case, rounded corners, no
           uppercase/letter-spacing display-font shouty look. The primary
           variant gets the accent fill so the visual hierarchy is carried
           by color, not by all-caps. */
        .settings__btn { padding: 6px var(--sp-3); background: var(--bg-1); border: 1px solid var(--line-2); border-radius: 4px; color: var(--fg-1); cursor: pointer; font-family: var(--font-body); font-size: var(--text-sm); font-weight: 500; transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt), color var(--dur-fast) var(--ease-crt); }
        .settings__btn:hover:not(:disabled) { background: var(--bg-2); border-color: var(--accent); color: var(--accent-hot); }
        .settings__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .settings__btn--primary { background: var(--accent); border-color: var(--accent); color: var(--bg-0); font-weight: 600; }
        .settings__btn--primary:hover:not(:disabled) { background: var(--accent-hot); border-color: var(--accent-hot); color: var(--bg-0); }
        .settings__btn--danger { background: transparent; border-color: var(--bad); color: var(--bad); }
        .settings__btn--danger:hover:not(:disabled) { background: var(--bad); border-color: var(--bad); color: var(--bg-0); }
        /* Inline spinner inside the Test connection button — small ring
           that rotates while the request is in flight. Kept proportional
           to the button text (1em) so it scales with text-size settings. */
        .settings__spinner {
          display: inline-block;
          width: 0.9em;
          height: 0.9em;
          margin-right: var(--sp-1);
          border: 2px solid var(--line-2);
          border-top-color: var(--accent-hot);
          border-radius: 50%;
          vertical-align: -2px;
          animation: settings-spin 0.8s linear infinite;
        }
        @keyframes settings-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .settings__spinner { animation: none; border-top-color: var(--accent); }
        }

        .settings__danger { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); }
        .settings__danger-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .settings__danger-title { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-1); }
        .settings__danger-desc { font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); line-height: 1.7; }

        .settings__result { margin: var(--sp-1) 0 0; font-family: var(--font-body); font-size: var(--text-sm); padding: var(--sp-2) var(--sp-3); border-style: solid; border-width: 1px; word-break: break-word; }
        .settings__result--ok { background: var(--bg-2); border-color: var(--good); color: var(--good); }
        .settings__result--err { background: var(--bg-2); border-color: var(--bad); color: var(--bad); }
        .settings__result code { background: var(--bg-inset); padding: 1px 4px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-1); }
        .settings__note { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-2); line-height: 1.7; }

        /* About tab — repo + deps + credits. Read-heavy, no controls, so
           leans on body font with comfortable line-height. Dep list is a
           two-column grid with monospaced versions right-aligned so it
           scans like a lockfile summary. */
        .settings__about-pitch {
          margin: 0;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.7;
          color: var(--fg-2);
        }
        .settings__about-intro {
          margin: 0;
          font-family: var(--font-body);
          font-size: var(--text-xs);
          line-height: 1.7;
          color: var(--fg-3);
        }
        .settings__about-meta {
          display: grid;
          grid-template-columns: max-content 1fr;
          gap: var(--sp-1) var(--sp-3);
          margin: 0;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
        }
        .settings__about-meta dt {
          color: var(--fg-3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: var(--text-xs);
          align-self: center;
        }
        .settings__about-meta dd {
          margin: 0;
          color: var(--fg-1);
        }
        .settings__about-build {
          color: var(--fg-3);
          font-size: var(--text-xs);
          margin-left: var(--sp-1);
        }
        .settings__about-meta a,
        .settings__about-links a,
        .settings__about-deps a {
          color: var(--accent-hot);
          text-decoration: none;
          border-bottom: 1px dotted var(--line-2);
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt);
        }
        .settings__about-meta a:hover,
        .settings__about-links a:hover,
        .settings__about-deps a:hover {
          color: var(--accent);
          border-bottom-color: var(--accent);
          text-shadow: var(--glow-sm);
        }
        .settings__about-links {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          font-family: var(--font-body);
          font-size: var(--text-sm);
        }
        .settings__about-deps {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--sp-1) var(--sp-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .settings__about-deps li { min-width: 0; }
        .settings__about-deps a {
          display: flex;
          justify-content: space-between;
          gap: var(--sp-2);
          padding: 2px 0;
          border-bottom: none;
        }
        .settings__about-deps a:hover { border-bottom: none; }
        .settings__about-dep-name { color: var(--fg-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .settings__about-deps a:hover .settings__about-dep-name { color: var(--accent); }
        .settings__about-dep-ver { color: var(--fg-3); font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .settings__inline-code { background: var(--bg-inset); padding: 1px 4px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-1); margin: 0 2px; }

        /* AI disclosure — disclosure bullets inside the About tab. Leans on
           the same body-font rhythm as the pitch paragraph but with a
           dimmer bullet hairline so the list reads as supporting copy,
           not a feature checklist. */
        .settings__about-ai-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.7;
          color: var(--fg-2);
        }
        .settings__about-ai-list li {
          padding-left: var(--sp-3);
          border-left: 1px solid var(--line-1);
        }
        .settings__about-ai-list strong {
          color: var(--fg-1);
          font-weight: 400;
          text-shadow: var(--glow-sm);
        }
        .settings__about-landing {
          margin-top: var(--sp-1);
        }
        .settings__about-landing-btn {
          padding: 4px var(--sp-2);
          background: transparent;
          color: var(--fg-3);
          border: 1px solid var(--line-2);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt);
        }
        .settings__about-landing-btn:hover {
          color: var(--accent-hot);
          border-color: var(--line-3);
          text-shadow: var(--glow-sm);
        }

        /* One-column fallback on narrow viewports — deps list doesn't
           truncate usefully below ~400px. */
        @media (max-width: 520px) {
          .settings__about-deps { grid-template-columns: 1fr; }
        }

        /* Custom-palette editor — two-column grid of color swatches
           paired with a label + live hex readout. The color input is
           sized to read as a big sample swatch; browser chrome around
           the native picker varies by platform but the overall layout
           stays legible. */
        .settings__color-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: var(--sp-2);
        }
        .settings__color-row {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
          cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease-crt);
        }
        .settings__color-row:hover { border-color: var(--line-3); }
        .settings__color-input {
          width: 36px;
          height: 36px;
          padding: 0;
          border: 1px solid var(--line-2);
          background: transparent;
          cursor: pointer;
          flex-shrink: 0;
        }
        .settings__color-input::-webkit-color-swatch-wrapper { padding: 0; }
        .settings__color-input::-webkit-color-swatch { border: none; }
        .settings__color-copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .settings__color-label {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          color: var(--fg-1);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .settings__color-hex {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-variant-numeric: tabular-nums;
        }
        .settings__reset-btn {
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px var(--sp-2);
          background: transparent;
          color: var(--fg-3);
          border: 1px solid var(--line-2);
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt);
        }
        .settings__reset-btn:hover {
          color: var(--warn);
          border-color: var(--warn);
        }

        /* Sound tab — bucketed per-event toggles. Category sections
           group the 14 events into Combat / Progress / Discovery /
           System so the tab reads like a mixer instead of a flat list.
           Inter-section gap is larger (sp-7) than the rest of Settings
           to make the category breaks obvious; within a category we use
           a 2-column responsive grid so the rows stay dense without
           stretching full-width like descriptive toggle cards. */
        .settings__sound {
          display: flex;
          flex-direction: column;
          gap: var(--sp-7);
        }
        .settings__sound .settings__section { gap: var(--sp-3); }
        .settings__sound-categories {
          display: flex;
          flex-direction: column;
          gap: var(--sp-6);
        }
        .settings__sound-categories--dim { opacity: 0.45; }
        .settings__sound-cat {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }
        .settings__sound-cat-head {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-bottom: var(--sp-1);
          border-bottom: 1px dashed var(--line-1);
        }
        .settings__sound-cat-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: var(--text-md);
          font-weight: 400;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .settings__sound-cat-intro {
          font-family: var(--font-body);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-style: italic;
        }
        .settings__sound-cat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: var(--sp-2);
        }
        .settings__sound-cell {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
          cursor: default;
        }
        .settings__sound-cell-label {
          flex: 1;
          min-width: 0;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--fg-1);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .settings__sound-cell-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          flex-shrink: 0;
        }
        /* Compact variant of the toggle used inside sound cells so the
           On/Off pill doesn't dominate the row. Min-width drops so a
           one-line cell reads as a single band. */
        .settings__toggle--compact {
          padding: 2px var(--sp-2);
          min-width: 44px;
          font-size: var(--text-sm);
          letter-spacing: 0.06em;
        }
        @media (max-width: 520px) {
          .settings__sound-cat-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
