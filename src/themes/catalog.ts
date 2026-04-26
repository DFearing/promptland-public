import type {
  ScaleId,
  ScaleMeta,
  ThemeId,
  ThemeMeta,
  TickSpeedId,
  TickSpeedMeta,
} from './types'

export const DEFAULT_THEME: ThemeId = 'mud'

export const THEMES: readonly ThemeMeta[] = [
  { id: 'mud', name: 'MUD (Modern)', description: 'Phosphor green hud with semantic color accents. The default.' },
  { id: 'mud-classic', name: 'MUD (Classic)', description: 'Pure green-on-black. No color accents — every token collapses to a single phosphor shade.' },
  { id: 'chromejack', name: 'Chromejack', description: 'Cyber-yellow chrome on slate. Cyan runner, magenta links, hot-pink danger.' },
  { id: 'lcars', name: 'LCARS', description: 'Star Trek TNG console — peach on void, mauve chrome, Federation blue navigation.' },
  { id: 'channel', name: 'Channel', description: 'Office-chat aesthetic. Aubergine highlights, channel blue, mention yellow.' },
  { id: 'newsroom', name: 'Newsroom', description: 'Broadsheet ink on cream paper. The only light one.' },
  { id: 'custom', name: 'Custom', description: 'Your own palette — eight tokens. Selecting this theme reveals the editor.' },
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

export const DEFAULT_TICK_SPEED: TickSpeedId = '100'

export const TICK_SPEEDS: readonly TickSpeedMeta[] = [
  { id: '50', label: '0.5×', mult: 0.5 },
  { id: '75', label: '0.75×', mult: 0.75 },
  { id: '100', label: '1×', mult: 1 },
  { id: '125', label: '1.25×', mult: 1.25 },
  { id: '150', label: '1.5×', mult: 1.5 },
  { id: '200', label: '2×', mult: 2 },
] as const

export function isTickSpeedId(value: unknown): value is TickSpeedId {
  return typeof value === 'string' && TICK_SPEEDS.some((s) => s.id === value)
}

export function tickSpeedMult(id: TickSpeedId): number {
  return TICK_SPEEDS.find((s) => s.id === id)?.mult ?? 1
}
