import { DEFAULT_SCALE, DEFAULT_THEME, isScaleId, isThemeId } from './catalog'
import type { Effects, ScaleId, ThemeId } from './types'

const THEME_KEY = 'understudy.theme'
const SCALE_KEY = 'understudy.scale'
const EFFECTS_KEY = 'understudy.effects'

export const DEFAULT_EFFECTS: Effects = {
  scanlines: true,
  flashes: true,
  confetti: true,
  viewportFilters: true,
  fieldIndicators: true,
}

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return isThemeId(raw) ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch {
    // storage unavailable — ignore
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id)
}

export function loadScale(): ScaleId {
  try {
    const raw = localStorage.getItem(SCALE_KEY)
    return isScaleId(raw) ? raw : DEFAULT_SCALE
  } catch {
    return DEFAULT_SCALE
  }
}

export function saveScale(id: ScaleId): void {
  try {
    localStorage.setItem(SCALE_KEY, id)
  } catch {
    // ignore
  }
}

export function applyScale(id: ScaleId): void {
  if (id === DEFAULT_SCALE) {
    document.documentElement.removeAttribute('data-scale')
  } else {
    document.documentElement.setAttribute('data-scale', id)
  }
}

export function loadEffects(): Effects {
  try {
    const raw = localStorage.getItem(EFFECTS_KEY)
    if (!raw) return { ...DEFAULT_EFFECTS }
    const parsed = JSON.parse(raw) as Partial<Effects>
    const pick = (key: keyof Effects): boolean =>
      typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : DEFAULT_EFFECTS[key]
    return {
      scanlines: pick('scanlines'),
      flashes: pick('flashes'),
      confetti: pick('confetti'),
      viewportFilters: pick('viewportFilters'),
      fieldIndicators: pick('fieldIndicators'),
    }
  } catch {
    return { ...DEFAULT_EFFECTS }
  }
}

export function saveEffects(effects: Effects): void {
  try {
    localStorage.setItem(EFFECTS_KEY, JSON.stringify(effects))
  } catch {
    // ignore
  }
}

export function applyEffects(effects: Effects): void {
  document.documentElement.classList.toggle('fx-scanlines', effects.scanlines)
}
