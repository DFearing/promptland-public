import { useState } from 'react'
import {
  LLMError,
  LLM_PRESETS,
  OpenAICompatClient,
  loadLLMConfig,
  saveLLMConfig,
  type LLMConfig,
} from '../llm'
import {
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

interface Props {
  onResetCharacters: () => Promise<void> | void
  characterCount: number
}

export default function Settings({ onResetCharacters, characterCount }: Props) {
  const [config, setConfig] = useState<LLMConfig>(() => loadLLMConfig())
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme())
  const [scale, setScaleState] = useState<ScaleId>(() => loadScale())
  const [effects, setEffectsState] = useState<Effects>(() => loadEffects())
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [confirmReset, setConfirmReset] = useState(false)

  const update = (patch: Partial<LLMConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setSaved(false)
    setTest({ kind: 'idle' })
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

  const toggleEffect = (key: keyof Effects) => {
    const next = { ...effects, [key]: !effects[key] }
    setEffectsState(next)
    applyEffects(next)
    saveEffects(next)
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

  const handleTest = async () => {
    setTest({ kind: 'running' })
    try {
      const client = new OpenAICompatClient(config)
      const res = await client.complete({
        messages: [
          { role: 'system', content: 'Reply with exactly: ok' },
          { role: 'user', content: 'ping' },
        ],
        maxTokens: 8,
        temperature: 0,
      })
      setTest({ kind: 'ok', sample: res.content.trim().slice(0, 120) || '(empty)' })
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

  const canTest =
    config.baseUrl.trim().length > 0 &&
    config.model.trim().length > 0 &&
    test.kind !== 'running'

  return (
    <div className="settings">
      <div className="settings__card">
        <header className="settings__header">
          <h1>Settings</h1>
        </header>

        <div className="settings__body">
          <section className="settings__section">
            <h2>Theme</h2>
            <div className="settings__themes">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'settings__theme' + (theme === t.id ? ' settings__theme--active' : '')}
                  onClick={() => pickTheme(t.id)}
                  title={t.description}
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

          <section className="settings__section">
            <h2>Effects</h2>
            {(
              [
                {
                  key: 'scanlines',
                  title: 'Scanlines',
                  desc: 'CRT line overlay on the map and log.',
                },
                {
                  key: 'flashes',
                  title: 'Screen flashes',
                  desc: 'Full-screen color pulses and banners on big moments.',
                },
                {
                  key: 'confetti',
                  title: 'Confetti bursts',
                  desc: 'Particle bursts on level-ups and rare loot.',
                },
                {
                  key: 'viewportFilters',
                  title: 'Viewport shaders',
                  desc: 'Shockwave, glow, and desaturation on the character panel.',
                },
                {
                  key: 'fieldIndicators',
                  title: 'Field indicators',
                  desc: 'Floating +N / −N deltas next to HP, MP, XP, and gold.',
                },
              ] as const
            ).map(({ key, title, desc }) => (
              <div key={key} className="settings__toggle-row">
                <div className="settings__toggle-copy">
                  <span className="settings__toggle-title">{title}</span>
                  <span className="settings__toggle-desc">{desc}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={effects[key]}
                  className={
                    'settings__toggle' +
                    (effects[key] ? ' settings__toggle--on' : '')
                  }
                  onClick={() => toggleEffect(key)}
                >
                  {effects[key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </section>

          <section className="settings__section">
            <h2>Provider</h2>
            <div className="settings__presets">
              {LLM_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="settings__preset"
                  onClick={() => applyPreset(p.id)}
                  title={p.note}
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
          </section>

          <p className="settings__note">
            Your API key is stored in this browser's localStorage and is never sent anywhere except directly to the endpoint you configure.
          </p>

          <section className="settings__section">
            <h2>Data</h2>
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

      <style>{`
        .settings { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: var(--sp-7) var(--sp-4); background: var(--bg-0); }
        .settings__card { width: 100%; max-width: 640px; background: var(--bg-1); border: 1px solid var(--line-2); display: flex; flex-direction: column; }
        .settings__header { padding: var(--sp-5) var(--sp-6) var(--sp-3); border-bottom: 1px solid var(--line-1); }
        .settings__header h1 { margin: 0; font-family: var(--font-display); font-size: var(--text-3xl); color: var(--accent-hot); text-shadow: var(--glow-sm); letter-spacing: 0.02em; }
        .settings__body { padding: var(--sp-5) var(--sp-6) var(--sp-6); overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-5); }
        .settings__section { display: flex; flex-direction: column; gap: var(--sp-2); }
        .settings__section h2 { margin: 0 0 var(--sp-1); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-2); text-shadow: none; border-bottom: 1px solid var(--line-1); padding-bottom: var(--sp-1); }

        .settings__themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--sp-2); }
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
        .settings__label input { padding: var(--sp-2) var(--sp-3); font-family: var(--font-mono); font-size: var(--text-sm); background: var(--bg-inset); color: var(--fg-1); border: 1px solid var(--line-1); box-shadow: var(--shadow-inset); outline: none; }
        .settings__label input:focus { border-color: var(--line-3); }

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
