import type { WorldContent } from '../types'
import {
  FANTASY_BARROW_APPROACH,
  FANTASY_BARROW_AREA,
  FANTASY_BARROWDOWN_CAVE,
  FANTASY_MILL_STREAM,
  FANTASY_START_AREA,
  FANTASY_THORNWOOD,
} from './area'
import { FANTASY_CONDITIONS } from './conditions'
import { FANTASY_CONTEXT } from './context'
import { FANTASY_ENCOUNTERS } from './encounters'
import { FANTASY_ITEMS } from './items'
import { FANTASY_MOBS } from './mobs'

export const FANTASY_CONTENT: WorldContent = {
  mobs: FANTASY_MOBS,
  items: FANTASY_ITEMS,
  encounters: FANTASY_ENCOUNTERS,
  startingArea: FANTASY_START_AREA,
  // Starter chain, west-to-east:
  //   Millhaven (hub, level 1)
  //     └ West → Barrow Approach (level 2) → Barrow of the Fallen King (level 4)
  //     └ East → Mill Stream (level 2) → Thornwood Clearing (level 3)
  //              → Barrowdown Cave (level 4, mini-boss on floor 2)
  areas: [
    FANTASY_START_AREA,
    FANTASY_BARROW_APPROACH,
    FANTASY_BARROW_AREA,
    FANTASY_MILL_STREAM,
    FANTASY_THORNWOOD,
    FANTASY_BARROWDOWN_CAVE,
  ],
  conditions: FANTASY_CONDITIONS,
  context: FANTASY_CONTEXT,
  shopInventory: [
    { itemId: 'healing_draught', price: 15, maxStock: 5 },
    { itemId: 'greater_healing_draught', price: 30, maxStock: 3 },
    { itemId: 'mana_tincture', price: 18, maxStock: 4 },
    { itemId: 'mana_crystal', price: 25, maxStock: 3 },
    { itemId: 'sated_wanderer_pendant', price: 120, maxStock: 1 },
    { itemId: 'stone_of_deep_rest', price: 140, maxStock: 1 },
  ],
}
