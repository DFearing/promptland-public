# Promptland — Project Memory

Living document. Update as decisions solidify or change.

---

## Elevator pitch

A browser-based game that plays itself. The user picks a world theme (fantasy, cyberpunk, Star Trek-style sci-fi, etc.) and a character (species, gender, class — options gated by world), then watches. The screen has two sides:

- **Left:** 2D pixel-art character sprite on top mirroring the log actions (walking while traveling, sword-swinging during combat, etc.), with the character sheet and inventory panel below.
- **Right:** grid-based map on top showing only rooms the character has visited, with a MUD-style text log below streaming everything happening.

The inventory is read-only; clicking a visited room on the map shows its description, also read-only.

The gameplay loop is algorithm-driven. LLMs generate flavor: world lore, mob descriptions, item descriptions, and eventually 2D art assets. Generated content is persisted so the same thing isn't re-generated on future sessions. Worlds are thematically consistent — no guns in fantasy, no magic in sci-fi.

Each session builds on the previous. Sessions are persistent; the world accumulates state.

## v1 scope

Character sheet + inventory panel + map + log. **No 2D art yet** (sprite placeholder). The log runs, the character and inventory display, the map reveals as the character moves, the game loop ticks. Art comes later.

## Core design decisions

### LLM: BYOK (Bring Your Own Key)
User supplies their own LLM — either an API key for a hosted provider (Anthropic, OpenAI, Google, OpenRouter, etc.) or a local endpoint (Ollama, LM Studio, llama.cpp). This eliminates our biggest recurring cost and sidesteps API-key management entirely. Established pattern — GitHub Copilot, JetBrains Junie, OpenCode, Factory CLI, Cursor, etc. all support this.

**Implementation:** target the **OpenAI-compatible chat completions API** as the common denominator. Ollama, LM Studio, llama.cpp, OpenRouter, Anthropic, Google, DeepSeek, Mistral all expose an OpenAI-compatible endpoint. Users paste `base_url` + `api_key` + `model_name`. One code path covers everything.

Keys are stored in browser `localStorage` (never in our DB). In shared-world mode, LLM calls happen client-side and we never see keys.

### Worlds are thematically consistent
LLM prompts are parameterized by a "world manifest" (allowed entity types, vocabulary, taboos). Fantasy world manifest forbids "gun," "laser," "spaceship"; sci-fi manifest forbids "magic," "sword," "dragon" (swappable for sci-fi-appropriate equivalents). Generated entities get validated against the manifest before being persisted.

### Generated content is cached
Every LLM-generated entity (item, mob, location, lore snippet) gets persisted keyed by a deterministic hash of the generation inputs. Before generating, check the cache. This is non-negotiable — it's the central cost/latency optimization.

## Design decisions

### Shared world model
**Shared content cache only. Gameplay is single-player.** Players never see or affect each other. What's shared is the LLM-generated entity library — items, mobs, locations, lore snippets. When one player's game generates "the village of Thornfall," it's written to the shared cache; a future player whose world needs a village might draw that same Thornfall. Thematic consistency emerges from the shared lore library without any multiplayer complexity.

Two deployment tracks, same codebase:
- **Track A — Shared cache, minimal hosting.** Cloudflare Workers + D1 free tier for the shared entity cache.
- **Track B — Fully solo, fully free.** Static site + IndexedDB. No server. Player's cache is private.

Storage abstraction layer makes both possible from one bundle; user picks on first run.

### Save / resume (Track B)
JSON export/import only. Button to download save state as JSON, button to load one. Manual but bulletproof, works offline, no infrastructure. Doubles as a disaster-recovery mechanism in Track A. Deferred: WebDAV, cloud sync, gist sync, or any automated multi-device sync. Players who want cross-device play are steered toward Track A.

### Art pipeline — deferred post-v1
LLM-generated pixel art is the stated long-term goal but not in v1. Decisions to make when we get there: generation source (BYOK image-gen API vs. local vs. pre-generated library vs. procedural vs. hybrid), what gets generated (whole sprites vs. paper-doll layers vs. sprite sheets), and when generation happens (lazy on first encounter vs. background pregeneration). Leading candidate: hybrid pre-generated sprite library + BYOK image-gen, lazy generation on first encounter, whole sprites, animation via CSS/canvas transforms rather than generated sprite sheets.

## Gameplay loop

### Tick cadence
**Variable, state-dependent.** Fast during combat, medium exploring, slow during downtime. Local deployments can override cadence values via config file. Cloud deployments use fixed defaults.

### State machine
Six states in v1: **Traveling, Exploring, Fighting, Resting, Shopping, Interacting.** Each state has its own tick behavior and its own tick speed. Easy to add more states in later versions without restructuring.

**Configurable:** users can tune existing states (tick speeds, transition thresholds) and disable states they don't want (e.g., turn off Shopping). Users **cannot** add custom states in v1 — that would require a scripting hook; defer.

### Encounter system
**Weighted encounter tables per location type**, seeded by world theme. A "forest path" in fantasy has different odds (bandits, wolves, lost travelers, ruins) than a "neon alleyway" in cyberpunk (gangers, street vendors, malfunctioning drones, data caches). Tables are JSON data, not LLM-generated — cheap and deterministic. The LLM fills in flavor once an encounter is rolled.

### Combat
**Stat-driven, turn-based, MUD-style.** Each tick during Fighting is one round: attacker rolls to-hit vs. defender's evasion, damage rolls against armor, HP ticks down. No positioning, no tactics — this is a watch-game. Keeps the log readable and gives the character animation a clear hook (swing sword, take hit).

### Travel
**Grid-based world map with goal-seeking.** Each area is a bounded 3D grid of rooms. Movement between adjacent grid cells is implicit; connectivity exists unless walled off. The character has a current goal (find a quest-giver, reach a landmark, sell loot) and picks the adjacent cell that moves toward it. When goals are satisfied or expire, pick a new one. Wandering is the fallback behavior when no goal is active.

**Movement directions:** 10 total — 8 horizontal (N, NE, E, SE, S, SW, W, NW — classic MUD compass) plus up and down (stairs, ladders, elevators, etc.).

**Non-adjacent links allowed:** most movement is grid-adjacent, but worlds can define explicit links for teleporters, long staircases, portals, etc. These show up on the map as special icons.

**Per-area sizing:** each area (region, dungeon, settlement) is its own bounded grid with portals between them. MVP starts with small bounds. Moving between areas transitions to a new map.

### Map UI
Lives on the **right side, above the log**.

- **Fog of war:** only visited rooms are visible. Unvisited rooms are hidden entirely — not shown as "unexplored," just absent from the rendered grid until first entry.
- **Current location** is highlighted and updates in real time as the character moves.
- **Click-to-read:** clicking a visited room opens its description in a panel or popup. Read-only.
- **Floor selector:** defaults to the character's current floor. User can switch to any floor they've previously visited via arrows or a dropdown. Rooms with up/down connections show stair/ladder/elevator indicators.
- **Special icons** for non-adjacent links (portals, teleporters).

### Needs / drives
**Four basic drives:** hunger, fatigue, greed (wants gold/loot), curiosity (wants to explore new rooms). Drives accumulate over time; the highest drive picks the next goal. Eating at an inn satisfies hunger, sleeping satisfies fatigue, finding treasure satisfies greed, visiting a new room satisfies curiosity.

### Death
**Not permadeath.** Character dies, respawns, continues.

- **Respawn location:** the last safe location where the character rested (typically an inn, shrine, or equivalent).
- **Death log:** every death is counted and recorded with cause, location, and killer. The death log is part of the character's permanent story ("died 3 times: once to a goblin ambush, once to poisoned mushrooms, once falling off a cliff"). Great fodder for LLM-generated flavor text.
- **Penalties:** default is some equipment loss and/or some XP loss. **All penalty parameters are configurable** — users can tune harshness, disable penalties entirely, or enable stricter modes.
- **Optional advanced:** dead characters' corpses can become discoverable entities in the shared world cache for future runs or other players.

## Priorities (user-ranked)

1. Cheapest to run long-term
2. Ease of building (familiar web tech)
3. Best performance for pixel games

(Original ranking included "easiest to eventually add multiplayer" but the shared-cache-only decision supersedes this — the game is explicitly single-player.)

These priorities favor: boring web tech, aggressive caching, BYOK, and a free-tier-friendly backend.

## Non-goals (v1)

- Mobile app (web-first, mobile-responsive is fine)
- Accounts with passwords (use anonymous IDs or OAuth-only if needed)
- Real-time PvP
- Voice/audio
- Our own LLM hosting

## Known gaps — to work through before coding

The design decisions above are settled, but these specifics still need to be nailed down before a fresh session can start building:

1. **Data schemas.** No defined shape for `Character`, `Entity`, `World`, `Area`, `Room`, `Item`, `Mob`, `DeathRecord`, or the `Storage` interface itself.
2. **World manifests.** Referenced throughout but never defined. What fields are in a manifest? What's the hardcoded initial set (fantasy, cyberpunk, sci-fi — and which specific species/classes in each)?
3. **Prompt templates.** The entity cache is keyed by `(manifest_version, prompt_template_id, input_params)` — need the templates themselves, or at least an inventory of which ones exist (item generator, mob generator, location generator, lore snippet, etc.).
4. **Config file format** for local deployments. "Configurable tick speeds, configurable state toggles, configurable death penalties" but no spec for the config file itself.
5. **Character sheet stats.** What stats does a character have? HP, XP, plus what — STR/DEX/INT classic? World-specific stats? Blocks character creation UI.
6. **Project structure.** No directory layout, no decision on state management (Zustand? Redux? plain Context?), testing approach, or how PixiJS and React communicate.

Suggested approach when picking this up: work through each gap the same way as the TBDs — present options, decide, record. Possibly split into purpose-built companion docs (SCHEMAS.md, WORLDS.md, PROMPTS.md, STRUCTURE.md) rather than growing MEMORY.md further.

## Glossary

- **World manifest** — the JSON schema + allowlist/denylist of concepts for a given world theme. Drives LLM prompts and validation.
- **Entity cache** — persisted LLM-generated content, keyed by deterministic hash.
- **Tick** — a single step of the game loop; one line of log output roughly corresponds to one tick.
- **BYOK** — Bring Your Own Key.
- **Area** — a bounded 3D grid of rooms; the unit of map scope. Worlds contain multiple areas connected by portals.
- **Room** — a single cell in an area's grid. Has a description, coordinates (x, y, z), and connections to neighbors.
- **Fog of war** — unvisited rooms are not shown on the map at all (not even as "unexplored").
