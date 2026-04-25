import type { ScaleId, ScaleMeta, ThemeId, ThemeMeta } from './types'

export const DEFAULT_THEME: ThemeId = 'mud'

export const THEMES: readonly ThemeMeta[] = [
  { id: 'mud', name: 'Classic MUD', description: 'Phosphor green on deep black. The default.' },
  { id: 'amber', name: 'Amber', description: 'PC/3270 amber terminal.' },
  { id: 'phosphor', name: 'Phosphor', description: 'Paper white on black.' },
  { id: 'neon', name: 'Neon', description: 'Purple on slate. The old look.' },
  { id: 'cyber', name: 'Cyber', description: 'Magenta and cyan on near-black.' },
  { id: 'vacuum', name: 'Vacuum', description: 'Ice-white on navy.' },
  { id: 'vellum', name: 'Vellum', description: 'Ink on parchment. The only light one.' },
] as const

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

export const DEFAULT_SCALE: ScaleId = '100'

export const SCALES: readonly ScaleMeta[] = [
  { id: '90', label: '90%' },
  { id: '100', label: '100%' },
  { id: '115', label: '115%' },
  { id: '130', label: '130%' },
  { id: '150', label: '150%' },
] as const

export function isScaleId(value: unknown): value is ScaleId {
  return typeof value === 'string' && SCALES.some((s) => s.id === value)
}
