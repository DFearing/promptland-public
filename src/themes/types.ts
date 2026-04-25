export type ThemeId =
  | 'mud'
  | 'mud-classic'
  | 'amber'
  | 'phosphor'
  | 'neon'
  | 'cyber'
  | 'vacuum'
  | 'vellum'
  | 'paper'

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
    levelUpConfetti: boolean
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
}

export const FIELD_DURATION_MIN_MS = 300
export const FIELD_DURATION_MAX_MS = 2500
export const FIELD_DURATION_STEP_MS = 100
