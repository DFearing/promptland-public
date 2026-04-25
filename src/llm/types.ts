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
}

export interface LLMCompletionResponse {
  content: string
  model: string
  raw: unknown
}

export interface LLMClient {
  complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse>
}
