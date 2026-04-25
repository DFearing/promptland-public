# pixel-gen

A single-file Node HTTP bridge that fronts a local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) instance so the game client sees a simple `POST /generate → PNG` endpoint instead of ComfyUI's workflow-queue-poll-view API.

**What runs where:** the bridge and ComfyUI both run on the machine with the GPU. The browser game (which may live on a VM or another host) talks to the bridge over HTTP — CORS allows any origin.

## One-time setup

### 1. Install ComfyUI on a GPU host

Download the portable Windows build (or build from source on Linux/Mac) from https://github.com/comfyanonymous/ComfyUI.

Minimum hardware for this workflow (Flux Schnell + pixel LoRA):
- **10 GB VRAM** (tested on RTX 3080). Below 10 GB needs a smaller quant.
- **16 GB system RAM**; more helps with ComfyUI's async weight offloading.
- **~16 GB free disk** for model weights.

### 2. Install the GGUF custom node

Flux Schnell is distributed as GGUF quants so it fits on consumer cards. ComfyUI needs an extension to load them.

```
cd <ComfyUI root>/ComfyUI/custom_nodes
git clone https://github.com/city96/ComfyUI-GGUF
cd <ComfyUI root>
./python_embeded/python.exe -m pip install -r ./ComfyUI/custom_nodes/ComfyUI-GGUF/requirements.txt
```

(On Linux/Mac replace `python_embeded/python.exe` with your ComfyUI Python.)

### 3. Download the models

All five files go under `<ComfyUI root>/ComfyUI/models/`:

| File | Folder | Size | Source |
|------|--------|------|--------|
| `flux1-schnell-Q5_K_S.gguf` | `unet/` | 8.26 GB | [city96/FLUX.1-schnell-gguf](https://huggingface.co/city96/FLUX.1-schnell-gguf) |
| `t5xxl_fp8_e4m3fn.safetensors` | `clip/` | 4.89 GB | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders) |
| `clip_l.safetensors` | `clip/` | 246 MB | same |
| `ae.safetensors` **⚠ gated** | `vae/` | 335 MB | [black-forest-labs/FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| `ume_modern_pixelart.safetensors` | `loras/` | 344 MB | [UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art](https://huggingface.co/UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art) |

The VAE is behind a click-through gate: open https://huggingface.co/black-forest-labs/FLUX.1-schnell once, sign in, click *"Agree and access repository"* (Apache 2.0, instant approval), then the download link works.

### 4. Launch ComfyUI with CORS enabled

Edit the launch script to pass `--enable-cors-header "*"`. On Windows portable that means editing `run_nvidia_gpu.bat`:

```
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors-header "*"
pause
```

Launch it. Confirm the console prints `To see the GUI go to: http://127.0.0.1:8188` and your GPU is detected.

## Running the bridge

From the repo root (on the same machine as ComfyUI):

```
npm run pixel-gen
```

Default listen address is `http://127.0.0.1:11436`. Override with env vars (see *Configuration*).

Expected startup:

```
pixel-gen bridge listening on http://127.0.0.1:11436
  upstream ComfyUI: http://127.0.0.1:8188
  models: unet=flux1-schnell-Q5_K_S.gguf  lora=ume_modern_pixelart.safetensors  vae=ae.safetensors
  POST /generate {prompt, seed?, width?, height?, steps?}  →  PNG
```

## Smoke test

```bash
curl -X POST http://127.0.0.1:11436/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a small knight with a red cape, white background"}' \
  -o test.png -D headers.txt
cat headers.txt | grep X-Pixel-Gen
```

On a 10 GB card the first call takes **~25 s** as ComfyUI loads weights. Subsequent calls with the same models stay in that range on 10 GB because the combined model footprint exceeds VRAM — ComfyUI juggles weights per request. If you care about latency, either:

- Upgrade to a ≥16 GB card so everything stays resident, or
- Drop to smaller quants (Q4 Flux + Q5 T5) to reduce swap pressure, or
- Pre-generate in background on area-enter rather than on-click.

## API

### `POST /generate`

Request body (JSON):

```ts
{
  prompt: string           // required, 1–2000 chars
  seed?: number            // 32-bit unsigned; omitted = random
  width?: number           // 256–2048, snapped to 64-px grid; default 512
  height?: number          // same
  steps?: number           // 1–8, default 4 (Flux Schnell is distilled to 4)
}
```

Response (on success):

- `200 OK`
- `Content-Type: image/png`
- Headers: `X-Pixel-Gen-Seed`, `X-Pixel-Gen-Elapsed-Ms`, `X-Pixel-Gen-Prompt-Id`
- Body: raw PNG bytes

Error responses are JSON: `{"error": {"message": "...", "type": "..."}}`.

### `GET /health`

Returns a JSON object with bridge info, ComfyUI reachability, and the model filenames currently configured. Used by the game client to decide whether to fall back to placeholders.

## Configuration

All env vars; defaults in parentheses.

| Var | Purpose |
|-----|---------|
| `PIXEL_GEN_PORT` | Bridge listen port (`11436`) |
| `PIXEL_GEN_HOST` | Bridge listen host (`127.0.0.1`) |
| `COMFY_URL` | Upstream ComfyUI base URL (`http://127.0.0.1:8188`) |
| `PIXEL_GEN_TIMEOUT_MS` | Max per-generation wall time (`180000`) |
| `PIXEL_GEN_POLL_MS` | ComfyUI history poll interval (`500`) |
| `PIXEL_GEN_UNET` | Flux UNet filename (`flux1-schnell-Q5_K_S.gguf`) |
| `PIXEL_GEN_T5` | T5 text encoder filename (`t5xxl_fp8_e4m3fn.safetensors`) |
| `PIXEL_GEN_CLIP_L` | CLIP-L filename (`clip_l.safetensors`) |
| `PIXEL_GEN_VAE` | VAE filename (`ae.safetensors`) |
| `PIXEL_GEN_LORA` | LoRA filename (`ume_modern_pixelart.safetensors`) |
| `PIXEL_GEN_LORA_TRIGGER` | Text prefix auto-added to every prompt (`umempart, pixel art`) |

Swap the UNet env var to point at a different Flux quant, or set `PIXEL_GEN_LORA_TRIGGER` to `""` to disable the auto-prefix.

## Design notes

- **Zero deps, Node ≥18** — the bridge uses only `node:http` and native `fetch`. No npm install.
- **Runs beside ComfyUI, not inside the VM running the game client** — the GPU lives with the host, the bridge lives with the GPU, and the browser talks across via HTTP+CORS.
- **Workflow JSON is built in code** (not a template file) so parameter substitution is typed rather than a regex pass. Swapping to Flux Dev or Klein is a matter of adding a second workflow factory.
- **No streaming** — the bridge polls ComfyUI's `/history` until done, then returns the PNG in one shot. Good enough for per-sprite generation; if the game needs progress events later, swap the poll loop for ComfyUI's WebSocket.
