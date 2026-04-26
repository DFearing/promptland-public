import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AREA_KINDS, type AreaKind } from '../areas'
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
import { RARITIES, type Rarity } from '../items/rarity'
import {
  LLMError,
  areaFlavorTemplate,
  createLLMClient,
  generate,
  itemFlavorTemplate,
  loadLLMConfig,
  loreSnippetTemplate,
  mobFlavorTemplate,
  roomFlavorTemplate,
  type TemplateId,
} from '../llm'
import {
  MATERIALS,
  PORTRAIT_SLOTS,
  SLOT_FORMS,
  SLOT_MATERIALS,
  TONES,
  compileSpritePrompt,
  descriptorKey,
  resolveDescriptor,
  resolveFiltersForItem,
  type ElementKey,
  type Material,
  type PortraitSlot,
  type SpriteDescriptor,
  type Tone,
  getOrGenerate,
  lookupCached,
} from '../portrait'
import type { Storage } from '../storage'
import { getWorldContent, getWorldManifest } from '../worlds'

// Flux Schnell is trained at 64-pixel increments. Offer a handful of values
// that keep the latent small on a 10 GB GPU — 512 is the PoC default.
const SIZE_OPTIONS = [256, 384, 512, 768] as const
type SizeOption = (typeof SIZE_OPTIONS)[number]

const PROMPT_KEY = 'promptland.devPanel.gen.prompt'
const BASE_URL_KEY = 'promptland.devPanel.gen.baseUrl'
const SIZE_KEY = 'promptland.devPanel.gen.size'
const OPEN_KEY = 'promptland.devPanel.gen.open'

// Cap the response log so a long session doesn't grow unbounded. 30 entries
// is enough to see the last few minutes of bridge traffic during integration
// testing without blowing up the panel height.
const MAX_LOG = 30

// Element vocabulary the filter resolver understands. Mirrors `ElementKey`
// from `portrait/filters.ts`; kept here as a const tuple for the dropdown.
const ELEMENT_OPTIONS: readonly ElementKey[] = [
  'fire',
  'frost',
  'shock',
  'shadow',
  'arcane',
  'holy',
] as const

// LLM generation templates available for testing. Mirror what Settings →
// Generation exposes — each entry covers one of the curated codepaths an
// integration tester would want to fire from the dev panel. The `*Flavor`
// template ids mirror the type names in src/llm/templates.ts; user-visible
// labels describe the entity instead.
const TEMPLATE_OPTIONS: { id: TemplateId; label: string; defaultHint: string }[] = [
  { id: 'itemFlavor', label: 'Item', defaultHint: 'something a tavern rat would drop' },
  { id: 'mobFlavor', label: 'Mob', defaultHint: 'a scruffy cave rat' },
  { id: 'areaFlavor', label: 'Area', defaultHint: 'a forgotten crypt below the tavern' },
  { id: 'roomFlavor', label: 'Room', defaultHint: 'a narrow passage stained with lichen' },
  { id: 'loreSnippet', label: 'Lore snippet', defaultHint: 'the fall of the Thornfall dynasty' },
]

type SectionId = 'bridge' | 'descriptor' | 'item' | 'filter' | 'llm'

type LogStatus = 'started' | 'ok' | 'cache-hit' | 'error'

type LogEntry = {
  id: number
  ts: number
  source: SectionId
  status: LogStatus
  label: string
  detail?: string
}

type FreeformStatus =
  | { kind: 'idle' }
  | { kind: 'generating'; startedAt: number }
  | { kind: 'done'; result: SpriteRecord; fromCache: boolean }
  | { kind: 'error'; message: string }

type DescriptorStatus =
  | { kind: 'idle' }
  | { kind: 'generating'; startedAt: number; key: string }
  | { kind: 'done'; result: SpriteRecord; fromCache: boolean; key: string }
  | { kind: 'error'; message: string; key: string }

type LlmFlavorStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; payload: unknown; cached: boolean; hash: string }
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

// Pull the "rarity" picker value from a string-typed select. 'none' encodes
// "leave rarity unset" so the LLM template falls through to its default.
function rarityFromOption(value: string): Rarity | undefined {
  return value === 'none' ? undefined : (value as Rarity)
}

// Default form for a slot — first entry in SLOT_FORMS. Used when the user
// changes the slot and the previous form is no longer valid for the new
// slot's vocabulary.
function defaultFormForSlot(slot: PortraitSlot): string {
  return SLOT_FORMS[slot][0]
}

// Default material for a slot — first allowed material from SLOT_MATERIALS.
// Same reasoning as defaultFormForSlot: keep the descriptor self-consistent
// after a slot change.
function defaultMaterialForSlot(slot: PortraitSlot): Material {
  return SLOT_MATERIALS[slot][0]
}

interface SectionOpenState {
  bridge: boolean
  descriptor: boolean
  item: boolean
  filter: boolean
  llm: boolean
}

const DEFAULT_OPEN: SectionOpenState = {
  bridge: true,
  descriptor: false,
  item: false,
  filter: false,
  llm: false,
}

function loadOpenState(): SectionOpenState {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    if (!raw) return DEFAULT_OPEN
    const parsed = JSON.parse(raw) as Partial<SectionOpenState>
    return {
      bridge: parsed.bridge ?? DEFAULT_OPEN.bridge,
      descriptor: parsed.descriptor ?? DEFAULT_OPEN.descriptor,
      item: parsed.item ?? DEFAULT_OPEN.item,
      filter: parsed.filter ?? DEFAULT_OPEN.filter,
      llm: parsed.llm ?? DEFAULT_OPEN.llm,
    }
  } catch {
    return DEFAULT_OPEN
  }
}

interface Props {
  storage: Storage
}

export default function GenerationPanel({ storage }: Props) {
  // ── Shared bridge plumbing ──────────────────────────────────────────────
  // One bridge URL drives both the freeform section and the portrait
  // pipeline section, so flipping between them tests the same endpoint.
  // The shared cache + client refs are recreated on URL change.
  const [baseUrl, setBaseUrl] = useState(() => readLocal(BASE_URL_KEY, DEFAULT_BASE_URL))
  const [health, setHealth] = useState<HealthInfo | null>(null)

  const cacheRef = useRef<SpriteCache | null>(null)
  const clientRef = useRef<HttpImageGenClient | null>(null)

  if (cacheRef.current === null) {
    cacheRef.current = createSpriteCache()
  }

  useEffect(() => {
    try {
      clientRef.current = new HttpImageGenClient(baseUrl)
    } catch {
      clientRef.current = null
    }
  }, [baseUrl])

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

  // ── Response log ─────────────────────────────────────────────────────────
  const [log, setLog] = useState<LogEntry[]>([])
  const logIdRef = useRef(0)
  const pushLog = useCallback(
    (entry: Omit<LogEntry, 'id' | 'ts'>) => {
      logIdRef.current += 1
      const next: LogEntry = { ...entry, id: logIdRef.current, ts: Date.now() }
      setLog((prev) => [next, ...prev].slice(0, MAX_LOG))
    },
    [],
  )
  const clearLog = useCallback(() => setLog([]), [])

  // ── Section open state ──────────────────────────────────────────────────
  const [open, setOpen] = useState<SectionOpenState>(loadOpenState)
  const toggle = useCallback((id: SectionId) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeLocal(OPEN_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // ── Bridge / freeform section state ─────────────────────────────────────
  const [prompt, setPrompt] = useState(() =>
    readLocal(PROMPT_KEY, 'a small knight with a red cape, white background'),
  )
  const [size, setSize] = useState<SizeOption>(() => {
    const raw = Number(readLocal(SIZE_KEY, String(512)))
    return (SIZE_OPTIONS as readonly number[]).includes(raw) ? (raw as SizeOption) : 512
  })
  const [freeStatus, setFreeStatus] = useState<FreeformStatus>({ kind: 'idle' })
  const [history, setHistory] = useState<SpriteRecord[]>([])
  const [freePreview, setFreePreview] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (freePreview) URL.revokeObjectURL(freePreview)
    }
  }, [freePreview])

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

  const [freeElapsed, setFreeElapsed] = useState(0)
  useEffect(() => {
    if (freeStatus.kind !== 'generating') return
    const startedAt = freeStatus.startedAt
    const id = window.setInterval(() => {
      setFreeElapsed(Date.now() - startedAt)
    }, 250)
    return () => window.clearInterval(id)
  }, [freeStatus])

  const showFreeResult = (record: SpriteRecord, fromCache: boolean) => {
    setFreePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(record.blob)
    })
    setFreeStatus({ kind: 'done', result: record, fromCache })
  }

  const generateFreeform = async () => {
    const cache = cacheRef.current
    const client = clientRef.current
    if (!cache || !client) {
      setFreeStatus({ kind: 'error', message: 'Client not initialized (check base URL).' })
      return
    }
    const trimmed = prompt.trim()
    if (!trimmed) {
      setFreeStatus({ kind: 'error', message: 'Prompt is empty.' })
      return
    }
    const key = spriteCacheKey({ prompt: trimmed, width: size, height: size })
    const cached = await cache.get(key)
    if (cached) {
      showFreeResult(cached, true)
      pushLog({ source: 'bridge', status: 'cache-hit', label: trimmed.slice(0, 60), detail: `seed ${cached.seed}` })
      return
    }
    pushLog({ source: 'bridge', status: 'started', label: trimmed.slice(0, 60), detail: `${size}×${size}` })
    setFreeStatus({ kind: 'generating', startedAt: Date.now() })
    try {
      const response = await client.generate({ prompt: trimmed, width: size, height: size })
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
      showFreeResult(record, false)
      pushLog({
        source: 'bridge',
        status: 'ok',
        label: trimmed.slice(0, 60),
        detail: `seed ${record.seed} · ${(record.elapsedMs / 1000).toFixed(1)}s`,
      })
    } catch (err) {
      const message =
        err instanceof ImageGenError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setFreeStatus({ kind: 'error', message })
      pushLog({ source: 'bridge', status: 'error', label: trimmed.slice(0, 60), detail: message })
    }
  }

  const loadFromHistory = (record: SpriteRecord) => {
    showFreeResult(record, true)
    setPrompt(record.prompt)
    writeLocal(PROMPT_KEY, record.prompt)
  }

  const clearHistory = async () => {
    const cache = cacheRef.current
    if (!cache) return
    await cache.clear()
    setHistory([])
    if (freePreview) {
      URL.revokeObjectURL(freePreview)
      setFreePreview(null)
    }
    setFreeStatus({ kind: 'idle' })
  }

  // ── Portrait descriptor section ────────────────────────────────────────
  // Lifted to the parent so the item resolver can hand a resolved descriptor
  // straight into the generator without any cross-section state plumbing.
  const [descSlot, setDescSlot] = useState<PortraitSlot>('armor')
  const [descMaterial, setDescMaterial] = useState<Material>('leather')
  const [descForm, setDescForm] = useState<string>('jerkin')
  const [descTone, setDescTone] = useState<Tone>('muted')
  const [descStatus, setDescStatus] = useState<DescriptorStatus>({ kind: 'idle' })
  const [descPreview, setDescPreview] = useState<string | null>(null)
  useEffect(() => {
    return () => {
      if (descPreview) URL.revokeObjectURL(descPreview)
    }
  }, [descPreview])

  const descriptor: SpriteDescriptor = useMemo(
    () => ({ slot: descSlot, material: descMaterial, form: descForm, tone: descTone } as SpriteDescriptor),
    [descSlot, descMaterial, descForm, descTone],
  )
  const compiledPrompt = useMemo(() => compileSpritePrompt(descriptor), [descriptor])
  const validMaterials = SLOT_MATERIALS[descSlot]
  const validForms = SLOT_FORMS[descSlot]

  // When the slot changes, snap material + form to a valid choice for the
  // new slot. Keeping a stale `plate` material on a `cape` would resolve
  // a descriptor the cache key can technically hold but no real item ever
  // produces — confusing during testing.
  const changeSlot = (slot: PortraitSlot) => {
    setDescSlot(slot)
    if (!SLOT_MATERIALS[slot].includes(descMaterial)) setDescMaterial(defaultMaterialForSlot(slot))
    if (!(SLOT_FORMS[slot] as readonly string[]).includes(descForm)) setDescForm(defaultFormForSlot(slot))
    setDescStatus({ kind: 'idle' })
  }

  const showDescResult = (record: SpriteRecord, fromCache: boolean, key: string) => {
    setDescPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(record.blob)
    })
    setDescStatus({ kind: 'done', result: record, fromCache, key })
  }

  const generateFromDescriptor = async () => {
    const cache = cacheRef.current
    const client = clientRef.current
    if (!cache || !client) {
      setDescStatus({ kind: 'error', message: 'Client not initialized (check base URL).', key: descriptorKey(descriptor) })
      return
    }
    const key = descriptorKey(descriptor)
    const deps = { client, cache }
    // Probe the cache explicitly so the dev panel can show cache hit vs miss
    // without guessing. `getOrGenerate` does its own cache check too, so we'd
    // never double-fire ComfyUI even if a parallel call populates between
    // these two awaits.
    const cached = await lookupCached(descriptor, deps)
    if (cached) {
      showDescResult(cached, true, key)
      pushLog({
        source: 'descriptor',
        status: 'cache-hit',
        label: key,
        detail: `seed ${cached.seed}`,
      })
      return
    }
    pushLog({ source: 'descriptor', status: 'started', label: key })
    setDescStatus({ kind: 'generating', startedAt: Date.now(), key })
    try {
      // Run through the real PR 94 codepath — descriptor-derived seed,
      // [rig:N] marker in the prompt, in-flight dedup. Anything we test
      // here is what the in-game `PortraitLayers` component would see.
      const record = await getOrGenerate(descriptor, deps)
      showDescResult(record, false, key)
      pushLog({
        source: 'descriptor',
        status: 'ok',
        label: key,
        detail: `seed ${record.seed} · ${(record.elapsedMs / 1000).toFixed(1)}s`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDescStatus({ kind: 'error', message, key })
      pushLog({ source: 'descriptor', status: 'error', label: key, detail: message })
    }
  }

  // ── Item resolver section ───────────────────────────────────────────────
  const [itemName, setItemName] = useState('Iron Shortsword')
  const [itemSlot, setItemSlot] = useState<PortraitSlot>('mainhand')
  const [itemRarity, setItemRarity] = useState<Rarity | 'none'>('common')

  const resolvedItemDescriptor = useMemo<SpriteDescriptor>(() => {
    const rarity = itemRarity === 'none' ? undefined : itemRarity
    // resolveDescriptor takes an InventoryItem; we only need the name +
    // rarity it actually reads, so build a minimal stub. The cast bridges
    // the partial shape; resolveDescriptor never touches other fields.
    const stub = { name: itemName, rarity } as Parameters<typeof resolveDescriptor>[0]
    return resolveDescriptor(stub, itemSlot)
  }, [itemName, itemSlot, itemRarity])
  const resolvedItemPrompt = useMemo(
    () => compileSpritePrompt(resolvedItemDescriptor),
    [resolvedItemDescriptor],
  )

  const sendResolvedToDescriptor = () => {
    setDescSlot(resolvedItemDescriptor.slot)
    setDescMaterial(resolvedItemDescriptor.material)
    setDescForm(resolvedItemDescriptor.form)
    setDescTone(resolvedItemDescriptor.tone)
    setOpen((prev) => ({ ...prev, descriptor: true }))
    pushLog({
      source: 'item',
      status: 'ok',
      label: itemName.slice(0, 40),
      detail: `→ ${descriptorKey(resolvedItemDescriptor)}`,
    })
  }

  // ── Filter resolver section ─────────────────────────────────────────────
  const [filterRarity, setFilterRarity] = useState<Rarity>('rare')
  const [filterElement, setFilterElement] = useState<ElementKey | 'none'>('none')
  const [filterEnchanted, setFilterEnchanted] = useState(false)
  const [filterDurability, setFilterDurability] = useState(0.85)

  const resolvedFilters = useMemo(() => {
    const stub = { name: 'preview', rarity: filterRarity } as Parameters<typeof resolveFiltersForItem>[0]
    return resolveFiltersForItem(stub, undefined, {
      element: filterElement === 'none' ? undefined : filterElement,
      enchanted: filterEnchanted,
      durability: filterDurability,
    })
  }, [filterRarity, filterElement, filterEnchanted, filterDurability])

  // ── LLM flavor section ──────────────────────────────────────────────────
  const [llmTemplate, setLlmTemplate] = useState<TemplateId>('itemFlavor')
  const [llmHint, setLlmHint] = useState<string>(TEMPLATE_OPTIONS[0].defaultHint)
  const [llmRarity, setLlmRarity] = useState<string>('none')
  const [llmAreaKind, setLlmAreaKind] = useState<AreaKind>('dungeon')
  const [llmStatus, setLlmStatus] = useState<LlmFlavorStatus>({ kind: 'idle' })

  const pickLlmTemplate = (id: TemplateId) => {
    setLlmTemplate(id)
    setLlmHint(TEMPLATE_OPTIONS.find((o) => o.id === id)?.defaultHint ?? '')
    setLlmStatus({ kind: 'idle' })
  }

  const generateLlmFlavor = async () => {
    setLlmStatus({ kind: 'running' })
    pushLog({ source: 'llm', status: 'started', label: llmTemplate, detail: llmHint.slice(0, 40) })
    try {
      // Settings's "Try generation" panel uses the fantasy world as the
      // canonical sandbox. We mirror that here so dev-time output matches
      // what an itemFlavor / mobFlavor / areaFlavor call looks like during
      // real play.
      // Pin to the fantasy sandbox world — same as Settings → Try generation.
      // The dev panel exists to fire integration points; world variation can
      // come later if needed.
      const manifest = getWorldManifest('fantasy')
      if (!manifest) throw new Error('Fantasy world manifest not found.')
      const content = getWorldContent('fantasy')
      if (!content) throw new Error('Fantasy world content not found.')
      const config = loadLLMConfig()
      const client = createLLMClient(config)
      const ctx = { llm: client, cache: storage.entities }
      const opts = { manifestVersion: manifest.version, maxTokens: 200 }
      const hint = llmHint.trim() || TEMPLATE_OPTIONS.find((o) => o.id === llmTemplate)!.defaultHint
      const rarity = rarityFromOption(llmRarity)
      const concepts = {
        allowedConcepts: manifest.allowedConcepts,
        forbiddenConcepts: manifest.forbiddenConcepts,
      }

      let payload: unknown
      let cached = false
      let hash = ''

      if (llmTemplate === 'itemFlavor') {
        const r = await generate(
          itemFlavorTemplate,
          { worldId: manifest.id, archetypeKind: 'junk', archetypeHint: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        payload = r.payload
        cached = r.cached
        hash = r.hash
      } else if (llmTemplate === 'mobFlavor') {
        const r = await generate(
          mobFlavorTemplate,
          { worldId: manifest.id, archetypeHint: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        payload = r.payload
        cached = r.cached
        hash = r.hash
      } else if (llmTemplate === 'areaFlavor') {
        const r = await generate(
          areaFlavorTemplate,
          { worldId: manifest.id, areaKind: llmAreaKind, areaHint: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        payload = r.payload
        cached = r.cached
        hash = r.hash
      } else if (llmTemplate === 'roomFlavor') {
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
        payload = r.payload
        cached = r.cached
        hash = r.hash
      } else {
        const r = await generate(
          loreSnippetTemplate,
          { worldId: manifest.id, topic: hint, rarity, ...concepts },
          content.context,
          ctx,
          opts,
        )
        payload = r.payload
        cached = r.cached
        hash = r.hash
      }

      setLlmStatus({ kind: 'ok', payload, cached, hash })
      pushLog({
        source: 'llm',
        status: cached ? 'cache-hit' : 'ok',
        label: llmTemplate,
        detail: hash.slice(0, 12),
      })
    } catch (err) {
      const message =
        err instanceof LLMError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      setLlmStatus({ kind: 'error', message })
      pushLog({ source: 'llm', status: 'error', label: llmTemplate, detail: message })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const generating = freeStatus.kind === 'generating'
  const descGenerating = descStatus.kind === 'generating'
  const llmRunning = llmStatus.kind === 'running'

  return (
    <div className="dev__gen">
      {/* Bridge URL + health are shared across every section that hits the bridge,
          so they live above the collapsible sections rather than inside one. */}
      <label className="dev__gen-row dev__gen-row--inline">
        <span className="dev__row-label">Bridge</span>
        <input
          type="text"
          className="dev__gen-input"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value)
            writeLocal(BASE_URL_KEY, e.target.value)
          }}
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

      {/* ── Bridge / freeform ─────────────────────────────────────────── */}
      <Section id="bridge" title="Bridge — freeform prompt" open={open.bridge} onToggle={toggle}>
        <label className="dev__gen-row">
          <span className="dev__row-label">Prompt</span>
          <textarea
            className="dev__gen-prompt"
            value={prompt}
            rows={3}
            onChange={(e) => {
              setPrompt(e.target.value)
              writeLocal(PROMPT_KEY, e.target.value)
            }}
            placeholder="a small knight with a red cape, white background"
            disabled={generating}
          />
        </label>
        <div className="dev__gen-row dev__gen-row--inline">
          <span className="dev__row-label">Size</span>
          <select
            className="dev__select"
            value={size}
            onChange={(e) => {
              const v = Number(e.target.value) as SizeOption
              setSize(v)
              writeLocal(SIZE_KEY, String(v))
            }}
            disabled={generating}
          >
            {SIZE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}×{v}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="dev__btn"
          disabled={generating || !prompt.trim()}
          onClick={generateFreeform}
        >
          {generating ? `Generating… ${Math.floor(freeElapsed / 1000)}s` : 'Generate'}
        </button>
        {freeStatus.kind === 'error' && <div className="dev__gen-error">{freeStatus.message}</div>}
        {freePreview && (
          <div className="dev__gen-preview-wrap">
            <img src={freePreview} alt={prompt} className="dev__gen-preview" />
            {freeStatus.kind === 'done' && (
              <div className="dev__gen-meta">
                {freeStatus.fromCache
                  ? `cached · seed ${freeStatus.result.seed}`
                  : `seed ${freeStatus.result.seed} · ${(freeStatus.result.elapsedMs / 1000).toFixed(1)}s`}
              </div>
            )}
          </div>
        )}
        {history.length > 0 && (
          <div className="dev__gen-history">
            <div className="dev__row-label dev__gen-history-label">Recent</div>
            <div className="dev__gen-history-grid">
              {history.map((record) => (
                <HistoryThumb key={record.hash} record={record} onClick={() => loadFromHistory(record)} />
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
      </Section>

      {/* ── Portrait descriptor ───────────────────────────────────────── */}
      <Section
        id="descriptor"
        title="Portrait — descriptor → layer"
        open={open.descriptor}
        onToggle={toggle}
      >
        <div className="dev__gen-grid2">
          <label className="dev__gen-row">
            <span className="dev__row-label">Slot</span>
            <select
              className="dev__select"
              value={descSlot}
              onChange={(e) => changeSlot(e.target.value as PortraitSlot)}
              disabled={descGenerating}
            >
              {PORTRAIT_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="dev__gen-row">
            <span className="dev__row-label">Tone</span>
            <select
              className="dev__select"
              value={descTone}
              onChange={(e) => setDescTone(e.target.value as Tone)}
              disabled={descGenerating}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="dev__gen-row">
            <span className="dev__row-label">Material</span>
            <select
              className="dev__select"
              value={descMaterial}
              onChange={(e) => setDescMaterial(e.target.value as Material)}
              disabled={descGenerating}
            >
              {MATERIALS.map((m) => (
                <option key={m} value={m} disabled={!validMaterials.includes(m)}>
                  {m}
                  {validMaterials.includes(m) ? '' : ' (n/a)'}
                </option>
              ))}
            </select>
          </label>
          <label className="dev__gen-row">
            <span className="dev__row-label">Form</span>
            <select
              className="dev__select"
              value={descForm}
              onChange={(e) => setDescForm(e.target.value)}
              disabled={descGenerating}
            >
              {validForms.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dev__gen-row">
          <span className="dev__row-label">Compiled prompt</span>
          <pre className="dev__gen-readout">{compiledPrompt}</pre>
        </div>
        <div className="dev__gen-row dev__gen-row--inline">
          <button
            type="button"
            className="dev__btn"
            disabled={descGenerating}
            onClick={generateFromDescriptor}
          >
            {descGenerating ? 'Generating…' : 'Generate via portrait pipeline'}
          </button>
          <span className="dev__gen-key">{descriptorKey(descriptor)}</span>
        </div>
        {descStatus.kind === 'error' && <div className="dev__gen-error">{descStatus.message}</div>}
        {descPreview && (
          <div className="dev__gen-preview-wrap">
            <img src={descPreview} alt={descriptorKey(descriptor)} className="dev__gen-preview" />
            {descStatus.kind === 'done' && (
              <div className="dev__gen-meta">
                {descStatus.fromCache
                  ? `cached · seed ${descStatus.result.seed}`
                  : `seed ${descStatus.result.seed} · ${(descStatus.result.elapsedMs / 1000).toFixed(1)}s`}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Item resolver ──────────────────────────────────────────────── */}
      <Section id="item" title="Portrait — item resolver" open={open.item} onToggle={toggle}>
        <label className="dev__gen-row">
          <span className="dev__row-label">Item name</span>
          <input
            type="text"
            className="dev__gen-input"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="dev__gen-grid2">
          <label className="dev__gen-row">
            <span className="dev__row-label">Slot</span>
            <select
              className="dev__select"
              value={itemSlot}
              onChange={(e) => setItemSlot(e.target.value as PortraitSlot)}
            >
              {PORTRAIT_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="dev__gen-row">
            <span className="dev__row-label">Rarity</span>
            <select
              className="dev__select"
              value={itemRarity}
              onChange={(e) => setItemRarity(e.target.value as Rarity | 'none')}
            >
              <option value="none">— none —</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dev__gen-row">
          <span className="dev__row-label">Resolved descriptor</span>
          <pre className="dev__gen-readout">
            {JSON.stringify(resolvedItemDescriptor, null, 2)}
          </pre>
        </div>
        <div className="dev__gen-row">
          <span className="dev__row-label">Compiled prompt</span>
          <pre className="dev__gen-readout">{resolvedItemPrompt}</pre>
        </div>
        <button
          type="button"
          className="dev__btn dev__btn--compact"
          onClick={sendResolvedToDescriptor}
        >
          Send to descriptor section
        </button>
      </Section>

      {/* ── Filter resolver ────────────────────────────────────────────── */}
      <Section id="filter" title="Portrait — runtime filters" open={open.filter} onToggle={toggle}>
        <div className="dev__gen-grid2">
          <label className="dev__gen-row">
            <span className="dev__row-label">Rarity</span>
            <select
              className="dev__select"
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value as Rarity)}
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="dev__gen-row">
            <span className="dev__row-label">Element</span>
            <select
              className="dev__select"
              value={filterElement}
              onChange={(e) => setFilterElement(e.target.value as ElementKey | 'none')}
            >
              <option value="none">— none —</option>
              {ELEMENT_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dev__gen-row dev__gen-row--inline">
          <input
            type="checkbox"
            checked={filterEnchanted}
            onChange={(e) => setFilterEnchanted(e.target.checked)}
          />
          <span className="dev__row-label">Enchanted</span>
        </label>
        <label className="dev__gen-row">
          <span className="dev__row-label">
            Durability ({filterDurability.toFixed(2)})
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={filterDurability}
            onChange={(e) => setFilterDurability(Number(e.target.value))}
          />
        </label>
        <div className="dev__gen-row">
          <span className="dev__row-label">Resolved filters</span>
          <pre className="dev__gen-readout">
            {resolvedFilters.length === 0
              ? '(no filters)'
              : JSON.stringify(resolvedFilters, null, 2)}
          </pre>
        </div>
      </Section>

      {/* ── LLM generation (item / mob / area / room / lore) ──────────── */}
      <Section id="llm" title="LLM generation (item / mob / area / room / lore)" open={open.llm} onToggle={toggle}>
        <label className="dev__gen-row">
          <span className="dev__row-label">Template</span>
          <select
            className="dev__select"
            value={llmTemplate}
            onChange={(e) => pickLlmTemplate(e.target.value as TemplateId)}
            disabled={llmRunning}
          >
            {TEMPLATE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dev__gen-row">
          <span className="dev__row-label">Hint</span>
          <input
            type="text"
            className="dev__gen-input"
            value={llmHint}
            onChange={(e) => setLlmHint(e.target.value)}
            disabled={llmRunning}
            spellCheck={false}
          />
        </label>
        <div className="dev__gen-grid2">
          <label className="dev__gen-row">
            <span className="dev__row-label">Rarity</span>
            <select
              className="dev__select"
              value={llmRarity}
              onChange={(e) => setLlmRarity(e.target.value)}
              disabled={llmRunning}
            >
              <option value="none">— none —</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {llmTemplate === 'areaFlavor' && (
            <label className="dev__gen-row">
              <span className="dev__row-label">Area kind</span>
              <select
                className="dev__select"
                value={llmAreaKind}
                onChange={(e) => setLlmAreaKind(e.target.value as AreaKind)}
                disabled={llmRunning}
              >
                {AREA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          className="dev__btn"
          onClick={generateLlmFlavor}
          disabled={llmRunning || !llmHint.trim()}
        >
          {llmRunning ? 'Generating…' : 'Generate'}
        </button>
        {llmStatus.kind === 'error' && <div className="dev__gen-error">{llmStatus.message}</div>}
        {llmStatus.kind === 'ok' && (
          <div className="dev__gen-row">
            <span className="dev__row-label">
              {llmStatus.cached ? 'Cache hit' : 'Generated'} · {llmStatus.hash.slice(0, 12)}
            </span>
            <pre className="dev__gen-readout">{JSON.stringify(llmStatus.payload, null, 2)}</pre>
          </div>
        )}
      </Section>

      {/* ── Response log ───────────────────────────────────────────────── */}
      <ResponseLog entries={log} onClear={clearLog} />

      <style>{`
        /* Inline copies of the small set of helper classes the panel uses
           (.dev__btn, .dev__select, .dev__row-label). These were originally
           styled by DevPanel's own <style> block; keeping them here keeps
           the panel self-contained when rendered from Settings. */
        /* Primary section action — body font, sentence-case, accent
           fill so the call-to-action is unmistakable. Block-level so it
           anchors the bottom of each section the same way regardless of
           which subsection it belongs to (Bridge/Item/Filter/LLM). */
        .dev__btn {
          display: block;
          width: 100%;
          padding: var(--sp-2) var(--sp-3);
          background: var(--accent);
          border: 1px solid var(--accent);
          border-radius: 4px;
          color: var(--bg-0);
          cursor: pointer;
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 600;
          transition: background var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt);
        }
        .dev__btn:hover:not(:disabled), .dev__btn:focus-visible {
          outline: none;
          background: var(--accent-hot);
          border-color: var(--accent-hot);
          color: var(--bg-0);
        }
        /* Compact variant — secondary actions like "Clear", "Send to
           descriptor". Auto-width, body-font sentence-case, neutral
           outline so it doesn't compete with the primary fill above. */
        .dev__btn--compact {
          display: inline-block;
          width: auto;
          padding: 4px var(--sp-2);
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg-1);
          font-size: var(--text-xs);
          font-weight: 500;
        }
        .dev__btn--compact:hover:not(:disabled), .dev__btn--compact:focus-visible {
          background: var(--bg-2);
          border-color: var(--accent);
          color: var(--accent-hot);
        }
        .dev__btn--danger { background: transparent; border-color: var(--bad); color: var(--bad); }
        .dev__btn--danger:hover:not(:disabled) { background: var(--bad); border-color: var(--bad); color: var(--bg-0); }
        .dev__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dev__select {
          background: var(--bg-inset);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          border-radius: 4px;
          padding: var(--sp-1) var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          outline: none;
          min-width: 0;
        }
        .dev__select:focus { border-color: var(--accent); }
        /* Row label — body-font sentence case, paired with its sibling
           input control. Used to be display-uppercase; modernized to
           match the new Settings field labels. */
        .dev__row-label {
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--fg-2);
          font-weight: 500;
        }

        .dev__gen { display: flex; flex-direction: column; gap: var(--sp-3); }
        .dev__gen-row { display: flex; flex-direction: column; gap: 4px; }
        .dev__gen-row--inline { flex-direction: row; align-items: center; gap: var(--sp-2); }
        .dev__gen-row--inline > .dev__row-label { flex-shrink: 0; }
        .dev__gen-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2) var(--sp-3); }
        .dev__gen-prompt {
          background: var(--bg-inset);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          border-radius: 4px;
          padding: var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          outline: none;
          resize: vertical;
          min-height: 64px;
          line-height: 1.5;
        }
        .dev__gen-prompt:focus { border-color: var(--accent); }
        .dev__gen-input {
          flex: 1;
          min-width: 0;
          background: var(--bg-inset);
          color: var(--fg-1);
          border: 1px solid var(--line-2);
          border-radius: 4px;
          padding: var(--sp-1) var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          outline: none;
        }
        .dev__gen-input:focus { border-color: var(--accent); }
        .dev__gen-readout {
          margin: 0;
          background: var(--bg-0);
          color: var(--fg-2);
          border: 1px solid var(--line-1);
          padding: var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 240px;
          overflow: auto;
        }
        .dev__gen-key {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          word-break: break-all;
        }
        .dev__gen-health {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          padding: var(--sp-1) var(--sp-2);
          border: 1px dashed var(--line-1);
          word-break: break-all;
        }
        .dev__gen-error {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          color: var(--bad);
          padding: var(--sp-2);
          border: 1px solid var(--bad);
          text-shadow: var(--glow-sm);
          word-break: break-word;
        }
        .dev__gen-preview-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-1);
          padding: var(--sp-2);
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
        .dev__gen-history { display: flex; flex-direction: column; gap: var(--sp-1); }
        .dev__gen-history-label { padding-top: var(--sp-1); }
        .dev__gen-history-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--sp-1);
        }
        .dev__gen-section {
          border: 1px solid var(--line-1);
          padding: 0;
        }
        .dev__gen-section-head {
          width: 100%;
          text-align: left;
          background: var(--bg-inset);
          color: var(--fg-1);
          border: none;
          padding: var(--sp-2) var(--sp-3);
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dev__gen-section-head:hover { background: var(--bg-1); }
        .dev__gen-section-body {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-3);
        }
        .dev__gen-log {
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid var(--line-1);
          padding: 0;
        }
        .dev__gen-log-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--sp-2) var(--sp-3);
          background: var(--bg-inset);
          font-family: var(--font-body);
          font-size: var(--text-md);
          font-weight: 600;
          color: var(--fg-1);
        }
        .dev__gen-log-list {
          max-height: 200px;
          overflow: auto;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .dev__gen-log-row {
          display: grid;
          grid-template-columns: 64px 64px 1fr;
          gap: var(--sp-2);
          padding: 4px var(--sp-3);
          border-top: 1px solid var(--line-1);
        }
        .dev__gen-log-row--ok       { color: var(--fg-2); }
        .dev__gen-log-row--cache    { color: var(--fg-3); }
        .dev__gen-log-row--started  { color: var(--fg-3); }
        .dev__gen-log-row--error    { color: var(--bad); }
        .dev__gen-log-empty {
          padding: var(--sp-2) var(--sp-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
        }
      `}</style>
    </div>
  )
}

interface SectionProps {
  id: SectionId
  title: string
  open: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}

// Plain disclosure widget. Uses a button + aria-expanded so screen readers
// announce the open/closed state — simpler than juggling a <details> element
// while still keeping keyboard activation free.
function Section({ id, title, open, onToggle, children }: SectionProps) {
  return (
    <div className="dev__gen-section">
      <button
        type="button"
        className="dev__gen-section-head"
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dev__gen-section-body">{children}</div>}
    </div>
  )
}

interface ResponseLogProps {
  entries: LogEntry[]
  onClear: () => void
}

function ResponseLog({ entries, onClear }: ResponseLogProps) {
  return (
    <div className="dev__gen-log">
      <div className="dev__gen-log-head">
        <span>Response log ({entries.length})</span>
        <button
          type="button"
          className="dev__btn dev__btn--compact"
          onClick={onClear}
          disabled={entries.length === 0}
        >
          Clear
        </button>
      </div>
      <div className="dev__gen-log-list">
        {entries.length === 0 ? (
          <div className="dev__gen-log-empty">no calls yet</div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className={`dev__gen-log-row dev__gen-log-row--${
                e.status === 'cache-hit' ? 'cache' : e.status
              }`}
              title={e.detail ?? ''}
            >
              <span>{formatTime(e.ts)}</span>
              <span>{shortStatus(e.status, e.source)}</span>
              <span>
                {e.label}
                {e.detail ? ` · ${e.detail}` : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function shortStatus(status: LogStatus, source: SectionId): string {
  const tag =
    source === 'bridge'
      ? 'BRG'
      : source === 'descriptor'
        ? 'DSC'
        : source === 'item'
          ? 'ITM'
          : source === 'filter'
            ? 'FLT'
            : 'LLM'
  if (status === 'started') return `${tag}…`
  if (status === 'ok') return `${tag} ✓`
  if (status === 'cache-hit') return `${tag} ⚡`
  return `${tag} ✗`
}

interface HistoryThumbProps {
  record: SpriteRecord
  onClick: () => void
}

// Tiny self-contained thumb component so each row manages its own object URL
// lifecycle. The parent's preview only reflects the currently displayed
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
