// Five-tier rarity system shared by items and mobs.
//
// Items roll a rarity at drop time and persist it on the InventoryItem.
// Equipment bonuses and sale value are multiplied by the tier's
// \`statMult\` / \`valueMult\`.
//
// Mobs are assigned a rarity at spawn. Their name gets a prefix modifier
// and (for rare/epic/legendary) trailing skulls. HP / attack / defense /
// xpReward / loot quantity are multiplied by the tier's stat mults.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export interface RarityDef {
  id: Rarity
  /** Display label (capitalized). */
  label: string
  /** CSS color for the item name and mob prefix in logs / panels. */
  color: string
  /** Multiplier for equipment ATK/DEF bonuses and mob HP/ATK/DEF/XP. */
  statMult: number
  /** Multiplier for item \`value\` (sale price). */
  valueMult: number
  /** Mob name prefix, applied before the base name. Empty = no prefix. */
  mobPrefix: string
  /** How many skulls trail the mob name. */
  mobSkulls: number
  /** Roll weight — odds of this tier when rolling a random rarity. */
  rollWeight: number
}

export const RARITY_DEFS: Record<Rarity, RarityDef> = {
  common: {
    id: 'common',
    label: 'Common',
    color: '#c8c8c8',
    statMult: 1,
    valueMult: 1,
    mobPrefix: '',
    mobSkulls: 0,
    rollWeight: 55,
  },
  uncommon: {
    id: 'uncommon',
    label: 'Uncommon',
    color: '#5fd45f',
    statMult: 1.3,
    valueMult: 1.6,
    mobPrefix: 'Strong ',
    mobSkulls: 0,
    rollWeight: 25,
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    color: '#5aa7ff',
    statMult: 1.7,
    valueMult: 2.4,
    mobPrefix: 'King ',
    mobSkulls: 1,
    rollWeight: 13,
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    color: '#c084fc',
    statMult: 2.2,
    valueMult: 4,
    mobPrefix: 'Strong King ',
    mobSkulls: 2,
    rollWeight: 6,
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    color: '#ffb040',
    statMult: 3,
    valueMult: 8,
    mobPrefix: 'Dread King ',
    mobSkulls: 3,
    rollWeight: 1,
  },
}

// Black star as the rarity pip. The old skull-and-crossbones glyph (☠) renders
// tiny in most system fonts and was easy to miss; ★ scales with font-size and
// is a commonly-understood "elite tier" marker in game UIs.
const PIP = '★'

export function skullsFor(rarity: Rarity): string {
  const n = RARITY_DEFS[rarity].mobSkulls
  if (n <= 0) return ''
  return ' ' + PIP.repeat(n)
}

export function mobDisplayName(baseName: string, rarity: Rarity): string {
  const def = RARITY_DEFS[rarity]
  return `${def.mobPrefix}${baseName}${skullsFor(rarity)}`
}

// How long a defeated mob's card lingers on screen after the fight ends,
// scaled by rarity. Higher tiers get more time so a legendary kill reads as
// a victory lap; commons are dismissed quickly to keep pacing brisk.
const DEFEAT_LINGER_BY_RARITY: Record<Rarity, number> = {
  common: 1800,
  uncommon: 2400,
  rare: 3400,
  epic: 4800,
  legendary: 6500,
}

export function defeatLingerMs(rarity: Rarity): number {
  return DEFEAT_LINGER_BY_RARITY[rarity]
}

// Rolls a rarity using the per-tier weights. Optionally biases upward (for
// higher-tier mob drops): each step of \`bias\` adds one tier's worth of
// skew toward the top. Bias of 0 = unbiased.
export function rollRarity(bias = 0): Rarity {
  const effective: Array<[Rarity, number]> = RARITIES.map((r, i) => {
    const base = RARITY_DEFS[r].rollWeight
    // A positive bias rotates weight toward higher tiers.
    const shifted = i < bias ? base * 0.3 : base
    return [r, shifted]
  })
  const total = effective.reduce((acc, [, w]) => acc + w, 0)
  let roll = Math.random() * total
  for (const [r, w] of effective) {
    roll -= w
    if (roll <= 0) return r
  }
  return 'common'
}

// For mobs: rarity distribution skews to common more heavily than items, so
// the rare/epic/legendary tiers feel genuinely special rather than routine.
export function rollMobRarity(): Rarity {
  const weights: Array<[Rarity, number]> = [
    ['common', 72],
    ['uncommon', 18],
    ['rare', 7],
    ['epic', 2.5],
    ['legendary', 0.5],
  ]
  const total = weights.reduce((acc, [, w]) => acc + w, 0)
  let roll = Math.random() * total
  for (const [r, w] of weights) {
    roll -= w
    if (roll <= 0) return r
  }
  return 'common'
}

export function rarityColor(rarity: Rarity): string {
  return RARITY_DEFS[rarity].color
}

export function rarityLabel(rarity: Rarity): string {
  return RARITY_DEFS[rarity].label
}

export function rarityStatMult(rarity: Rarity): number {
  return RARITY_DEFS[rarity].statMult
}

export function rarityValueMult(rarity: Rarity): number {
  return RARITY_DEFS[rarity].valueMult
}
