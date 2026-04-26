# Promptland

**A browser-based game that plays itself.** Pick a world (fantasy, cyberpunk, sci-fi) and a character (species, class). Then watch. The character walks, fights, loots, rests, levels up, dies, respawns — all on its own. You're a spectator. The log on the right tells the story; the sheet on the left shows the character living it.

Promptland is algorithm-driven at the core — the tick loop, combat, drives, economy, and death all live in deterministic TypeScript. The **LLM only generates flavor**: world names, area layouts, mob descriptions, curated encounters and loot. Every generation is cached by hash so the same prompt never costs twice.

<img width="1024" height="360" alt="promptland-logo-primary-1024" src="https://github.com/user-attachments/assets/17fae2a7-a3a1-4f0c-8a7d-0327524a0b3c" />

## Quick start

```bash
npm install
npm run dev        # vite dev server on localhost:5173
npm run build      # typecheck + vite build → dist/
npm run lint       # eslint with zero-warning target
```

First run: the app opens to character creation. Pick a world, species, class, and a name. No accounts, no signup — everything lives in your browser's IndexedDB.

The game is playable **offline, without an LLM key.** LLM calls only happen for dynamic flavor generation (new areas past the authored starter chains, etc.). The hand-authored content covers the first few hours of play.

To enable LLM generation, open Settings → LLM, and paste an OpenAI-compatible `baseUrl` + `apiKey` + `model`. BYOK — your key never leaves your browser. See [docs/LLM-SETUP.md](docs/LLM-SETUP.md) for provider-specific guides (OpenRouter, Anthropic, Ollama, LM Studio, and a local Claude Code proxy).

## The idea

The point isn't to play a character — it's to watch a character live. The screen is split:

- **Left:** character sheet on top (HP/MP/XP, stat block, equipment, titles, drives), inventory below.
- **Right:** grid-based map on top (fog of war — only visited rooms visible), MUD-style log below streaming every action.

The game loop ticks at a state-dependent cadence: fast during combat, medium while exploring, slow while resting. Speed is user-adjustable from the topbar, and pauses cleanly at any time.

Worlds are thematically consistent — fantasy forbids "laser," sci-fi forbids "magic," cyberpunk has its own vocabulary. The LLM prompt is parameterized by a **world manifest** (allowed concepts, forbidden concepts, species/classes, currency name) so generated content stays in-world.

## Sections

- [**docs/GAMEPLAY.md**](docs/GAMEPLAY.md) — game systems: tick states, combat, drives, death, shops, worlds.
- [**docs/ARCHITECTURE.md**](docs/ARCHITECTURE.md) — code layout: storage, LLM pipeline, caching, rehydration.
- [**docs/LLM-SETUP.md**](docs/LLM-SETUP.md) — BYOK walkthroughs: hosted providers, local servers, Claude Code proxy.
- [**docs/STATUS.md**](docs/STATUS.md) — what's implemented, partially implemented, and missing. **Read this if you're evaluating the project's maturity.**
- [**docs/DEVELOPMENT.md**](docs/DEVELOPMENT.md) — developer handbook: scripts, directory structure, dev panel, conventions.
- [**design/README.md**](design/README.md) — the design system (colors, type, voice, CRT aesthetic).
- [**docs/MEMORY.md**](docs/MEMORY.md) — the original project-memory document (historical; some sections superseded by STATUS.md).
- [**docs/RESEARCH.md**](docs/RESEARCH.md) — early tech-stack research notes (historical).
- [**tools/sim/README.md**](tools/sim/README.md) — deterministic pacing simulator (`npm run sim`).
- [**tools/pixel-gen/README.md**](tools/pixel-gen/README.md) — local ComfyUI bridge for pixel-art sprite generation (`npm run pixel-gen`).
- [**tools/claude-proxy/README.md**](tools/claude-proxy/README.md) — local proxy to route generation through a Claude Code subscription.

## Tech stack (one-liner each)

- **Frontend** — Vite + TypeScript + React 19. Pixel-art viewport stubbed for PixiJS; no sprite assets yet.
- **Storage** — IndexedDB via Dexie. Abstracted behind a `Storage` interface so a Cloudflare Workers + D1 backend (Track A, shared cache) can slot in later without touching gameplay code.
- **LLM** — OpenAI-compatible chat completions. BYOK (key in `localStorage`, never server-side). Caching by deterministic hash of `(manifestVersion, templateId, params)`.
- **Sound** — Web Audio API, procedural synthesis (no sample files). Per-event tone recipes in `src/sound/manager.ts`.
- **Image gen (optional)** — local pixel-art sprite generation via a ComfyUI bridge (`tools/pixel-gen/`). Exposed to the browser through `src/gen/client.ts`. Falls back to placeholders when the bridge isn't running.

## Status at a glance

See [docs/STATUS.md](docs/STATUS.md) for the full matrix. Summary:

- **Fully wired:** character creation, full stat block, combat (with level scaling, ambush, mob self-heal, spells, conditions, DOTs), inventory (rarity + level + weight + requirements), drives + goal-seeking, map UI, fog of war, portals, three worlds, LLM integration with caching + bespoke mob/item + curated item generation, journal, custom theme editor, rest/meditate cooldown, layered level-up + death celebrations, procedural sound.
- **Partial:** shopping (auto-buy works, no manual purchase UI); death penalties (hardcoded, design doc promised configurable).
- **Deferred:** 2D sprite rendering (placeholder only; local pixel-gen bridge in `tools/pixel-gen/` for when you want to experiment), Cloudflare Workers backend (Track A), cross-device sync, corpses as shared-world entities.

## License

See [LICENSE](LICENSE).
