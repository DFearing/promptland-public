# Promptland — Tech Stack Research

Goal: pick a stack that's cheap to run long-term, uses familiar web tech, handles a pixel-art 2D game well, and doesn't paint us into a corner if we add multiplayer later. BYOK for LLMs is settled.

## Recommendation (TL;DR)

**Ship both tracks from one codebase:**

- **Frontend:** Vite + TypeScript + React (UI chrome) + **PixiJS** (character canvas). Single-page app, statically deployable.
- **Persistence abstraction:** a thin `Storage` interface with two implementations — `LocalStorage` (IndexedDB via Dexie) and `RemoteStorage` (HTTP to a Worker).
- **Track A (shared world):** Cloudflare Workers + D1 + Pages, all on the free tier.
- **Track B (solo / fully free):** the same static bundle, served from GitHub Pages or any static host, with IndexedDB as the only store.
- **LLM:** OpenAI-compatible HTTP requests from the browser, keys in `localStorage`. Works against Ollama, LM Studio, Anthropic, OpenAI, Google, OpenRouter, etc.

The user flips between tracks by choosing a "world server URL" on first run. Default to local; paste a Worker URL to join a shared world.

## Frontend framework — PixiJS over Phaser

The game is mostly **UI and text with a small animated sprite**. It isn't a platformer; there's no physics, no collisions, no tilemap. Phaser's built-in physics, scene manager, and input handling are wasted weight here.

PixiJS is purpose-built for 2D WebGL sprite rendering — fast, small (~200 KB), and leaves UI to React. Pixel-art rendering is well-supported (set `roundPixels: true` and disable texture smoothing). Benchmarks consistently put PixiJS among the top 2D renderers, and in this kind of app the bottleneck will be LLM latency, not rendering.

**Rejected alternatives:**
- **Phaser** — full game framework (~500 KB) with physics, tweens, scene management. Overkill; we want React for UI anyway.
- **Kaboom/Kaplay** — fun API but measured ~3 FPS in recent benchmarks. No.
- **Canvas API alone** — fine, but sprite batching and animation helpers are worth PixiJS's weight.
- **Babylon.js** — slightly faster in benchmarks, but it's a 3D engine we'd use 5% of. Bundle cost not justified.

React handles the log panel, character sheet, inventory, and world-selection UI. PixiJS renders only the character viewport inside a `<canvas>` that React mounts.

## Hosting and data — Cloudflare-first for Track A

Cloudflare's free tier is the strongest for this workload:

- **Workers:** 100,000 requests/day free. Our traffic per player is tick-driven, maybe 1 write per few seconds — easily fits.
- **D1 (SQLite):** 5 GB storage, 5 million row reads + 100,000 row writes per day free. Perfect for the entity cache, which is mostly reads with rare writes.
- **Pages / Workers static assets:** unlimited static bandwidth free. The game bundle and any art assets are static.
- **No egress charges** — critical, because LLM-generated text is small but frequent.
- Free tier has genuinely stayed free through multiple industry pricing shake-outs (unlike PlanetScale's discontinued hobby tier).

**Architecture:** static bundle on Pages → Worker at `/api/*` → D1 for entity cache and shared world state. The Worker is thin: validate requests, dedupe by entity hash, read/write D1. LLM calls never hit the Worker — they go browser-direct-to-provider.

**Rejected alternatives (for Track A):**
- **Supabase** — good but the 500 MB DB ceiling is tight for a world cache, and the free project pauses after 7 days of inactivity. Fine for prototyping, annoying for an always-available shared world.
- **Neon** — excellent Postgres, 0.5 GB per project, scale-to-zero with ~500ms cold start. Viable alternative if we want Postgres features. D1 is cheaper at scale and closer to the edge.
- **Turso** — 5 GB free, SQLite at the edge. Very competitive with D1; their Jan 2026 change removed scale-to-zero for new users but that's fine for an always-on service. A valid swap if D1 becomes limiting.
- **Firebase** — works, but vendor lock-in and proprietary query semantics. Pass.

## Track B — fully free, no hosting

Same bundle, zero backend. All state in **IndexedDB** (via Dexie.js for ergonomics). Deployable to GitHub Pages, Cloudflare Pages, Netlify, or served from `file://`.

- No accounts. The game ID lives in the URL fragment or localStorage.
- Optional JSON export/import for backups and device transfer.
- Entity cache lives in IndexedDB — identical schema to D1, different driver.

The storage abstraction is what makes this cheap to ship: the same game code talks to `storage.getEntity(hash)` whether that resolves via IndexedDB or a Worker HTTP call.

## LLM integration — OpenAI-compatible as the lingua franca

Every relevant provider exposes an OpenAI-compatible `/v1/chat/completions` endpoint:

- **Ollama** — `http://localhost:11434/v1/` (also supports Anthropic Messages API as of v0.14.0)
- **LM Studio** — `http://localhost:1234/v1/`
- **llama.cpp** server — OpenAI-compatible out of the box
- **Anthropic** — native Messages API + an OpenAI-compatible endpoint
- **OpenAI, Google (Gemini), DeepSeek, Mistral, OpenRouter** — all OpenAI-compatible

We ship a `LLMClient` that takes `{ baseUrl, apiKey, model }` and issues standard OpenAI-format requests. Users paste these three values in settings. Optional preset buttons for common providers pre-fill the base URL. **No server-side key handling, ever.**

**Prompt engineering:** world manifests constrain generation. Every LLM request is cached by a deterministic hash of `(manifest_version, prompt_template_id, input_params)`. Cache hits return instantly; misses call the user's LLM and store the result.

## Priority fit

1. **Cheapest long-term** — BYOK eliminates LLM cost; Cloudflare free tier covers everything else; IndexedDB costs nothing. ✅
2. **Ease of building** — React + TypeScript + Vite is as familiar as it gets. PixiJS is a thin addition. ✅
3. **Pixel game performance** — PixiJS is best-in-class for 2D WebGL sprites; the game's rendering demand is tiny anyway. ✅
4. **Easy path to multiplayer** — Workers + D1 already gives us shared state. Adding real-time presence later is a Durable Objects or WebSocket addition on the same platform, no replatforming. ✅

## Risks and open items

- **D1 row-read limits** — 5M reads/day sounds like a lot, but a chatty game loop could burn through it. Mitigation: the entity cache is accessed from the client directly on Track B; on Track A, aggressive client-side caching of hot entities + edge cache headers keep D1 reads low.
- **Cloudflare free tier changes** — if they ever do. Turso or Neon are drop-in replacements.
- **BYOK friction** — "paste an API key" is a real onboarding tax. Mitigation: bundle a preset for Ollama with localhost defaults so running it locally is zero-config, and OpenRouter is one-click signup with free-tier models.
- **CORS on local LLM endpoints** — Ollama requires `OLLAMA_ORIGINS=*` or an allowlist for browser access. Document this clearly in onboarding.

## Next steps

1. Scaffold the Vite + React + TypeScript + PixiJS skeleton with the two-panel layout.
2. Define the `Storage` interface and ship the IndexedDB implementation.
3. Build the character creation flow (world → species → class) with hardcoded world manifests.
4. Build the character sheet and inventory panels (no game loop yet).
5. Stub the LLM client and settings page.
6. Then — and only then — add the tick loop and log.
