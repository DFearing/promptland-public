export interface LLMPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel?: string
  apiKeyRequired: boolean
  note?: string
}

export const LLM_PRESETS: readonly LLMPreset[] = [
  {
    id: 'mock',
    name: 'Mock (test)',
    baseUrl: 'mock://local',
    defaultModel: 'mock-1',
    apiKeyRequired: false,
    note: 'Returns canned JSON locally. No network. Use to verify the cache pipeline.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    apiKeyRequired: false,
    note: 'Local. Set OLLAMA_ORIGINS=* so the browser can reach it.',
  },
  {
    id: 'claude-subscription',
    name: 'Claude Subscription (local proxy)',
    baseUrl: 'http://127.0.0.1:11435/v1',
    defaultModel: 'haiku',
    apiKeyRequired: false,
    note: 'Run `npm run proxy` in a second terminal. Uses your Claude Code login (Pro/Max plan) via headless mode.',
  },
  {
    id: 'ollama-lan',
    name: 'Ollama (LAN)',
    baseUrl: 'http://192.168.1.186/v1',
    defaultModel: 'llama3.1',
    apiKeyRequired: false,
    note: 'LAN Ollama server. Set OLLAMA_ORIGINS=* so it accepts browser requests.',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyRequired: false,
    note: 'Local. Enable the server in LM Studio and set Allow CORS.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyRequired: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-001',
    apiKeyRequired: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-4-5-20251001',
    apiKeyRequired: true,
    note: 'Uses the OpenAI-compatible endpoint.',
  },
] as const
