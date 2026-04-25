export type LootEntry =
  | { kind: 'gold'; chance: number; min: number; max: number }
  | { kind: 'item'; itemId: string; chance: number; min?: number; max?: number }

export interface ApplyOnHit {
  /** Condition id from the world's conditions library. */
  conditionId: string
  /** 0..1 probability of applying on a successful hit. */
  chance: number
}

// Mechanics of a mob. World-scoped but world-agnostic in shape. Hardcoded.
export interface MobArchetype {
  id: string
  maxHp: number
  attack: number
  defense: number
  xpReward: number
  loot?: LootEntry[]
  applyOnHit?: ApplyOnHit
}

// Flavor of a mob. Today hardcoded per world; tomorrow LLM-generated and cached.
export interface MobFlavor {
  name: string
  description: string
}

// A ready-to-use mob template (archetype + flavor merged).
export type MobTemplate = MobArchetype & MobFlavor

// Running instance in a fight.
export type Mob = MobTemplate & { hp: number }

export function spawn(template: MobTemplate): Mob {
  return { ...template, hp: template.maxHp }
}
