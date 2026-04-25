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
}

export const ROOM_TYPE_VISUALS: Record<RoomType, RoomTypeVisual> = {
  safe: {
    label: 'Safe',
    glyph: '⌂',
    color: 'var(--good)',
    hint: 'Safe room',
  },
  corridor: {
    label: 'Corridor',
    glyph: '·',
    color: 'var(--fg-3)',
    hint: 'Corridor',
  },
  chamber: {
    label: 'Chamber',
    glyph: '□',
    color: 'var(--fg-2)',
    hint: 'Chamber',
  },
  crypt: {
    label: 'Crypt',
    glyph: '✝',
    color: '#a78bfa',
    hint: 'Crypt',
  },
  storage: {
    label: 'Storage',
    glyph: '▣',
    color: '#d4a052',
    hint: 'Storage',
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
  },
  portal: {
    label: 'Portal',
    glyph: '◉',
    color: 'var(--magic)',
    hint: 'Portal',
  },
  entrance: {
    label: 'Entrance',
    glyph: '↯',
    color: 'var(--bad)',
    hint: 'Dungeon entrance',
  },
  shop: {
    label: 'Shop',
    glyph: '$',
    color: '#ffb040',
    hint: 'Shop',
  },
  shrine: {
    label: 'Shrine',
    glyph: '☆',
    color: '#ffffff',
    hint: 'Shrine',
  },
}
