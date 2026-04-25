# claude-proxy

A ~200-line Node script that exposes an **OpenAI-compatible**
`/v1/chat/completions` endpoint backed by **Claude Code's headless mode**
(`claude -p`). Point any OpenAI-compatible client at it — including
Promptland — and it will transparently use your Claude Code login (i.e. your
Pro/Max subscription) as the LLM backend.

## Why

- BYOK paid APIs cost money per token. A Claude subscription doesn't.
- Running Promptland's game loop against Claude-Haiku through a subscription
  means generating items, mobs, lore, etc. doesn't tick a meter beyond the
  flat monthly fee (subject to the plan's usage limits).
- The proxy is a local dev tool only. It does not ship with deployed builds
  and is not suitable for multi-user use.

## Prerequisites

1. Node 18+.
2. The `claude` CLI installed and **logged in** to your Anthropic account
   (`claude` once interactively, complete OAuth). Verify with `claude -p
   "hello"`.
3. That's it — no npm deps for the proxy itself.

## Run

```sh
npm run proxy
```

You should see:

```
claude-proxy listening on http://127.0.0.1:11435
  base_url for OpenAI-compatible clients: http://127.0.0.1:11435/v1
  default model: haiku
```

Leave it running in a second terminal alongside `npm run dev`.

## Wire into Promptland

In Promptland's LLM settings, pick the **"Claude Subscription (local
proxy)"** preset. Defaults:

- `base_url`: `http://127.0.0.1:11435/v1`
- `api_key`: (leave blank)
- `model`: `haiku` (also valid: `sonnet`, `opus`, or explicit IDs like
  `claude-haiku-4-5-20251001`)

## Quick smoke test

```sh
curl -sN http://127.0.0.1:11435/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"haiku","messages":[{"role":"user","content":"Reply with the single word pong."}]}'
```

You should get a standard OpenAI response object with Claude's reply in
`choices[0].message.content`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `CLAUDE_PROXY_PORT` | `11435` | Port to listen on. |
| `CLAUDE_PROXY_HOST` | `127.0.0.1` | Interface to bind. Stay on loopback. |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code binary. |
| `CLAUDE_PROXY_DEFAULT_MODEL` | `haiku` | Used when the request omits `model`. |
| `CLAUDE_PROXY_TIMEOUT_MS` | `120000` | Per-request timeout. |

## Limitations / gotchas

- **No streaming.** `stream: true` returns 400. Promptland's current
  `LLMClient` uses non-streaming, so this is fine today.
- **`temperature` and `max_tokens` are ignored.** Claude Code's headless mode
  doesn't expose them. If you need tight control over randomness, use the
  real Anthropic/OpenAI preset.
- **Cold-start cost.** Each request spawns a fresh `claude` process (~1–3s
  overhead). The 5-minute prompt cache warms subsequent calls, but the
  spawn itself is always there. Promptland's entity cache masks most of it.
- **Subscription rate limits.** Pro/Max plans meter by messages/sessions per
  5h window. A chatty game loop can hit these — the entity cache is your
  real mitigation.
- **Tools disabled.** The proxy passes `--tools ""` so Claude Code can't
  read files or run bash in response to "describe this goblin." Generation
  only.
- **Local-only.** Binds to loopback, uses your personal subscription.
  Never expose this proxy to the network or share the URL.
- **ToS.** Claude Code's headless mode is a supported Anthropic surface.
  Using it as a generation backend for your own local app falls within
  normal subscription use. Don't wrap it into a hosted service for others.

## How it works (one paragraph)

A Node `http` server. `POST /v1/chat/completions` parses the OpenAI-shaped
body, collapses all `system` messages into a single `--system-prompt` arg,
flattens user/assistant turns into a single prompt string, then spawns
`claude -p --output-format json --tools "" --no-session-persistence --model
<requested>` with the prompt on stdin. Claude Code returns one JSON blob
with a `result` field (the assistant's text) plus usage and cost info;
we repackage that into the standard OpenAI `chat.completion` shape and
return it. `/v1/models` lists the accepted Claude model aliases. `/health`
is a liveness probe.
