#!/usr/bin/env node
// Local HTTP bridge that fronts a ComfyUI instance so the browser sees a
// simple "POST /generate → PNG" interface instead of ComfyUI's queue/poll/view
// dance. Mirrors tools/claude-proxy/server.mjs in shape: single-file, zero
// deps, CORS-enabled, runs on the same machine as its upstream.
//
// Expected upstream: ComfyUI listening on http://127.0.0.1:8188 with the
// ComfyUI-GGUF custom node installed and the Flux Schnell model files under
// ComfyUI/models/{unet,clip,vae,loras}. See README.md for the exact files.

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PIXEL_GEN_PORT ?? 11436)
const HOST = process.env.PIXEL_GEN_HOST ?? '127.0.0.1'
const COMFY_URL = (process.env.COMFY_URL ?? 'http://127.0.0.1:8188').replace(/\/+$/, '')
const POLL_INTERVAL_MS = Number(process.env.PIXEL_GEN_POLL_MS ?? 500)
const GENERATION_TIMEOUT_MS = Number(process.env.PIXEL_GEN_TIMEOUT_MS ?? 180_000)
const MAX_BODY_BYTES = 64 * 1024

const UNET_FILE = process.env.PIXEL_GEN_UNET ?? 'flux1-schnell-Q5_K_S.gguf'
const T5_FILE = process.env.PIXEL_GEN_T5 ?? 't5xxl_fp8_e4m3fn.safetensors'
const CLIP_L_FILE = process.env.PIXEL_GEN_CLIP_L ?? 'clip_l.safetensors'
const VAE_FILE = process.env.PIXEL_GEN_VAE ?? 'ae.safetensors'
const LORA_FILE = process.env.PIXEL_GEN_LORA ?? 'ume_modern_pixelart.safetensors'
// UmeAiRT's Modern Pixel Art LoRA activates on "umempart". We prepend it so
// clients can send plain descriptions and still get the LoRA style.
const LORA_TRIGGER = process.env.PIXEL_GEN_LORA_TRIGGER ?? 'umempart, pixel art'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'X-Pixel-Gen-Seed, X-Pixel-Gen-Elapsed-Ms, X-Pixel-Gen-Prompt-Id',
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

// Flux Schnell is a 4-step distilled model — cfg must be 1.0, sampler=euler,
// scheduler=simple. The LoRA is wired once between the UNet and the text
// encoder so both model and clip paths pick up its conditioning.
function buildWorkflow({ prompt, seed, width, height, steps }) {
  const positive = LORA_TRIGGER ? `${LORA_TRIGGER}, ${prompt}` : prompt
  return {
    '1': {
      class_type: 'UnetLoaderGGUF',
      inputs: { unet_name: UNET_FILE },
    },
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: T5_FILE,
        clip_name2: CLIP_L_FILE,
        type: 'flux',
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: VAE_FILE },
    },
    '4': {
      class_type: 'LoraLoader',
      inputs: {
        model: ['1', 0],
        clip: ['2', 0],
        lora_name: LORA_FILE,
        strength_model: 1.0,
        strength_clip: 1.0,
      },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['4', 1], text: positive },
    },
    // Flux ignores negative conditioning at cfg=1 but the KSampler still needs
    // the wire — feed an empty encode so the graph resolves.
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['4', 1], text: '' },
    },
    '7': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
        seed,
        steps,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1.0,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'pixelgen' },
    },
  }
}

async function queuePrompt(workflow, clientId) {
  const response = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`ComfyUI /prompt returned ${response.status}: ${text.slice(0, 400)}`)
  }
  const data = await response.json()
  if (!data?.prompt_id) {
    throw new Error(`ComfyUI /prompt missing prompt_id in response: ${JSON.stringify(data).slice(0, 400)}`)
  }
  return data.prompt_id
}

// ComfyUI's /history/{id} returns `{}` while running and the full record once
// it lands. Poll on a fixed interval until the record shows up or we time
// out. Success is `status.completed === true`; anything else with a status
// block is a real failure we should surface.
async function waitForCompletion(promptId, deadline) {
  while (Date.now() < deadline) {
    const response = await fetch(`${COMFY_URL}/history/${promptId}`)
    if (response.ok) {
      const data = await response.json()
      const record = data[promptId]
      if (record) {
        const status = record.status
        if (status?.completed === true) return record
        if (status?.status_str && status.status_str !== 'success' && status?.completed === false && Array.isArray(status?.messages)) {
          const errMsg = status.messages
            .filter((m) => Array.isArray(m) && (m[0] === 'execution_error' || m[0] === 'execution_interrupted'))
            .map((m) => JSON.stringify(m[1] ?? m))
            .join('; ')
          if (errMsg) throw new Error(`ComfyUI execution failed: ${errMsg}`)
        }
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`Generation did not complete within ${GENERATION_TIMEOUT_MS}ms`)
}

function extractOutputImage(record) {
  const outputs = record.outputs ?? {}
  for (const nodeOutput of Object.values(outputs)) {
    if (Array.isArray(nodeOutput?.images) && nodeOutput.images.length > 0) {
      return nodeOutput.images[0]
    }
  }
  throw new Error('ComfyUI completed but produced no images')
}

async function fetchImageBytes(image) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output',
  })
  const response = await fetch(`${COMFY_URL}/view?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`ComfyUI /view returned ${response.status} for ${image.filename}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function validateGenerateBody(body) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) throw new Error('prompt is required and must be a non-empty string')
  if (prompt.length > 2000) throw new Error('prompt must be <= 2000 chars')

  const seed = Number.isFinite(body?.seed)
    ? Math.floor(body.seed)
    : Math.floor(Math.random() * 0xffffffff)
  // Flux Schnell is trained in 64-pixel increments. Clamp+snap to avoid
  // ComfyUI spending a step telling us the latent dims are off.
  const snap = (v, def) => {
    const n = Number.isFinite(v) ? Math.round(v / 64) * 64 : def
    return Math.min(2048, Math.max(256, n))
  }
  const width = snap(body?.width, 512)
  const height = snap(body?.height, 512)
  const steps = Number.isFinite(body?.steps)
    ? Math.min(8, Math.max(1, Math.floor(body.steps)))
    : 4
  return { prompt, seed, width, height, steps }
}

async function handleGenerate(req, res) {
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

  let params
  try {
    params = validateGenerateBody(body)
  } catch (err) {
    errorResponse(res, 400, err.message, 'invalid_request_error')
    return
  }

  const clientId = randomUUID()
  const workflow = buildWorkflow(params)

  const t0 = Date.now()
  let promptId
  try {
    promptId = await queuePrompt(workflow, clientId)
  } catch (err) {
    errorResponse(res, 502, err.message, 'upstream_error')
    return
  }

  let record
  try {
    record = await waitForCompletion(promptId, t0 + GENERATION_TIMEOUT_MS)
  } catch (err) {
    errorResponse(res, 502, err.message, 'upstream_error')
    return
  }

  let pngBytes
  try {
    const image = extractOutputImage(record)
    pngBytes = await fetchImageBytes(image)
  } catch (err) {
    errorResponse(res, 502, err.message, 'upstream_error')
    return
  }

  const elapsedMs = Date.now() - t0
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'image/png',
    'Content-Length': pngBytes.length,
    'X-Pixel-Gen-Seed': String(params.seed),
    'X-Pixel-Gen-Elapsed-Ms': String(elapsedMs),
    'X-Pixel-Gen-Prompt-Id': promptId,
  })
  res.end(pngBytes)
}

async function handleHealth(_req, res) {
  let comfyOk = false
  let comfyErr = null
  try {
    const response = await fetch(`${COMFY_URL}/system_stats`, {
      signal: AbortSignal.timeout(3000),
    })
    comfyOk = response.ok
    if (!response.ok) comfyErr = `HTTP ${response.status}`
  } catch (err) {
    comfyErr = err.message
  }
  jsonResponse(res, 200, {
    ok: comfyOk,
    bridge: { host: HOST, port: PORT },
    upstream: { url: COMFY_URL, ok: comfyOk, error: comfyErr },
    models: {
      unet: UNET_FILE,
      t5: T5_FILE,
      clip_l: CLIP_L_FILE,
      vae: VAE_FILE,
      lora: LORA_FILE,
      lora_trigger: LORA_TRIGGER,
    },
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

  if (path === '/generate') return handleGenerate(req, res)
  if (path === '/health' || path === '/') return handleHealth(req, res)
  errorResponse(res, 404, `Unknown path: ${path}`, 'not_found')
})

server.listen(PORT, HOST, () => {
  console.log(`pixel-gen bridge listening on http://${HOST}:${PORT}`)
  console.log(`  upstream ComfyUI: ${COMFY_URL}`)
  console.log(`  models: unet=${UNET_FILE}  lora=${LORA_FILE}  vae=${VAE_FILE}`)
  console.log(`  POST /generate {prompt, seed?, width?, height?, steps?}  →  PNG`)
})
