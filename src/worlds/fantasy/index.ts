import type { WorldContent } from '../types'
import { FANTASY_START_AREA } from './area'
import { FANTASY_CONDITIONS } from './conditions'
import { FANTASY_ENCOUNTERS } from './encounters'
import { FANTASY_ITEMS } from './items'
import { FANTASY_MOBS } from './mobs'

export const FANTASY_CONTENT: WorldContent = {
  mobs: FANTASY_MOBS,
  items: FANTASY_ITEMS,
  encounters: FANTASY_ENCOUNTERS,
  startingArea: FANTASY_START_AREA,
  conditions: FANTASY_CONDITIONS,
}
