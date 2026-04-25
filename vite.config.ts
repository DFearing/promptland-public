import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Resolve the current git branch at build / dev-server start so the topbar can
// render "v0.1.0 · branch-name". Falls back to "detached" / "unknown" so the
// build never breaks if git is unavailable or we're in a detached-HEAD state.
function gitBranchName(): string {
  try {
    const name = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return name === 'HEAD' ? 'detached' : name
  } catch {
    return 'unknown'
  }
}

// Dev-only middleware that accepts structured log events from the browser and
// prints them to the `npm run dev` terminal. Lets us watch game activity
// (LLM generations, cache hits, etc.) in real time alongside Vite's own logs.
function devLogPlugin(): Plugin {
  return {
    name: 'promptland-dev-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              event?: string
              data?: unknown
              ts?: number
            }
            const time = new Date(body.ts ?? Date.now()).toISOString().slice(11, 19)
            const label = (body.event ?? 'log').padEnd(11)
            const payload =
              body.data === undefined
                ? ''
                : typeof body.data === 'string'
                  ? body.data
                  : JSON.stringify(body.data)
            console.log(`[${time}] ${label} ${payload}`)
          } catch {
            console.log('[devlog] malformed body')
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devLogPlugin()],
  define: {
    __GIT_BRANCH__: JSON.stringify(gitBranchName()),
  },
})
