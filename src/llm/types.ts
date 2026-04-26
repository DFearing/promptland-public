export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** Marks the endpoint as keyless. When true the API key is ignored
   *  (and the field is hidden in Settings). Auto-set by presets — local
   *  / proxy presets flip it on, hosted presets flip it off — but the
   *  user can override either way. */
  local: boolean
}

export type LLMRole = 'system' | 'user' | 'assistant'

export interface LLMMessage {
  role: LLMRole
  content: string
}

export interface LLMCompletionRequest {
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
  /** Optional AbortSignal — when aborted, the in-flight fetch is
   *  cancelled and the returned promise rejects. Used by the area
   *  generation timeout to tear down requests that outlive their
   *  budget. */
  signal?: AbortSignal
}

export interface LLMCompletionResponse {
  content: string
  model: string
  raw: unknown
}

export interface LLMClient {
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse>
}
