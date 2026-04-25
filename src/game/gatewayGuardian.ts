import { spawn, type Mob, type MobTemplate } from '../mobs'
import type { Rarity } from '../items/rarity'
import type { Rng } from '../rng'

/**
 * Gateway guardians are system-spawned mini-bosses that mask LLM area
 * generation latency. They are NOT part of any world's encounter pool —
 * they only appear when the player enters an exit tile where generation
 * is about to run. High HP and self-healing so the fight lasts long
 * enough for the LLM to finish; modest rewards so defeating one doesn't
 * unbalance progression.
 *
 * The `isGatewayGuardian` predicate identifies these mobs in downstream
 * handlers (resolveMobDefeat, resolveCharacterDeath) so the area
 * transition flow can branch on fight outcome.
 */

/** Sentinel id prefix — all gateway guardian mob ids start with this so
 *  `isGatewayGuardian` can do a single string check. */
const GUARDIAN_ID_PREFIX = 'gateway_guardian'

const GUARDIAN_TEMPLATES: MobTemplate[] = [
  {
    id: 'gateway_guardian_sentinel',
    name: 'Path Sentinel',
    description: 'A towering shape of condensed twilight, standing where the world runs out. It does not move aside.',
    maxHp: 18,
    attack: 3,
    defense: 2,
    xpReward: 40,
    healCharges: 2,
    healAmount: 6,
    attackFamily: 'crush',
    loot: [
      { kind: 'gold', chance: 0.8, min: 3, max: 8 },
    ],
  },
  {
    id: 'gateway_guardian_warden',
    name: 'Threshold Warden',
    description: 'A figure of pale stone and older purpose. The ground hums where it stands.',
    maxHp: 22,
    attack: 2,
    defense: 3,
    xpReward: 45,
    healCharges: 3,
    healAmount: 5,
    attackFamily: 'crush',
    loot: [
      { kind: 'gold', chance: 0.8, min: 4, max: 10 },
    ],
  },
]

/** Pick a random guardian template and spawn it at the given rarity.
 *  Takes the character's `Rng` so the guardian-template choice replays
 *  identically from a saved seed, same as every other game-logic roll. */
export function spawnGatewayGuardian(rng: Rng, rarity: Rarity = 'uncommon'): Mob {
  const template = rng.pick(GUARDIAN_TEMPLATES)
  return spawn(template, rarity)
}

/** True when `mob` is a gateway guardian (system-spawned latency mask),
 *  not a regular world encounter. */
export function isGatewayGuardian(mob: Mob): boolean {
  return mob.id.startsWith(GUARDIAN_ID_PREFIX)
}
