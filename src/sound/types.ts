import type { EffectEvent } from '../effects'

export type SoundEventKind = EffectEvent['kind']

export interface SoundSettings {
  /** Master on/off from the Settings tab. When off the manager short-circuits
   *  in play() and the whole audio cluster disappears from the topbar. */
  enabled: boolean
  /** Temporary mute from the topbar button. Distinct from `enabled` so the
   *  user can silence audio without losing their volume setting or hiding
   *  the slider. When muted the manager gates playback just like `!enabled`. */
  muted: boolean
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
  'death-save',
  'favor-tier-up',
  'enter-fight',
  'new-area',
  'llm-connected',
  'gold-windfall',
  'gold-jackpot',
  'new-mob',
  'new-item',
  'generating-area',
] as const

export const SOUND_EVENT_LABELS: Record<SoundEventKind, string> = {
  'damage-taken': 'Damage taken',
  'damage-dealt': 'Damage dealt',
  'heal-self': 'Heal',
  loot: 'Loot pickup',
  'level-up': 'Level up',
  death: 'Defeat',
  'death-save': 'Death save',
  'favor-tier-up': 'Favor tier-up',
  'enter-fight': 'Enter fight',
  'new-area': 'New area',
  'llm-connected': 'LLM connected',
  'gold-windfall': 'Gold windfall',
  'gold-jackpot': 'Gold jackpot',
  'new-mob': 'New mob',
  'new-item': 'New item',
  'generating-area': 'Area generation',
}

export const SOUND_EVENT_DESCS: Record<SoundEventKind, string> = {
  'damage-taken': 'Low thump scaled by the fraction of HP lost.',
  'damage-dealt': 'Brief square-wave snap when the character lands a hit.',
  'heal-self': 'Two-note triangle chime when HP is restored.',
  loot: 'Rising square-wave pickup chirp.',
  'level-up': 'C-major arpeggio with a sparkle tail.',
  death: 'Long descending tone on defeat.',
  'death-save': 'Soaring chord when the gods avert a killing blow.',
  'favor-tier-up': 'Bright shimmer on crossing into a new favor tier.',
  'enter-fight': 'Short tension stinger when combat starts.',
  'new-area': 'Triumphant chime when a new area is discovered.',
  'llm-connected': 'Confirmation tone when a test connection succeeds.',
  'gold-windfall': 'Cash register ding on large gold pickups.',
  'gold-jackpot': 'Grand cash register on huge gold pickups.',
  'new-mob': 'Alert tone when a new mob is first encountered.',
  'new-item': 'Sparkle chime when a new item type is discovered.',
  'generating-area': 'Mystical drone while charting unknown paths.',
}
