export type ThemeId =
  | 'mud'
  | 'amber'
  | 'phosphor'
  | 'neon'
  | 'cyber'
  | 'vacuum'
  | 'vellum'

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

export interface Effects {
  scanlines: boolean
  flashes: boolean
  confetti: boolean
  viewportFilters: boolean
  fieldIndicators: boolean
}
