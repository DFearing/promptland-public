import type { CustomTheme } from './types'

/** localStorage key for the custom-theme palette. */
const CUSTOM_KEY = 'promptland.customTheme'

/** Sensible default — matches the `mud` theme's key tokens so a new
 *  user who picks "Custom" and edits nothing sees the default look. */
export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  bg0: '#050706',
  bg1: '#0a0d0b',
  fg1: '#a8ffb0',
  accentHot: '#4cff6a',
  hp: '#ff6b6b',
  mp: '#6b8aff',
  good: '#9bf57a',
  bad: '#ff6b6b',
}

/** Hex-only sanity check so a malformed entry in localStorage doesn't
 *  leak through as "red" or a URL. Three- or six-digit hex only. */
function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
}

export function loadCustomTheme(): CustomTheme {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return { ...DEFAULT_CUSTOM_THEME }
    const parsed = JSON.parse(raw) as Partial<CustomTheme>
    return {
      bg0: isHexColor(parsed.bg0) ? parsed.bg0 : DEFAULT_CUSTOM_THEME.bg0,
      bg1: isHexColor(parsed.bg1) ? parsed.bg1 : DEFAULT_CUSTOM_THEME.bg1,
      fg1: isHexColor(parsed.fg1) ? parsed.fg1 : DEFAULT_CUSTOM_THEME.fg1,
      accentHot: isHexColor(parsed.accentHot) ? parsed.accentHot : DEFAULT_CUSTOM_THEME.accentHot,
      hp: isHexColor(parsed.hp) ? parsed.hp : DEFAULT_CUSTOM_THEME.hp,
      mp: isHexColor(parsed.mp) ? parsed.mp : DEFAULT_CUSTOM_THEME.mp,
      good: isHexColor(parsed.good) ? parsed.good : DEFAULT_CUSTOM_THEME.good,
      bad: isHexColor(parsed.bad) ? parsed.bad : DEFAULT_CUSTOM_THEME.bad,
    }
  } catch {
    return { ...DEFAULT_CUSTOM_THEME }
  }
}

export function saveCustomTheme(theme: CustomTheme): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(theme))
  } catch {
    // ignore — runtime still works against the in-memory theme
  }
}

/**
 * Writes each CustomTheme token as an inline CSS variable on the root
 * element, plus a few derived tokens (secondary/tertiary text, borders,
 * accent shades) synthesized from the user-picked ones so the result
 * doesn't look half-painted. The inline styles override whatever the
 * theme stylesheet set, so swapping to / from 'custom' is instant.
 *
 * Call `clearCustomThemeTokens()` when switching away from 'custom' so
 * the inline vars don't bleed into the next theme.
 */
export function applyCustomThemeTokens(theme: CustomTheme): void {
  const root = document.documentElement
  const setVar = (name: string, value: string) => root.style.setProperty(name, value)

  // Direct user-picked tokens.
  setVar('--bg-0', theme.bg0)
  setVar('--bg-1', theme.bg1)
  setVar('--fg-1', theme.fg1)
  setVar('--accent-hot', theme.accentHot)
  setVar('--hp', theme.hp)
  setVar('--mp', theme.mp)
  setVar('--good', theme.good)
  setVar('--bad', theme.bad)

  // Derived tokens. Synthesizing these so the user only has to manage
  // eight colors; the dependent ones (borders, secondary text, inset
  // background) track the user's picks automatically.
  setVar('--bg-2', mix(theme.bg0, theme.bg1, 0.5))
  setVar('--bg-3', mix(theme.bg1, theme.fg1, 0.1))
  setVar('--bg-inset', darken(theme.bg0, 0.3))
  setVar('--fg-2', mix(theme.fg1, theme.bg0, 0.35))
  setVar('--fg-3', mix(theme.fg1, theme.bg0, 0.6))
  setVar('--fg-dim', mix(theme.fg1, theme.bg0, 0.78))
  setVar('--line-1', mix(theme.bg0, theme.fg1, 0.12))
  setVar('--line-2', mix(theme.bg0, theme.fg1, 0.22))
  setVar('--line-3', mix(theme.bg0, theme.accentHot, 0.38))
  setVar('--accent', mix(theme.accentHot, theme.bg0, 0.25))
  setVar('--warn', theme.accentHot)
  setVar('--magic', theme.mp)
}

/** Removes inline CSS vars written by applyCustomThemeTokens — call
 *  when switching to a non-custom theme. */
export function clearCustomThemeTokens(): void {
  const root = document.documentElement
  for (const v of CUSTOM_VARS) root.style.removeProperty(v)
}

const CUSTOM_VARS: readonly string[] = [
  '--bg-0',
  '--bg-1',
  '--bg-2',
  '--bg-3',
  '--bg-inset',
  '--fg-1',
  '--fg-2',
  '--fg-3',
  '--fg-dim',
  '--accent-hot',
  '--accent',
  '--line-1',
  '--line-2',
  '--line-3',
  '--hp',
  '--mp',
  '--good',
  '--bad',
  '--warn',
  '--magic',
]

// --- small color utilities (hex-only) -------------------------------------

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function toHex(rgb: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const hh = (n: number) => clamp(n).toString(16).padStart(2, '0')
  return `#${hh(rgb.r)}${hh(rgb.g)}${hh(rgb.b)}`
}

/** Linear interpolate between two colors by `t` (0 = a, 1 = b). */
function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a)
  const rb = parseHex(b)
  return toHex({
    r: ra.r + (rb.r - ra.r) * t,
    g: ra.g + (rb.g - ra.g) * t,
    b: ra.b + (rb.b - ra.b) * t,
  })
}

/** Pulls a color toward black by `t` (0 = unchanged, 1 = black). */
function darken(c: string, t: number): string {
  return mix(c, '#000000', t)
}
