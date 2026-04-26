import type { Character } from '../character'
import type { WorldManifest } from '../worlds/types'
import type { Rng } from '../rng'
import type { Drives } from './drives'

/** Maximum favor a character can accumulate. The Anointed tier (death-save
 *  guarantee) sits 100 points below this cap so a few extra sacrifices
 *  past 900 are still meaningful. Hard cap rather than soft asymptote
 *  to keep the gauge readable. */
export const FAVOR_MAX = 1000

/** Lower bound (inclusive) of each favor tier — index 0 is "Unseen", indices
 *  1–4 are the named tiers from the manifest's `favorTierNames`. The number
 *  at index N is the favor value at which the character *enters* tier N. */
export const FAVOR_TIER_THRESHOLDS = [0, 100, 300, 600, 900] as const

/** Default tier names when a manifest doesn't override them. Matches the
 *  fantasy ladder. Tier 0 ("Unseen") is universal — no world re-skins it. */
export const DEFAULT_FAVOR_TIER_NAMES: [string, string, string, string] = [
  'Touched',
  'Witnessed',
  'Favored',
  'Anointed',
]

/** Default per-tier flavor tooltips. Used when a manifest doesn't supply
 *  `favorTierTooltips`. Index 0 corresponds to tier 0 (Unseen). */
export const DEFAULT_FAVOR_TIER_TOOLTIPS: [string, string, string, string, string] = [
  'The gods do not yet know your name.',
  'The gods are watching.',
  'The gods know your face.',
  'The gods walk a step behind you.',
  'The gods will not let you fall.',
]

/** Default NPC tier-acknowledgement pools. Used when a manifest doesn't
 *  override. Indexed 0..3 for tiers 1..4 (no Unseen pool). Each entry
 *  is a `{name}`-templated greeting prefix. */
export const DEFAULT_FAVOR_TIER_ACKNOWLEDGEMENTS: readonly (readonly string[])[] = [
  [
    'Oh, {name}, you are touched. Have a blessed day.',
    '{name} — touched. The gods see you walking.',
    'Touched one — {name}, may their gaze be gentle.',
  ],
  [
    '{name}, witnessed by the gods. Walk well.',
    'Witnessed — {name}, the gods know your name now.',
    'Honored to see you, {name}. The gods are watching close.',
  ],
  [
    '{name}, favored — the gods walk a step behind you today.',
    'Welcome, favored {name}. May the road be soft.',
    'Favored {name}, light a candle for the road.',
  ],
  [
    '{name}, anointed. The gods will not let you fall.',
    'Anointed {name} — bless me, in passing.',
    'The gods themselves walk with you, {name}. Anointed.',
  ],
]

/** Probability an NPC greeting picks up a tier-acknowledgement prefix
 *  when the character is at tier 1+. Tuned to feel "some NPCs notice"
 *  rather than "every interaction is a sermon". */
export const TIER_ACKNOWLEDGEMENT_CHANCE = 0.35

/** Picks a tier-acknowledgement greeting prefix for the character's
 *  current favor tier. Returns null when:
 *   - the character is at tier 0 (Unseen — NPCs don't notice yet),
 *   - the manifest's pool for the tier is empty.
 *  When non-null, `{name}` is substituted with the character's name.
 *  Caller is expected to gate the call on a probability roll
 *  (TIER_ACKNOWLEDGEMENT_CHANCE) so not every greeting fires. */
export function pickTierAcknowledgement(
  character: Character,
  manifest: WorldManifest | undefined,
  rng: Rng,
): string | null {
  const tier = favorTier(character.favor)
  if (tier === 0) return null
  const pools = manifest?.favorTierAcknowledgements ?? DEFAULT_FAVOR_TIER_ACKNOWLEDGEMENTS
  const pool = pools[tier - 1]
  if (!pool || pool.length === 0) return null
  const template = rng.pick(pool as readonly string[])
  return template.replaceAll('{name}', character.name)
}

/** Tier ordinal (0–4) for a given favor amount. Out-of-range values are
 *  clamped (negative → 0, > FAVOR_MAX → 4). */
export function favorTier(favor: number | undefined): 0 | 1 | 2 | 3 | 4 {
  const f = favor ?? 0
  if (f >= FAVOR_TIER_THRESHOLDS[4]) return 4
  if (f >= FAVOR_TIER_THRESHOLDS[3]) return 3
  if (f >= FAVOR_TIER_THRESHOLDS[2]) return 2
  if (f >= FAVOR_TIER_THRESHOLDS[1]) return 1
  return 0
}

/** Pretty tier label for the sheet/log. Tier 0 is always "Unseen"; tiers
 *  1–4 read from the manifest (or default ladder). */
export function favorTierName(
  tier: 0 | 1 | 2 | 3 | 4,
  manifest?: WorldManifest,
): string {
  if (tier === 0) return 'Unseen'
  const names = manifest?.favorTierNames ?? DEFAULT_FAVOR_TIER_NAMES
  return names[tier - 1] ?? DEFAULT_FAVOR_TIER_NAMES[tier - 1]
}

/** Per-tier flavor tooltip (Sheet hover). World-specific via the manifest's
 *  `favorTierTooltips`; falls back to the fantasy ladder. */
export function favorTierTooltip(
  tier: 0 | 1 | 2 | 3 | 4,
  manifest?: WorldManifest,
): string {
  const tips = manifest?.favorTierTooltips ?? DEFAULT_FAVOR_TIER_TOOLTIPS
  return tips[tier] ?? DEFAULT_FAVOR_TIER_TOOLTIPS[tier]
}

/** Display name of the favor gauge in this world. Defaults to "Favor". */
export function favorName(manifest?: WorldManifest): string {
  return manifest?.favorName ?? 'Favor'
}

/** Word used for the deity in the death-save log line ("the gods", "the net",
 *  "the archive"). Defaults to "gods". */
export function deityWord(manifest?: WorldManifest): string {
  return manifest?.deityWord ?? 'gods'
}

/** Add favor to the character, clamped to [0, FAVOR_MAX]. Returns the new
 *  total — the old tier ordinal is exposed for callers that want to detect
 *  a tier-up. */
export function gainFavor(
  current: number | undefined,
  amount: number,
): { next: number; tieredUp: boolean; fromTier: 0 | 1 | 2 | 3 | 4; toTier: 0 | 1 | 2 | 3 | 4 } {
  const fromTier = favorTier(current)
  const next = Math.max(0, Math.min(FAVOR_MAX, (current ?? 0) + amount))
  const toTier = favorTier(next)
  return { next, tieredUp: toTier > fromTier, fromTier, toTier }
}

/** Whether the character currently qualifies for a death-save (Anointed
 *  tier). Used by `resolveCharacterDeath` as the pre-check that converts
 *  the killing blow. */
export function canDeathSave(character: Character): boolean {
  return favorTier(character.favor) === 4
}

/** Per-tick HP regen multiplier from an active blessing. Tier 1+ adds a
 *  10% bonus on top of the base rest heal. Returns 1.0 when no blessing
 *  is active. Composes with equipped rest-boost gear (see
 *  `restHealAmount` in tick.ts). */
export function blessingRestMultiplier(character: Character): number {
  const t = character.blessing?.tier
  if (!t) return 1
  return 1.1
}

/** Per-kill XP multiplier from an active blessing. Tier 2+ grants +10% XP
 *  per kill. Returns 1.0 when no blessing is active or the tier is too
 *  low. */
export function blessingXpMultiplier(character: Character): number {
  const t = character.blessing?.tier
  if (!t || t < 2) return 1
  return 1.1
}

/** Severity floor bump from an active blessing. Tier 4 (Anointed) raises
 *  every successful character attack one severity tier (grazing → light,
 *  light → solid, etc.). Returns 0 below tier 4 or with no blessing. */
export function blessingSeverityFloor(character: Character): number {
  const t = character.blessing?.tier
  if (!t || t < 4) return 0
  return 1
}

/** Pretty short summary of an active blessing for the conditions row.
 *  Returns null when no blessing is active. */
export function describeBlessing(character: Character, manifest?: WorldManifest): string | null {
  const b = character.blessing
  if (!b) return null
  const tName = favorTierName(b.tier, manifest)
  return `Blessing of the ${tName}`
}

/** Tick down an active blessing by one. Returns the next blessing state
 *  (or undefined when it expires). Pure — caller persists. */
export function tickBlessing(character: Character): Character {
  const b = character.blessing
  if (!b) return character
  if (b.ticksRemaining <= 1) {
    return { ...character, blessing: undefined }
  }
  return { ...character, blessing: { ...b, ticksRemaining: b.ticksRemaining - 1 } }
}

/** Default blessing duration in ticks per tier — higher tiers stick around
 *  longer so a single Anointed shrine visit covers more of the next push. */
export const BLESSING_TICKS = [0, 120, 180, 240, 300] as const

/** Indexed by favor tier (0..4) — the strength of the shrine "pull" the
 *  character feels when no blessing is active. Compared 1-to-1 against the
 *  highest body drive so the shrine wins out only when the pull genuinely
 *  exceeds the strongest physical need. Tier 4 (Anointed) effectively
 *  always wants the shrine when the blessing isn't running. */
export const SHRINE_PULL_BY_TIER = [0, 30, 50, 70, 95] as const

/** How strongly the character is currently pulled toward a shrine — 0 when
 *  there's nothing to seek (no favor yet, or a blessing is already active),
 *  otherwise scales with tier per `SHRINE_PULL_BY_TIER`. Used to stamp the
 *  `piety` drive on every explore tick (see `stampPiety`). */
export function shrinePull(character: Character): number {
  if (character.blessing) return 0
  const t = favorTier(character.favor)
  if (t === 0) return 0
  return SHRINE_PULL_BY_TIER[t]
}

/** Stamps the `piety` drive value on a Drives object. Piety is computed,
 *  not grown — the user's favor + blessing state determines its value
 *  every tick (same model `weight` uses for inventory mass). When a
 *  blessing is active piety is 0; otherwise it scales with favor tier
 *  via `shrinePull`. Pure — caller persists. */
export function stampPiety(drives: Drives, character: Character): Drives {
  return { ...drives, piety: shrinePull(character) }
}

/** Build the blessing record corresponding to the tier the character is
 *  currently at. Returns null when favor is below tier 1. */
export function blessingFor(character: Character): Character['blessing'] | null {
  const t = favorTier(character.favor)
  if (t === 0) return null
  return { tier: t, ticksRemaining: BLESSING_TICKS[t] }
}
