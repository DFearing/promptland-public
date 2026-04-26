export type ThemeId =
  | 'mud'
  | 'mud-classic'
  | 'chromejack'
  | 'lcars'
  | 'channel'
  | 'newsroom'
  | 'custom'

export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
}

export type ScaleId = '90' | '100' | '115' | '130' | '150'

export interface ScaleMeta {
  id: ScaleId
  label: string
}

export type TickSpeedId = '50' | '75' | '100' | '125' | '150' | '200'

export interface TickSpeedMeta {
  id: TickSpeedId
  label: string
  /** Multiplier applied to the base per-state cadence. 1× = default. */
  mult: number
}

/**
 * Runtime effects catalog. Two parallel groups — `fullscreen` (overlay layer
 * covering the whole app) and `viewport` (pixi canvas under the sprite) — each
 * expose the same character events (damage, heal, level-up, death) so the user
 * can mix-and-match. Each group has an `enabled` master: when it's off, every
 * effect in that group is suppressed regardless of the individual toggles.
 */
export interface Effects {
  scanlines: boolean
  /** When true, heal / consume / condition-tick / XP entries show exact
   *  numeric amounts in the log. When false, they render as qualitative
   *  descriptors so the game reads like a story instead of a spec sheet.
   *  Default: false — the "watch and infer" mode is the shipping vibe. */
  logNumbers: boolean
  fullscreen: {
    /** Master toggle — disables every fullscreen effect when off. */
    enabled: boolean
    damage: boolean
    heal: boolean
    levelUpBanner: boolean
    death: boolean
    newArea: boolean
  }
  viewport: {
    /** Master toggle — disables every viewport/canvas effect when off. */
    enabled: boolean
    damage: boolean
    heal: boolean
    levelUp: boolean
    death: boolean
    fightAmbient: boolean
  }
  fields: {
    hp: boolean
    magic: boolean
    xp: boolean
    gold: boolean
    durationMs: number
  }
  /** When true, the numeric readouts ("12 / 30") render next to the
   *  HP / MP / XP bars on the sheet. When false, only the bars are
   *  shown. Independent of `logNumbers` — the sheet and the log speak
   *  with different voices and the player may want to quiet one but
   *  not the other. Default: true — matches long-standing behavior. */
  sheetNumbers: boolean
}

export const FIELD_DURATION_MIN_MS = 300
export const FIELD_DURATION_MAX_MS = 2500
export const FIELD_DURATION_STEP_MS = 100

/**
 * User-authored palette. Eight tokens — the most impactful ones —
 * cover the visual range without drowning the editor UI. Each value is
 * a CSS color string (hex or rgb; the color picker emits hex).
 */
export interface CustomTheme {
  /** Page background. */
  bg0: string
  /** Panel background. */
  bg1: string
  /** Primary text / stat values. */
  fg1: string
  /** Brand accent — wordmark, highlights, hover states. */
  accentHot: string
  /** HP color (bars, damage lines). */
  hp: string
  /** MP / magic color (bars, spell lines). */
  mp: string
  /** Positive / good-outcome color (heal lines, confirmations). */
  good: string
  /** Negative / bad-outcome color (damage tag, death, errors). */
  bad: string
}
