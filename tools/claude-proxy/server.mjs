#!/usr/bin/env node
// Tiny OpenAI-compatible proxy that serves /v1/chat/completions by shelling out
// to `claude -p` (Claude Code headless mode). Lets Promptland — or any client
// that speaks OpenAI chat completions — use your Claude.ai Max/Pro subscription
// as the LLM backend. Single-file, no external deps.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.CLAUDE_PROXY_PORT ?? 11435)
const HOST = process.env.CLAUDE_PROXY_HOST ?? '127.0.0.1'
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
const DEFAULT_MODEL = process.env.CLAUDE_PROXY_DEFAULT_MODEL ?? 'haiku'
const MAX_BODY_BYTES = 4 * 1024 * 1024
const SPAWN_TIMEOUT_MS = Number(process.env.CLAUDE_PROXY_TIMEOUT_MS ?? 120_000)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function errorResponse(res, status, message, type = 'proxy_error') {
  jsonResponse(res, status, { error: { message, type } })
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// Claude Code takes a single prompt string + optional system prompt. OpenAI's
// chat format has arbitrary role-alternation, so we collapse system messages
// into one --system-prompt value and render the remainder as a transcript.
function flattenMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array')
  }
  const systemParts = []
  const turns = []
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue
    const role = String(msg.role ?? '')
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
              .join('')
          : ''
    if (!content.trim()) continue
    if (role === 'system') systemParts.push(content)
    else if (role === 'assistant') turns.push(`Assistant: ${content}`)
    else turns.push(`User: ${content}`)
  }
  if (turns.length === 0) throw new Error('messages contained no user/assistant content')
  // If the final turn is a user turn (the common case), just hand it over.
  // Otherwise include the whole transcript and ask for the next assistant reply.
  const prompt =
    turns.length === 1 && turns[0].startsWith('User: ')
      ? turns[0].slice('User: '.length)
      : turns.join('\n\n') + '\n\nAssistant:'
  return { systemPrompt: systemParts.join('\n\n').trim(), prompt }
}

function runClaude({ prompt, systemPrompt, model }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--no-session-persistence',
      '--tools', '',
      '--model', model,
    ]
    if (systemPrompt) args.push('--system-prompt', systemPrompt)

    const child = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, SPAWN_TIMEOUT_MS)

    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => { stderr += c })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn ${CLAUDE_BIN}: ${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`claude timed out after ${SPAWN_TIMEOUT_MS}ms`))
        return
      }
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`claude exited ${code}: ${stderr.trim() || '(no stderr)'}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (err) {
        reject(new Error(`claude returned non-JSON: ${err.message}\n${stdout.slice(0, 500)}`))
      }
    })

    child.stdin.end(prompt, 'utf8')
  })
}

async function handleChatCompletions(req, res) {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'Method not allowed; use POST', 'invalid_request_error')
    return
  }
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch (err) {
    errorResponse(res, 400, `Invalid JSON body: ${err.message}`, 'invalid_request_error')
    return
  }

  let flat
  try {
    flat = flattenMessages(body.messages)
  } catch (err) {
    errorResponse(res, 400, err.message, 'invalid_request_error')
    return
  }

  if (body.stream) {
    errorResponse(res, 400, 'Streaming is not supported by the Claude subscription proxy; set stream=false.', 'invalid_request_error')
    return
  }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL

  let claudeResult
  try {
    claudeResult = await runClaude({ prompt: flat.prompt, systemPrompt: flat.systemPrompt, model })
  } catch (err) {
    errorResponse(res, 502, err.message, 'upstream_error')
    return
  }

  if (claudeResult?.is_error) {
    errorResponse(res, 502, claudeResult.result ?? 'Claude reported an error', 'upstream_error')
    return
  }

  const content = typeof claudeResult?.result === 'string' ? claudeResult.result : ''
  const usage = claudeResult?.usage ?? {}
  const promptTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  const completionTokens = usage.output_tokens ?? 0

  jsonResponse(res, 200, {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: claudeResult?.stop_reason === 'end_turn' ? 'stop' : (claudeResult?.stop_reason ?? 'stop'),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    // Non-standard passthroughs — handy for debugging; OpenAI clients ignore them.
    x_claude: {
      session_id: claudeResult?.session_id,
      total_cost_usd: claudeResult?.total_cost_usd,
      duration_ms: claudeResult?.duration_ms,
    },
  })
}

function handleModels(_req, res) {
  // Advertise the common Claude aliases + the explicit IDs Claude Code accepts.
  const now = Math.floor(Date.now() / 1000)
  const ids = [
    'haiku', 'sonnet', 'opus',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-7',
  ]
  jsonResponse(res, 200, {
    object: 'list',
    data: ids.map((id) => ({ id, object: 'model', created: now, owned_by: 'anthropic' })),
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '') || '/'

  if (path === '/v1/chat/completions') return handleChatCompletions(req, res)
  if (path === '/v1/models') return handleModels(req, res)
  if (path === '/health' || path === '/') {
    jsonResponse(res, 200, { ok: true, bin: CLAUDE_BIN, default_model: DEFAULT_MODEL })
    return
  }
  errorResponse(res, 404, `Unknown path: ${path}`, 'not_found')
})

server.listen(PORT, HOST, () => {
  console.log(`claude-proxy listening on http://${HOST}:${PORT}`)
  console.log(`  base_url for OpenAI-compatible clients: http://${HOST}:${PORT}/v1`)
  console.log(`  default model: ${DEFAULT_MODEL}   (override via request body or CLAUDE_PROXY_DEFAULT_MODEL)`)
})
