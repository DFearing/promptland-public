# Promptland — LLM setup

Promptland is **BYOK — bring your own key.** You plug in any OpenAI-compatible chat-completions endpoint and the game talks to it directly from your browser. Nothing routes through a Promptland server (there is no Promptland server).

The hand-authored starter chains are playable **without any LLM at all.** You only need a key when the character steps through an unexplored exit into dynamically-generated territory.

---

## Configuration

Open Settings → LLM. Three fields:

- **Base URL** — the OpenAI-compatible root. Ends at `/v1/` typically.
- **API key** — provider credential. Stored in `localStorage` on your machine only.
- **Model** — the model id the provider expects (e.g. `gpt-4o-mini`, `claude-sonnet-4-5`, `llama3.1:8b`).

Test the connection with the "Ping" button — it runs a tiny throwaway completion.

---

## Providers

### OpenRouter (easiest hosted)

OpenRouter is the path of least resistance: one signup, one key, access to every major model. Free tier covers several models at modest rates.

```
Base URL: https://openrouter.ai/api/v1
API key:  sk-or-...
Model:    openai/gpt-4o-mini          # or any other listed model
```

See [openrouter.ai/models](https://openrouter.ai/models) for the catalog and pricing.

### Anthropic (direct)

Anthropic's native Messages API also exposes an OpenAI-compatible endpoint.

```
Base URL: https://api.anthropic.com/v1
API key:  sk-ant-...
Model:    claude-sonnet-4-5   # or claude-haiku-4-5, claude-opus-4-6, etc.
```

### OpenAI (direct)

```
Base URL: https://api.openai.com/v1
API key:  sk-...
Model:    gpt-4o-mini        # or gpt-4o, etc.
```

### Google Gemini

Gemini's OpenAI-compat endpoint is at:

```
Base URL: https://generativelanguage.googleapis.com/v1beta/openai
API key:  <Google AI Studio key>
Model:    gemini-2.5-flash   # or gemini-2.5-pro
```

### DeepSeek, Mistral, Groq, etc.

All expose OpenAI-compatible endpoints. Check their docs for the `baseUrl` and paste the key + model id into Settings.

---

## Local models (no key needed)

### Ollama

```
Base URL: http://localhost:11434/v1
API key:  (leave blank, or any placeholder)
Model:    llama3.1:8b       # or whatever's pulled
```

**Important:** Ollama blocks browser requests by default. Set `OLLAMA_ORIGINS=*` before starting Ollama, or configure an explicit allowlist:

```bash
OLLAMA_ORIGINS="http://localhost:5173" ollama serve
```

### LM Studio

Start the local server from LM Studio's Developer tab. Default:

```
Base URL: http://localhost:1234/v1
API key:  (blank)
Model:    <whatever's loaded — check the Developer tab for the id>
```

### llama.cpp server

```bash
./llama-server -m <model.gguf> --port 8080
```

```
Base URL: http://localhost:8080/v1
API key:  (blank)
Model:    (whatever llama.cpp exposes, usually the filename)
```

---

## Claude Code proxy (local, via subscription)

If you already have a Claude Code subscription, `tools/claude-proxy/server.mjs` exposes a **minimal OpenAI-compatible server** that routes requests through `claude -p` (Claude Code's headless mode). Your subscription covers the generation cost; you never touch an API key.

```bash
npm run proxy
# → listening on http://localhost:8123/v1
```

Then in Settings:

```
Base URL: http://localhost:8123/v1
API key:  (blank)
Model:    claude-sonnet-4-5   # or any Claude model your subscription supports
```

Caveats:

- **No streaming.** The proxy returns `400` on `stream: true`. Promptland's current LLM path is request-response, so this is fine in practice but rules out future streaming hookups.
- **~Second of spawn overhead.** Each completion spawns a fresh `claude -p` subprocess. The entity cache masks most of this — cold generations feel slower than hosted APIs, warm (cached) generations are instant.

See [`tools/claude-proxy/README.md`](../tools/claude-proxy/README.md) for detailed setup.

---

## Mock mode (no LLM at all)

For offline development or testing, Promptland ships a deterministic mock provider. In Settings, paste:

```
Base URL: mock://
API key:  (any, or blank)
Model:    mock-v1
```

The mock returns stable placeholder flavor for every template. Useful when you want to exercise the full pipeline (including caching and rehydration) without burning tokens.

---

## How the pipeline uses your key

1. **Key is stored in `localStorage` only.** Never written to IndexedDB, never sent anywhere except the endpoint you specified.
2. **All generation requests are browser-direct.** There is no Promptland proxy.
3. **Every generation is cached by a deterministic hash.** Same prompt → same key → cache hit → no API call.
4. **Cache lives in IndexedDB.** Survives refreshes. Purged per-world via Dev Panel's "Purge generated areas" if you want to re-roll everything in a world.

If your key leaks, it's because your browser was compromised or your extensions have too much permission. The Promptland codebase reads `localStorage.getItem('promptland.llm.config')` and that value goes into the `Authorization: Bearer …` header of the completion request. That's it.

---

## Cost shape

With caching, a new character playing through authored content uses **zero tokens** until they step into an unexplored exit. After that:

| Action | Cost |
|---|---|
| Generating a new area (cold) | one `areaGenTemplate` call — a few hundred output tokens, ~3k input tokens including the mob/item pools. |
| Re-entering a generated area | zero (cache hit). |
| Defeating a bespoke mob the LLM just invented | zero — the mob is now in `world.mobs`, not a fresh generation. |
| Gaining level 101 | one `classTitleTemplate` call per new-title threshold — tiny. |

For a few hours of play through fresh content, expect **~50–200 generations total** depending on how aggressively you explore. At GPT-4o-mini or Claude Haiku rates, that's under a dollar. Local models are free beyond electricity.
