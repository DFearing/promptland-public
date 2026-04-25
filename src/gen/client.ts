import type {
  HealthInfo,
  ImageGenClient,
  ImageGenRequest,
  ImageGenResponse,
} from './types'

// Matches the default PIXEL_GEN_PORT in tools/pixel-gen/server.mjs. The bridge
// runs on whichever machine hosts ComfyUI (i.e. the one with the GPU), which
// may or may not be the same machine serving the Vite dev server — the bridge
// CORS-allows any origin.
export const DEFAULT_BASE_URL = 'http://127.0.0.1:11436'

export class ImageGenError extends Error {
  readonly status?: number
  readonly body?: string

  constructor(message: string, opts: { status?: number; body?: string } = {}) {
    super(message)
    this.name = 'ImageGenError'
    this.status = opts.status
    this.body = opts.body
  }
}

function trimSlashes(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export class HttpImageGenClient implements ImageGenClient {
  readonly baseUrl: string

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    const trimmed = trimSlashes(baseUrl)
    if (!trimmed) throw new ImageGenError('Base URL is empty.')
    this.baseUrl = trimmed
  }

  async generate(req: ImageGenRequest): Promise<ImageGenResponse> {
    if (!req.prompt?.trim()) {
      throw new ImageGenError('prompt must be a non-empty string')
    }
    const body: Record<string, unknown> = { prompt: req.prompt }
    if (req.seed !== undefined) body.seed = req.seed
    if (req.width !== undefined) body.width = req.width
    if (req.height !== undefined) body.height = req.height
    if (req.steps !== undefined) body.steps = req.steps

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      throw new ImageGenError(
        `Could not reach ${this.baseUrl}. Check the pixel-gen bridge is running and CORS allows this origin.`,
        { body: cause instanceof Error ? cause.message : String(cause) },
      )
    }

    if (!response.ok) {
      const text = await response.text()
      let msg = `HTTP ${response.status}`
      try {
        const parsed = text ? (JSON.parse(text) as { error?: { message?: string } }) : null
        if (parsed?.error?.message) msg = parsed.error.message
      } catch {
        // response wasn't JSON — keep the HTTP-status message
      }
      throw new ImageGenError(msg, { status: response.status, body: text })
    }

    const blob = await response.blob()
    const seed = Number(response.headers.get('X-Pixel-Gen-Seed') ?? 0)
    const elapsedMs = Number(response.headers.get('X-Pixel-Gen-Elapsed-Ms') ?? 0)
    const promptId = response.headers.get('X-Pixel-Gen-Prompt-Id') ?? ''

    return { blob, seed, elapsedMs, promptId }
  }

  async health(): Promise<HealthInfo> {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new ImageGenError(`health check failed: HTTP ${response.status}`, {
        status: response.status,
      })
    }
    return (await response.json()) as HealthInfo
  }
}
