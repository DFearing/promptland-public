# Fonts

Understudy uses three typefaces, all loaded from Google Fonts at runtime. No local `.ttf`/`.woff2` files are bundled — the `@import` rules in `colors_and_type.css` pull them directly.

| Role | Family | Why |
|---|---|---|
| Display, labels, pixel accents | **VT323** | Classic CRT terminal face. Evokes the MUD/BBS era without being a literal ASCII-only throwback. Used for the wordmark, section labels, stat keys. |
| Body, log, prose | **IBM Plex Mono** | Warm monospace with real book-weight. The log is the primary output; it needs to read like a telnet session but not feel hostile. |
| Data, numerics | **JetBrains Mono** | Clean monospace with good tabular figures. Stat columns, inventory counts, timestamps. |

**Font substitution flag:** No font files were provided with the brief, so these are my picks filling the role. Drop `.ttf`/`.woff2` files here and update `colors_and_type.css` to swap them.
