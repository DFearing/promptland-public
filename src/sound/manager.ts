// Procedural sound manager — builds each SFX on the fly with Web Audio
// oscillators + envelopes. Zero asset files; theme-driven synthesis that
// matches the pixel/MUD aesthetic.
//
// Themes provide per-event tone recipes. The active theme is selected in
// Settings and stored in localStorage. The rest of the codebase calls
// `play(event)` without caring which theme is active.

import type { EffectEvent } from '../effects'
import { DEFAULT_SOUND_SETTINGS } from './config'
import { getThemeById, loadSoundTheme, type SoundThemeId, type ToneSpec } from './themes'
import type { SoundSettings } from './types'

type WindowWithWebkit = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function resolveAudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as WindowWithWebkit
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

// Scale a 0..1 intensity value into a peakGain. Clamp so overlapping voices
// can't ever push us into clipping territory.
function intensityGain(intensity: number, max = 0.45): number {
  const clamped = Math.max(0, Math.min(1, intensity))
  return 0.15 + clamped * (max - 0.15)
}

function damageIntensity(amount: number, maxHp: number): number {
  if (maxHp <= 0) return 0.4
  return Math.min(1, amount / (maxHp * 0.35))
}

class SoundManager {
  private settings: SoundSettings = {
    ...DEFAULT_SOUND_SETTINGS,
    events: { ...DEFAULT_SOUND_SETTINGS.events },
  }
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private unlocked = false
  private themeId: SoundThemeId = loadSoundTheme()

  configure(next: SoundSettings): void {
    this.settings = {
      enabled: next.enabled,
      muted: next.muted,
      volume: Math.max(0, Math.min(1, next.volume)),
      events: { ...next.events },
    }
    if (this.master) this.master.gain.value = this.audible() ? this.settings.volume : 0
  }

  private audible(): boolean {
    return this.settings.enabled && !this.settings.muted
  }

  setTheme(id: SoundThemeId): void {
    this.themeId = id
  }

  /**
   * Browsers block AudioContext until a user gesture. Call this from the
   * first `pointerdown` / `keydown` / `touchstart` — it's cheap and idempotent.
   */
  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume()
      return
    }
    const Ctor = resolveAudioCtor()
    if (!Ctor) return
    try {
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.audible() ? this.settings.volume : 0
      this.master.connect(this.ctx.destination)
      this.unlocked = true
      void this.ctx.resume()
    } catch {
      // Audio not available — fail silent; sound is best-effort.
      this.ctx = null
      this.master = null
    }
  }

  play(event: EffectEvent): void {
    if (!this.audible()) return
    if (!this.settings.events[event.kind]) return
    if (!this.ctx || !this.master) return
    // If the ctx suspended itself (tab backgrounded, etc.) try to wake it.
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const tones = this.recipeFor(event)
    const now = this.ctx.currentTime
    for (const tone of tones) this.scheduleTone(tone, now)
  }

  private recipeFor(event: EffectEvent): ToneSpec[] {
    const theme = getThemeById(this.themeId)
    const base = theme.recipes[event.kind]

    // Apply intensity scaling for damage/heal events.
    switch (event.kind) {
      case 'damage-taken': {
        const g = intensityGain(damageIntensity(event.amount, event.maxHp), 0.55)
        return base.map((t) => ({ ...t, peakGain: (t.peakGain ?? 0.25) * (g / 0.45) }))
      }
      case 'damage-dealt': {
        const intensity = Math.min(1, event.amount / 40)
        const g = intensityGain(intensity, 0.4)
        return base.map((t) => ({ ...t, peakGain: (t.peakGain ?? 0.25) * (g / 0.35) }))
      }
      case 'heal-self': {
        const intensity = event.maxHp > 0 ? Math.min(1, event.amount / (event.maxHp * 0.35)) : 0.5
        const g = intensityGain(intensity, 0.4)
        return base.map((t) => ({ ...t, peakGain: (t.peakGain ?? 0.25) * (g / 0.35) }))
      }
      default:
        return base
    }
  }

  private scheduleTone(tone: ToneSpec, baseAt: number): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const startAt = baseAt + (tone.delayS ?? 0)
    const attack = tone.attackS ?? 0.005
    const release = tone.releaseS ?? Math.max(0.02, tone.durationS * 0.4)
    const peak = tone.peakGain ?? 0.25
    const end = tone.endFreq ?? tone.startFreq

    const osc = ctx.createOscillator()
    osc.type = tone.type
    osc.frequency.setValueAtTime(tone.startFreq, startAt)
    if (end !== tone.startFreq) {
      osc.frequency.linearRampToValueAtTime(end, startAt + tone.durationS)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(peak, startAt + attack)
    // Hold the peak through most of the body, then decay to near-zero.
    const bodyEnd = startAt + Math.max(attack, tone.durationS - release)
    gain.gain.linearRampToValueAtTime(peak, bodyEnd)
    gain.gain.linearRampToValueAtTime(0.0001, startAt + tone.durationS)

    osc.connect(gain)
    gain.connect(this.master)
    osc.start(startAt)
    osc.stop(startAt + tone.durationS + 0.05)
  }
}

export const soundManager = new SoundManager()
