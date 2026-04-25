import type { EffectEvent } from '../effects'

export type SoundEventKind = EffectEvent['kind']

export interface SoundSettings {
  /** Master on/off. When off the manager short-circuits in play(). */
  enabled: boolean
  /** Master volume, 0..1. Applied as a linear gain to every voice. */
  volume: number
  /** Per-kind toggles. Let users mute the noisy ones without killing all audio. */
  events: Record<SoundEventKind, boolean>
}

export const SOUND_EVENT_KINDS: readonly SoundEventKind[] = [
  'damage-taken',
  'damage-dealt',
  'heal-self',
  'loot',
  'level-up',
  'death',
  'enter-fight',
  'new-area',
  'llm-connected',
] as const

export const SOUND_EVENT_LABELS: Record<SoundEventKind, string> = {
  'damage-taken': 'Damage taken',
  'damage-dealt': 'Damage dealt',
  'heal-self': 'Heal',
  loot: 'Loot pickup',
  'level-up': 'Level up',
  death: 'Defeat',
  'enter-fight': 'Enter fight',
  'new-area': 'New area',
  'llm-connected': 'LLM connected',
}

export const SOUND_EVENT_DESCS: Record<SoundEventKind, string> = {
  'damage-taken': 'Low thump scaled by the fraction of HP lost.',
  'damage-dealt': 'Brief square-wave snap when the character lands a hit.',
  'heal-self': 'Two-note triangle chime when HP is restored.',
  loot: 'Rising square-wave pickup chirp.',
  'level-up': 'C-major arpeggio with a sparkle tail.',
  death: 'Long descending tone on defeat.',
  'enter-fight': 'Short tension stinger when combat starts.',
  'new-area': 'Triumphant chime when a new area is discovered.',
  'llm-connected': 'Confirmation tone when a test connection succeeds.',
}
