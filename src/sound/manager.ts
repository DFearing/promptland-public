// Procedural sound manager — builds each SFX on the fly with Web Audio
// oscillators + envelopes. Zero asset files; chiptune-ish retro flavor that
// matches the pixel/MUD aesthetic.
//
// Update path: swap the synth recipes for sampled clips (one `.ogg` per
// EffectEvent kind) by loading them via `@pixi/sound`'s AudioBufferSourceNode
// wrapper and keeping the same `play(event)` surface. The rest of the codebase
// never needs to know which backend is in use.

import type { EffectEvent } from '../effects'
import { DEFAULT_SOUND_SETTINGS } from './config'
import type { SoundSettings } from './types'

type WindowWithWebkit = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

function resolveAudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as WindowWithWebkit
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

interface ToneSpec {
  /** Oscillator wave shape. */
  type: OscillatorType
  /** Starting frequency in Hz. */
  startFreq: number
  /** Ending frequency (for glides). Defaults to startFreq. */
  endFreq?: number
  /** Length of the tone in seconds. */
  durationS: number
  /** Attack in seconds — rise from 0 to peak gain. */
  attackS?: number
  /** Release in seconds — decay from peak to 0. Overlaps the tail. */
  releaseS?: number
  /** Peak gain, 0..1 before the master volume is applied. */
  peakGain?: number
  /** Delay in seconds before this tone starts, relative to the voice start. */
  delayS?: number
}

class SoundManager {
  private settings: SoundSettings = {
    ...DEFAULT_SOUND_SETTINGS,
    events: { ...DEFAULT_SOUND_SETTINGS.events },
  }
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private unlocked = false

  configure(next: SoundSettings): void {
    this.settings = {
      enabled: next.enabled,
      volume: Math.max(0, Math.min(1, next.volume)),
      events: { ...next.events },
    }
    if (this.master) this.master.gain.value = this.settings.enabled ? this.settings.volume : 0
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
      this.master.gain.value = this.settings.enabled ? this.settings.volume : 0
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
    if (!this.settings.enabled) return
    if (!this.settings.events[event.kind]) return
    if (!this.ctx || !this.master) return
    // If the ctx suspended itself (tab backgrounded, etc.) try to wake it.
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const tones = recipeFor(event)
    const now = this.ctx.currentTime
    for (const tone of tones) this.scheduleTone(tone, now)
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

function recipeFor(event: EffectEvent): ToneSpec[] {
  switch (event.kind) {
    case 'damage-taken': {
      const g = intensityGain(damageIntensity(event.amount, event.maxHp), 0.55)
      return [
        { type: 'sawtooth', startFreq: 220, endFreq: 90, durationS: 0.18, attackS: 0.002, peakGain: g },
        { type: 'square', startFreq: 70, endFreq: 45, durationS: 0.22, attackS: 0.003, peakGain: g * 0.6 },
      ]
    }
    case 'damage-dealt': {
      // No maxHp for dealt damage — scale on a softer curve against a nominal ceiling.
      const intensity = Math.min(1, event.amount / 40)
      const g = intensityGain(intensity, 0.4)
      return [
        { type: 'square', startFreq: 880, endFreq: 520, durationS: 0.09, attackS: 0.002, peakGain: g },
      ]
    }
    case 'heal-self': {
      const intensity = event.maxHp > 0 ? Math.min(1, event.amount / (event.maxHp * 0.35)) : 0.5
      const g = intensityGain(intensity, 0.4)
      return [
        { type: 'triangle', startFreq: 523, durationS: 0.12, peakGain: g },
        { type: 'triangle', startFreq: 784, durationS: 0.16, peakGain: g, delayS: 0.07 },
      ]
    }
    case 'loot':
      return [
        { type: 'square', startFreq: 988, durationS: 0.07, peakGain: 0.3 },
        { type: 'square', startFreq: 1319, durationS: 0.12, peakGain: 0.3, delayS: 0.06 },
      ]
    case 'level-up':
      // "dun dun dun duH!" — three punchy square hits (G4) then a big triumphant
      // sawtooth+triangle chord (C5/G5) with a sine bass bloom underneath.
      return [
        // dun 1
        { type: 'square',   startFreq: 392, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.45 },
        { type: 'sine',     startFreq: 196, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.2  },
        // dun 2
        { type: 'square',   startFreq: 392, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.45, delayS: 0.16 },
        { type: 'sine',     startFreq: 196, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.2,  delayS: 0.16 },
        // dun 3
        { type: 'square',   startFreq: 440, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.48, delayS: 0.32 },
        { type: 'sine',     startFreq: 220, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.22, delayS: 0.32 },
        // duH! — big chord (C5 + G5), sustained
        { type: 'sawtooth', startFreq: 523, durationS: 0.7,  attackS: 0.01,  releaseS: 0.5,  peakGain: 0.38, delayS: 0.5  },
        { type: 'triangle', startFreq: 784, durationS: 0.75, attackS: 0.01,  releaseS: 0.55, peakGain: 0.32, delayS: 0.5  },
        { type: 'sine',     startFreq: 262, durationS: 0.8,  attackS: 0.03,  releaseS: 0.6,  peakGain: 0.22, delayS: 0.5  },
        // sparkle on top
        { type: 'triangle', startFreq: 1047, durationS: 0.5, attackS: 0.01, releaseS: 0.4,  peakGain: 0.22, delayS: 0.58 },
      ]
    case 'death':
      return [
        { type: 'sawtooth', startFreq: 196, endFreq: 55, durationS: 0.8, attackS: 0.01, releaseS: 0.4, peakGain: 0.5 },
        { type: 'square', startFreq: 110, endFreq: 41, durationS: 0.9, attackS: 0.02, releaseS: 0.5, peakGain: 0.25 },
      ]
    case 'enter-fight':
      return [
        { type: 'sawtooth', startFreq: 330, endFreq: 165, durationS: 0.18, peakGain: 0.35 },
        { type: 'square', startFreq: 110, durationS: 0.22, peakGain: 0.2, delayS: 0.08 },
      ]
    case 'llm-connected':
      // Three-note ascending confirmation — sine root, triangle fifth, triangle
      // octave — with a soft sine bloom underneath. Total dwell ~1.2s.
      return [
        { type: 'sine',     startFreq: 440,  durationS: 0.55, attackS: 0.02, releaseS: 0.4,  peakGain: 0.28 },
        { type: 'triangle', startFreq: 660,  durationS: 0.5,  attackS: 0.01, releaseS: 0.35, peakGain: 0.32, delayS: 0.18 },
        { type: 'triangle', startFreq: 880,  durationS: 0.65, attackS: 0.01, releaseS: 0.5,  peakGain: 0.36, delayS: 0.36 },
        { type: 'sine',     startFreq: 220,  durationS: 0.9,  attackS: 0.06, releaseS: 0.6,  peakGain: 0.16, delayS: 0.1  },
      ]
    case 'new-area':
      // Discovery chime — C-major arpeggio (C5 · E5 · G5 · C6) ascending on
      // triangle bells, layered with a soft sine swell underneath so the
      // banner landing feels earned. Distinct from the level-up arpeggio
      // (same notes, faster, shorter sparkle tail) and from the old
      // portal sweep this replaces.
      return [
        { type: 'triangle', startFreq: 523, durationS: 0.28, attackS: 0.01, releaseS: 0.2, peakGain: 0.3 },                    // C5
        { type: 'triangle', startFreq: 659, durationS: 0.3, attackS: 0.01, releaseS: 0.22, peakGain: 0.3, delayS: 0.12 },      // E5
        { type: 'triangle', startFreq: 784, durationS: 0.32, attackS: 0.01, releaseS: 0.24, peakGain: 0.32, delayS: 0.24 },    // G5
        { type: 'triangle', startFreq: 1047, durationS: 0.6, attackS: 0.01, releaseS: 0.42, peakGain: 0.36, delayS: 0.36 },    // C6, sustains
        // Bloom underneath — gives the landing weight without stepping on the bells.
        { type: 'sine', startFreq: 262, endFreq: 523, durationS: 0.7, attackS: 0.08, releaseS: 0.4, peakGain: 0.18, delayS: 0.1 },
        // Sparkle tail — higher harmonics ringing into the fadeout.
        { type: 'triangle', startFreq: 2093, durationS: 0.4, attackS: 0.01, releaseS: 0.3, peakGain: 0.14, delayS: 0.48 },
      ]
  }
}

export const soundManager = new SoundManager()
