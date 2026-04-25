---
name: understudy-design
description: Use this skill to generate well-branded interfaces and assets for Understudy, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.

## Quick map

- `colors_and_type.css` — all tokens, three themes (`mud` default, `amber`, `phosphor`). Set `data-theme` on `<html>` to switch.
- `assets/logo/` — wordmark and `[U]` mark, both single-color SVGs that pick up `currentColor`.
- `assets/icons/` — a handful of 16×16 utility icons (settings, close, play/pause/FF, chevrons).
- `ui_kits/understudy/` — React UI kit: game view, character creation wizard, settings screen.
- `preview/` — per-token specimen cards.

## Iron rules

- **No emoji.** Ever. Use Unicode dingbats (`✶ ◎ ◯ †`) or ASCII brackets (`[x] [ ]`).
- **No icon fonts.** Prefer Unicode; fall back to inline SVG in the existing 1px stroke style.
- **No sans-serif.** All type is VT323 (display) or monospace (IBM Plex Mono body, JetBrains Mono numerics).
- **No drop shadows, no rounded corners, no gradients.** CRT aesthetic — flat panels, 1px borders, phosphor glow via `text-shadow`.
- **The player is never "you".** Narration is third person about the character. "You" only appears in chrome/settings UI directed at the player-operator.
