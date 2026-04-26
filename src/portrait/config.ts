// Central tweakable knob bag for the layered portrait pipeline.
//
// Everything that's "tunable" — prompt phrasing, item-name → descriptor
// keyword maps, filter intensities, generation defaults, the master enable
// switch — lives here so contributors can iterate the look without hunting
// through the codebase. The shape is split into named sub-objects rather
// than a flat blob so editors can fold sections you're not touching.
//
// This file owns *defaults*. Runtime overrides (Settings panel, dev tools)
// shallow-merge over this object — see the eventual portrait Settings tab.

import type { Material, PortraitSlot, Tone } from './descriptor'
import type { SlotForm } from './descriptor'

export interface PortraitConfig {
  /** Master switch. When `false`, `PortraitLayers` renders nothing and
   *  the placeholder stick figure in `CharacterViewport` keeps the show.
   *  Defaulted off so first-run players without a ComfyUI bridge don't
   *  see broken portrait squares. Flip to `true` once the bridge is up. */
  enabled: boolean

  generation: {
    /** ComfyUI canvas size — must match `CANVAS_PX` from `rig.ts`. Kept
     *  here too for ergonomic override (e.g. dev wants 256² fast iteration). */
    width: number
    height: number
    /** Inference steps. `undefined` = use the bridge's default (Flux Schnell
     *  is fine at 4-8). Bump for higher quality at the cost of latency. */
    steps?: number
    /** How to derive the seed for each layer:
     *  - `descriptor-derived`: hash(descriptorKey) → 32-bit seed. Same
     *    descriptor always produces the same image, even after a cache wipe.
     *    Recommended.
     *  - `random`: let the bridge roll. Two cache misses on the same
     *    descriptor produce different images.
     *  - `none`: don't pass a seed at all. Equivalent to random in practice. */
    seedStrategy: 'descriptor-derived' | 'random' | 'none'
  }

  bridge: {
    /** Override the ComfyUI bridge URL. `undefined` falls back to
     *  `DEFAULT_BASE_URL` from `src/gen/client.ts`. */
    baseUrl?: string
    /** Health-check the bridge before firing the first generation. When
     *  the check fails, the portrait silently falls back to placeholders. */
    probeBeforeGenerate: boolean
  }

  prompt: {
    /** Style preamble — applied to every layer prompt before the
     *  descriptor-specific tokens. Keeps the look consistent across slots. */
    prefix: string
    /** Style postscript — applied at the end of every layer prompt. */
    suffix: string
    /** Per-tone modifier appended after the material/form clause. */
    toneModifier: Record<Tone, string>
    /** Per-material adjective phrase. */
    materialAdjective: Record<Material, string>
    /** Per-form noun phrase. Not every form must be mapped — unmapped
     *  forms fall through to the raw token. */
    formDescription: Record<string, string>
  }

  resolver: {
    /** Ordered list of (regex, material) pairs scanned against
     *  `item.name`. First match wins. Build from coarse → specific so
     *  "shadow-iron" hits `shadowstuff` before `plate`. The regex is
     *  matched case-insensitive. */
    materialKeywords: ReadonlyArray<readonly [pattern: string, material: Material]>
    /** Per-slot ordered (regex, form) pairs over `item.name`. */
    formKeywords: Partial<Record<PortraitSlot, ReadonlyArray<readonly [pattern: string, form: string]>>>
    /** Per-slot fallback form when no `formKeywords` matches. */
    fallbackForm: { [S in PortraitSlot]: SlotForm<S> }
    /** Per-slot fallback material when no `materialKeywords` matches. */
    fallbackMaterial: Record<PortraitSlot, Material>
    /** Tone derivation from item rarity. Reasonable defaults: low rarity =
     *  muted, high rarity = vibrant or pale (legendary reads as ethereal). */
    toneByRarity: Record<'common' | 'uncommon' | 'rare' | 'epic' | 'legendary', Tone>
  }

  filters: {
    rarityOutline: {
      enabled: boolean
      /** CSS color string per rarity tier. References theme tokens so the
       *  outline retints with theme. */
      colorByTier: Record<'common' | 'uncommon' | 'rare' | 'epic' | 'legendary', string>
      /** Outline thickness in display pixels. */
      thickness: number
    }
    elementalTint: {
      enabled: boolean
      /** RGB hex per element keyword. Tints applied via PixiJS ColorMatrixFilter. */
      colorByElement: Record<'fire' | 'frost' | 'shock' | 'shadow' | 'arcane' | 'holy', number>
      /** 0-1 blend strength. */
      intensity: number
    }
    enchantGlow: {
      enabled: boolean
      /** Milliseconds per pulse cycle. */
      pulseSpeedMs: number
      /** Peak GlowFilter outerStrength. */
      maxStrength: number
    }
    durabilityWear: {
      enabled: boolean
      /** Below this durability ratio, the wear overlay starts ramping in. */
      crackThreshold: number
    }
  }

  display: {
    /** Pixelated CSS rendering on the canvas — required for crisp pixel art
     *  at non-1× scale. */
    pixelated: boolean
    /** Background of the portrait stage. `'transparent'` lets the underlying
     *  CharacterViewport (with its CRT effects) show through. */
    background: number | 'transparent'
    /** While layers are still generating, fade them in instead of popping. */
    fadeInMs: number
  }
}

export const PORTRAIT_CONFIG: PortraitConfig = {
  enabled: false,

  generation: {
    width: 512,
    height: 512,
    steps: undefined,
    seedStrategy: 'descriptor-derived',
  },

  bridge: {
    baseUrl: undefined,
    probeBeforeGenerate: true,
  },

  prompt: {
    prefix: 'pixel art, transparent background, ',
    suffix: ', centered single character, no other elements, fantasy RPG style, crisp clean lines',
    toneModifier: {
      dark: 'dark muted colors, gritty atmosphere',
      muted: 'soft muted palette, weathered',
      vibrant: 'bright saturated colors, polished',
      pale: 'pale washed-out tones, ethereal faded look',
    },
    materialAdjective: {
      cloth: 'woven cloth',
      leather: 'tanned leather',
      hide: 'rough hide',
      silk: 'flowing silk',
      wool: 'thick wool',
      wood: 'carved wood',
      bone: 'pale bone',
      mail: 'chain mail',
      scale: 'overlapping scale',
      plate: 'forged steel plate',
      crystal: 'translucent crystal',
      shadowstuff: 'inky shadow-fabric',
    },
    formDescription: {
      humanoid: 'humanoid figure, neutral pose, arms slightly out',
      cloak: 'long flowing cloak, draped from shoulders to ankles',
      mantle: 'shoulder mantle, short cape',
      tabard: 'heraldic tabard, knee-length panel front and back',
      shawl: 'soft shawl wrapped around shoulders',
      wrap: 'tied wrap, simple cloth',
      breeches: 'breeches, knee-length',
      leggings: 'tight leggings',
      greaves: 'plate greaves, segmented',
      kilt: 'belted kilt',
      skirt: 'long flowing skirt',
      boots: 'leather boots, mid-calf',
      sandals: 'open sandals with straps',
      sabatons: 'plate sabatons, articulated',
      wraps: 'cloth foot-wraps',
      tunic: 'simple tunic, belted at waist',
      vest: 'fitted sleeveless vest',
      breastplate: 'breastplate, polished',
      robe: 'long sweeping robe',
      jerkin: 'leather jerkin, sleeveless',
      brigandine: 'studded brigandine, riveted plates',
      bracers: 'forearm bracers',
      vambraces: 'plate vambraces, segmented',
      sleeves: 'long sleeves, ending at wrist',
      pauldrons: 'shoulder pauldrons',
      gloves: 'fitted gloves',
      gauntlets: 'plate gauntlets, fingered',
      mitts: 'thick mitts',
      'shield-round': 'round shield, banded',
      'shield-kite': 'kite shield, tall and tapered',
      'shield-tower': 'tower shield, full-body',
      buckler: 'small buckler, fist-sized',
      orb: 'glowing orb, hovering above palm',
      tome: 'leather-bound spellbook',
      dagger: 'short dagger',
      wand: 'slender wand, etched runes',
      sword: 'longsword, single-edged',
      axe: 'battle axe, single-bladed',
      mace: 'iron mace, flanged head',
      spear: 'wooden spear, leaf-blade',
      bow: 'recurve bow, drawn slightly',
      staff: 'wooden staff, knot at top',
      hammer: 'war hammer, square head',
      hood: 'soft hood up over head',
      cap: 'leather cap, snug',
      helm: 'iron helm, faceplate',
      coif: 'mail coif, hood-style',
      circlet: 'metal circlet across brow',
      crown: 'jeweled crown, tall points',
    },
  },

  resolver: {
    materialKeywords: [
      ['shadow|void|dread|wraith|umbral', 'shadowstuff'],
      ['crystal|gem|rune|prism', 'crystal'],
      ['bone|fang|tooth|skull', 'bone'],
      ['plate|steel|iron|forged|adamant', 'plate'],
      ['mail|chain', 'mail'],
      ['scale|drake|wyrm', 'scale'],
      ['silk|elven|spider', 'silk'],
      ['wool|fleece', 'wool'],
      ['hide|fur|pelt|beast', 'hide'],
      ['leather|tanned|cured', 'leather'],
      ['wood|oak|elm|ash|birch|yew', 'wood'],
      ['cloth|linen|cotton|robe', 'cloth'],
    ],
    formKeywords: {
      mainhand: [
        ['sword|blade|saber|rapier|katana|falchion|scimitar', 'sword'],
        ['axe|hatchet|cleaver', 'axe'],
        ['mace|club|cudgel|morningstar', 'mace'],
        ['spear|pike|halberd|glaive', 'spear'],
        ['bow|longbow|shortbow|crossbow', 'bow'],
        ['staff|stave', 'staff'],
        ['hammer|maul|warhammer', 'hammer'],
        ['dagger|knife|shiv|stiletto|dirk', 'dagger'],
      ],
      offhand: [
        ['tower\\s*shield', 'shield-tower'],
        ['kite\\s*shield', 'shield-kite'],
        ['buckler', 'buckler'],
        ['shield', 'shield-round'],
        ['orb|sphere', 'orb'],
        ['tome|book|grimoire|codex', 'tome'],
        ['wand|rod', 'wand'],
        ['dagger|knife|shiv', 'dagger'],
      ],
      head: [
        ['crown', 'crown'],
        ['circlet|tiara|diadem', 'circlet'],
        ['coif', 'coif'],
        ['helm|helmet', 'helm'],
        ['cap|hat', 'cap'],
        ['hood|cowl', 'hood'],
      ],
      armor: [
        ['breastplate|cuirass', 'breastplate'],
        ['robe|gown', 'robe'],
        ['brigandine', 'brigandine'],
        ['jerkin', 'jerkin'],
        ['vest|waistcoat', 'vest'],
        ['tunic|shirt', 'tunic'],
      ],
      cape: [
        ['mantle', 'mantle'],
        ['tabard', 'tabard'],
        ['shawl', 'shawl'],
        ['wrap', 'wrap'],
        ['cape|cloak|mantle', 'cloak'],
      ],
      legs: [
        ['greaves', 'greaves'],
        ['kilt', 'kilt'],
        ['skirt', 'skirt'],
        ['leggings|tights', 'leggings'],
        ['breeches|trousers|pants', 'breeches'],
      ],
      feet: [
        ['sabatons', 'sabatons'],
        ['sandals', 'sandals'],
        ['wraps', 'wraps'],
        ['boots|shoes', 'boots'],
      ],
      hands: [
        ['gauntlets', 'gauntlets'],
        ['mitts|mittens', 'mitts'],
        ['gloves', 'gloves'],
      ],
      arms: [
        ['vambraces', 'vambraces'],
        ['pauldrons', 'pauldrons'],
        ['sleeves', 'sleeves'],
        ['bracers', 'bracers'],
      ],
    },
    fallbackForm: {
      'body-base': 'humanoid',
      cape: 'cloak',
      legs: 'breeches',
      feet: 'boots',
      armor: 'tunic',
      arms: 'bracers',
      hands: 'gloves',
      offhand: 'shield-round',
      mainhand: 'sword',
      head: 'cap',
    },
    fallbackMaterial: {
      'body-base': 'cloth',
      cape: 'cloth',
      legs: 'cloth',
      feet: 'leather',
      armor: 'cloth',
      arms: 'leather',
      hands: 'leather',
      offhand: 'wood',
      mainhand: 'wood',
      head: 'leather',
    },
    toneByRarity: {
      common: 'muted',
      uncommon: 'muted',
      rare: 'vibrant',
      epic: 'vibrant',
      legendary: 'pale',
    },
  },

  filters: {
    rarityOutline: {
      enabled: true,
      colorByTier: {
        common: 'var(--rarity-common)',
        uncommon: 'var(--rarity-uncommon)',
        rare: 'var(--rarity-rare)',
        epic: 'var(--rarity-epic)',
        legendary: 'var(--rarity-legendary)',
      },
      thickness: 2,
    },
    elementalTint: {
      enabled: true,
      colorByElement: {
        fire: 0xff7a3a,
        frost: 0x80c8ff,
        shock: 0xfff080,
        shadow: 0x4a3060,
        arcane: 0xc070ff,
        holy: 0xfff0a0,
      },
      intensity: 0.35,
    },
    enchantGlow: {
      enabled: true,
      pulseSpeedMs: 800,
      maxStrength: 4,
    },
    durabilityWear: {
      enabled: false,
      crackThreshold: 0.5,
    },
  },

  display: {
    pixelated: true,
    background: 'transparent',
    fadeInMs: 220,
  },
}
