import type { RoomType } from './types'

// Single source of truth for how rooms render on the map. Map cells render
// `glyph` in the type's `color`; popovers use `label` for display. Keep the
// glyph to one printable ASCII / basic Unicode character — wider codepoints
// throw off the 22px cell grid.
export interface RoomTypeVisual {
  label: string
  glyph: string
  /** CSS color — resolves to a theme var when possible, literal otherwise. */
  color: string
  /** Short human hint surfaced on hover. */
  hint: string
  /** Optional per-glyph font-size multiplier. Some Unicode characters (e.g.
   *  the middle dot · or the wavy equals ≈) take much less visual space
   *  than the rest of the ROOM_TYPE_VISUALS set, so they look tiny on the
   *  map and in the legend. A scale >1 pushes them back in line with the
   *  rest. Defaults to 1 when unset. */
  glyphScale?: number
  /** Optional CSS translateY correction, in ems, so the ink centers of
   *  every legend glyph sit on the same optical line. Each Unicode
   *  codepoint's ink lands at a different y within its em box; without
   *  this nudge, filled shapes like ◉ ▣ read as sitting higher than
   *  characters with descenders like $ I. Computed by
   *  tools/measure-glyphs.mjs. */
  glyphYOffset?: number
}

export const ROOM_TYPE_VISUALS: Record<RoomType, RoomTypeVisual> = {
  // Scales + offsets below come from tools/measure-glyphs.mjs run against
  // the shipped Cascadia Mono TTF. The script finds each glyph's ink box
  // and uses sqrt(w*h) as a visual-size proxy, normalised to the median
  // glyph with a scale range of [0.7, 2.5]. Offsets are the translateY
  // needed (in ems) so every ink center lands on the same baseline after
  // `textBaseline: middle` placement.
  safe: {
    label: 'Safe',
    glyph: '⌂',
    color: 'var(--good)',
    hint: 'Safe room',
    glyphScale: 1.05,
    glyphYOffset: -0.07,
  },
  corridor: {
    label: 'Corridor',
    glyph: '·',
    color: 'var(--fg-3)',
    hint: 'Corridor',
    glyphScale: 2.5,
    // Manually tuned against Cascadia Mono: at 2.5× scale the middle
    // dot renders well below the optical line, so the nudge is
    // negative to pull it back up to match its neighbours.
    glyphYOffset: -0.25,
  },
  chamber: {
    label: 'Chamber',
    glyph: '□',
    color: 'var(--fg-2)',
    hint: 'Chamber',
    glyphScale: 1.05,
  },
  crypt: {
    label: 'Crypt',
    glyph: '✝',
    color: '#a78bfa',
    hint: 'Crypt',
    glyphScale: 0.9,
    glyphYOffset: 0.02,
  },
  storage: {
    label: 'Storage',
    glyph: '▣',
    color: '#d4a052',
    hint: 'Storage',
    glyphScale: 1.05,
  },
  inn: {
    label: 'Inn',
    glyph: 'I',
    color: '#ffb040',
    hint: 'Inn — rest here',
  },
  water: {
    label: 'Water',
    glyph: '≈',
    color: '#5aa7ff',
    hint: 'Water source',
    glyphScale: 1.1,
  },
  portal: {
    label: 'Portal',
    glyph: '◉',
    color: 'var(--magic)',
    hint: 'Portal',
    glyphScale: 1.05,
  },
  entrance: {
    label: 'Entrance',
    glyph: '▼',
    color: 'var(--bad)',
    hint: 'Dungeon entrance',
  },
  shop: {
    label: 'Shop',
    glyph: '$',
    color: '#ffb040',
    hint: 'Shop',
    glyphScale: 0.8,
  },
  shrine: {
    label: 'Shrine',
    glyph: '☆',
    color: '#ffffff',
    hint: 'Shrine',
    glyphScale: 0.75,
    glyphYOffset: 0.02,
  },
  exit: {
    label: 'Exit',
    glyph: '→',
    color: 'var(--magic)',
    hint: 'Path to unknown lands',
  },
}
