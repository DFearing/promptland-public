export interface ImageGenRequest {
  prompt: string
  /** Unsigned 32-bit seed. Same (prompt, seed, size, steps) deterministically
   *  yields the same image on Flux Schnell, so callers can key a cache by
   *  these inputs without storing the seed separately. */
  seed?: number
  width?: number
  height?: number
  steps?: number
}

export interface ImageGenResponse {
  blob: Blob
  /** Seed the bridge actually used — echo of the request's seed, or the one
   *  it rolled when the request omitted it. Store this if you want to
   *  re-generate the same sprite later. */
  seed: number
  elapsedMs: number
  promptId: string
}

export interface HealthInfo {
  ok: boolean
  bridge: { host: string; port: number }
  upstream: { url: string; ok: boolean; error: string | null }
  models: Record<string, string>
}

export interface ImageGenClient {
  generate(req: ImageGenRequest): Promise<ImageGenResponse>
  health(): Promise<HealthInfo>
}

export interface ImageGenConfig {
  baseUrl: string
}
