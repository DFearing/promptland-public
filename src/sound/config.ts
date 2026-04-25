import { SOUND_EVENT_KINDS, type SoundEventKind, type SoundSettings } from './types'

const SOUND_KEY = 'understudy.sound'

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.6,
  events: SOUND_EVENT_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = true
      return acc
    },
    {} as Record<SoundEventKind, boolean>,
  ),
}

function cloneDefault(): SoundSettings {
  return {
    ...DEFAULT_SOUND_SETTINGS,
    events: { ...DEFAULT_SOUND_SETTINGS.events },
  }
}

export function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(SOUND_KEY)
    if (!raw) return cloneDefault()
    const parsed = JSON.parse(raw) as Partial<SoundSettings>
    const events = { ...DEFAULT_SOUND_SETTINGS.events }
    if (parsed.events && typeof parsed.events === 'object') {
      for (const k of SOUND_EVENT_KINDS) {
        const v = (parsed.events as Record<string, unknown>)[k]
        if (typeof v === 'boolean') events[k] = v
      }
    }
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_SOUND_SETTINGS.volume
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume,
      events,
    }
  } catch {
    return cloneDefault()
  }
}

export function saveSoundSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable — ignore
  }
}
