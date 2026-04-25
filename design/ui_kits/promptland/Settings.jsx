/* Settings — BYOK LLM config with provider presets. */

const PRESETS = [
  { k: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { k: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5' },
  { k: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4-5' },
  { k: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { k: 'custom', name: 'Custom', baseUrl: '', model: '' },
];

const Settings = ({ onBack }) => {
  const [preset, setPreset] = React.useState('openai');
  const [baseUrl, setBaseUrl] = React.useState(PRESETS[0].baseUrl);
  const [model, setModel] = React.useState(PRESETS[0].model);
  const [apiKey, setApiKey] = React.useState('');
  const [persist, setPersist] = React.useState(true);
  const [stream, setStream] = React.useState(true);
  const [verbose, setVerbose] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const pickPreset = k => {
    setPreset(k);
    const p = PRESETS.find(p => p.k === k);
    if (p && k !== 'custom') {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div style={{ padding: '40px 60px', maxWidth: 760, margin: '0 auto', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--accent-hot)', textShadow: 'var(--glow-sm)' }}>Settings</h2>
        <Button variant="ghost" onClick={onBack}>← Back to game</Button>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-3)', fontStyle: 'italic', marginBottom: 26 }}>
        Promptland does not ship a model. You bring your own. Your key is stored locally in this browser.
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)', marginBottom: 10, borderBottom: '1px solid var(--line-1)', paddingBottom: 4 }}>
        Provider
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
        {PRESETS.map(p => (
          <button key={p.k} onClick={() => pickPreset(p.k)} style={{
            background: preset === p.k ? 'var(--bg-3)' : 'var(--bg-1)',
            border: '1px solid ' + (preset === p.k ? 'var(--line-3)' : 'var(--line-2)'),
            color: preset === p.k ? 'var(--accent-hot)' : 'var(--fg-1)',
            padding: '10px 8px', cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase',
            textShadow: preset === p.k ? 'var(--glow-sm)' : 'none',
          }}>{p.name}</button>
        ))}
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)', marginBottom: 10, borderBottom: '1px solid var(--line-1)', paddingBottom: 4 }}>
        Model
      </div>
      <Field label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://…" />
      <Field label="Model name" value={model} onChange={setModel} placeholder="e.g. gpt-4o-mini" />
      <Field label="API key" value={apiKey} onChange={setApiKey} type="password" placeholder="sk-…" />

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)', margin: '18px 0 10px', borderBottom: '1px solid var(--line-1)', paddingBottom: 4 }}>
        Options
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-1)' }}>
        <Check label="Persist locally (store key in this browser only)" checked={persist} onChange={setPersist} />
        <Check label="Stream tokens as they generate" checked={stream} onChange={setStream} />
        <Check label="Verbose log (show prompts, timings)" checked={verbose} onChange={setVerbose} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 26 }}>
        <Button variant="primary" onClick={save}>Save settings</Button>
        {saved && <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--good)', fontStyle: 'italic' }}>Settings saved.</span>}
      </div>
    </div>
  );
};

const Check = ({ label, checked, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => onChange(!checked)}>
    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{checked ? '[x]' : '[ ]'}</span>
    <span>{label}</span>
  </label>
);

Object.assign(window, { Settings });
