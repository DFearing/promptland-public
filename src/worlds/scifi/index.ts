import type { WorldContent } from '../types'
import { SCIFI_START_AREA } from './area'
import { SCIFI_CONDITIONS } from './conditions'
import { SCIFI_CONTEXT } from './context'
import { SCIFI_ENCOUNTERS } from './encounters'
import { SCIFI_ITEMS } from './items'
import { SCIFI_MOBS } from './mobs'

export const SCIFI_CONTENT: WorldContent = {
  mobs: SCIFI_MOBS,
  items: SCIFI_ITEMS,
  encounters: SCIFI_ENCOUNTERS,
  startingArea: SCIFI_START_AREA,
  conditions: SCIFI_CONDITIONS,
  context: SCIFI_CONTEXT,
  shopInventory: [
    { itemId: 'medfoam', price: 16, maxStock: 4 },
    { itemId: 'psi_lozenge', price: 20, maxStock: 3 },
    { itemId: 'ration_synth_module', price: 130, maxStock: 1 },
    { itemId: 'circadian_regulator', price: 150, maxStock: 1 },
  ],
}
