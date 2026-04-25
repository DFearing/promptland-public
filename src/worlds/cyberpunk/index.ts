import type { WorldContent } from '../types'
import { CYBERPUNK_START_AREA } from './area'
import { CYBERPUNK_CONDITIONS } from './conditions'
import { CYBERPUNK_CONTEXT } from './context'
import { CYBERPUNK_ENCOUNTERS } from './encounters'
import { CYBERPUNK_ITEMS } from './items'
import { CYBERPUNK_MOBS } from './mobs'

export const CYBERPUNK_CONTENT: WorldContent = {
  mobs: CYBERPUNK_MOBS,
  items: CYBERPUNK_ITEMS,
  encounters: CYBERPUNK_ENCOUNTERS,
  startingArea: CYBERPUNK_START_AREA,
  conditions: CYBERPUNK_CONDITIONS,
  context: CYBERPUNK_CONTEXT,
  shopInventory: [
    { itemId: 'stim_patch', price: 16, maxStock: 4 },
    { itemId: 'neural_cap', price: 20, maxStock: 3 },
    { itemId: 'nutrichip_implant', price: 130, maxStock: 1 },
    { itemId: 'neural_relaxant_dose', price: 150, maxStock: 1 },
  ],
}
