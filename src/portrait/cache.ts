// Descriptor-keyed sprite generation + cache wrapper.
//
// Reuses the existing IndexedDB store (`src/gen/sprites.ts`) and HTTP
// client (`HttpImageGenClient`). The `[rig:N]` marker in the compiled
// prompt is what makes a `RIG_VERSION` bump invalidate stale entries —
// no schema migration needed.
//
// Two kinds of dedup happen here:
//
//  1. *Cache* dedup — second `getOrGenerate` for the same descriptor
//     after persistence reads the Blob from IndexedDB.
//  2. *In-flight* dedup — two `getOrGenerate` calls for the same
//     descriptor while the first is still hitting the bridge share the
//     same Promise. Without this a portrait remount would fire a fresh
//     ComfyUI generation for every layer instead of reusing the in-flight
//     one — a 10× cost amplification.

import {
  HttpImageGenClient,
  ImageGenError,
  type ImageGenClient,
  type SpriteCache,
  type SpriteRecord,
  createSpriteCache,
  spriteCacheKey,
} from '../gen'
import { PORTRAIT_CONFIG, type PortraitConfig } from './config'
import { descriptorKey, type SpriteDescriptor } from './descriptor'
import { compileSpritePrompt } from './prompt'

/** FNV-1a 32-bit. Used to derive a deterministic seed from a descriptor
 *  key so the bridge produces the same image on every cache miss. Smaller
 *  than the 64-bit hash in `spriteCacheKey`; we only need 32 bits because
 *  the bridge's seed parameter is a 32-bit unsigned integer. */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h >>> 0
}

function deriveSeed(d: SpriteDescriptor, strategy: PortraitConfig['generation']['seedStrategy']):
  | number
  | undefined {
  if (strategy === 'descriptor-derived') return fnv1a32(descriptorKey(d))
  // 'random' / 'none' — let the bridge roll its own. Returning undefined
  // tells `client.generate` not to send the seed field.
  return undefined
}

export interface PortraitCacheDeps {
  client: ImageGenClient
  cache: SpriteCache
  config?: PortraitConfig
}

/** Build a `PortraitCacheDeps` using the existing gen infrastructure
 *  and `PORTRAIT_CONFIG`. Pass overrides for tests or dev tooling. */
export function createPortraitCache(
  overrides: Partial<PortraitCacheDeps> = {},
): PortraitCacheDeps {
  const config = overrides.config ?? PORTRAIT_CONFIG
  const client = overrides.client ?? new HttpImageGenClient(config.bridge.baseUrl)
  const cache = overrides.cache ?? createSpriteCache()
  return { client, cache, config }
}

const inFlight = new Map<string, Promise<SpriteRecord>>()

/** Look up the descriptor's PNG. On cache hit, returns the cached record.
 *  On miss, fires a single bridge generation and stores the result.
 *  Concurrent calls for the same descriptor share the in-flight promise. */
export async function getOrGenerate(
  descriptor: SpriteDescriptor,
  deps: PortraitCacheDeps,
): Promise<SpriteRecord> {
  const cfg = deps.config ?? PORTRAIT_CONFIG
  const prompt = compileSpritePrompt(descriptor, cfg.prompt)
  const seed = deriveSeed(descriptor, cfg.generation.seedStrategy)
  const cacheKey = spriteCacheKey({
    prompt,
    seed,
    width: cfg.generation.width,
    height: cfg.generation.height,
    steps: cfg.generation.steps,
  })

  const cached = await deps.cache.get(cacheKey)
  if (cached) return cached

  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const job = (async () => {
    try {
      const response = await deps.client.generate({
        prompt,
        seed,
        width: cfg.generation.width,
        height: cfg.generation.height,
        steps: cfg.generation.steps,
      })
      const record: SpriteRecord = {
        hash: cacheKey,
        prompt,
        blob: response.blob,
        width: cfg.generation.width,
        height: cfg.generation.height,
        seed: response.seed,
        elapsedMs: response.elapsedMs,
        createdAt: Date.now(),
      }
      await deps.cache.put(record)
      return record
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, job)
  return job
}

/** Fast cache-only check — used by the renderer to decide between a
 *  cached layer (synchronous draw) and a generation kickoff (placeholder
 *  + async draw). Never throws or hits the bridge. */
export async function lookupCached(
  descriptor: SpriteDescriptor,
  deps: PortraitCacheDeps,
): Promise<SpriteRecord | null> {
  const cfg = deps.config ?? PORTRAIT_CONFIG
  const prompt = compileSpritePrompt(descriptor, cfg.prompt)
  const seed = deriveSeed(descriptor, cfg.generation.seedStrategy)
  const cacheKey = spriteCacheKey({
    prompt,
    seed,
    width: cfg.generation.width,
    height: cfg.generation.height,
    steps: cfg.generation.steps,
  })
  return deps.cache.get(cacheKey)
}

/** Re-export so callers get a single import surface for the layer pipeline. */
export { ImageGenError }
