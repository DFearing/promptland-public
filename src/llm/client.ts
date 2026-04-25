import { MOCK_BASE_URL, MockLLMClient } from './mockClient'
import type {
  LLMClient,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMConfig,
} from './types'

interface OpenAIChoice {
  message?: { content?: string }
}

interface OpenAIChatResponse {
  choices?: OpenAIChoice[]
  error?: { message?: string; type?: string }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) throw new LLMError('Base URL is empty.')
  return trimmed
}

export class LLMError extends Error {
  readonly status?: number
  readonly body?: string

  constructor(message: string, opts: { status?: number; body?: string } = {}) {
    super(message)
    this.name = 'LLMError'
    this.status = opts.status
    this.body = opts.body
  }
}

export function createLLMClient(config: LLMConfig): LLMClient {
  if (config.baseUrl.trim().toLowerCase().startsWith(MOCK_BASE_URL)) {
    return new MockLLMClient()
  }
  return new OpenAICompatClient(config)
}

export class OpenAICompatClient implements LLMClient {
  readonly config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.config.model.trim()) {
      throw new LLMError('Model name is empty.')
    }
    const url = normalizeBaseUrl(this.config.baseUrl) + '/chat/completions'

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: req.messages,
    }
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      })
    } catch (cause) {
      throw new LLMError(
        `Could not reach ${url}. Check the base URL, that the server is running, and that browser CORS is allowed.`,
        { body: cause instanceof Error ? cause.message : String(cause) },
      )
    }

    const rawText = await response.text()
    let parsed: OpenAIChatResponse | null = null
    try {
      parsed = rawText ? (JSON.parse(rawText) as OpenAIChatResponse) : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const msg = parsed?.error?.message ?? `HTTP ${response.status}`
      throw new LLMError(msg, { status: response.status, body: rawText })
    }

    const content = parsed?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new LLMError('Response did not include a choice message content.', {
        body: rawText,
      })
    }

    return {
      content,
      model: this.config.model,
      raw: parsed,
    }
  }
}
