# Promptland — Theming Guide

A reference for **why each color exists** in the Promptland palette. Write a new theme by translating each token into the new palette's equivalent role — not by matching hexes 1:1.

The default theme `mud` (phosphor green on deep black) is the canonical reference; every value below is taken from `design/colors_and_type.css`. Per-theme overrides live in `src/themes/extra.css`. The user-editable "Custom" theme exposes a smaller eight-token surface and synthesizes the rest (see `src/themes/customTheme.ts`).

---

## How the palette layers

1. **Default tokens** — defined under `:root, :root[data-theme="mud"]` in `design/colors_and_type.css`. Every token has a value here.
2. **Per-theme overrides** — defined under `:root[data-theme="<id>"]` in `design/colors_and_type.css` (for `amber`, `phosphor`) or `src/themes/extra.css` (for `mud-classic`, `neon`, `cyber`, `vacuum`, `vellum`, `paper`). A theme only overrides what it wants to change; everything else inherits from the defaults. **This means a new theme can crash if it forgets a token whose default doesn't fit its background — always re-check `--magic`, `--speech`, `--log-hp`, `--log-mp`, `--log-neutral`, `--log-muted`, the rarity tier set, `--player`, `--dir`, `--heat` against the new palette.**
3. **Custom theme** — eight user-picked tokens written inline on the root element via `applyCustomThemeTokens()`; the rest are synthesized by `mix()` and `darken()` from those eight.

A theme is selected by setting `data-theme="<id>"` on `<html>` (`applyTheme()` in `src/themes/config.ts`).

---

## Surfaces — `--bg-*`

A new theme must define the full layered set, not just one background. Every one is referenced by name in component CSS; missing tokens render as transparent black.

| Token | Default | Role |
|---|---|---|
| `--bg-0` | `#050807` | **Page background.** The body fills with this; it's the deepest "outside the panels" surface. Must be darker (or lighter, on light themes) than every panel so panels read as raised. |
| `--bg-1` | `#0a110d` | **Panel background.** Sheet, log, map, inventory all sit on this. The "default" surface for content. |
| `--bg-2` | `#0f1913` | **Raised / hover.** Buttons in their hover state, expanded panel sections, the sprite frame's lower half. Should read as one step *above* `--bg-1` — usually 4–8% lighter than `bg-1` on dark themes. |
| `--bg-3` | `#152219` | **Pressed / selected.** Toggle buttons in their on state, the active speed-control button, the currently-selected map cell. Brighter than `bg-2`. |
| `--bg-inset` | `#030504` | **Sunken field.** Inputs (BYOK URL field), code blocks, scrollbar tracks. Must be *darker* than `bg-0` on dark themes (or lighter than the page on light themes — see `vellum` `#faf1dc` vs page `#f3e9d0`). The "carved into the CRT" feel depends on this contrast. |

**Why a five-step ramp instead of three:** the UI has a true four-state interaction model (default → hover → pressed → inset) plus the page itself, and collapsing any pair makes hover and select indistinguishable. Resist the temptation to merge.

---

## Foreground text — `--fg-*`

Three semantic ranks of text plus a "fog" tier and a body-copy override for the log.

| Token | Default | Role |
|---|---|---|
| `--fg-1` | `#a8ffb0` | **Primary text.** Stat values, log speaker names, button labels, the brightest text in the system. Should have ~7:1 contrast against `--bg-1`. |
| `--fg-2` | `#6fd37a` | **Secondary text.** Stat labels ("HP", "STR"), section headings inside panels, the system-line italic in the log. Visibly dimmer than `fg-1` but still legible at 13px. |
| `--fg-3` | `#3f8c4a` | **Tertiary / metadata.** Subtitles, timestamps, deprecated values, the `meta` log line, captions. Skim-only — readers shouldn't need to focus on it. |
| `--fg-dim` | `#1f4a28` | **Fog of war / disabled.** Unrevealed map positions, disabled buttons, "this isn't here yet" placeholder text. Must remain *barely* legible against `--bg-1`; if it disappears entirely, fog of war becomes invisible. |
| `--fg-body` | `#b8b8b8` | **Log body copy.** Deliberately neutral/desaturated rather than themed, so colored tokens (mob names, items, directions) pop against it instead of competing with the green-on-green prose. Themes that want a fully monochromatic log (`mud-classic`) can override this back to `--fg-2`; otherwise leave it as a near-white grey. |

**Why `--fg-body` exists separately:** when log prose used `--fg-1`, every colored token (rare items, mob names, damage tags) had to fight the bright green wash. Pulling body to a neutral grey turned the colored tokens into legible signal again. New themes should make this token slightly desaturated, slightly dim, but never black-on-black.

---

## Identity colors — `--player`, `--dir`, `--heat`

These three exist to keep three commonly-conflicting roles apart. Every theme should override them — the defaults are correct for `mud` and may clash elsewhere.

| Token | Default | Role |
|---|---|---|
| `--player` | `#ffffff` | **The character's name.** Used wherever the protagonist's name appears in the log or sheet. Falls back to `--accent-hot` if unset. Must read as "the hero" — distinct from accents, never the same as mob/item colors. MUD picks pure white so the player stands clear of the phosphor-green hud. |
| `--dir` | `#8ecbff` | **Cardinal directions in the log** ("north", "southeast", etc.). Should read as "travel/movement" — typically a cool blue or cyan. Falls back to `--link`. |
| `--heat` | `#ff8a3d` | **High-tier damage verbs in the log** (severe / critical strikes). Pulled out of `--bad` so it doesn't collide with mob names (which also paint in `--bad`). Warm orange that reads as "fire/violence." Falls back to `--warn`. **Note: code currently routes through `--verb-emph`, which serves the same role; keep both aligned.** |

---

## Accents — `--accent`, `--accent-hot`, `--link`

The three "this is interactive or important" colors. Used semantically, not decoratively.

| Token | Default | Role |
|---|---|---|
| `--accent` | `#7bff88` | **Current location, hover state, active border.** The "you are here" color. Saturated version of the foreground hue. |
| `--accent-hot` | `#c4ffcb` | **Selected, focused, headings, the wordmark, the character's name on the sheet.** The brightest accent — reserved for *the* highlighted thing, not just *a* highlighted thing. Headings and h1–h5 paint in this. |
| `--link` | `#8af0ff` | **Cyan tooltips, interactive prose.** The "click me" color when something looks like a link rather than a button. Distinct hue from `--accent` so a cyan link inside a green panel reads as off-color = clickable. |

**Why two accents:** hover (`--accent`) and selected (`--accent-hot`) need to coexist — when a user hovers a tab while another is selected, the two need to read at a glance. One color flattens that distinction.

---

## Semantic tokens — combat, narration, magic

The "these mean something specific" colors. Every theme **must** define these or borrow defaults that work with the new palette. Light themes especially need to revisit `--magic` and `--speech`.

| Token | Default | Role |
|---|---|---|
| `--good` | `#9bf57a` | **Positive outcomes.** XP gained, items picked up, buffs applied, "+" bonuses, item names in the log, healing log lines, confirmations. Should read as "this is helpful." |
| `--warn` | `#ffcc66` | **Caution, low HP, settings cog, dev panel title.** Yellow-orange that says "look at this but don't panic." Borders of toggle buttons in their warning state. |
| `--bad` | `#ff6b6b` | **Damage, death, errors, mob names** (rare+ overrides per-rarity). Saturated red. Lethal, unfriendly, or destructive. Mob names default to this so even a no-rarity goblin reads as a threat. |
| `--magic` | `#c99bff` | **Magic, dialogue (room/condition tokens), generating-area effects.** Purple by default — the "this is otherworldly" color. Used in the log for room names, condition names, and during the generating-area fullscreen effect. **Warning:** light themes should pick a darker purple (`vellum` uses `#5b2e82`); a pale lilac on parchment is invisible. |
| `--speech` | `#ffe58a` | **NPC dialogue in the log.** Warm yellow/cream — should read as "spoken aloud" against neutral body copy. |
| `--verb-emph` | `#ff8a3d` | **SEVERE / CRITICAL damage verbs in the log.** Same warm orange as `--heat`. Themeable so light palettes can swap to a darker shade (`vellum` uses `#6b1313` burgundy). The visual emphasis comes from a tight black outline + bold weight, not a glow — same-color glows smear orange into a halo. |
| `--hp` | `#6fd37a` | **HP bar in the sheet.** Frequently aligned with the theme's main `--fg` so the bar reads as "in palette." |
| `--mp` | `#6fd37a` | **MP bar in the sheet.** Similarly aligned with the theme; on `mud` it intentionally matches `--hp` so both bars sit in the green family. Override per-theme if MP should diverge (e.g., `vellum` uses indigo `#1e3a8a`). |
| `--xp` | `#6fd37a` | **XP bar in the sheet.** Same logic as `--hp` / `--mp`. Note: not declared in every per-theme block — falls back to default green; light themes should override. |

---

## Log-only HP / MP / XP — `--log-*`

The sheet bars stay in palette; the log paints HP/MP/XP references in classic "red HP / blue MP" so the eye scans them as a familiar pair. This split is deliberate: the sheet is the "palette surface," the log is the "data surface."

| Token | Default | Role |
|---|---|---|
| `--log-hp` | `#ff5a6a` | **HP references in log prose.** "+8 HP" inline and "(+8 HP)" in the trailing combat tag share this color so they read identically. Themes that want monochrome (`mud-classic`) override back to the main palette. |
| `--log-mp` | `#6f9aff` | **MP references in log prose.** Same role as `--log-hp` for the magic stat. |
| `--log-xp` | `var(--xp)` | **XP references in log prose.** Defaults to the same value as the XP bar so the log "+N XP" reads as the bar's twin. Independent from `--xp` so themes can split them if needed (mirrors the HP/MP split). |
| `--log-scale` | `#6f4e37` | **Damage multiplier "×0.48 MOD" tag.** Coffee brown — pure brown with no orange, gray, or sienna cast. Sits visibly distinct from `--verb-emph` (warm orange ATK) and the HP/MP/XP stat colors that share the same combat-math line. |
| `--log-neutral` | `#e8e8ea` | **Damage-tag final amount.** The "8 DMG" number itself reads as a clean bright neutral, independent of whatever the theme chose for `--fg-1` (which on phosphor renders as bright green). |
| `--log-muted` | `#5a5a5a` | **Damage-tag dim parts** (defender's defense roll). Dim grey so the supporting numbers sink without disappearing. Independent of `--fg-dim` (which on phosphor is dark green and would clash inside a math tag). |

**Why these are separate from the bar tokens:** when `--hp` was overloaded for both the sheet bar and log prose, themes had to choose between "make the bar match the palette" and "make the log scan as red HP." Splitting them lets each surface speak its own language without the theme writer doing extra work.

---

## Rarity tiers — `--rarity-*`

A five-tier ramp shared by items and mobs. Exposed as theme tokens (rather than hardcoded in `rarity.ts`) so each theme can swap shades that read against its palette. Used for inventory item names, mob name colors, defeat-card tints, popover headers, and the dev panel rarity row.

| Token | Default | Role |
|---|---|---|
| `--rarity-common` | `#9a9a9a` | Neutral grey. Reads as "nothing special." |
| `--rarity-uncommon` | `#5fd45f` | Saturated green. The first tier the eye should notice. |
| `--rarity-rare` | `#5aa7ff` | Bright blue. |
| `--rarity-epic` | `#c084fc` | Purple. |
| `--rarity-legendary` | `#ffb040` | Gold/orange. |

**Why this exact progression:** "grey → green → blue → purple → gold" is the universally-recognized MMO/ARPG rarity ramp. Players read it instantly. **Don't reorder it** for cosmetic reasons — players will misread tier severity. If your theme can't accommodate one of these hues (e.g., `mud-classic`'s pure phosphor aesthetic), step *brightness* instead of hue across the five tiers and accept the loss of universal hue-coding.

---

## Lines — `--line-*`

Three weights of 1px borders. The CRT aesthetic relies on borders, not shadows, so these carry a lot of visual weight.

| Token | Default | Role |
|---|---|---|
| `--line-1` | `#1d3a24` | **Subtle divider.** Inside a panel — between log entries, around inset fields, around code blocks. Should be barely visible against `--bg-1`. |
| `--line-2` | `#2d5a38` | **Panel perimeter.** The most common border. Wraps every panel, every button at rest, every popover. ~2× the contrast of `line-1`. |
| `--line-3` | `#4a8655` | **Focus / active / selected.** Hover borders on buttons, the focused input outline, the active map-cell border. Should read as clearly brighter than `line-2`. |

---

## Glow — `--glow-*`

Phosphor bloom replaces the drop-shadow role. Three intensities, applied via `text-shadow` on bright text and headings.

| Token | Default | Role |
|---|---|---|
| `--glow-sm` | `0 0 2px rgba(168, 255, 176, 0.35)` | **Default bloom.** Headings, stat values, glow on hover. The "phosphor pulse" baseline. |
| `--glow-md` | `0 0 6px rgba(168, 255, 176, 0.25), 0 0 1px rgba(168, 255, 176, 0.6)` | Stronger bloom for interactive emphasis (hover glow on the wordmark, level-up dialog title). |
| `--glow-lg` | `0 0 12px rgba(123, 255, 136, 0.35), 0 0 2px rgba(123, 255, 136, 0.8)` | Reserved for marquee moments — the death banner, fullscreen cards. |

**Light themes set all three to `none`.** Phosphor bloom on parchment looks like a printer error. `vellum` and `paper` strip them entirely.

---

## Shadows — `--shadow-*`

Two roles only — drop shadows are forbidden by the design system.

| Token | Default | Role |
|---|---|---|
| `--shadow-panel` | `inset 0 0 0 1px var(--line-2), 0 0 0 1px rgba(0,0,0,0.6)` | **Panel framing.** A double inset border that gives panels a "cut into the CRT" edge. Light themes can collapse to a single line. |
| `--shadow-inset` | `inset 0 1px 0 rgba(0,0,0,0.8), inset 0 0 0 1px var(--line-1)` | **Sunken fields.** Inputs, code blocks. The dark inset on top reads as "depressed below the panel surface." |

---

## Scanlines — `--scanline`

A repeating gradient applied via `::after` on `.scanlines`-classed elements. The tint should match the theme's primary hue — `mud` uses faint green, `cyber` uses faint purple, `vellum` and `paper` set this to `none`. Always low-contrast (35% opacity multiply); aggressive scanlines become tedious within minutes.

---

## Custom theme — what the user picks

Eight tokens (`bg0`, `bg1`, `fg1`, `accentHot`, `hp`, `mp`, `good`, `bad`). Defined in `src/themes/types.ts`; the rest of the palette is *synthesized* in `applyCustomThemeTokens()` (`src/themes/customTheme.ts`) by mixing those eight with each other or with black:

- `--bg-2`, `--bg-3` — interpolate between `bg0`/`bg1` and `bg1`/`fg1`
- `--bg-inset` — `bg0` darkened 30%
- `--fg-2`, `--fg-3`, `--fg-dim` — `fg1` mixed toward `bg0` at 35% / 60% / 78%
- `--line-1`, `--line-2`, `--line-3` — `bg0` mixed toward `fg1` (or `accentHot` for line-3) at 12% / 22% / 38%
- `--accent` — `accentHot` darkened toward `bg0` by 25%
- `--warn` — falls back to `accentHot`
- `--magic` — falls back to `mp`

**This means anything declared in the per-theme overrides above (rarity tiers, log-* tokens, dir/player/heat, speech, verb-emph) does not exist in the custom theme.** Components fall back to the inline `var(--token, fallback)` in their CSS. If a new feature adds a token without a fallback, custom-theme users will see a broken render.

---

## Writing a new theme — checklist

1. **Pick the two anchors first**: `--bg-0` (page) and `--fg-1` (primary text). Verify ~7:1 contrast.
2. **Build the full surface ramp**: `bg-0 → bg-1 → bg-2 → bg-3 → bg-inset`. Step lighter (or darker on light themes) at each level so hover and selected stay distinguishable.
3. **Build the foreground ramp**: `fg-1 → fg-2 → fg-3 → fg-dim`. Test that `fg-dim` is *barely* legible against `bg-1` — if it disappears, fog of war breaks.
4. **Pick the accent pair**: `--accent` and `--accent-hot`. They should differ visibly enough that hover-vs-selected reads at a glance.
5. **Override `--magic`, `--speech`, `--link`**: the defaults are tuned for dark backgrounds. On light themes pick darker shades; on cool themes (`vacuum`, `cyber`) verify the magic purple still reads as "otherworldly" and not "another link."
6. **Tune the rarity ramp**: keep the five-step "grey → green → blue → purple → gold" hue progression unless your theme can't physically support it (`mud-classic`). Even in monochrome themes, step the brightness so tier ordering still reads.
7. **Decide HP/MP/XP alignment**: on most themes, the sheet bars match the primary palette (`--hp` = `--fg-2` or similar). Always override `--log-hp`, `--log-mp` if you want non-default red/blue in log prose.
8. **Override `--player`, `--dir`, `--heat`** if the defaults clash. `--player` especially — pure white reads on dark themes but blends into `vellum`'s parchment.
9. **Strip glow on light themes**: `--glow-sm/md/lg: none`. Add `text-shadow: none` overrides on h1–h5 so headings stop blooming.
10. **Strip scanlines on light themes**: `--scanline: none`. The CRT sweep doesn't belong on paper.
11. **Verify `--log-neutral` and `--log-muted`**: these are independent of `--fg-1` / `--fg-dim` because the damage tag's tight number row needs its own contrast. If your theme has unusual `fg-1` (very colored, very bright), override these too.
12. **Test the dev panel and fullscreen effects**: the level-up card, death banner, and generating-area overlay all use `--magic`, `--accent-hot`, and the rarity tokens heavily. They expose theme errors fast.

---

## Files at a glance

| Path | Role |
|---|---|
| `design/colors_and_type.css` | Default theme + `amber` + `phosphor`. Token definitions, type scale, spacing, motion, utility classes. |
| `src/themes/extra.css` | Per-theme overrides for `mud-classic`, `neon`, `cyber`, `vacuum`, `vellum`, `paper`. Plus `mud-classic`'s targeted `!important` rules to flatten hardcoded off-palette colors back to phosphor. |
| `src/themes/catalog.ts` | The `THEMES` registry. Add a new entry here to make a theme appear in Settings. |
| `src/themes/types.ts` | `ThemeId` union and the `CustomTheme` shape. |
| `src/themes/config.ts` | `applyTheme()`, `loadTheme()`, `saveTheme()`. The runtime that swaps themes. |
| `src/themes/customTheme.ts` | The eight-token user-editable theme + the synthesizer that derives the rest. |
| `src/items/rarity.ts` | `RARITY_DEFS` — references `var(--rarity-*)` so theme tokens flow through. |
