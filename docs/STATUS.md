# Promptland — Implementation Status

**What works, what's partial, what's missing.** Ground truth from a codebase audit, matched against the design intent in [MEMORY.md](MEMORY.md). Last updated 2026-04-24.

Overall: **~90% of v1 scope is implemented and end-to-end wired.** Track A (Cloudflare shared cache) is the largest intentional gap; it's deferred and doesn't block Track B gameplay.

---

## Matrix

| System | Status | Notes |
|---|---|---|
| [Tick loop / game states](#tick-loop--game-states) | ✅ 80% | 6 states; Shopping & Interacting merged into `using-room` |
| [Character sheet + stats](#character-sheet--stats) | ✅ 100% | 6-stat block, HP/MP/XP, 11 equip slots, titles |
| [Inventory system](#inventory-system) | ✅ 100% | 4 kinds, rarity, level, weight, requirements, auto-equip |
| [Combat](#combat) | ✅ 95% | Attack/defense math, level scaling, ambush, mob heal, spells, conditions, DOTs |
| [Death + respawn](#death--respawn) | 🟡 80% | Wired, but penalties are hardcoded; config file undesigned |
| [World + area + room model](#world--area--room-model) | ✅ 100% | 10 directions, fog of war, portals, exits, floor selector, 3 worlds |
| [LLM integration](#llm-integration) | ✅ 100% | BYOK, OpenAI-compat, caching by hash, 9 templates |
| [Shared world cache (Track A)](#shared-world-cache-track-a) | ❌ 0% | Not wired; IndexedDB-only (Track B) |
| [Save / resume](#save--resume) | ✅ 90% | Multi-slot, JSON persistence; no auto-save cadence |
| [Shop / economy](#shop--economy) | 🟡 70% | Auto-buy + auto-sell work; no purchase UI, no forced-sell on weight |
| [Needs / drives](#needs--drives) | ✅ 100% | 5 drives incl. weight, goal-seeking, satisfaction |
| [Map UI](#map-ui) | ✅ 100% | Fog, floor selector, click-to-read, portal icons, area rarity color |
| [Effects / feedback](#effects--feedback) | ✅ 100% | Level-up, death, damage, new-area, rare variant, effects queue |
| [Topbar controls](#topbar-controls) | ✅ 100% | Pause, speed, mute, settings |
| [Dev tools](#dev-tools) | ✅ 100% | Teleport, spawn, conditions, reset, purge, drive manip |
| [Audio / themes](#audio--themes) | ✅ 100% | Procedural synthesis, 5+ themes, scale, color tokens |
| [Art / sprites](#art--sprites) | ❌ 0% | Placeholder only; explicitly out of v1 scope |

Legend: ✅ fully wired · 🟡 partial · ❌ not implemented

---

## Tick loop / game states

**Implemented.** Six states (`exploring`, `resting`, `meditating`, `fighting`, `using-room`, `generating-area`) with per-state tick cadence. User-adjustable speed multiplier (0.5× / 1× / 2×) with auto-ramp for new characters. Pause is clean and reversible.

### Gap: Shopping and Interacting merged

The design doc listed **six gameplay states**: Traveling, Exploring, Fighting, Resting, Shopping, Interacting. In code, Shopping and Interacting are **merged into `using-room`** with a `UsingAction` union (`satisfy` / `traverse-portal` / `sell`). This was a reasonable consolidation — shopping and interacting are one-tick events driven by context, not sustained state phases — but it means:

- "Shopping as its own state" with its own tick speed isn't configurable.
- Extending to new interaction types (talking to NPCs, reading lore plaques, etc.) requires adding a new `UsingAction` variant, not a new top-level state.

**Files:** `src/game/state.ts:12-36`

---

## Character sheet + stats

**Implemented.** Full 6-stat block (STR/DEX/CON/INT/WIS/CHA), HP/MP/XP pools derived from species + class + CON/MIND mods, 11 equipment slots (including offhand for dual-wield), inventory with stacking, death log, level-up record tracking best item and baddest enemy per segment.

Titles: hand-authored ladder per class up to level 100. Beyond 100, `classTitleTemplate` generates per-character titles on demand and caches them.

**Files:** `src/character/types.ts`, `src/worlds/manifests.ts`

---

## Inventory system

**Implemented.** Four item kinds (junk, consumable, equipment, scroll), weight-per-item, rarity rolled at drop, item level scales archetype stats, equip requirements (STR/DEX/INT/WIS/level minimums) scaled down by rarity, auto-equip on loot pickup, class-aware sell filtering.

**Files:** `src/items/`, `src/game/equip.ts`, `src/game/loot.ts`

---

## Combat

**Implemented end-to-end.**

- Attack/defense math — d4 + STR mod + equip bonus vs. mob defense; severity tiered from excess.
- Level-delta scaling — higher-level attacker hits harder, lower-level bounces off.
- Rarity-scaled mob stats (via `spawn` with rarity mult).
- Ambush mechanic — auto-ambush at level delta ≥ 5, 15% roll otherwise.
- Mob self-heal — fires below 35% HP, limited by `healCharges`.
- Spells — damage, heal, buff/debuff, teleport-to-safe.
- Conditions — `dot`, `skip`, `stat-mod` kinds, optional element tag (fire/ice/electric/earth/hack).
- DOTs — clamped so they can't kill (min 1 HP).
- Auto-consume potions at < 50% HP / MP.

### Minor gap: generic verb pools per severity

Damage verbs are picked from severity-tier pools, not from the attacker's weapon type or spell. "Slash" and "crush" don't differentiate between a sword-swing and a mace-swing. Flavor-level, not mechanical.

**Files:** `src/game/tick.ts` (runTick + fight + ambush + heal), `src/combat/`, `src/spells/`, `src/conditions/`, `src/game/consume.ts`

---

## Death + respawn

**Implemented, not configurable.**

- Respawn at `lastSafePosition` (last inn/shrine/safe room rested at), falls back to area start.
- Full `DeathRecord[]` on the character: cause, area, room, killer, timestamp.

### Gap: penalties are hardcoded

`applyDeathPenalty` in `src/game/death.ts` applies:

- 25% XP loss (floored at zero on current level)
- 10–25% gold loss (random)
- Per-equipped-item 100% loss roll (every equipped slot is rolled independently)

The design doc calls for **configurable** penalty parameters — users should be able to tune harshness, disable penalties entirely, or enable stricter modes. **Not implemented.** A config-file format for local deployments was also part of the design but is likewise not specified yet.

### Gap: corpses as shared-world entities

The advanced goal in the design doc was: a dead character's corpse becomes a discoverable entity in the shared-world cache — another player could run across "Fenra the Warrior's body" in a forest clearing. **Deferred** until Track A (shared cache) ships.

**Files:** `src/game/death.ts`

---

## World + area + room model

**Implemented.** Grid-bounded areas (3D with x/y/z), 10-direction movement (N/NE/E/SE/S/SW/W/NW + U/D), fog of war (unvisited rooms rendered absent, not as "unexplored"), portal rooms with explicit destinations, exit rooms that trigger area generation, floor selector, click-to-read, per-exit per-character-level area generation.

**Three worlds** all fully playable:

- `fantasy` — Millhaven + mill stream + thornwood + barrows
- `cyberpunk` — district hubs + neon alleys + data caches
- `scifi` — station habs + disputed outposts + anomalies

All three share identical mechanics; only content (mobs, items, rooms, currency name, vocabulary, spell library) differs.

**Files:** `src/areas/`, `src/worlds/`

---

## LLM integration

**Implemented.** BYOK (base URL + api key + model, in localStorage only). OpenAI-compatible chat completions. Nine prompt templates: `itemFlavorTemplate`, `mobFlavorTemplate`, `areaFlavorTemplate`, `roomFlavorTemplate`, `areaGenTemplate` (the big one — v5 — flavor + curated encounters + bespoke mobs + curated loot + bespoke items), `itemGenTemplate`, `mobGenTemplate`, `loreSnippetTemplate`, `classTitleTemplate`.

Caching by deterministic hash of `(manifestVersion, templateId, params)`. Every entry carries `GenerationMeta` for audit/replay. Prefix scans rehydrate generated content on boot.

Mock LLM client ships for offline development. Claude Code proxy in `tools/claude-proxy/` lets a subscription cover generation cost without an API key.

**Files:** `src/llm/`

---

## Shared world cache (Track A)

**Not implemented.** The plan: a Cloudflare Workers + D1 backend that serves the same `Storage` interface over HTTP, so a thin `RemoteStorage` implementation can replace `IndexedDBStorage`. The shared cache would let LLM-generated entities (items, mobs, locations, lore) from one player's game appear in a future player's world — thematic consistency emerges from the shared library.

Zero code written. No Cloudflare Workers, no D1 schema, no `RemoteStorage` implementation. The storage layer is abstracted cleanly so adding it later is not expected to touch gameplay code.

**Acceptable for v1** — the design doc explicitly describes this as Track A (shared) vs. Track B (solo), deployable from the same bundle with a first-run selector. Only Track B ships today.

---

## Save / resume

**Implemented.** Multi-character roster, each character has a unique id and serializes to JSON. Saves live in IndexedDB (`saves` table). The roster UI lists all characters sorted by updated-at.

### Gap: no auto-save cadence

Currently saves fire in response to specific gameplay events (level-up, death, meaningful state transitions). There's no wall-clock auto-save timer. If the user closes the tab mid-tick, the latest save is whatever the last event-driven save captured — usually within seconds, but not guaranteed.

### Gap: no cross-device sync

The design doc explicitly deferred WebDAV / cloud sync / gist sync. JSON export/import is listed as the intended solution but the UI buttons for it are **not yet wired**.

**Files:** `src/storage/indexeddb.ts`, character-loading in `src/App.tsx`

---

## Shop / economy

**Partial.**

### Wired

- Per-world currency (`gold` for fantasy, `credits` for cyberpunk + scifi).
- Hand-authored shop inventory per world (item id + price + max stock).
- **Auto-buy:** at a shop with sufficient currency, healing potions auto-purchase at HP < 50% and mana potions at MP < 50%. Capped at 3 of each already in inventory.
- **Auto-sell:** when the `weight` drive crosses threshold at a shop, `pickItemsToSell` picks items to offload with class-aware filtering (never sells consumables/scrolls; sells junk first; filters equipment by class bonuses).

### Gaps

- **No player-initiated purchase UI.** Entering a shop doesn't open a browsable inventory. You can't pick something and buy it.
- **No weight-driven forced-sell in main loop.** The `weight` drive contributes to goal-seeking (drives the character toward a shop when overloaded) but there's no hard encumbrance cap that stops the character from picking up another item — over-encumbered characters just have a persistent weight drive.
- **Sacrifice is dev-only.** `src/game/sacrifice.ts` exists and is callable from the Dev Panel, but isn't wired into the main tick loop.

**Files:** `src/game/tick.ts` (tryShopPurchase), `src/game/sell.ts`, `src/game/sacrifice.ts`

---

## Needs / drives

**Implemented.** Five drives: `hunger`, `fatigue`, `greed`, `curiosity`, `weight`. First four grow while exploring; `weight` is computed from inventory mass vs. STR-derived capacity. `topDrive` picks the one above `DRIVE_THRESHOLD` (35). Goal-seeker BFSes toward a room that `satisfies` that drive.

Rooms annotate what they satisfy via `RoomArchetype.satisfies?: Drive[]`. Authored rooms are annotated; LLM-generated rooms inherit satisfaction from their shape's room type.

**Files:** `src/game/drives.ts`, `src/game/weight.ts`, `src/game/tick.ts`

---

## Map UI

**Implemented.** Fog of war (unvisited rooms rendered absent), floor selector (arrows + dropdown filtering by z), click-to-read (room description popover), portal icons, area-name + area-rarity color in the map header.

**Files:** `src/components/MapPanel.tsx`, `src/components/RoomDescPanel.tsx`

---

## Effects / feedback

**Implemented.** Pure derivation from log stream + character state (in `src/effects/derive.ts`). Events:

- Rim flashes: damage taken, heal self (scaled by intensity).
- Fullscreen cards: level-up (with segment summary), death, new-area (+ rare-variant), LLM-connected, generating-area, new-mob (rare+ only), new-item.
- Effects queue: FIFO serialization of fullscreen cards. Rim flashes bypass.

Everything is toggleable per-effect in Settings.

**Files:** `src/effects/`

---

## Topbar controls

**Implemented.** Pause / speed selector / mute / settings. Mute is separated from sound-enable (mute from topbar preserves volume; disabling in Settings hides the audio cluster entirely).

**Files:** `src/components/Topbar.tsx`

---

## Dev tools

**Implemented.** Dev Panel with tabs:

- **Play:** D-pad (10-direction + U/D floor buttons), rest / meditate / reset-location / die (with 2s confirm), sell / sacrifice items.
- **Spawn:** roll a specific mob id at a specific rarity, instant-fight.
- **Set:** grant XP / gold / specific item / drive value.
- **Cond:** inject any condition at any stack count.
- **FX:** preview every fullscreen effect.
- **Log:** clear log, sample log (dumps every log variant for theme previewing).
- **Theme:** swap themes + scale + tick speeds.
- **Area:** list every loaded area grouped by level tier, teleport to any by click, purge all generated areas for the world.

**Files:** `src/components/DevPanel.tsx`

---

## Audio / themes

**Implemented.** All sound is procedural (Web Audio API) — no sample files. Per-event tone recipes in `src/sound/manager.ts`.

Themes: `mud` (default classic green-on-black), plus additional palettes swapped via `[data-theme]`. Scale via `[data-scale]`. Rarity/drive/element colors as tokens applied uniformly.

**Files:** `src/sound/`, `src/themes/`, `design/colors_and_type.css`

---

## Art / sprites

**Not implemented — intentional.**

The design doc explicitly stated: "No 2D art yet (sprite placeholder)." Still true. `design/` contains UI assets (logo, icons, wordmark, fonts) but **no character sprites, mob sprites, animation sheets, or tile art.**

The character viewport component (`src/components/CharacterViewport.tsx`) is a stub placeholder. PixiJS is a dependency but nothing renders on a `<canvas>` yet.

Art pipeline decisions deferred: generation source (BYOK image-gen vs. local vs. pre-generated library vs. procedural vs. hybrid), what gets generated (whole sprites vs. paper-doll layers), when generation happens (lazy-on-first-encounter vs. background pregen). Leading candidate per MEMORY.md: hybrid pre-generated sprite library + BYOK image-gen, lazy generation, whole sprites, animation via CSS/canvas transforms.

---

## Deferred (explicitly post-v1)

- **Multiplayer / shared presence.** Never in scope. Promptland is explicitly single-player even on Track A — the shared layer is the entity cache, not the gameplay.
- **Accounts / auth.** Track A plan is anonymous ids or OAuth-only if needed. No account system today.
- **Mobile app.** Web-first. The layout is mobile-responsive-ish but the split-panel design is desktop-first.
- **Voice / audio generation.** Procedural sound is in; TTS narration of the log is not planned.
- **Player-authored worlds.** Users cannot add custom worlds in-app. The three worlds are hardcoded TypeScript content packs. Adding a fourth requires adding a directory and wiring into `WORLD_CONTENTS`.
- **Custom gameplay states.** Users can tune existing state tick speeds and disable states (e.g. turn off shopping) but cannot add new custom states. Would require a scripting hook.

---

## Known TODOs in the codebase

Searches for `TODO`, `FIXME`, `placeholder`, `pending`, `not yet`, `not implemented` across the source tree:

- `src/llm/mockClient.ts` — documented placeholder flavor strings for the mock provider. Intentional.
- `src/components/SheetPanel.tsx` — "Title pending — the archive is composing one" rendered for level-101+ characters while `classTitleTemplate` is inflight. Intentional.
- `src/areas/types.ts` — `pendingAreaGeneration?: boolean` on exit rooms awaiting LLM area-gen. Intentional.
- `src/components/CharacterCreation.tsx` — "(Coming Soon)" labels on species/class options that aren't wired for a given world.

**No blocking TODOs or unfinished critical paths.**
