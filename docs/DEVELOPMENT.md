# Promptland — Development

Handbook for working on the codebase. See [ARCHITECTURE.md](ARCHITECTURE.md) for the code layout and data flow.

---

## Setup

```bash
git clone <repo>
cd promptland
npm install
npm run dev     # http://localhost:5173
```

Requirements:
- Node 20+ (anything Vite 8 supports)
- npm (pnpm / yarn / bun all untested — should work)

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR on `localhost:5173`. Includes the `promptland-dev-log` middleware so browser-side LLM events print to the terminal. |
| `npm run build` | `tsc -b && vite build`. Typechecks every `tsconfig.*.json` project and emits a static bundle to `dist/`. |
| `npm run lint` | ESLint across the whole repo. Uses the flat-config setup in `eslint.config.js`. Zero-warnings is the goal; there's currently 1 known benign warning on `App.tsx`. |
| `npm run preview` | Serve the built `dist/` via Vite's preview server. Useful for sanity-checking a production build. |
| `npm run proxy` | Start the Claude Code proxy (`tools/claude-proxy/server.mjs`). See [LLM-SETUP.md](LLM-SETUP.md). |
| `npm run sim` | Run the pacing simulator with the default profile (`tools/sim/goals.json`). Exit code 1 on any failing verdict. See `tools/sim/README.md`. |
| `npm run sim:warrior` | Sim with the warrior-quick profile. |
| `npm run sim:mage` | Sim with the mage-midgame profile. |
| `npm run sim:long` | Sim with the long-haul profile. |
| `npm run pixel-gen` | Start the local pixel-art bridge (`tools/pixel-gen/server.mjs`) that fronts a ComfyUI instance. See `tools/pixel-gen/README.md`. |

---

## Dev Panel

A side panel accessible via a toggle hotkey (see `src/App.tsx` for the current binding). Organized into tabs:

### Play
- **D-pad.** 3×3 compass + U/D floor buttons. Stepping onto a portal or wired exit traverses in one step.
- **Rest / Meditate.** Transition to resting or meditating for 6 ticks.
- **Reset location.** Teleport back to the world's starting room without wiping any other state.
- **Sell items / Sacrifice items.** One-click bulk-offload batches.
- **Save.** Force an immediate save to IndexedDB outside of the normal event-driven cadence.
- **Die.** Two-click (2s confirm) instant-kill to test death/respawn.

### Spawn
Pick any mob id from the world pool and any rarity; instantly enters `fighting` state with that spawn.

### Set
Grant XP, gold, or any specific inventory item at any rarity/level. Also drive values (useful for debugging the goal-seeker).

### Cond
Inject any condition (poisoned, burning, slowed, stat-mod, etc.) at any stack count. Used for tuning condition visuals and combat.

### FX
Preview every fullscreen effect card (level-up, death, new-area, new-mob, new-item, rare-area, etc.) without having to trigger them in-game. Essential for testing theme changes.

### Log
Clear the current log, or dump a `sample log` that emits one entry of every log variant — useful when tuning colors/fonts.

### Theme
Swap themes, scale, and per-state tick speeds live. Changes persist to `localStorage`.

### Area
Lists every loaded area (authored + LLM-generated) grouped into level bands (1–5, 6–10, 11–15, …). Click any area to teleport. "Purge generated areas" wipes all LLM-generated areas for the current world (useful when iterating on prompts).

### Gen
Pixel-art image generation panel (`src/components/DevPanelGen.tsx`). Fires a test generation request to the running pixel-gen bridge and displays the result inline. Shows bridge health status. Requires `npm run pixel-gen` to be running.

---

## Project structure

```
.
├── README.md                 # top-level entry point
├── docs/                     # this folder
├── design/                   # design system (colors, fonts, UI kit, wordmark)
├── index.html                # SPA entry
├── public/                   # static assets copied to build root (favicon, fonts)
├── src/                      # application code — see ARCHITECTURE.md
│   ├── App.tsx
│   ├── App.css
│   ├── main.tsx
│   ├── areas/ character/ combat/ components/ conditions/
│   ├── effects/ game/ items/ llm/ log/ mobs/ sound/
│   ├── spells/ storage/ themes/ util/ worlds/
├── tools/
│   ├── claude-proxy/         # local proxy to Claude Code subscription
│   ├── pixel-gen/            # ComfyUI bridge for pixel-art sprite generation
│   └── sim/                  # deterministic pacing simulator
└── vite.config.ts
```

### `design/`

The design system in code. `colors_and_type.css` owns the canonical token names. Additional themes layer on via `src/themes/extra.css`. The UI kit under `design/ui_kits/promptland/` is a JSX recreation used for prototyping — it's not imported by the app.

### `docs/`

Prose. Current: [GAMEPLAY.md](GAMEPLAY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [LLM-SETUP.md](LLM-SETUP.md), [STATUS.md](STATUS.md), [DEVELOPMENT.md](DEVELOPMENT.md). Historical: [MEMORY.md](MEMORY.md) (original design doc), [RESEARCH.md](RESEARCH.md) (tech-stack research notes).

### `tools/claude-proxy/`

A tiny Node server exposing Claude Code's headless mode as an OpenAI-compatible endpoint. Zero dependencies beyond Node's standard library.

### `tools/pixel-gen/`

Single-file Node bridge that fronts a local ComfyUI instance. Accepts `POST /generate {prompt, seed?, width?, height?, steps?}` and returns a PNG. The browser-side client lives in `src/gen/`. See `tools/pixel-gen/README.md` for hardware requirements and setup.

### `tools/sim/`

Headless deterministic pacing simulator. Runs `runTick` in a loop with a seeded PRNG against the authored Millhaven content and reports level-up timing statistics. Drop JSON profile configs in `tools/sim/profiles/`. See `tools/sim/README.md`.

---

## Code conventions

- **TypeScript strict everywhere.** `tsconfig.app.json` uses `strict: true`. No `any` outside `as unknown as T` escape hatches at the LLM-payload boundary.
- **Pure core, side-effectful shell.** `src/game/tick.ts` is a pure function: `(phase, world) → phase'`. All IO (storage, LLM, logging, effects) happens in `src/App.tsx` around state transitions.
- **No comments for the obvious.** Comments explain *why*, not *what*. Don't annotate intent that's already clear from names. See the repo's comment style in `src/game/tick.ts` — every comment is load-bearing.
- **No backwards-compat shims.** Promptland pre-1.0 doesn't care about save-file forward compatibility. Schema changes can be breaking; the rehydration paths drop entries they can't parse rather than forever-carrying migration code. Once v1 ships, this posture will tighten.
- **Flat imports.** No barrel files that re-export everything — imports stay explicit so refactors are easy to follow. `index.ts` files exist only to define the public surface of a module (e.g. `src/areas/index.ts` exports the curated subset of the area module).
- **State types live close to their mechanics.** `GameState` is in `src/game/state.ts`, not a top-level types file. Same for `Character`, `Area`, `Mob`, `ItemDef`.

---

## Testing

**There are no automated unit/integration tests yet.** The audit-driven development style has leaned on:

1. **Typechecking as correctness floor.** `tsc -b --noEmit` catches most structural bugs.
2. **Lint as hygiene enforcement.** Custom rules (like the `react-hooks/set-state-in-effect` rule that flags effect-side setState chains) catch real footguns.
3. **Pacing simulator.** `npm run sim` runs the tick loop headlessly with a seeded PRNG and asserts level-up timing targets. Exit code 1 on any failing verdict — suitable for CI. This is the closest thing to an automated test in the repo today.
4. **Mock LLM client.** Exercises the full template pipeline offline.
5. **Dev Panel.** Every edge-case state is reachable in seconds for manual verification.

A proper test suite is a v1-complete follow-up. Likely shape: Vitest for unit (pure game logic), Playwright for end-to-end. Intentionally deferred — the game's mechanics are still in flux.

---

## Linting

`npm run lint` runs ESLint with the config in `eslint.config.js`. Key rules beyond the React defaults:

- `react-hooks/set-state-in-effect` — flags `setState` calls inside a `useEffect` body. Disabled case-by-case where the pattern is intentional; see the detailed comment in `src/effects/EffectsOverlay.tsx` for when this is justified.
- `@typescript-eslint/no-unused-vars` — strict. Use `_name` prefix to silence intentional unused parameters.

Pre-commit hook: **not configured.** Add one via Husky or similar if you're cutting frequent commits.

---

## Worktrees

The `.claude/worktrees/` directory under the repo root holds git worktrees used during feature development. Ignored by git (`.gitignore` includes `.claude/worktrees/`). Safe to delete if you're not mid-feature.

---

## Releasing

No releases yet. When we cut v0.1:

- `package.json` version bump.
- `npm run build` → produces `dist/`.
- Deploy `dist/` to whatever static host (Cloudflare Pages, Netlify, GitHub Pages all work).

Branch strategy: stacked PRs off `main`. See the PR history for examples — each substantive feature lands as its own PR, with multi-phase features split into a stack that merges bottom-up.
