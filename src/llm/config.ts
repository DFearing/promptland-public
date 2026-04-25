import type { LLMConfig } from './types'

const STORAGE_KEY = 'promptland.llm.config'

export const EMPTY_CONFIG: LLMConfig = { baseUrl: '', apiKey: '', model: '' }

export function loadLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_CONFIG }
    const parsed = JSON.parse(raw) as Partial<LLMConfig>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    }
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
