import type { ConditionDef } from '../../conditions'

export const SCIFI_CONDITIONS: ConditionDef[] = [
  {
    id: 'irradiated',
    name: 'Irradiated',
    description: 'An invisible bite in the marrow. The needle on your dosimeter won’t stop climbing.',
    kind: 'dot',
    polarity: 'debuff',
    defaultDuration: 6,
    params: { damagePerTick: 1 },
  },
  {
    id: 'stunned',
    name: 'Stunned',
    description: 'Neural shock. The universe brightens white and the seconds forget you.',
    kind: 'skip',
    polarity: 'debuff',
    defaultDuration: 2,
    params: { skipChance: 1 },
  },
  {
    id: 'vacuum_sick',
    name: 'Vacuum-sick',
    description: 'The inner ear still thinks you’re spinning. Steps land a heartbeat late.',
    kind: 'skip',
    polarity: 'debuff',
    defaultDuration: 5,
    params: { skipChance: 0.5 },
  },
  {
    id: 'shielded',
    name: 'Shielded',
    description: 'Personal field humming around you. Most edges die at the threshold.',
    kind: 'stat-mod',
    polarity: 'buff',
    defaultDuration: 4,
    params: { defense: 3 },
  },
]
