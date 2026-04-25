# Promptland Design System

**Promptland** is a browser-based game that plays itself. The player picks a world (fantasy, cyberpunk, sci-fi) and a character (species, gender, class), then **watches** the character live out an emergent adventure. Gameplay is algorithm-driven; LLMs generate the flavor — world lore, items, mobs, room descriptions — while the player is a spectator. The character dies, respawns, and the story accumulates across sessions.

The name is the product thesis. The player is not the hero — they're the one who watched the rehearsal. The tone is quiet, literary, self-aware, a little dry. Not silly. Not grim. Somewhere in cozy/idle-game territory, but with the visual lineage of a 1992 MUD client.

## Sources

- **Original brief:** pasted product description.
- **Repo:** `DFearing/promptland` (React 19 + Vite + PixiJS + Dexie/IndexedDB). Read selectively — `src/App.tsx`, `src/App.css`, `src/components/CharacterCreation.tsx`, `src/components/CharacterRoster.tsx`, `src/components/CharacterPanel.tsx`, `src/worlds/manifests.ts`.
- **World copy** (`manifests.ts`) was the most useful source — its one-liners ("A bow, a path, a long silence.", "Half you, half warranty.") confirmed the understated literary tone and are the voice this system aims to extend.

### Relationship to the current repo styling

The repo today uses a **system-UI sans + purple accent (`#c084fc`) on dark slate (`#15151c`)** with rounded 4–8px corners. That is a functional scaffold — the visual language was never committed to.

**This design system proposes a different direction**: classic MUD green-on-black, pixel display face (VT323), monospace body (IBM Plex Mono), zero radius, phosphor glow. It's an intentional aesthetic commitment that matches the brief's explicit "retro MUD/roguelike lineage" call and the copy tone already in `manifests.ts`.

The existing components map 1:1 to this system — `CharacterRoster`, `CharacterCreation`, `CharacterPanel`, `MapPanel`, `LogPanel`, `CharacterViewport` all have direct analogs in the UI kit. To adopt, swap `App.css` and the inline `<style>` blocks in each component for the tokens in `colors_and_type.css`, then rebuild the three screens against the kit recreations in `ui_kits/promptland/`.

## Product surface (v1)

Single desktop-first React + PixiJS web app. Two-column layout:

```
┌───────────────────┬─────────────────────────────────┐
│  CHARACTER SPRITE │  MAP GRID (floor selector)      │
│  (Pixi canvas)    │                                 │
│                   │                                 │
├───────────────────┼─────────────────────────────────┤
│  SHEET / INVENTORY│  LOG (scrolling MUD stream)     │
│  (tabbed)         │                                 │
│                   │                                 │
└───────────────────┴─────────────────────────────────┘
```

Plus two flows:
- **Character creation wizard** — world → species → gender → class
- **Settings** — BYOK LLM config (base URL / key / model, with provider presets)

And a **speed control** chrome (pause / 1× / 2× / 4×) since the game auto-plays.

## Themes

The MUD aesthetic is the DNA. Different *worlds* swap the color palette — future themes like `cyberpunk` (magenta-on-black) and `vacuum` (ice-white-on-navy) will slot in alongside these:

| Theme | Data attribute | Palette | Use |
|---|---|---|---|
| **Classic MUD** (default) | `data-theme="mud"` | Phosphor green on deep black | Fantasy worlds |
| **Amber** | `data-theme="amber"` | PC/3270 amber on warm black | Alt terminal, some sci-fi |
| **Phosphor White** | `data-theme="phosphor"` | Paper-white on black | Neutral / "settings" areas |

All three are wired in `colors_and_type.css`. Swap by setting `data-theme` on `<html>` or any subtree.

---

## CONTENT FUNDAMENTALS

Promptland's voice is the single most defining thing about the product. The log is 60% of what the player sees, so how it's written IS the UX.

### The voice

**Narrator-first, not system-first.** Traditional MUDs say "You are in a dimly lit room." Promptland says "Fenra stands at the edge of the pit, counting her arrows. She has three." The player is not the protagonist — the log is a story being told about someone else.

**Third person, past or present.** Both are acceptable. Lean present for action, past for reflection.

- ✅ `Fenra parries, takes the blow on her shoulder, and laughs.`
- ✅ `The room had been quieter before the moth found her lantern.`
- ❌ `You attack the goblin. You hit for 4 damage.` *(not this game)*

**Understated, literary, never epic.** The character matters but is not Chosen. Small verbs do the work. Avoid capital-letter moments.

- ✅ `A rat leaves. A rat arrives. Fenra does not look up.`
- ❌ `FENRA, HERO OF THE REALM, STRIKES DOWN THE DARK ONE!`

**Self-aware about the premise.** Occasional — *rare* — dry asides from the narrator are welcome. Fourth-wall nudges that acknowledge the player is watching. Use once per session, not every five lines.

- ✅ `Someone, somewhere, is watching her do this. She does not know.`
- ✅ `(The promptland improvises. It is not in the script.)`

**Mechanical events are written as prose.** Damage, item pickups, level-ups — all get narrated. Numbers appear in parentheses or margins, not mid-sentence.

- ✅ `The wound closes slowly. (+6 HP)`
- ✅ `She pockets the bone die. It is heavier than it looks.`
- ❌ `You healed 6 HP. You picked up Bone Die.`

### Casing

- **UI labels:** ALL CAPS, letter-spaced. `INVENTORY`, `MAP`, `SHEET`, `SETTINGS`. This is the MUD/CRT lineage — labels feel stenciled, not typeset.
- **Body copy & log:** Sentence case. Normal prose.
- **Proper nouns:** Normal capitalization. `Fenra`, `The Sunken Chapel`, `Blackroot Lantern`.
- **Buttons:** Sentence case verbs. `Begin`, `Continue`, `Pause`, `Save settings`. Not `BEGIN GAME` (reserved for marquee moments).
- **Menu items:** Sentence case. `New character`, `Load save`, `Configure model`.

### Person

- **Never "you."** The player is not the character. No "You see...", "You pick up...".
- **Narrator uses the character's name or a pronoun.** `Fenra`, `she`, `her`.
- **Settings & chrome use "you."** UI copy talking to the player is fine: `Your API key is stored locally.`, `You can resume at any time.`
- **The game never addresses the character.** No "The ghost looks at you."

### Emoji

**No emoji anywhere.** Not in UI, not in log, not in settings, not in success/error toasts. Emoji break the period aesthetic and the tone.

### Icons as text

Where a terminal would use a glyph, Promptland uses **ASCII/Unicode box-drawing or bracketed tags**:

- `[+]` add, new
- `[ ]` empty slot
- `[x]` filled / worn
- `▲ ▼ ◄ ►` direction
- `✶` rare item (Unicode is fine; emoji is not)
- `†` dead
- `◎` current location
- `◯` visited
- `·` unvisited fog
- `━ │ ┏ ┓ ┗ ┛ ┣ ┫` box drawing for panel frames where borders aren't enough

### Examples by surface

**Log entries** (Vollkorn-style prose with mono tags)

```
Fenra descends three flights of the staircase before she realizes
it is the same flight. She turns around.

A moth the size of a thumbnail drifts past her ear. She watches
it leave.

    >  The moth remembers the shape of her lantern.

The door at the landing is wet. She opens it.

    —  New area: The Sunken Chapel
```

**Tooltip / item description**

```
BLACKROOT LANTERN
A brass lantern, its glass fogged from the inside. Lights rooms
that were dim. Does nothing in rooms that are dark.
                                                    weight · 0.6
```

**Empty states**

- Inventory empty: `Her pockets are empty.`
- Log not started: `Fenra is still sleeping.`
- Save slot unused: `No one has lived here yet.`

**Settings / toasts**

- `Settings saved.`
- `Could not reach the model. Check the base URL.`
- `Resuming Fenra's seventh life.`

**Character death** (the most important single line in the product)

```
                Fenra is dead.
            She made it to floor four.
            
              She will be back shortly.
```

---

## VISUAL FOUNDATIONS

### Colors

A three-layer dark palette with a **single dominant hue** per theme (green for mud, amber for amber, near-white for phosphor). Accents are used *semantically*, not decoratively:

- `--fg-1` — primary text (log body)
- `--fg-2` — secondary (stat values, labels)
- `--fg-3` — tertiary (metadata, timestamps)
- `--fg-dim` — fog of war, disabled
- `--accent` — current location, hover state
- `--accent-hot` — focused, selected, headings
- `--good` / `--warn` / `--bad` — heal / caution / damage
- `--magic` — rare items, dialogue, magical effects
- `--speech` — NPC dialogue quoted in log
- `--link` — cyan, reserved for tooltips & interactive prose

Backgrounds are **layered blacks** (`bg-0` page, `bg-1` panel, `bg-2` raised, `bg-3` pressed, `bg-inset` sunken). Subtle green bias on mud theme, warm bias on amber.

### Typography

Three faces, all monospace or monospace-adjacent. **No sans-serifs.** Sans would snap the period.

- **VT323** — display/labels/wordmark. Pixelated CRT face. Big (min 18px, often 24–48px) because it's hard to read small.
- **IBM Plex Mono** — body, log prose, paragraph text. 14–15px baseline. Line height 1.55–1.65 (log needs to breathe).
- **JetBrains Mono** — numeric data. Tabular figures on by default. Used for stat tables, inventory counts, timestamps.

**Hierarchy strategy:** headings set in VT323 with a phosphor glow (`text-shadow: var(--glow-sm)`). Body in Plex Mono with no glow. Numbers in JetBrains Mono.

### Spacing

Tight **4px grid**. Dense information layout — this is a terminal, not a marketing page. Most gaps are `--sp-2` (8px) or `--sp-3` (12px). Panel padding is `--sp-4` (16px). Never more than `--sp-7` (32px) between related elements.

### Backgrounds

- **No images behind UI.** The aesthetic is pure CRT — backgrounds are flat dark colors.
- **Scanlines** (`.scanlines` utility) are an *optional* overlay on the game viewport and key panels. Subtle — 35% opacity multiply blend. Never full screen or it becomes tedious.
- **No gradients.** Exception: the sprite viewport uses a single radial `bg-1 → bg-0` vignette to suggest CRT curvature.
- **No patterns or textures** except scanlines.
- **No illustrations.** All "art" in v1 is typography + ASCII + pixel sprites (deferred to image-gen later).

### Borders

**1px solid borders** are the primary way panels are separated. Two weights:

- `--line-1` — subtle, for dividers inside a panel
- `--line-2` — panel perimeter (most common)
- `--line-3` — focus / active / selected

Optional **ASCII box-drawing frames** for flagship moments — the character creation wizard, the death screen, the first-boot settings. Implemented via CSS `::before`/`::after` with corner characters.

### Corners

**Radius zero.** Everywhere. Terminals don't round. `--radius-1` and `--radius-2` tokens exist as escape hatches but default to `0px`.

### Shadows

- **No drop shadows.** Drop shadows are for skeuomorphic UI; this is not that.
- **Inner shadows** on sunken fields (`--shadow-inset`) to give textareas/search inputs a "carved into the CRT" feel.
- **Phosphor glow** (`--glow-sm/md/lg`) replaces the drop shadow role — applied to text, current location highlight, hover states.

### Animations

Minimal and subtle. The game auto-plays; UI should feel calm.

- **`--dur-fast` (90ms)** — hover color shifts
- **`--dur-base` (160ms)** — panel opens, tab switches, log entry fade-in
- **`--dur-slow` (320ms)** — wizard step transitions, settings save confirmation
- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` — snappy out, no bounce
- **Cursor blink** — 1s hard step (not ease) on input fields and log tail
- **Phosphor flicker** — optional 4s very-subtle opacity 1→0.97 loop on the root container. Used very sparingly.
- **No** slides, spins, parallax, scroll-jack, or springy easing.

### Hover states

- **Links:** color shifts `--link → --accent-hot`, dotted underline becomes solid
- **Buttons:** background brightens one layer (`bg-2 → bg-3`), border shifts to `--line-3`, adds `--glow-sm` to text
- **Map cells:** background fills with `--fg-dim`, cursor crosshairs appear (ASCII corners)
- **Log entries:** hover reveals timestamp in `--fg-3` mono

### Press / active states

- **Buttons:** background drops one layer, border stays at `--line-3`, no transform (no shrink/scale — breaks pixel grid)
- **Map cells:** briefly invert (`bg-0` fg, `fg-1` bg) for 90ms, then back
- **Toggle buttons:** filled `bg-3` when on, outlined when off

### Transparency & blur

**Avoid both.** No frosted glass, no translucent overlays — these are modern-iOS vocabulary and fight the CRT thesis. The one exception: the **scanline overlay** (35% opacity via mix-blend-multiply). That's it.

### Cards

There are no "cards" in the Material sense. There are **panels**: flat `--bg-1` surfaces with a 1px `--line-2` border, no radius, no shadow. Items in inventory and map cells are panels too — just smaller ones.

### Layout rules

- **Two-column desktop** (described above). Resize behavior: columns are ratio-based (left 320px fixed, right flex).
- **Fixed chrome:** top-bar with wordmark + speed controls + settings icon is always visible.
- **No floating elements.** Tooltips anchor to their target with 1px gap. Menus render in-place.
- **Log auto-scrolls** unless the user has scrolled up; then a `[jump to present]` affordance appears.

### Imagery vibe (when there is any)

- **Pixel sprites only** — 32px or 64px base, nearest-neighbor scaled to 128/256/512. No smooth interpolation anywhere.
- **Character sprites:** front-facing or 3/4 view, on transparent background.
- **Current palette constraint** — sprites should adopt the theme's primary hue when possible (a desaturated sprite tinted `--fg-1` reads as in-world).
- **No photography, no stock art, no AI-generated 3D renders. Ever.**

---

## ICONOGRAPHY

**Promptland largely does not use icons.** The CRT aesthetic means labels, ASCII characters, and typography do the work that icons would do in a modern UI.

### Where icons appear

- **Speed controls:** ⏸ pause, ▶ 1×, ▶▶ 2×, ▶▶▶ 4× — all Unicode glyphs
- **Direction / navigation:** ▲ ▼ ◄ ►
- **Map legend:** `◎` player, `◯` visited, `·` unvisited, `†` dead here, `✶` item, `□` unexplored door
- **Log prefixes:** `>` system, `—` chapter/scene break, `"` dialogue
- **Form states:** `[ ]` unchecked, `[x]` checked, `[-]` indeterminate

All of the above are **plain Unicode characters or ASCII**. Not SVG, not emoji, not an icon font. They're text — they inherit color, size, and glow from their container.

### Fallback: SVG for a handful of chrome affordances

A small set of genuinely-visual-only icons — settings gear, close (×), collapse (⌄), expand (⌃), play/pause/FF — live as **CSS-drawn or inline SVG** elements at `assets/icons/` when needed. Single-color, 1px stroke, 16×16 viewBox, `currentColor` fill/stroke so they pick up theme colors.

Stroke weight matches text baseline (1px on a 16px grid). No gradient fills, no multi-color icons.

### No emoji, ever

Not even in casual/human moments. Emoji carry brand semantics (Apple, Google, Twitter) that fight the Promptland period aesthetic. Use Unicode dingbats if you need "emoji-like" — `✶ ✷ ❂ ❧ ✧ ◉`.

### No icon font

Icon fonts (Font Awesome, Material Icons, etc.) are not used. Don't add one. Prefer a Unicode character; fall back to an inline SVG drawn in the brand style.

### Assets in this system

- `assets/logo/promptland-wordmark.svg` — primary wordmark, VT323-style
- `assets/logo/promptland-mark.svg` — just the `[U]` mark for small spaces
- `assets/icons/` — inline SVG icons as needed (settings, close, play/pause, chevrons)

If the user downloads this system as a Claude Code skill and needs more icons, **generate them in the existing style** — single-color, 1px stroke, 16×16 grid, `currentColor`. Don't pull from Lucide / Heroicons / etc.; their geometry doesn't match the CRT aesthetic.

---

## Index

The root folder:

| Path | What it is |
|---|---|
| `README.md` | This file |
| `SKILL.md` | Manifest for use as a Claude Code skill |
| `colors_and_type.css` | **All** color tokens, type scale, spacing, motion, utilities. Three themes wired. |
| `fonts/` | Font substitution notes. Fonts load from Google Fonts at runtime. |
| `assets/` | Logos (`logo/`) and SVG icons (`icons/`) |
| `preview/` | Individual design-system cards (one HTML file per card). Shown in the Design System tab. |
| `ui_kits/promptland/` | High-fidelity React UI kit: the main game view, character creation wizard, settings. `index.html` is the clickable demo. |

Each UI kit subdirectory has its own `README.md` describing components and screens.
