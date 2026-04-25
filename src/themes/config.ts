import {
  DEFAULT_SCALE,
  DEFAULT_THEME,
  DEFAULT_TICK_SPEED,
  isScaleId,
  isThemeId,
  isTickSpeedId,
} from './catalog'
import {
  FIELD_DURATION_MAX_MS,
  FIELD_DURATION_MIN_MS,
  type Effects,
  type ScaleId,
  type ThemeId,
  type TickSpeedId,
} from './types'

const THEME_KEY = 'understudy.theme'
const SCALE_KEY = 'understudy.scale'
const EFFECTS_KEY = 'understudy.effects'
const TICK_SPEED_KEY = 'understudy.tickSpeed'

export const DEFAULT_EFFECTS: Effects = {
  scanlines: true,
  fullscreen: {
    enabled: true,
    damage: true,
    heal: true,
    levelUpBanner: true,
    levelUpConfetti: true,
    death: true,
    newArea: true,
  },
  viewport: {
    enabled: true,
    damage: true,
    heal: true,
    levelUp: true,
    death: true,
    fightAmbient: true,
  },
  fields: {
    hp: true,
    magic: true,
    xp: true,
    gold: true,
    durationMs: 1000,
  },
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

export function loadTickSpeed(): TickSpeedId {
  try {
    const raw = localStorage.getItem(TICK_SPEED_KEY)
    return isTickSpeedId(raw) ? raw : DEFAULT_TICK_SPEED
  } catch {
    return DEFAULT_TICK_SPEED
  }
}

export function saveTickSpeed(id: TickSpeedId): void {
  try {
    localStorage.setItem(TICK_SPEED_KEY, id)
  } catch {
    // ignore
  }
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EFFECTS.fields.durationMs
  return Math.max(FIELD_DURATION_MIN_MS, Math.min(FIELD_DURATION_MAX_MS, Math.round(n)))
}

function pickBool(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function loadEffects(): Effects {
  try {
    const raw = localStorage.getItem(EFFECTS_KEY)
    if (!raw) return {
      ...DEFAULT_EFFECTS,
      fullscreen: { ...DEFAULT_EFFECTS.fullscreen },
      viewport: { ...DEFAULT_EFFECTS.viewport },
      fields: { ...DEFAULT_EFFECTS.fields },
    }
    // Tolerate the pre-rename shape so stored configs don't wipe on upgrade.
    type LegacyFullscreen = Partial<Effects['fullscreen']> & {
      damageFlash?: boolean
      deathBanner?: boolean
      /** Renamed to newArea when the portal fullscreen FX became a
       *  dedicated "new area" reveal banner. Read as a fallback so saved
       *  user preferences survive the rename. */
      portal?: boolean
    }
    type LegacyViewport = Partial<Effects['viewport']> & {
      shockwave?: boolean
      levelUpGlow?: boolean
    }
    const parsed = JSON.parse(raw) as Partial<Omit<Effects, 'fullscreen' | 'viewport'>> & {
      fullscreen?: LegacyFullscreen
      viewport?: LegacyViewport
    }
    const fs: LegacyFullscreen = parsed.fullscreen ?? {}
    const vp: LegacyViewport = parsed.viewport ?? {}
    const f = (parsed.fields ?? {}) as Partial<Effects['fields']>
    return {
      scanlines: pickBool(parsed.scanlines, DEFAULT_EFFECTS.scanlines),
      fullscreen: {
        enabled: pickBool(fs.enabled, DEFAULT_EFFECTS.fullscreen.enabled),
        damage: pickBool(fs.damage ?? fs.damageFlash, DEFAULT_EFFECTS.fullscreen.damage),
        heal: pickBool(fs.heal, DEFAULT_EFFECTS.fullscreen.heal),
        levelUpBanner: pickBool(fs.levelUpBanner, DEFAULT_EFFECTS.fullscreen.levelUpBanner),
        levelUpConfetti: pickBool(fs.levelUpConfetti, DEFAULT_EFFECTS.fullscreen.levelUpConfetti),
        death: pickBool(fs.death ?? fs.deathBanner, DEFAULT_EFFECTS.fullscreen.death),
        newArea: pickBool(fs.newArea ?? fs.portal, DEFAULT_EFFECTS.fullscreen.newArea),
      },
      viewport: {
        enabled: pickBool(vp.enabled, DEFAULT_EFFECTS.viewport.enabled),
        damage: pickBool(vp.damage ?? vp.shockwave, DEFAULT_EFFECTS.viewport.damage),
        heal: pickBool(vp.heal, DEFAULT_EFFECTS.viewport.heal),
        levelUp: pickBool(vp.levelUp ?? vp.levelUpGlow, DEFAULT_EFFECTS.viewport.levelUp),
        death: pickBool(vp.death, DEFAULT_EFFECTS.viewport.death),
        fightAmbient: pickBool(vp.fightAmbient, DEFAULT_EFFECTS.viewport.fightAmbient),
      },
      fields: {
        hp: pickBool(f.hp, DEFAULT_EFFECTS.fields.hp),
        magic: pickBool(f.magic, DEFAULT_EFFECTS.fields.magic),
        xp: pickBool(f.xp, DEFAULT_EFFECTS.fields.xp),
        gold: pickBool(f.gold, DEFAULT_EFFECTS.fields.gold),
        durationMs:
          typeof f.durationMs === 'number'
            ? clampDuration(f.durationMs)
            : DEFAULT_EFFECTS.fields.durationMs,
      },
    }
  } catch {
    return {
      ...DEFAULT_EFFECTS,
      fullscreen: { ...DEFAULT_EFFECTS.fullscreen },
      viewport: { ...DEFAULT_EFFECTS.viewport },
      fields: { ...DEFAULT_EFFECTS.fields },
    }
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
