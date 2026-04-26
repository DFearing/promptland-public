# Promptland — Architecture

A survey of how the code is organized, how data flows, and how the LLM pipeline stays bounded.

---

## Directory layout

```
src/
├── App.tsx               # top-level app state, boot flow, LLM orchestration
├── areas/                # areas, rooms, shapes, movement, type defs
│   ├── types.ts          # Area / Room / RoomEncounter / Position
│   ├── movement.ts       # stepTowards, neighborsOf, BFS, adjacency checks
│   ├── shapeGen.ts       # deterministic area shape generation per AreaKind
│   └── index.ts          # enforceAreaCaps, pruneDisconnectedRooms, helpers
├── character/            # Character, Equipped, StatBlock, DeathRecord, titles
├── combat/               # damage verbs, severity tiers, death predicates (pickDeathPredicate)
├── components/           # React UI: DevPanel, LogPanel, MapPanel, SheetPanel, Topbar, ...
├── conditions/           # active conditions: poisoned, burning, slowed, etc.
├── effects/              # fullscreen + field effect derivation and overlays
├── game/                 # tick loop, drives, loot, combat resolution
│   ├── tick.ts           # runTick — the heart of the game
│   ├── state.ts          # GameState, TICK_MS, INITIAL_STATE
│   ├── drives.ts         # Drive vector math, top-drive pick
│   ├── loot.ts           # rollLoot / rollCuratedLoot / applyDrops
│   ├── equip.ts          # applyAutoEquip, combatBonuses
│   ├── death.ts          # applyDeathPenalty
│   ├── sell.ts           # pickItemsToSell — class-aware filtering
│   ├── sacrifice.ts      # pickItemsToSacrifice — shrine offload, wired into tick
│   ├── consume.ts        # maybeAutoConsume — potions + mana
│   ├── journal.ts        # deriveJournalEntry — milestone tracking
│   ├── logLines.ts       # log-line construction helpers
│   └── weight.ts         # weightDriveValue
├── items/                # ItemDef, rarity roll, stat multipliers
├── llm/                  # LLM client, templates, caching, generation pipeline
│   ├── client.ts         # OpenAI-compatible HTTP client
│   ├── mockClient.ts     # deterministic stub for tests / offline dev
│   ├── config.ts         # loadLLMConfig / saveLLMConfig (localStorage)
│   ├── templates.ts      # all prompt templates + parsers
│   ├── generate.ts       # generate() — render + call + parse + cache
│   ├── cacheKey.ts       # deterministic hash of (manifest, template, params)
│   ├── areaGen.ts        # payloadToArea, area-gen specific helpers
│   ├── areaGenPersistence.ts   # rehydrateGeneratedAreas, save/load graph
│   ├── bespokeMobs.ts    # installBespokeMobsFromPayload, rehydrate
│   └── bespokeItems.ts   # installBespokeItemsFromPayload, rehydrate
├── log/                  # LogEntry type and helpers
├── mobs/                 # MobArchetype, MobFlavor, Mob, spawn()
├── sound/                # procedural audio (Web Audio API)
├── gen/                  # pixel-art image generation client
│   ├── client.ts         # ImageGenClient — talks to tools/pixel-gen/ bridge
│   ├── sprites.ts        # sprite-fetch helpers used by CharacterViewport
│   └── types.ts          # ImageGenRequest / ImageGenResponse / HealthInfo
├── spells/               # Spell defs + castSpell
├── storage/              # Storage abstraction
│   ├── types.ts          # EntityCache, SaveStore, Storage interfaces
│   └── indexeddb.ts      # Dexie-backed implementation
├── themes/               # CSS themes, tick-speed presets, effect flags
├── util/                 # uuid + assorted helpers
└── worlds/               # content packs
    ├── contents.ts       # WORLD_CONTENTS registry
    ├── manifests.ts      # world manifests (species, classes, title ladders)
    ├── types.ts          # WorldContent, WorldManifest
    ├── fantasy/          # fantasy content pack
    ├── cyberpunk/        # cyberpunk content pack
    └── scifi/            # sci-fi content pack
```

---

## Game loop

The tick loop is a pure function: `runTick(phase, world) → phase'`. No side effects inside; all side effects (storage writes, LLM calls) happen in App.tsx around the state transitions.

```
┌──────────────────────────────────────────────────────────────┐
│  React state: { phase: 'playing', character, state, log }    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   setInterval(tickHandler, TICK_MS[state.kind])              │
│      │                                                       │
│      ▼                                                       │
│   runTick(phase, world)                                      │
│      │                                                       │
│      ├─ state.kind === 'exploring' → explore()               │
│      ├─ state.kind === 'fighting'  → fight()                 │
│      ├─ state.kind === 'resting'   → rest()                  │
│      └─ … etc.                                               │
│                                                              │
│   phase' (new character, new state, appended log)            │
│      │                                                       │
│      ▼                                                       │
│   setPhase(phase')                                           │
│                                                              │
│   Side effects driven by transition:                         │
│      • save to IndexedDB on character updates                │
│      • fire LLM generation when state → 'generating-area'    │
│      • push effect events derived from log deltas            │
└──────────────────────────────────────────────────────────────┘
```

The separation is deliberate: the core game is a deterministic state machine, and all external I/O (storage, LLM, effects) lives outside it. This makes the core trivially testable and deterministic; hashes of runs with the same seed are stable.

---

## Storage layer

Two stores behind a single `Storage` interface (`src/storage/types.ts`):

### `EntityCache`
Content-addressed cache for LLM-generated artifacts. Keyed by a deterministic hash of `(templateId, worldId, params)` so the same prompt never costs twice.

```ts
interface EntityCache {
  get(hash: string): Promise<EntityCacheEntry | null>
  put(entry: EntityCacheEntry): Promise<void>
  listByPrefix(prefix: string): Promise<EntityCacheEntry[]>  // rehydration
  delete(hash: string): Promise<void>
  deleteByTemplateAndWorld(templateId: string, worldId: string): Promise<number>
}
```

`EntityCacheEntry` carries the hash, kind (`item | mob | location | lore | title`), created-at timestamp, the raw payload, and generation metadata (character name, character level, world id, model id, generated-at).

### `SaveStore`
Character saves. Simple key-value — characters are loaded by id, listed by updated-at, and serialized to JSON.

```ts
interface SaveStore {
  list(): Promise<SaveMetadata[]>
  load(id: string): Promise<SaveRecord | null>
  save(record: SaveRecord): Promise<void>
  delete(id: string): Promise<void>
}
```

### `IndexedDBStorage`
The only currently-implemented backend (`src/storage/indexeddb.ts`). Uses Dexie for ergonomics. Single database `promptland` with two tables (`entities`, `saves`). Prefix scans are O(log n) on Dexie's indexed primary key.

> 🔮 **Track A deferred.** The original plan is a second backend — Cloudflare Workers + D1 — serving the same interface so a thin HTTP client can replace `IndexedDBStorage` without gameplay changes. Not wired. See [STATUS.md](STATUS.md).

---

## LLM pipeline

### Templates

Every LLM call is driven by a `PromptTemplate<TParams, TPayload>` (`src/llm/templates.ts`). Each template declares:

- `id` and `version` (version bumps invalidate old cache entries)
- `kind` — drives the entity-cache kind tag
- `defaultSystemTemplate` — system prompt with `{{placeholder}}` substitution
- `systemPlaceholders` — documentation of available placeholders
- `systemValues(params, ctx)` — map placeholders to values at render time
- `user(params)` — the user message
- `parse(content)` — hardened JSON parser that drops malformed fields rather than failing the whole generation

Templates currently defined:

| Template | Purpose | Version |
|---|---|---|
| `itemFlavorTemplate` | Name + description for an item archetype | v2 |
| `mobFlavorTemplate` | Name + description for a mob archetype | v2 |
| `areaFlavorTemplate` | Area name + theme keyword | v2 |
| `roomFlavorTemplate` | Per-room name + description | v2 |
| `areaGenTemplate` | **The big one.** Full area flavor + curated encounters + bespoke mobs + curated loot + bespoke items | v5 |
| `itemGenTemplate` | Full item generation | v1 |
| `mobGenTemplate` | Full mob generation | v1 |
| `loreSnippetTemplate` | Short lore snippet | v1 |
| `classTitleTemplate` | LLM-generated title for level 101+ | v1 |

### Shape-first area generation

`areaGenTemplate` is the area-gen workhorse. Instead of asking the LLM for a full area (positions, types, connectivity), Promptland **generates the shape deterministically first** and hands it to the LLM as a flavor-only pass.

```
1. App decides an exit triggers generation.
2. generateShape(areaKind, seed) returns ShapeRoom[] — a fixed grid of
   (x, y, z, type, hint) entries. Same seed → same shape → same cache hash.
3. areaGenTemplate prompt lists the shape as a numbered list. The LLM
   emits names + descriptions indexed to the shape, plus optional
   per-room curated encounters and loot.
4. installBespokeMobsFromPayload / installBespokeItemsFromPayload walk
   the payload, install any bespoke mobs/items into the world pool,
   write them to the entity cache, and rewrite the payload to by-id
   form.
5. payloadToArea merges shape + flavor → Area. The shape is
   authoritative for layout; the LLM only controls names,
   descriptions, and per-room curated overrides.
```

This decouples "the LLM might hallucinate connectivity" from "the map must be walkable." The shape generator has zero LLM exposure; the LLM has zero control over layout.

Four `AreaKind` shapes ship: `settlement` (3×3 town footprint), `wilderness` (road spine with branches), `dungeon` (corridor → chest antechamber → boss), `ruin` (scattered chambers). See `src/areas/shapeGen.ts`.

### Bespoke mob / item generation

Curated encounters can emit `newMob` inline (a full mob archetype) instead of referencing an existing `mobId`. Same for curated loot — items can be `newItem` bespoke equipment/junk.

```
Area gen payload
    │
    ▼
installBespokeMobsFromPayload
    │  • walks payload.rooms[].encounter
    │  • for each newMob: converts to MobTemplate, prunes unknown loot item ids
    │  • if id new: pushes to world.mobs, writes bespokeMob:{worldId}:{id} to cache
    │  • if id colliding: existing wins, encounter is rewritten to by-id ref
    │  ▼
installBespokeItemsFromPayload (called inside installCuratedLoot)
    │  • same pattern for items
    │  • kind limited to 'junk' | 'equipment' (consumables/scrolls need engine wiring)
    │  ▼
payloadToArea(installed, shape) → Area
```

On app boot, `rehydrateBespokeMobs` and `rehydrateBespokeItems` prefix-scan the cache for `bespokeMob:{worldId}:*` / `bespokeItem:{worldId}:*` entries and merge them into `world.mobs` / `world.items` before `rehydrateGeneratedAreas` runs. The effect: bespoke content accumulates across sessions, and later generations see earlier bespoke mobs in the pool so they can reference them by id.

### Generation metadata & cache keys

Every entry carries `GenerationMeta`:

```ts
interface GenerationMeta {
  characterName: string
  characterLevel?: number
  worldId: string
  modelId: string
  generatedAt: number
}
```

Cache keys are `${templateId}:${worldId}:${hash}` where `hash` is a deterministic hash of `(manifestVersion, templateId, serialized-params)`. Rehydration uses prefix scans on the primary key (O(log n) in Dexie).

Worlds can be purged wholesale via `deleteByTemplateAndWorld(templateId, worldId)` — used when a world manifest changes incompatibly.

---

## Effects pipeline

Effects are derived from the log stream + character state, not pushed from gameplay code.

```
log entries + character state
    │
    ▼
deriveEvents / deriveElementEvents / deriveFieldEvents
    │  (pure functions in src/effects/derive.ts)
    │
    ▼
EffectEvent[] / ElementFxEvent[] / FieldFxEvent[]
    │
    ▼
EffectsOverlay (React component, consumes events, renders cards/flashes)
```

This decoupling means the core loop knows nothing about effects — it only writes log entries. Effects are a projection. It's also how the effect system stays replayable: feed the same log into `deriveEvents` twice and you get the same events.

A FIFO queue inside `EffectsOverlay` serializes fullscreen card-style effects so at most one is on screen at a time. Rim flashes and ambient field effects bypass the queue.

---

## Theming

CSS custom properties, layered:

1. `design/colors_and_type.css` — the default "mud" green-on-black palette + type tokens.
2. `src/themes/extra.css` — additional themes (selected via `[data-theme="..."]` on `<html>`). Same token shape, different palettes.
3. `src/themes/scale.css` — `[data-scale]` attribute scales text tokens by a multiplier.

Themes are user-selectable in Settings. Scale is user-adjustable too — useful for high-DPI monitors where the default pixel-CRT look reads too small.

Per-rarity colors (`--rarity-common` … `--rarity-legendary`), per-drive colors, and per-element tints are defined as tokens and used uniformly across log entries, gauges, banners, and map markers.

---

## Build pipeline

Standard Vite + TypeScript. No SSR, no SSG, no server. The app is a single-page static bundle that talks to:

- **IndexedDB** for all gameplay state.
- **The user's LLM endpoint** (BYOK, browser-direct) for generation.

Build:

```bash
npm run build  # tsc -b && vite build  →  dist/
```

Deploy: anything that serves static files. Currently no deployment target is wired. Likely candidates (per the design doc) are Cloudflare Pages, GitHub Pages, or Netlify.

---

## Dev-time tooling

- **Mock LLM client** (`src/llm/mockClient.ts`) — deterministic stubs for every template, so the app is fully exercisable offline. Bound to the `MOCK_BASE_URL` sentinel value in Settings.
- **Claude Code proxy** (`tools/claude-proxy/server.mjs`) — a tiny Node server that exposes Claude Code's headless mode over an OpenAI-compatible endpoint. Lets you run the game against your Claude subscription without paying per-token. See `tools/claude-proxy/README.md`.
- **Pacing simulator** (`tools/sim/`) — headless deterministic simulator. Runs the tick loop against authored content with a seeded PRNG and reports how long it takes a character to reach each target level. `npm run sim` (default profile), `npm run sim:warrior`, `npm run sim:mage`, `npm run sim:long` for bundled profiles. Exit code 1 on any failing verdict. See `tools/sim/README.md`.
- **Pixel-gen bridge** (`tools/pixel-gen/`) — single-file Node bridge that fronts a local ComfyUI instance for pixel-art sprite generation. `npm run pixel-gen`. The browser client lives in `src/gen/`. Falls back to placeholders when the bridge is not running. See `tools/pixel-gen/README.md`.
- **Dev Panel** (`src/components/DevPanel.tsx`) — accessible via a toggle hotkey. Teleport between areas, spawn specific mobs at specific rarities, inject conditions, purge generated areas, modify drives, grant XP/gold, force-rest/meditate, move directionally, preview image gen (Gen tab), and more. See [DEVELOPMENT.md](DEVELOPMENT.md).
- **Dev log plugin** (`vite.config.ts` `promptland-dev-log`) — a middleware that accepts structured log events from the browser and prints them to the `npm run dev` terminal so LLM generations and cache hits are visible without opening devtools.
