# Understudy UI Kit

High-fidelity recreation of the Understudy game UI in React. Three screens:

| File | What |
|---|---|
| `index.html` | Main game view — two-column desktop layout with sprite, sheet/inventory tabs, map, and log. Click the Settings icon or "new character" to demo the other flows. |
| `components.jsx` | All React components: Topbar, SpeedControl, Panel, Tabs, SheetPanel, InventoryPanel, MapPanel, LogPanel, SpriteViewport, Button, Field. |
| `CharacterCreation.jsx` | 4-step wizard: world → species → gender → class. |
| `Settings.jsx` | BYOK LLM config with provider presets. |
| `app.jsx` | App shell that routes between game / creation / settings. |

All screens share `colors_and_type.css` from the design system root. Theme swaps via `data-theme` on `<html>`; a theme picker is exposed in Settings.
