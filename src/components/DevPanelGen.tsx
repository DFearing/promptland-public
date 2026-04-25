import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_BASE_URL,
  HttpImageGenClient,
  ImageGenError,
  createSpriteCache,
  spriteCacheKey,
  type HealthInfo,
  type SpriteCache,
  type SpriteRecord,
} from '../gen'

// Flux Schnell is trained at 64-pixel increments. Offer a handful of values
// that keep the latent small on a 10 GB GPU — 512 is the PoC default.
const SIZE_OPTIONS = [256, 384, 512, 768] as const
type SizeOption = (typeof SIZE_OPTIONS)[number]

const PROMPT_KEY = 'promptland.devPanel.gen.prompt'
const BASE_URL_KEY = 'promptland.devPanel.gen.baseUrl'
const SIZE_KEY = 'promptland.devPanel.gen.size'

type Status =
  | { kind: 'idle' }
  | { kind: 'generating'; startedAt: number }
  | { kind: 'done'; result: SpriteRecord; fromCache: boolean }
  | { kind: 'error'; message: string }

function readLocal(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

export default function DevPanelGen() {
  const [prompt, setPrompt] = useState(() =>
    readLocal(PROMPT_KEY, 'a small knight with a red cape, white background'),
  )
  const [baseUrl, setBaseUrl] = useState(() => readLocal(BASE_URL_KEY, DEFAULT_BASE_URL))
  const [size, setSize] = useState<SizeOption>(() => {
    const raw = Number(readLocal(SIZE_KEY, String(512)))
    return (SIZE_OPTIONS as readonly number[]).includes(raw)
      ? (raw as SizeOption)
      : 512
  })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [health, setHealth] = useState<HealthInfo | null>(null)
  const [history, setHistory] = useState<SpriteRecord[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const cacheRef = useRef<SpriteCache | null>(null)
  const clientRef = useRef<HttpImageGenClient | null>(null)

  // One cache instance per mount; reusing a Dexie handle across renders is
  // fine since Dexie serializes transactions internally.
  if (cacheRef.current === null) {
    cacheRef.current = createSpriteCache()
  }

  // Recreate the HTTP client whenever the base URL changes so a user edit in
  // Settings takes effect on the next Generate click without a panel reopen.
  useEffect(() => {
    try {
      clientRef.current = new HttpImageGenClient(baseUrl)
    } catch {
      clientRef.current = null
    }
  }, [baseUrl])

  // Revoke blob object URLs when they're swapped out. Without this the
  // browser holds the Blob alive forever; long sessions leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    let cancelled = false
    const cache = cacheRef.current
    if (!cache) return
    cache
      .list()
      .then((records) => {
        if (cancelled) return
        setHistory(records.slice(0, 12))
      })
      .catch(() => {
        // Non-fatal: just show an empty history on read failure.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const client = clientRef.current
    if (!client) {
      setHealth(null)
      return
    }
    client
      .health()
      .then((info) => {
        if (!cancelled) setHealth(info)
      })
      .catch(() => {
        if (!cancelled) setHealth(null)
      })
    return () => {
      cancelled = true
    }
  }, [baseUrl])

  const onPromptChange = (value: string) => {
    setPrompt(value)
    writeLocal(PROMPT_KEY, value)
  }
  const onBaseUrlChange = (value: string) => {
    setBaseUrl(value)
    writeLocal(BASE_URL_KEY, value)
  }
  const onSizeChange = (value: SizeOption) => {
    setSize(value)
    writeLocal(SIZE_KEY, String(value))
  }

  const showResult = (record: SpriteRecord, fromCache: boolean) => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(record.blob)
    })
    setStatus({ kind: 'done', result: record, fromCache })
  }

  const generate = async () => {
    const cache = cacheRef.current
    const client = clientRef.current
    if (!cache || !client) {
      setStatus({ kind: 'error', message: 'Client not initialized (check base URL).' })
      return
    }
    const trimmed = prompt.trim()
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Prompt is empty.' })
      return
    }

    // Deterministic on (prompt, size) — omitting seed means the bridge rolls
    // one, so we cache the rolled seed alongside the blob. A second identical
    // click hits the cache instead of the bridge.
    const key = spriteCacheKey({ prompt: trimmed, width: size, height: size })
    const cached = await cache.get(key)
    if (cached) {
      showResult(cached, true)
      return
    }

    setStatus({ kind: 'generating', startedAt: Date.now() })
    try {
      const response = await client.generate({
        prompt: trimmed,
        width: size,
        height: size,
      })
      const record: SpriteRecord = {
        hash: key,
        prompt: trimmed,
        blob: response.blob,
        width: size,
        height: size,
        seed: response.seed,
        elapsedMs: response.elapsedMs,
        createdAt: Date.now(),
      }
      await cache.put(record)
      setHistory((prev) => [record, ...prev.filter((r) => r.hash !== key)].slice(0, 12))
      showResult(record, false)
    } catch (err) {
      const message =
        err instanceof ImageGenError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setStatus({ kind: 'error', message })
    }
  }

  const loadFromHistory = (record: SpriteRecord) => {
    showResult(record, true)
    setPrompt(record.prompt)
    writeLocal(PROMPT_KEY, record.prompt)
  }

  const clearHistory = async () => {
    const cache = cacheRef.current
    if (!cache) return
    await cache.clear()
    setHistory([])
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setStatus({ kind: 'idle' })
  }

  const generating = status.kind === 'generating'

  // Keep elapsed time in state and mutate it from inside the interval —
  // reading Date.now() during render is banned as impure, and React's new
  // lint also disallows synchronous setState in an effect body. The interval
  // callback is async, so writing state there is fine.
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (status.kind !== 'generating') return
    const startedAt = status.startedAt
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)
    return () => window.clearInterval(id)
  }, [status])

  return (
    <div className="dev__gen">
      <label className="dev__gen-row">
        <span className="dev__row-label">Prompt</span>
        <textarea
          className="dev__gen-prompt"
          value={prompt}
          rows={3}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="a small knight with a red cape, white background"
          disabled={generating}
        />
      </label>

      <div className="dev__gen-row dev__gen-row--inline">
        <span className="dev__row-label">Size</span>
        <select
          className="dev__select"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value) as SizeOption)}
          disabled={generating}
        >
          {SIZE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}×{v}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dev__btn dev__btn--compact"
          disabled={generating || !prompt.trim()}
          onClick={generate}
        >
          {generating ? `Generating… ${Math.floor(elapsedMs / 1000)}s` : 'Generate'}
        </button>
      </div>

      <label className="dev__gen-row dev__gen-row--inline">
        <span className="dev__row-label">Bridge</span>
        <input
          type="text"
          className="dev__gen-input"
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          disabled={generating}
          spellCheck={false}
        />
      </label>

      <div className="dev__gen-health">
        {health
          ? health.upstream.ok
            ? `✓ ComfyUI @ ${health.upstream.url} — lora=${health.models.lora}`
            : `✗ Bridge reachable, ComfyUI not: ${health.upstream.error ?? 'unknown'}`
          : '✗ Bridge unreachable'}
      </div>

      {status.kind === 'error' && (
        <div className="dev__gen-error">{status.message}</div>
      )}

      {previewUrl && (
        <div className="dev__gen-preview-wrap">
          <img src={previewUrl} alt={prompt} className="dev__gen-preview" />
          {status.kind === 'done' && (
            <div className="dev__gen-meta">
              {status.fromCache
                ? `cached · seed ${status.result.seed}`
                : `seed ${status.result.seed} · ${(status.result.elapsedMs / 1000).toFixed(1)}s`}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="dev__gen-history">
          <div className="dev__row-label dev__gen-history-label">Recent</div>
          <div className="dev__gen-history-grid">
            {history.map((record) => (
              <HistoryThumb
                key={record.hash}
                record={record}
                onClick={() => loadFromHistory(record)}
              />
            ))}
          </div>
          <button
            type="button"
            className="dev__btn dev__btn--compact dev__btn--danger"
            onClick={clearHistory}
          >
            Clear history
          </button>
        </div>
      )}

      <style>{`
        .dev__gen { display: flex; flex-direction: column; gap: var(--sp-2); }
        .dev__gen-row { display: flex; flex-direction: column; gap: 2px; }
        .dev__gen-row--inline { flex-direction: row; align-items: center; gap: var(--sp-2); }
        .dev__gen-row--inline > .dev__row-label { flex-shrink: 0; }
        .dev__gen-prompt {
          background: var(--bg-inset);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          padding: 4px var(--sp-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          outline: none;
          resize: vertical;
          min-height: 48px;
        }
        .dev__gen-prompt:focus { border-color: var(--line-3); }
        .dev__gen-input {
          flex: 1;
          min-width: 0;
          background: var(--bg-inset);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          padding: 3px var(--sp-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          outline: none;
        }
        .dev__gen-input:focus { border-color: var(--line-3); }
        .dev__gen-health {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          padding: 2px var(--sp-1);
          border: 1px dashed var(--line-1);
          word-break: break-all;
        }
        .dev__gen-error {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--bad);
          padding: 4px var(--sp-1);
          border: 1px solid var(--bad);
          text-shadow: var(--glow-sm);
          word-break: break-word;
        }
        .dev__gen-preview-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: var(--sp-1);
          background: var(--bg-0);
          border: 1px solid var(--line-2);
        }
        .dev__gen-preview {
          max-width: 100%;
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
        }
        .dev__gen-meta {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-variant-numeric: tabular-nums;
        }
        .dev__gen-history { display: flex; flex-direction: column; gap: 4px; }
        .dev__gen-history-label { padding-top: var(--sp-1); }
        .dev__gen-history-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
        }
      `}</style>
    </div>
  )
}

interface HistoryThumbProps {
  record: SpriteRecord
  onClick: () => void
}

// Tiny self-contained thumb component so each row manages its own object URL
// lifecycle. The parent's previewUrl only reflects the currently displayed
// sprite; thumbs each need a separate URL that lives as long as they're
// mounted.
function HistoryThumb({ record, onClick }: HistoryThumbProps) {
  // Lazy-init the URL so it's computed once without a setState-in-effect. The
  // parent keys thumbs on record.hash, so a different record remounts this
  // component rather than mutating the blob on an existing instance.
  const [url] = useState(() => URL.createObjectURL(record.blob))
  useEffect(() => {
    return () => URL.revokeObjectURL(url)
  }, [url])
  return (
    <button
      type="button"
      className="dev__gen-thumb"
      onClick={onClick}
      title={record.prompt}
    >
      <img src={url} alt={record.prompt} />
      <style>{`
        .dev__gen-thumb {
          padding: 0;
          background: var(--bg-inset);
          border: 1px solid var(--line-2);
          cursor: pointer;
          aspect-ratio: 1 / 1;
          display: grid;
          place-items: stretch;
        }
        .dev__gen-thumb:hover { border-color: var(--line-3); }
        .dev__gen-thumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
        }
      `}</style>
    </button>
  )
}
