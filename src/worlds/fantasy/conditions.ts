import type { ConditionDef } from '../../conditions'

export const FANTASY_CONDITIONS: ConditionDef[] = [
  {
    id: 'poisoned',
    name: 'Poisoned',
    description: 'A creeping sickness under the skin. Burns with each breath.',
    kind: 'dot',
    polarity: 'debuff',
    defaultDuration: 4,
    params: { damagePerTick: 2 },
  },
  {
    id: 'slept',
    name: 'Slept',
    description: 'A weight too heavy to shrug off. The world goes soft at the edges.',
    kind: 'skip',
    polarity: 'debuff',
    defaultDuration: 3,
    params: { skipChance: 1 },
  },
  {
    id: 'slowed',
    name: 'Slowed',
    description: 'Limbs heavy, thoughts lagging. Half the steps take twice as long.',
    kind: 'skip',
    polarity: 'debuff',
    defaultDuration: 5,
    params: { skipChance: 0.5 },
  },
  {
    id: 'blessed',
    name: 'Blessed',
    description: 'A warm hand, somewhere, on your shoulder. Strikes land true.',
    kind: 'stat-mod',
    polarity: 'buff',
    defaultDuration: 4,
    params: { attack: 2 },
  },
]
