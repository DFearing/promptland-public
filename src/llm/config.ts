import type { LLMConfig } from './types'

const STORAGE_KEY = 'promptland.llm.config'

export const EMPTY_CONFIG: LLMConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  local: false,
}

export function loadLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_CONFIG }
    const parsed = JSON.parse(raw) as Partial<LLMConfig>
    const baseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl : ''
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : ''
    const model = typeof parsed.model === 'string' ? parsed.model : ''
    // Pre-toggle saves have no `local` field. Infer it from a missing
    // API key — anyone with a working keyless setup (Ollama, LAN, the
    // Claude proxy) had no key, so they roll over with local: true and
    // don't get gated on reload.
    const local =
      typeof parsed.local === 'boolean' ? parsed.local : apiKey.trim().length === 0
    return { baseUrl, apiKey, model, local }
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearLLMConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isLLMConfigured(config: LLMConfig): boolean {
  return config.baseUrl.trim().length > 0 && config.model.trim().length > 0
}
