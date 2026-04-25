export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
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
