import type { EntityCache, EntityCacheEntry } from '../storage/types'
import { devLog } from '../util/devLog'
import { deriveCacheKey } from './cacheKey'
import { LLMError } from './client'
import { renderMessages, type PromptTemplate, type WorldContextDefaults } from './templates'
import type { LLMClient } from './types'

export interface GenerateContext {
  llm: LLMClient
  cache: EntityCache
}

export interface GenerateOptions {
  manifestVersion: string
  temperature?: number
  maxTokens?: number
}

export interface GenerateResult<TPayload> {
  payload: TPayload
  cached: boolean
  hash: string
}

// Truncate long params for log lines so the terminal stays scannable.
function preview(value: unknown, max = 80): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export async function generate<TParams, TPayload>(
  template: PromptTemplate<TParams, TPayload>,
  params: TParams,
  context: WorldContextDefaults,
  ctx: GenerateContext,
  opts: GenerateOptions,
): Promise<GenerateResult<TPayload>> {
  const worldId = template.worldIdOf(params)

  const hash = deriveCacheKey({
    manifestVersion: opts.manifestVersion,
    templateId: template.id,
    templateVersion: template.version,
    worldId,
    params,
  })

  const hit = await ctx.cache.get(hash)
  if (hit) {
    devLog('llm.hit', { template: template.id, hash })
    return { payload: hit.payload as TPayload, cached: true, hash }
  }

  devLog('llm.miss', {
    template: template.id,
    hash,
    params: preview(params, 160),
  })
  const startedAt = Date.now()

  let res
  try {
    res = await ctx.llm.complete({
      messages: renderMessages(template, params, context),
      temperature: opts.temperature ?? 0.7,
      maxTokens: opts.maxTokens,
    })
  } catch (err) {
    devLog('llm.error', {
      template: template.id,
      hash,
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  let payload: TPayload
  try {
    payload = template.parse(res.content)
  } catch (err) {
    devLog('llm.parseerr', { template: template.id, hash, content: preview(res.content, 120) })
    throw new LLMError(`Template "${template.id}" could not parse the model response.`, {
      body: res.content + (err instanceof Error ? `\n\n${err.message}` : ''),
    })
  }

  const entry: EntityCacheEntry = {
    hash,
    kind: template.kind,
    createdAt: Date.now(),
    payload,
  }
  await ctx.cache.put(entry)
  devLog('llm.done', {
    template: template.id,
    hash,
    ms: Date.now() - startedAt,
    preview: preview(payload, 100),
  })
  return { payload, cached: false, hash }
}
