// Posts structured log events to the Vite dev server's /__dev/log middleware
// so activity happening in the browser (LLM calls, cache hits, etc.) is
// visible in the `npm run dev` terminal. No-ops in production builds.
export function devLog(event: string, data?: unknown): void {
  if (!import.meta.env.DEV) return
  try {
    void fetch('/__dev/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, ts: Date.now() }),
      keepalive: true,
    }).catch(() => {
      // Logger must never throw.
    })
  } catch {
    // Same.
  }
}
