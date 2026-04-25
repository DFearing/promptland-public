import { useState } from 'react'
import { AREA_KINDS, type AreaKind } from '../areas'
import {
  KEYLESS_HOSTS,
  LLMError,
  LLM_PRESETS,
  areaFlavorTemplate,
  createLLMClient,
  generate,
  itemFlavorTemplate,
  loadLLMConfig,
  loreSnippetTemplate,
  mobFlavorTemplate,
  roomFlavorTemplate,
  saveLLMConfig,
  type GenerateResult,
  type LLMConfig,
  type TemplateId,
} from '../llm'
import type { EffectEvent } from '../effects'
import type { Storage } from '../storage'
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_EVENT_DESCS,
  SOUND_EVENT_KINDS,
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
import { getWorldContent, getWorldManifest } from '../worlds'
import {
  DEFAULT_EFFECTS,
  DEFAULT_SCALE,
  DEFAULT_THEME,
  DEFAULT_TICK_SPEED,
  FIELD_DURATION_MAX_MS,
  FIELD_DURATION_MIN_MS,
  FIELD_DURATION_STEP_MS,
  SCALES,
  THEMES,
  applyEffects,
  applyScale,
  applyTheme,
  loadEffects,
  loadScale,
  loadTheme,
  saveEffects,
  saveScale,
  saveTheme,
  saveTickSpeed,
  type Effects,
  type ScaleId,
  type ThemeId,
} from '../themes'
import ConfirmDialog from './ConfirmDialog'

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; sample: string }
  | { kind: 'error'; message: string }

type GenResult =
  | { shape: 'named'; template: TemplateId; name: string; description: string }
  | { shape: 'area'; template: TemplateId; name: string; description: string; theme: string }
  | { shape: 'lore'; template: TemplateId; text: string; topics: string[] }

type GenState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; result: GenResult; cached: boolean; hash: string }
  | { kind: 'error'; message: string }

const TEMPLATE_OPTIONS: { id: TemplateId; label: string; defaultHint: string }[] = [
  { id: 'itemFlavor', label: 'Item flavor', defaultHint: 'something a tavern rat would drop' },
  { id: 'mobFlavor', label: 'Mob flavor', defaultHint: 'a scruffy cave rat' },
  { id: 'areaFlavor', label: 'Area flavor', defaultHint: 'a forgotten crypt below the tavern' },
  { id: 'roomFlavor', label: 'Room flavor', defaultHint: 'a narrow passage stained with lichen' },
  { id: 'loreSnippet', label: 'Lore snippet', defaultHint: 'the fall of the Thornfall dynasty' },
]

interface Props {
  onResetCharacters: () => Promise<void> | void
  onLlmConnected?: () => void
  characterCount: number
  storage: Storage
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

// Which providers require an API key? Prefer the preset table when the base URL
// matches one; otherwise assume any non-localhost endpoint needs a key so users
// don't fire doomed requests against OpenAI/Anthropic/etc. with a blank key.
function needsApiKey(baseUrl: string): boolean {
  const trimmed = baseUrl.trim()
  if (!trimmed) return false
  const preset = LLM_PRESETS.find((p) => p.baseUrl === trimmed)
  if (preset) return preset.apiKeyRequired
  try {
    const host = new URL(trimmed).hostname
    return !KEYLESS_HOSTS.includes(host)
  } catch {
    return false
  }
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
      return { id, kind }
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
  }
}

// Gameplay tab used to live here for tick-speed; the per-character control
// in the topbar now owns that, so Settings has nothing left in 'gameplay'.
type SettingsTab = 'appearance' | 'effects' | 'sound' | 'llm' | 'data'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'effects', label: 'Effects' },
  { id: 'sound', label: 'Sound' },
  { id: 'llm', label: 'LLM' },
  { id: 'data', label: 'Data' },
]

export default function Settings({ onResetCharacters, onLlmConnected, characterCount, storage }: Props) {
  const [tab, setTab] = useState<SettingsTab>('appearance')
  const [config, setConfig] = useState<LLMConfig>(() => loadLLMConfig())
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme())
  const [scale, setScaleState] = useState<ScaleId>(() => loadScale())
  const [effects, setEffectsState] = useState<Effects>(() => loadEffects())
  const [sound, setSoundState] = useState<SoundSettings>(() => loadSoundSettings())
  const [soundTheme, setSoundThemeState] = useState<SoundThemeId>(() => loadSoundTheme())
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [gen, setGen] = useState<GenState>({ kind: 'idle' })
  const [genTemplate, setGenTemplate] = useState<TemplateId>('itemFlavor')
  const [genHint, setGenHint] = useState<string>(TEMPLATE_OPTIONS[0].defaultHint)
  const [genRarity, setGenRarity] = useState<string>('none')
  const [genAreaKind, setGenAreaKind] = useState<AreaKind>('dungeon')

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false)

  const update = (patch: Partial<LLMConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setSaved(false)
    setTest({ kind: 'idle' })
    setGen({ kind: 'idle' })
  }

  const applyPreset = (presetId: string) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    update({
      baseUrl: preset.baseUrl,
      model: preset.defaultModel ?? config.model,
    })
  }

  const pickTheme = (id: ThemeId) => {
    setThemeState(id)
    applyTheme(id)
    saveTheme(id)
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
    commitSound({ ...sound, volume })
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

  const handleGenerate = async () => {
    setGen({ kind: 'running' })
    try {
      const manifest = getWorldManifest('fantasy')
      if (!manifest) throw new Error('Fantasy world manifest not found.')
      const content = getWorldContent('fantasy')
      if (!content) throw new Error('Fantasy world content not found.')
      const client = createLLMClient(config)
      const ctx = { llm: client, cache: storage.entities }
      const opts = { manifestVersion: manifest.version, maxTokens: 200 }
      const hint = genHint.trim() || TEMPLATE_OPTIONS.find((o) => o.id === genTemplate)!.defaultHint
      const concepts = {
        allowedConcepts: manifest.allowedConcepts,
        forbiddenConcepts: manifest.forbiddenConcepts,
      }

      let result: GenResult
      let cached = false
      let hash = ''

      const rarity = genRarity === 'none' ? undefined : genRarity

      if (genTemplate === 'itemFlavor') {
        const r = await generate(
          itemFlavorTemplate,
          {
            worldId: manifest.id,
            archetypeKind: 'junk',
            archetypeHint: hint,
            rarity,
            ...concepts,
          },
          content.context,
          ctx,
          opts,
        )
        result = { shape: 'named', template: 'itemFlavor', ...r.payload }
        cached = r.cached
        hash = r.hash
      } else if (genTemplate === 'mobFlavor') {
        const r = await generate(
          mobFlavorTemplate,
          { worldId: manifest.id, archetypeHint: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        result = { shape: 'named', template: 'mobFlavor', ...r.payload }
        cached = r.cached
        hash = r.hash
      } else if (genTemplate === 'areaFlavor') {
        const r = await generate(
          areaFlavorTemplate,
          { worldId: manifest.id, areaKind: genAreaKind, areaHint: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        result = { shape: 'area', template: 'areaFlavor', ...r.payload }
        cached = r.cached
        hash = r.hash
      } else if (genTemplate === 'roomFlavor') {
        const r = await generate(
          roomFlavorTemplate,
          {
            worldId: manifest.id,
            areaName: 'Crypt of Thorns',
            areaTheme: 'moldering crypt',
            roomType: 'corridor',
            roomHint: hint,
            rarity,
            ...concepts,
          },
          content.context,
          ctx,
          opts,
        )
        result = { shape: 'named', template: 'roomFlavor', ...r.payload }
        cached = r.cached
        hash = r.hash
      } else {
        const r: GenerateResult<{ text: string; topics: string[] }> = await generate(
          loreSnippetTemplate,
          { worldId: manifest.id, topic: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        result = { shape: 'lore', template: 'loreSnippet', ...r.payload }
        cached = r.cached
        hash = r.hash
      }

      setGen({ kind: 'ok', result, cached, hash })
    } catch (err) {
      const message =
        err instanceof LLMError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setGen({ kind: 'error', message })
    }
  }

  const pickTemplate = (id: TemplateId) => {
    setGenTemplate(id)
    setGenHint(TEMPLATE_OPTIONS.find((o) => o.id === id)?.defaultHint ?? '')
    setGen({ kind: 'idle' })
  }

  const apiKeyNeeded = needsApiKey(config.baseUrl)
  const apiKeyOk = !apiKeyNeeded || config.apiKey.trim().length > 0
  const baseReady =
    config.baseUrl.trim().length > 0 && config.model.trim().length > 0 && apiKeyOk

  const canTest = baseReady && test.kind !== 'running'
  const canGenerate = baseReady && gen.kind !== 'running'
  const missingKeyHint =
    apiKeyNeeded && config.apiKey.trim().length === 0
      ? 'This provider needs an API key. Paste one above to enable.'
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
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings__body">
          {tab === 'appearance' && (
            <>
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
            </>
          )}

          {tab === 'effects' && (
            <>
              <section className="settings__section">
                <h2>Display</h2>
                <div className="settings__fxgrid">
                  <ToggleRow
                    title="Scanlines"
                    desc="CRT line overlay on the map and log."
                    on={effects.scanlines}
                    onClick={toggleScanlines}
                  />
                  <ToggleRow
                    title="Log numbers"
                    desc="Show exact HP / MP / XP amounts in the log instead of descriptive words."
                    on={effects.logNumbers}
                    onClick={toggleLogNumbers}
                  />
                </div>
              </section>

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
                    title="Level-up confetti"
                    desc="Themed confetti bursts on level-up."
                    on={effects.fullscreen.levelUpConfetti}
                    onClick={() => toggleFullscreen('levelUpConfetti')}
                  />
                  <ToggleRow
                    title="Defeat"
                    desc='Red vignette and "Defeated" banner on death.'
                    on={effects.fullscreen.death}
                    onClick={() => toggleFullscreen('death')}
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
                  Pixi canvas under the sprite. Per-effect toggles are ignored when the group is off.
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
            <>
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
                <div className={'settings__fxgrid' + (sound.enabled ? '' : ' settings__fxgrid--dim')}>
                  {SOUND_EVENT_KINDS.map((kind) => (
                    <div key={kind} className="settings__toggle-row">
                      <div className="settings__toggle-copy">
                        <span className="settings__toggle-title">{SOUND_EVENT_LABELS[kind]}</span>
                        <span className="settings__toggle-desc">{SOUND_EVENT_DESCS[kind]}</span>
                      </div>
                      <div className="settings__toggle-actions">
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
                          className={'settings__toggle' + (sound.events[kind] ? ' settings__toggle--on' : '')}
                          onClick={() => toggleSoundEvent(kind)}
                        >
                          {sound.events[kind] ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              </div>
            </>
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

            <label className="settings__label">
              <span>API key</span>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-... (leave blank for local servers)"
                spellCheck={false}
                autoComplete="off"
              />
            </label>

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
                {test.kind === 'running' ? 'Testing…' : 'Test connection'}
              </button>
              <button type="button" className="settings__btn settings__btn--primary" onClick={handleSave}>
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
            {missingKeyHint && test.kind === 'idle' && (
              <p className="settings__result">{missingKeyHint}</p>
            )}
          </section>

          <section className="settings__section">
            <h2>Try generation</h2>
            <p className="settings__note">
              Runs a template end-to-end. Same inputs → cache hit (no network). Change the hint
              to force a new cache miss. Watch the hash to see the key change.
            </p>
            <label className="settings__label">
              <span>Template</span>
              <select
                value={genTemplate}
                onChange={(e) => pickTemplate(e.target.value as TemplateId)}
              >
                {TEMPLATE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings__label">
              <span>Hint</span>
              <input
                type="text"
                value={genHint}
                onChange={(e) => setGenHint(e.target.value)}
                placeholder={
                  TEMPLATE_OPTIONS.find((o) => o.id === genTemplate)?.defaultHint ?? ''
                }
                spellCheck={false}
              />
            </label>

            <label className="settings__label">
              <span>Rarity</span>
              <select value={genRarity} onChange={(e) => setGenRarity(e.target.value)}>
                <option value="none">none (no rarity passed)</option>
                <option value="common">common</option>
                <option value="uncommon">uncommon</option>
                <option value="rare">rare</option>
                <option value="epic">epic</option>
                <option value="legendary">legendary</option>
              </select>
            </label>

            {genTemplate === 'areaFlavor' && (
              <label className="settings__label">
                <span>Area kind</span>
                <select
                  value={genAreaKind}
                  onChange={(e) => setGenAreaKind(e.target.value as AreaKind)}
                >
                  {AREA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="settings__actions">
              <button
                type="button"
                className="settings__btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {gen.kind === 'running' ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {gen.kind === 'ok' && (
              <p className="settings__result settings__result--ok">
                <strong>{gen.cached ? 'Cache hit' : 'Generated'}</strong> ({gen.result.template}):
                {' '}
                {gen.result.shape === 'named' && (
                  <>
                    <code>{gen.result.name}</code> — {gen.result.description}
                  </>
                )}
                {gen.result.shape === 'area' && (
                  <>
                    <code>{gen.result.name}</code> — {gen.result.description}
                    <br />
                    <small>theme: <code>{gen.result.theme}</code></small>
                  </>
                )}
                {gen.result.shape === 'lore' && (
                  <>
                    {gen.result.text}
                    <br />
                    <small>topics: <code>{gen.result.topics.join(', ')}</code></small>
                  </>
                )}
                <br />
                <small>hash: <code>{gen.hash.slice(0, 28)}…</code></small>
              </p>
            )}
            {gen.kind === 'error' && (
              <p className="settings__result settings__result--err">{gen.message}</p>
            )}
            {missingKeyHint && gen.kind === 'idle' && (
              <p className="settings__result">{missingKeyHint}</p>
            )}
          </section>

          <p className="settings__note">
            Your API key is stored in this browser's localStorage and is never sent anywhere except directly to the endpoint you configure.
          </p>
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
        .settings { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--sp-7) var(--sp-4); background: var(--bg-0); }
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
        .settings__fxgrid .settings__toggle-title { font-size: var(--text-sm); }
        .settings__fxgrid .settings__toggle-desc { font-size: var(--text-xs); }
        .settings__group-head { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); }
        .settings__group-head h2 { margin: 0; border-bottom: none; padding-bottom: 0; flex: 1; }
        .settings__group-desc { margin: 0 0 var(--sp-2); font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); font-style: italic; }

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
        .settings__theme-desc { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); }

        .settings__toggle-row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); }
        .settings__toggle-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .settings__toggle-title { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-1); }
        .settings__toggle-desc { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); }
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
        .settings__label span { font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); }
        .settings__label input,
        .settings__label select { padding: var(--sp-2) var(--sp-3); font-family: var(--font-mono); font-size: var(--text-sm); background: var(--bg-inset); color: var(--fg-1); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); outline: none; }
        .settings__label input:focus,
        .settings__label select:focus { border-color: var(--line-3); }
        .settings__label select { appearance: none; padding-right: calc(var(--sp-3) + 18px); background-image: linear-gradient(45deg, transparent 50%, var(--fg-2) 50%), linear-gradient(135deg, var(--fg-2) 50%, transparent 50%); background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; cursor: pointer; }
        .settings__label select:hover { border-color: var(--line-2); }
        .settings__label select option { background: var(--bg-0); color: var(--fg-1); }

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
        .settings__btn { padding: 6px var(--sp-4); background: var(--bg-1); border: 1px solid var(--line-2); color: var(--fg-1); cursor: pointer; font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: var(--glow-sm); transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .settings__btn:hover:not(:disabled) { background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
        .settings__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .settings__btn--primary { background: var(--bg-2); border-color: var(--line-3); color: var(--accent-hot); text-shadow: var(--glow-md); }
        .settings__btn--danger { border-color: var(--bad); color: var(--bad); text-shadow: none; }
        .settings__btn--danger:hover:not(:disabled) { background: var(--bg-2); border-color: var(--bad); color: var(--bad); text-shadow: var(--glow-sm); }

        .settings__danger { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-inset); border: 1px solid var(--line-1); }
        .settings__danger-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .settings__danger-title { font-family: var(--font-display); font-size: var(--text-md); letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-1); }
        .settings__danger-desc { font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); }

        .settings__result { margin: var(--sp-1) 0 0; font-family: var(--font-body); font-size: var(--text-sm); padding: var(--sp-2) var(--sp-3); border-style: solid; border-width: 1px; word-break: break-word; }
        .settings__result--ok { background: var(--bg-2); border-color: var(--good); color: var(--good); }
        .settings__result--err { background: var(--bg-2); border-color: var(--bad); color: var(--bad); }
        .settings__result code { background: var(--bg-inset); padding: 1px 4px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-1); }
        .settings__note { margin: 0; font-family: var(--font-body); font-size: var(--text-xs); color: var(--fg-3); font-style: italic; line-height: 1.6; }
      `}</style>
    </div>
  )
}
