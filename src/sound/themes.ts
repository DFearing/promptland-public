// Sound theme packs — each theme provides tone recipes for every SoundEventKind.
// The SoundManager selects the active theme's recipes when playing an event.

import type { SoundEventKind } from './types'

export interface ToneSpec {
  type: OscillatorType
  startFreq: number
  endFreq?: number
  durationS: number
  attackS?: number
  releaseS?: number
  peakGain?: number
  delayS?: number
}

export type SoundThemeId =
  | 'retro'
  | 'chiptune'
  | 'harmonic'
  | 'orchestral'
  | 'dungeon'
  | 'minimal'

export interface SoundTheme {
  id: SoundThemeId
  name: string
  description: string
  recipes: Record<SoundEventKind, ToneSpec[]>
}

const THEME_KEY = 'sound-theme'
const DEFAULT_THEME: SoundThemeId = 'retro'

export function loadSoundTheme(): SoundThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw && SOUND_THEMES.some((t) => t.id === raw)) return raw as SoundThemeId
  } catch { /* ignore */ }
  return DEFAULT_THEME
}

export function saveSoundTheme(id: SoundThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Theme definitions
// ---------------------------------------------------------------------------

const retroTheme: SoundTheme = {
  id: 'retro',
  name: 'Retro',
  description: '8-bit square waves, punchy and classic.',
  recipes: {
    'damage-taken': [
      { type: 'sawtooth', startFreq: 220, endFreq: 90, durationS: 0.18, attackS: 0.002, peakGain: 0.45 },
      { type: 'square', startFreq: 70, endFreq: 45, durationS: 0.22, attackS: 0.003, peakGain: 0.27 },
    ],
    'damage-dealt': [
      { type: 'square', startFreq: 880, endFreq: 520, durationS: 0.09, attackS: 0.002, peakGain: 0.35 },
    ],
    'heal-self': [
      { type: 'triangle', startFreq: 523, durationS: 0.12, peakGain: 0.35 },
      { type: 'triangle', startFreq: 784, durationS: 0.16, peakGain: 0.35, delayS: 0.07 },
    ],
    loot: [
      { type: 'square', startFreq: 988, durationS: 0.07, peakGain: 0.3 },
      { type: 'square', startFreq: 1319, durationS: 0.12, peakGain: 0.3, delayS: 0.06 },
    ],
    'level-up': [
      { type: 'square', startFreq: 392, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.45 },
      { type: 'sine', startFreq: 196, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.2 },
      { type: 'square', startFreq: 392, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.45, delayS: 0.16 },
      { type: 'sine', startFreq: 196, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.2, delayS: 0.16 },
      { type: 'square', startFreq: 440, durationS: 0.11, attackS: 0.004, releaseS: 0.05, peakGain: 0.48, delayS: 0.32 },
      { type: 'sine', startFreq: 220, durationS: 0.10, attackS: 0.004, releaseS: 0.05, peakGain: 0.22, delayS: 0.32 },
      { type: 'sawtooth', startFreq: 523, durationS: 0.7, attackS: 0.01, releaseS: 0.5, peakGain: 0.38, delayS: 0.5 },
      { type: 'triangle', startFreq: 784, durationS: 0.75, attackS: 0.01, releaseS: 0.55, peakGain: 0.32, delayS: 0.5 },
      { type: 'sine', startFreq: 262, durationS: 0.8, attackS: 0.03, releaseS: 0.6, peakGain: 0.22, delayS: 0.5 },
      { type: 'triangle', startFreq: 1047, durationS: 0.5, attackS: 0.01, releaseS: 0.4, peakGain: 0.22, delayS: 0.58 },
    ],
    death: [
      { type: 'sawtooth', startFreq: 196, endFreq: 55, durationS: 0.8, attackS: 0.01, releaseS: 0.4, peakGain: 0.5 },
      { type: 'square', startFreq: 110, endFreq: 41, durationS: 0.9, attackS: 0.02, releaseS: 0.5, peakGain: 0.25 },
    ],
    'enter-fight': [
      { type: 'sawtooth', startFreq: 330, endFreq: 165, durationS: 0.18, peakGain: 0.35 },
      { type: 'square', startFreq: 110, durationS: 0.22, peakGain: 0.2, delayS: 0.08 },
    ],
    'new-area': [
      { type: 'triangle', startFreq: 523, durationS: 0.28, attackS: 0.01, releaseS: 0.2, peakGain: 0.3 },
      { type: 'triangle', startFreq: 659, durationS: 0.3, attackS: 0.01, releaseS: 0.22, peakGain: 0.3, delayS: 0.12 },
      { type: 'triangle', startFreq: 784, durationS: 0.32, attackS: 0.01, releaseS: 0.24, peakGain: 0.32, delayS: 0.24 },
      { type: 'triangle', startFreq: 1047, durationS: 0.6, attackS: 0.01, releaseS: 0.42, peakGain: 0.36, delayS: 0.36 },
      { type: 'sine', startFreq: 262, endFreq: 523, durationS: 0.7, attackS: 0.08, releaseS: 0.4, peakGain: 0.18, delayS: 0.1 },
      { type: 'triangle', startFreq: 2093, durationS: 0.4, attackS: 0.01, releaseS: 0.3, peakGain: 0.14, delayS: 0.48 },
    ],
    'llm-connected': [
      { type: 'sine', startFreq: 440, durationS: 0.55, attackS: 0.02, releaseS: 0.4, peakGain: 0.28 },
      { type: 'triangle', startFreq: 660, durationS: 0.5, attackS: 0.01, releaseS: 0.35, peakGain: 0.32, delayS: 0.18 },
      { type: 'triangle', startFreq: 880, durationS: 0.65, attackS: 0.01, releaseS: 0.5, peakGain: 0.36, delayS: 0.36 },
      { type: 'sine', startFreq: 220, durationS: 0.9, attackS: 0.06, releaseS: 0.6, peakGain: 0.16, delayS: 0.1 },
    ],
    'gold-windfall': [
      // Cash register: ascending metallic chirps ending with a "ding"
      { type: 'square', startFreq: 1200, endFreq: 1600, durationS: 0.06, attackS: 0.002, peakGain: 0.3 },
      { type: 'square', startFreq: 1600, endFreq: 2000, durationS: 0.06, attackS: 0.002, peakGain: 0.3, delayS: 0.06 },
      { type: 'square', startFreq: 2000, endFreq: 2400, durationS: 0.06, attackS: 0.002, peakGain: 0.32, delayS: 0.12 },
      // Ding
      { type: 'triangle', startFreq: 2637, durationS: 0.35, attackS: 0.003, releaseS: 0.25, peakGain: 0.4, delayS: 0.18 },
    ],
    'gold-jackpot': [
      // Two ascending runs then a grand ding
      { type: 'square', startFreq: 1000, endFreq: 1400, durationS: 0.05, attackS: 0.002, peakGain: 0.28 },
      { type: 'square', startFreq: 1400, endFreq: 1800, durationS: 0.05, attackS: 0.002, peakGain: 0.28, delayS: 0.05 },
      { type: 'square', startFreq: 1800, endFreq: 2200, durationS: 0.05, attackS: 0.002, peakGain: 0.3, delayS: 0.10 },
      // Second run, higher
      { type: 'square', startFreq: 1400, endFreq: 1800, durationS: 0.05, attackS: 0.002, peakGain: 0.3, delayS: 0.18 },
      { type: 'square', startFreq: 1800, endFreq: 2200, durationS: 0.05, attackS: 0.002, peakGain: 0.3, delayS: 0.23 },
      { type: 'square', startFreq: 2200, endFreq: 2800, durationS: 0.05, attackS: 0.002, peakGain: 0.32, delayS: 0.28 },
      // Grand ding with harmonic
      { type: 'triangle', startFreq: 2637, durationS: 0.5, attackS: 0.003, releaseS: 0.35, peakGain: 0.42, delayS: 0.35 },
      { type: 'sine', startFreq: 1319, durationS: 0.45, attackS: 0.01, releaseS: 0.3, peakGain: 0.2, delayS: 0.36 },
    ],
    'new-mob': [
      // Tense two-note: low growl stab
      { type: 'sawtooth', startFreq: 150, endFreq: 110, durationS: 0.15, attackS: 0.005, peakGain: 0.35 },
      { type: 'square', startFreq: 220, durationS: 0.12, attackS: 0.003, peakGain: 0.25, delayS: 0.1 },
    ],
    'new-item': [
      // Sparkle pickup — rising two-note chime
      { type: 'triangle', startFreq: 1047, durationS: 0.1, attackS: 0.005, peakGain: 0.3 },
      { type: 'triangle', startFreq: 1568, durationS: 0.18, attackS: 0.005, releaseS: 0.12, peakGain: 0.35, delayS: 0.08 },
    ],
    'generating-area': [
      { type: 'sine', startFreq: 262, durationS: 0.6, attackS: 0.08, releaseS: 0.4, peakGain: 0.2 },
      { type: 'triangle', startFreq: 392, durationS: 0.5, attackS: 0.06, releaseS: 0.35, peakGain: 0.25, delayS: 0.15 },
    ],
  },
}

const chiptuneTheme: SoundTheme = {
  id: 'chiptune',
  name: 'Chiptune',
  description: 'Triangle + sawtooth mix, C64/NES era.',
  recipes: {
    'damage-taken': [
      { type: 'triangle', startFreq: 200, endFreq: 80, durationS: 0.2, attackS: 0.003, peakGain: 0.4 },
      { type: 'sawtooth', startFreq: 100, endFreq: 50, durationS: 0.18, attackS: 0.003, peakGain: 0.2 },
    ],
    'damage-dealt': [
      { type: 'sawtooth', startFreq: 800, endFreq: 500, durationS: 0.08, attackS: 0.002, peakGain: 0.32 },
      { type: 'triangle', startFreq: 1200, endFreq: 800, durationS: 0.06, attackS: 0.002, peakGain: 0.15, delayS: 0.02 },
    ],
    'heal-self': [
      { type: 'triangle', startFreq: 440, durationS: 0.14, peakGain: 0.3 },
      { type: 'sawtooth', startFreq: 660, durationS: 0.16, peakGain: 0.22, delayS: 0.08 },
      { type: 'triangle', startFreq: 880, durationS: 0.2, peakGain: 0.28, delayS: 0.16 },
    ],
    loot: [
      { type: 'triangle', startFreq: 880, durationS: 0.08, peakGain: 0.28 },
      { type: 'sawtooth', startFreq: 1175, durationS: 0.1, peakGain: 0.22, delayS: 0.06 },
    ],
    'level-up': [
      { type: 'triangle', startFreq: 330, durationS: 0.12, attackS: 0.005, releaseS: 0.05, peakGain: 0.4 },
      { type: 'triangle', startFreq: 392, durationS: 0.12, attackS: 0.005, releaseS: 0.05, peakGain: 0.4, delayS: 0.14 },
      { type: 'triangle', startFreq: 440, durationS: 0.12, attackS: 0.005, releaseS: 0.05, peakGain: 0.42, delayS: 0.28 },
      { type: 'sawtooth', startFreq: 523, durationS: 0.6, attackS: 0.01, releaseS: 0.4, peakGain: 0.35, delayS: 0.44 },
      { type: 'triangle', startFreq: 784, durationS: 0.55, attackS: 0.01, releaseS: 0.4, peakGain: 0.3, delayS: 0.44 },
      { type: 'sawtooth', startFreq: 262, durationS: 0.7, attackS: 0.02, releaseS: 0.5, peakGain: 0.18, delayS: 0.44 },
    ],
    death: [
      { type: 'triangle', startFreq: 220, endFreq: 55, durationS: 0.9, attackS: 0.01, releaseS: 0.5, peakGain: 0.4 },
      { type: 'sawtooth', startFreq: 130, endFreq: 40, durationS: 0.8, attackS: 0.02, releaseS: 0.4, peakGain: 0.2 },
    ],
    'enter-fight': [
      { type: 'triangle', startFreq: 300, endFreq: 150, durationS: 0.16, peakGain: 0.32 },
      { type: 'sawtooth', startFreq: 150, durationS: 0.2, peakGain: 0.18, delayS: 0.06 },
    ],
    'new-area': [
      { type: 'triangle', startFreq: 440, durationS: 0.22, attackS: 0.01, releaseS: 0.16, peakGain: 0.3 },
      { type: 'sawtooth', startFreq: 554, durationS: 0.24, attackS: 0.01, releaseS: 0.18, peakGain: 0.25, delayS: 0.1 },
      { type: 'triangle', startFreq: 660, durationS: 0.28, attackS: 0.01, releaseS: 0.2, peakGain: 0.3, delayS: 0.2 },
      { type: 'triangle', startFreq: 880, durationS: 0.5, attackS: 0.01, releaseS: 0.35, peakGain: 0.35, delayS: 0.32 },
      { type: 'sawtooth', startFreq: 220, durationS: 0.6, attackS: 0.06, releaseS: 0.35, peakGain: 0.15, delayS: 0.1 },
    ],
    'llm-connected': [
      { type: 'triangle', startFreq: 440, durationS: 0.45, attackS: 0.02, releaseS: 0.3, peakGain: 0.3 },
      { type: 'sawtooth', startFreq: 660, durationS: 0.4, attackS: 0.01, releaseS: 0.28, peakGain: 0.25, delayS: 0.16 },
      { type: 'triangle', startFreq: 880, durationS: 0.55, attackS: 0.01, releaseS: 0.4, peakGain: 0.32, delayS: 0.32 },
    ],
    'gold-windfall': [
      { type: 'triangle', startFreq: 1100, endFreq: 1500, durationS: 0.06, attackS: 0.002, peakGain: 0.28 },
      { type: 'sawtooth', startFreq: 1500, endFreq: 1900, durationS: 0.06, attackS: 0.002, peakGain: 0.22, delayS: 0.06 },
      { type: 'triangle', startFreq: 1900, endFreq: 2300, durationS: 0.06, attackS: 0.002, peakGain: 0.3, delayS: 0.12 },
      { type: 'triangle', startFreq: 2637, durationS: 0.3, attackS: 0.003, releaseS: 0.22, peakGain: 0.38, delayS: 0.18 },
    ],
    'gold-jackpot': [
      { type: 'triangle', startFreq: 900, endFreq: 1300, durationS: 0.05, attackS: 0.002, peakGain: 0.26 },
      { type: 'sawtooth', startFreq: 1300, endFreq: 1700, durationS: 0.05, attackS: 0.002, peakGain: 0.22, delayS: 0.05 },
      { type: 'triangle', startFreq: 1700, endFreq: 2100, durationS: 0.05, attackS: 0.002, peakGain: 0.28, delayS: 0.10 },
      { type: 'sawtooth', startFreq: 1300, endFreq: 1700, durationS: 0.05, attackS: 0.002, peakGain: 0.28, delayS: 0.18 },
      { type: 'triangle', startFreq: 1700, endFreq: 2100, durationS: 0.05, attackS: 0.002, peakGain: 0.28, delayS: 0.23 },
      { type: 'sawtooth', startFreq: 2100, endFreq: 2600, durationS: 0.05, attackS: 0.002, peakGain: 0.3, delayS: 0.28 },
      { type: 'triangle', startFreq: 2637, durationS: 0.45, attackS: 0.003, releaseS: 0.3, peakGain: 0.4, delayS: 0.35 },
      { type: 'sawtooth', startFreq: 1319, durationS: 0.4, attackS: 0.01, releaseS: 0.28, peakGain: 0.18, delayS: 0.36 },
    ],
    'new-mob': [
      { type: 'triangle', startFreq: 140, endFreq: 100, durationS: 0.16, attackS: 0.005, peakGain: 0.32 },
      { type: 'sawtooth', startFreq: 200, durationS: 0.12, attackS: 0.003, peakGain: 0.2, delayS: 0.1 },
    ],
    'new-item': [
      { type: 'sawtooth', startFreq: 988, durationS: 0.1, attackS: 0.005, peakGain: 0.25 },
      { type: 'triangle', startFreq: 1480, durationS: 0.16, attackS: 0.005, releaseS: 0.1, peakGain: 0.3, delayS: 0.08 },
    ],
    'generating-area': [
      { type: 'triangle', startFreq: 262, durationS: 0.5, attackS: 0.06, releaseS: 0.35, peakGain: 0.22 },
      { type: 'sawtooth', startFreq: 392, durationS: 0.45, attackS: 0.05, releaseS: 0.3, peakGain: 0.2, delayS: 0.12 },
    ],
  },
}

const harmonicTheme: SoundTheme = {
  id: 'harmonic',
  name: 'Harmonic',
  description: 'Sine waves in clean musical intervals.',
  recipes: {
    'damage-taken': [
      { type: 'sine', startFreq: 260, endFreq: 110, durationS: 0.22, attackS: 0.005, peakGain: 0.4 },
      { type: 'sine', startFreq: 130, endFreq: 65, durationS: 0.25, attackS: 0.008, peakGain: 0.2 },
    ],
    'damage-dealt': [
      { type: 'sine', startFreq: 784, endFreq: 523, durationS: 0.1, attackS: 0.003, peakGain: 0.35 },
    ],
    'heal-self': [
      { type: 'sine', startFreq: 523, durationS: 0.18, attackS: 0.01, peakGain: 0.3 },
      { type: 'sine', startFreq: 659, durationS: 0.2, attackS: 0.01, peakGain: 0.3, delayS: 0.1 },
      { type: 'sine', startFreq: 784, durationS: 0.24, attackS: 0.01, releaseS: 0.16, peakGain: 0.32, delayS: 0.2 },
    ],
    loot: [
      { type: 'sine', startFreq: 880, durationS: 0.1, peakGain: 0.28 },
      { type: 'sine', startFreq: 1320, durationS: 0.14, peakGain: 0.28, delayS: 0.08 },
    ],
    'level-up': [
      { type: 'sine', startFreq: 523, durationS: 0.2, attackS: 0.01, releaseS: 0.1, peakGain: 0.35 },
      { type: 'sine', startFreq: 659, durationS: 0.2, attackS: 0.01, releaseS: 0.1, peakGain: 0.35, delayS: 0.15 },
      { type: 'sine', startFreq: 784, durationS: 0.2, attackS: 0.01, releaseS: 0.1, peakGain: 0.38, delayS: 0.3 },
      { type: 'sine', startFreq: 1047, durationS: 0.7, attackS: 0.02, releaseS: 0.5, peakGain: 0.4, delayS: 0.45 },
      { type: 'sine', startFreq: 523, durationS: 0.8, attackS: 0.04, releaseS: 0.6, peakGain: 0.18, delayS: 0.45 },
    ],
    death: [
      { type: 'sine', startFreq: 220, endFreq: 55, durationS: 1.0, attackS: 0.02, releaseS: 0.6, peakGain: 0.4 },
      { type: 'sine', startFreq: 165, endFreq: 41, durationS: 1.1, attackS: 0.03, releaseS: 0.6, peakGain: 0.2 },
    ],
    'enter-fight': [
      { type: 'sine', startFreq: 330, endFreq: 220, durationS: 0.2, attackS: 0.005, peakGain: 0.3 },
      { type: 'sine', startFreq: 165, durationS: 0.25, attackS: 0.008, peakGain: 0.18, delayS: 0.06 },
    ],
    'new-area': [
      { type: 'sine', startFreq: 523, durationS: 0.3, attackS: 0.02, releaseS: 0.2, peakGain: 0.3 },
      { type: 'sine', startFreq: 659, durationS: 0.32, attackS: 0.02, releaseS: 0.22, peakGain: 0.3, delayS: 0.14 },
      { type: 'sine', startFreq: 784, durationS: 0.34, attackS: 0.02, releaseS: 0.24, peakGain: 0.32, delayS: 0.28 },
      { type: 'sine', startFreq: 1047, durationS: 0.6, attackS: 0.02, releaseS: 0.42, peakGain: 0.36, delayS: 0.42 },
      { type: 'sine', startFreq: 262, endFreq: 523, durationS: 0.7, attackS: 0.1, releaseS: 0.4, peakGain: 0.16, delayS: 0.14 },
    ],
    'llm-connected': [
      { type: 'sine', startFreq: 440, durationS: 0.5, attackS: 0.03, releaseS: 0.35, peakGain: 0.3 },
      { type: 'sine', startFreq: 660, durationS: 0.45, attackS: 0.02, releaseS: 0.3, peakGain: 0.3, delayS: 0.2 },
      { type: 'sine', startFreq: 880, durationS: 0.6, attackS: 0.02, releaseS: 0.45, peakGain: 0.35, delayS: 0.4 },
    ],
    'gold-windfall': [
      { type: 'sine', startFreq: 1047, endFreq: 1397, durationS: 0.08, attackS: 0.003, peakGain: 0.28 },
      { type: 'sine', startFreq: 1397, endFreq: 1760, durationS: 0.08, attackS: 0.003, peakGain: 0.28, delayS: 0.07 },
      { type: 'sine', startFreq: 1760, endFreq: 2093, durationS: 0.08, attackS: 0.003, peakGain: 0.3, delayS: 0.14 },
      { type: 'sine', startFreq: 2637, durationS: 0.4, attackS: 0.005, releaseS: 0.3, peakGain: 0.35, delayS: 0.22 },
    ],
    'gold-jackpot': [
      { type: 'sine', startFreq: 880, endFreq: 1175, durationS: 0.06, attackS: 0.003, peakGain: 0.25 },
      { type: 'sine', startFreq: 1175, endFreq: 1480, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.06 },
      { type: 'sine', startFreq: 1480, endFreq: 1760, durationS: 0.06, attackS: 0.003, peakGain: 0.28, delayS: 0.12 },
      { type: 'sine', startFreq: 1175, endFreq: 1480, durationS: 0.06, attackS: 0.003, peakGain: 0.28, delayS: 0.2 },
      { type: 'sine', startFreq: 1480, endFreq: 1760, durationS: 0.06, attackS: 0.003, peakGain: 0.28, delayS: 0.26 },
      { type: 'sine', startFreq: 1760, endFreq: 2200, durationS: 0.06, attackS: 0.003, peakGain: 0.3, delayS: 0.32 },
      { type: 'sine', startFreq: 2637, durationS: 0.55, attackS: 0.005, releaseS: 0.4, peakGain: 0.38, delayS: 0.4 },
      { type: 'sine', startFreq: 1319, durationS: 0.5, attackS: 0.01, releaseS: 0.35, peakGain: 0.18, delayS: 0.41 },
    ],
    'new-mob': [
      { type: 'sine', startFreq: 165, endFreq: 110, durationS: 0.2, attackS: 0.008, peakGain: 0.3 },
      { type: 'sine', startFreq: 247, durationS: 0.15, attackS: 0.005, peakGain: 0.2, delayS: 0.12 },
    ],
    'new-item': [
      { type: 'sine', startFreq: 1047, durationS: 0.12, attackS: 0.008, peakGain: 0.28 },
      { type: 'sine', startFreq: 1568, durationS: 0.2, attackS: 0.008, releaseS: 0.14, peakGain: 0.32, delayS: 0.1 },
    ],
    'generating-area': [
      { type: 'sine', startFreq: 262, durationS: 0.55, attackS: 0.08, releaseS: 0.38, peakGain: 0.2 },
      { type: 'sine', startFreq: 392, durationS: 0.5, attackS: 0.06, releaseS: 0.35, peakGain: 0.22, delayS: 0.14 },
    ],
  },
}

const orchestralTheme: SoundTheme = {
  id: 'orchestral',
  name: 'Orchestral',
  description: 'Layered sine/triangle, strings and brass feel.',
  recipes: {
    'damage-taken': [
      { type: 'sine', startFreq: 196, endFreq: 82, durationS: 0.25, attackS: 0.008, peakGain: 0.35 },
      { type: 'triangle', startFreq: 130, endFreq: 65, durationS: 0.28, attackS: 0.01, peakGain: 0.2 },
      { type: 'sine', startFreq: 98, endFreq: 55, durationS: 0.3, attackS: 0.01, peakGain: 0.15 },
    ],
    'damage-dealt': [
      { type: 'triangle', startFreq: 660, endFreq: 440, durationS: 0.12, attackS: 0.004, peakGain: 0.3 },
      { type: 'sine', startFreq: 880, endFreq: 660, durationS: 0.1, attackS: 0.003, peakGain: 0.18, delayS: 0.02 },
    ],
    'heal-self': [
      { type: 'sine', startFreq: 440, durationS: 0.2, attackS: 0.02, peakGain: 0.28 },
      { type: 'triangle', startFreq: 554, durationS: 0.22, attackS: 0.02, peakGain: 0.25, delayS: 0.1 },
      { type: 'sine', startFreq: 660, durationS: 0.3, attackS: 0.02, releaseS: 0.2, peakGain: 0.3, delayS: 0.2 },
      { type: 'triangle', startFreq: 880, durationS: 0.35, attackS: 0.03, releaseS: 0.25, peakGain: 0.25, delayS: 0.32 },
    ],
    loot: [
      { type: 'triangle', startFreq: 784, durationS: 0.12, attackS: 0.005, peakGain: 0.25 },
      { type: 'sine', startFreq: 1047, durationS: 0.16, attackS: 0.005, peakGain: 0.28, delayS: 0.08 },
    ],
    'level-up': [
      // Brass fanfare
      { type: 'triangle', startFreq: 349, durationS: 0.15, attackS: 0.008, releaseS: 0.06, peakGain: 0.35 },
      { type: 'sine', startFreq: 175, durationS: 0.14, attackS: 0.008, releaseS: 0.06, peakGain: 0.18 },
      { type: 'triangle', startFreq: 392, durationS: 0.15, attackS: 0.008, releaseS: 0.06, peakGain: 0.35, delayS: 0.18 },
      { type: 'sine', startFreq: 196, durationS: 0.14, attackS: 0.008, releaseS: 0.06, peakGain: 0.18, delayS: 0.18 },
      { type: 'triangle', startFreq: 440, durationS: 0.15, attackS: 0.008, releaseS: 0.06, peakGain: 0.38, delayS: 0.36 },
      // Sustained chord
      { type: 'sine', startFreq: 523, durationS: 0.8, attackS: 0.02, releaseS: 0.6, peakGain: 0.32, delayS: 0.54 },
      { type: 'triangle', startFreq: 660, durationS: 0.75, attackS: 0.02, releaseS: 0.55, peakGain: 0.28, delayS: 0.54 },
      { type: 'sine', startFreq: 784, durationS: 0.7, attackS: 0.02, releaseS: 0.5, peakGain: 0.25, delayS: 0.56 },
      { type: 'sine', startFreq: 262, durationS: 0.9, attackS: 0.04, releaseS: 0.7, peakGain: 0.18, delayS: 0.54 },
    ],
    death: [
      { type: 'sine', startFreq: 220, endFreq: 55, durationS: 1.2, attackS: 0.03, releaseS: 0.8, peakGain: 0.35 },
      { type: 'triangle', startFreq: 165, endFreq: 41, durationS: 1.1, attackS: 0.04, releaseS: 0.7, peakGain: 0.2 },
      { type: 'sine', startFreq: 110, endFreq: 33, durationS: 1.3, attackS: 0.05, releaseS: 0.9, peakGain: 0.12 },
    ],
    'enter-fight': [
      { type: 'triangle', startFreq: 294, endFreq: 196, durationS: 0.2, attackS: 0.006, peakGain: 0.3 },
      { type: 'sine', startFreq: 147, durationS: 0.25, attackS: 0.01, peakGain: 0.18, delayS: 0.06 },
      { type: 'triangle', startFreq: 220, durationS: 0.18, attackS: 0.005, peakGain: 0.15, delayS: 0.1 },
    ],
    'new-area': [
      { type: 'sine', startFreq: 440, durationS: 0.3, attackS: 0.03, releaseS: 0.2, peakGain: 0.28 },
      { type: 'triangle', startFreq: 554, durationS: 0.32, attackS: 0.03, releaseS: 0.22, peakGain: 0.25, delayS: 0.14 },
      { type: 'sine', startFreq: 660, durationS: 0.34, attackS: 0.03, releaseS: 0.24, peakGain: 0.28, delayS: 0.28 },
      { type: 'triangle', startFreq: 880, durationS: 0.65, attackS: 0.03, releaseS: 0.45, peakGain: 0.32, delayS: 0.42 },
      { type: 'sine', startFreq: 220, endFreq: 440, durationS: 0.8, attackS: 0.1, releaseS: 0.5, peakGain: 0.15, delayS: 0.14 },
      { type: 'sine', startFreq: 1320, durationS: 0.4, attackS: 0.02, releaseS: 0.3, peakGain: 0.12, delayS: 0.52 },
    ],
    'llm-connected': [
      { type: 'sine', startFreq: 440, durationS: 0.5, attackS: 0.04, releaseS: 0.35, peakGain: 0.28 },
      { type: 'triangle', startFreq: 554, durationS: 0.45, attackS: 0.03, releaseS: 0.3, peakGain: 0.22, delayS: 0.18 },
      { type: 'sine', startFreq: 660, durationS: 0.55, attackS: 0.03, releaseS: 0.4, peakGain: 0.28, delayS: 0.36 },
      { type: 'triangle', startFreq: 880, durationS: 0.6, attackS: 0.03, releaseS: 0.45, peakGain: 0.3, delayS: 0.52 },
    ],
    'gold-windfall': [
      { type: 'triangle', startFreq: 1047, endFreq: 1397, durationS: 0.07, attackS: 0.003, peakGain: 0.25 },
      { type: 'sine', startFreq: 1397, endFreq: 1760, durationS: 0.07, attackS: 0.003, peakGain: 0.25, delayS: 0.07 },
      { type: 'triangle', startFreq: 1760, endFreq: 2093, durationS: 0.07, attackS: 0.003, peakGain: 0.28, delayS: 0.14 },
      { type: 'sine', startFreq: 2637, durationS: 0.4, attackS: 0.006, releaseS: 0.28, peakGain: 0.32, delayS: 0.21 },
      { type: 'triangle', startFreq: 1319, durationS: 0.35, attackS: 0.01, releaseS: 0.25, peakGain: 0.15, delayS: 0.22 },
    ],
    'gold-jackpot': [
      { type: 'triangle', startFreq: 880, endFreq: 1175, durationS: 0.06, attackS: 0.003, peakGain: 0.22 },
      { type: 'sine', startFreq: 1175, endFreq: 1480, durationS: 0.06, attackS: 0.003, peakGain: 0.22, delayS: 0.06 },
      { type: 'triangle', startFreq: 1480, endFreq: 1760, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.12 },
      { type: 'sine', startFreq: 1175, endFreq: 1480, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.2 },
      { type: 'triangle', startFreq: 1480, endFreq: 1760, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.26 },
      { type: 'sine', startFreq: 1760, endFreq: 2200, durationS: 0.06, attackS: 0.003, peakGain: 0.28, delayS: 0.32 },
      { type: 'sine', startFreq: 2637, durationS: 0.55, attackS: 0.008, releaseS: 0.4, peakGain: 0.35, delayS: 0.4 },
      { type: 'triangle', startFreq: 1319, durationS: 0.5, attackS: 0.015, releaseS: 0.35, peakGain: 0.18, delayS: 0.41 },
      { type: 'sine', startFreq: 660, durationS: 0.55, attackS: 0.02, releaseS: 0.4, peakGain: 0.12, delayS: 0.42 },
    ],
    'new-mob': [
      { type: 'sine', startFreq: 165, endFreq: 110, durationS: 0.22, attackS: 0.01, peakGain: 0.28 },
      { type: 'triangle', startFreq: 220, endFreq: 165, durationS: 0.18, attackS: 0.008, peakGain: 0.18, delayS: 0.08 },
      { type: 'sine', startFreq: 82, durationS: 0.25, attackS: 0.015, peakGain: 0.12, delayS: 0.04 },
    ],
    'new-item': [
      { type: 'sine', startFreq: 880, durationS: 0.15, attackS: 0.01, peakGain: 0.25 },
      { type: 'triangle', startFreq: 1175, durationS: 0.18, attackS: 0.01, releaseS: 0.12, peakGain: 0.28, delayS: 0.1 },
      { type: 'sine', startFreq: 1320, durationS: 0.22, attackS: 0.01, releaseS: 0.16, peakGain: 0.22, delayS: 0.2 },
    ],
    'generating-area': [
      { type: 'sine', startFreq: 262, durationS: 0.5, attackS: 0.06, releaseS: 0.35, peakGain: 0.2 },
      { type: 'triangle', startFreq: 330, durationS: 0.48, attackS: 0.05, releaseS: 0.32, peakGain: 0.18, delayS: 0.12 },
    ],
  },
}

const dungeonTheme: SoundTheme = {
  id: 'dungeon',
  name: 'Dungeon',
  description: 'Low sawtooth drones, dark atmosphere.',
  recipes: {
    'damage-taken': [
      { type: 'sawtooth', startFreq: 110, endFreq: 55, durationS: 0.3, attackS: 0.01, peakGain: 0.4 },
      { type: 'sawtooth', startFreq: 65, endFreq: 33, durationS: 0.35, attackS: 0.015, peakGain: 0.25 },
    ],
    'damage-dealt': [
      { type: 'sawtooth', startFreq: 440, endFreq: 220, durationS: 0.12, attackS: 0.003, peakGain: 0.3 },
      { type: 'sawtooth', startFreq: 220, endFreq: 110, durationS: 0.1, attackS: 0.003, peakGain: 0.15, delayS: 0.04 },
    ],
    'heal-self': [
      { type: 'sine', startFreq: 330, durationS: 0.2, attackS: 0.02, peakGain: 0.25 },
      { type: 'sine', startFreq: 440, durationS: 0.25, attackS: 0.02, peakGain: 0.25, delayS: 0.12 },
    ],
    loot: [
      { type: 'sawtooth', startFreq: 660, durationS: 0.08, peakGain: 0.22 },
      { type: 'sawtooth', startFreq: 880, durationS: 0.1, peakGain: 0.22, delayS: 0.06 },
    ],
    'level-up': [
      { type: 'sawtooth', startFreq: 220, durationS: 0.15, attackS: 0.01, releaseS: 0.06, peakGain: 0.35 },
      { type: 'sawtooth', startFreq: 262, durationS: 0.15, attackS: 0.01, releaseS: 0.06, peakGain: 0.35, delayS: 0.18 },
      { type: 'sawtooth', startFreq: 330, durationS: 0.15, attackS: 0.01, releaseS: 0.06, peakGain: 0.38, delayS: 0.36 },
      { type: 'sawtooth', startFreq: 440, durationS: 0.8, attackS: 0.02, releaseS: 0.6, peakGain: 0.35, delayS: 0.54 },
      { type: 'sine', startFreq: 220, durationS: 0.9, attackS: 0.04, releaseS: 0.7, peakGain: 0.2, delayS: 0.54 },
      { type: 'sawtooth', startFreq: 330, durationS: 0.7, attackS: 0.03, releaseS: 0.5, peakGain: 0.18, delayS: 0.56 },
    ],
    death: [
      { type: 'sawtooth', startFreq: 130, endFreq: 33, durationS: 1.2, attackS: 0.02, releaseS: 0.8, peakGain: 0.45 },
      { type: 'sawtooth', startFreq: 82, endFreq: 25, durationS: 1.3, attackS: 0.03, releaseS: 0.9, peakGain: 0.25 },
    ],
    'enter-fight': [
      { type: 'sawtooth', startFreq: 196, endFreq: 98, durationS: 0.22, attackS: 0.008, peakGain: 0.35 },
      { type: 'sawtooth', startFreq: 82, durationS: 0.3, attackS: 0.015, peakGain: 0.2, delayS: 0.08 },
    ],
    'new-area': [
      { type: 'sawtooth', startFreq: 220, durationS: 0.3, attackS: 0.04, releaseS: 0.2, peakGain: 0.25 },
      { type: 'sawtooth', startFreq: 262, durationS: 0.32, attackS: 0.04, releaseS: 0.22, peakGain: 0.25, delayS: 0.16 },
      { type: 'sawtooth', startFreq: 330, durationS: 0.35, attackS: 0.04, releaseS: 0.24, peakGain: 0.28, delayS: 0.32 },
      { type: 'sine', startFreq: 440, durationS: 0.55, attackS: 0.05, releaseS: 0.4, peakGain: 0.3, delayS: 0.48 },
      { type: 'sawtooth', startFreq: 110, durationS: 0.7, attackS: 0.1, releaseS: 0.4, peakGain: 0.15, delayS: 0.16 },
    ],
    'llm-connected': [
      { type: 'sawtooth', startFreq: 220, durationS: 0.5, attackS: 0.04, releaseS: 0.35, peakGain: 0.25 },
      { type: 'sine', startFreq: 330, durationS: 0.45, attackS: 0.03, releaseS: 0.3, peakGain: 0.22, delayS: 0.2 },
      { type: 'sawtooth', startFreq: 440, durationS: 0.5, attackS: 0.03, releaseS: 0.35, peakGain: 0.28, delayS: 0.4 },
    ],
    'gold-windfall': [
      { type: 'sawtooth', startFreq: 660, endFreq: 880, durationS: 0.08, attackS: 0.003, peakGain: 0.25 },
      { type: 'sawtooth', startFreq: 880, endFreq: 1175, durationS: 0.08, attackS: 0.003, peakGain: 0.25, delayS: 0.07 },
      { type: 'sawtooth', startFreq: 1175, endFreq: 1480, durationS: 0.08, attackS: 0.003, peakGain: 0.28, delayS: 0.14 },
      { type: 'sine', startFreq: 1760, durationS: 0.35, attackS: 0.005, releaseS: 0.25, peakGain: 0.3, delayS: 0.22 },
    ],
    'gold-jackpot': [
      { type: 'sawtooth', startFreq: 550, endFreq: 770, durationS: 0.06, attackS: 0.003, peakGain: 0.22 },
      { type: 'sawtooth', startFreq: 770, endFreq: 1000, durationS: 0.06, attackS: 0.003, peakGain: 0.22, delayS: 0.06 },
      { type: 'sawtooth', startFreq: 1000, endFreq: 1300, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.12 },
      { type: 'sawtooth', startFreq: 770, endFreq: 1000, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.2 },
      { type: 'sawtooth', startFreq: 1000, endFreq: 1300, durationS: 0.06, attackS: 0.003, peakGain: 0.25, delayS: 0.26 },
      { type: 'sawtooth', startFreq: 1300, endFreq: 1700, durationS: 0.06, attackS: 0.003, peakGain: 0.28, delayS: 0.32 },
      { type: 'sine', startFreq: 1760, durationS: 0.5, attackS: 0.008, releaseS: 0.35, peakGain: 0.32, delayS: 0.4 },
      { type: 'sawtooth', startFreq: 880, durationS: 0.4, attackS: 0.015, releaseS: 0.3, peakGain: 0.15, delayS: 0.42 },
    ],
    'new-mob': [
      { type: 'sawtooth', startFreq: 98, endFreq: 65, durationS: 0.25, attackS: 0.015, peakGain: 0.35 },
      { type: 'sawtooth', startFreq: 165, endFreq: 110, durationS: 0.2, attackS: 0.01, peakGain: 0.2, delayS: 0.12 },
    ],
    'new-item': [
      { type: 'sawtooth', startFreq: 660, durationS: 0.12, attackS: 0.008, peakGain: 0.22 },
      { type: 'sine', startFreq: 988, durationS: 0.18, attackS: 0.008, releaseS: 0.12, peakGain: 0.28, delayS: 0.1 },
    ],
    'generating-area': [
      { type: 'sawtooth', startFreq: 165, durationS: 0.5, attackS: 0.06, releaseS: 0.35, peakGain: 0.2 },
      { type: 'sine', startFreq: 220, durationS: 0.45, attackS: 0.05, releaseS: 0.3, peakGain: 0.18, delayS: 0.12 },
    ],
  },
}

const minimalTheme: SoundTheme = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Short single-tone blips, barely there.',
  recipes: {
    'damage-taken': [
      { type: 'sine', startFreq: 180, durationS: 0.06, attackS: 0.002, peakGain: 0.2 },
    ],
    'damage-dealt': [
      { type: 'sine', startFreq: 600, durationS: 0.04, attackS: 0.002, peakGain: 0.18 },
    ],
    'heal-self': [
      { type: 'sine', startFreq: 523, durationS: 0.06, attackS: 0.003, peakGain: 0.2 },
    ],
    loot: [
      { type: 'sine', startFreq: 880, durationS: 0.04, peakGain: 0.18 },
    ],
    'level-up': [
      { type: 'sine', startFreq: 523, durationS: 0.08, attackS: 0.003, peakGain: 0.22 },
      { type: 'sine', startFreq: 784, durationS: 0.1, attackS: 0.003, peakGain: 0.22, delayS: 0.08 },
    ],
    death: [
      { type: 'sine', startFreq: 165, durationS: 0.15, attackS: 0.005, releaseS: 0.08, peakGain: 0.2 },
    ],
    'enter-fight': [
      { type: 'sine', startFreq: 220, durationS: 0.06, attackS: 0.003, peakGain: 0.18 },
    ],
    'new-area': [
      { type: 'sine', startFreq: 660, durationS: 0.08, attackS: 0.005, peakGain: 0.2 },
      { type: 'sine', startFreq: 880, durationS: 0.1, attackS: 0.005, peakGain: 0.2, delayS: 0.08 },
    ],
    'llm-connected': [
      { type: 'sine', startFreq: 440, durationS: 0.08, attackS: 0.005, peakGain: 0.2 },
      { type: 'sine', startFreq: 660, durationS: 0.08, attackS: 0.005, peakGain: 0.2, delayS: 0.08 },
    ],
    'gold-windfall': [
      { type: 'sine', startFreq: 1319, durationS: 0.05, attackS: 0.002, peakGain: 0.18 },
      { type: 'sine', startFreq: 2093, durationS: 0.08, attackS: 0.003, peakGain: 0.2, delayS: 0.05 },
    ],
    'gold-jackpot': [
      { type: 'sine', startFreq: 1047, durationS: 0.04, attackS: 0.002, peakGain: 0.16 },
      { type: 'sine', startFreq: 1568, durationS: 0.04, attackS: 0.002, peakGain: 0.18, delayS: 0.04 },
      { type: 'sine', startFreq: 2093, durationS: 0.1, attackS: 0.003, peakGain: 0.22, delayS: 0.08 },
    ],
    'new-mob': [
      { type: 'sine', startFreq: 165, durationS: 0.06, attackS: 0.003, peakGain: 0.18 },
    ],
    'new-item': [
      { type: 'sine', startFreq: 1047, durationS: 0.06, attackS: 0.003, peakGain: 0.2 },
    ],
    'generating-area': [
      { type: 'sine', startFreq: 262, durationS: 0.1, attackS: 0.005, peakGain: 0.15 },
    ],
  },
}

export const SOUND_THEMES: readonly SoundTheme[] = [
  retroTheme,
  chiptuneTheme,
  harmonicTheme,
  orchestralTheme,
  dungeonTheme,
  minimalTheme,
] as const

export function getThemeById(id: SoundThemeId): SoundTheme {
  return SOUND_THEMES.find((t) => t.id === id) ?? retroTheme
}
