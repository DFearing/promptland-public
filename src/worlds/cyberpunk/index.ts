import type { WorldContent } from '../types'
import { CYBERPUNK_START_AREA } from './area'
import { CYBERPUNK_CONDITIONS } from './conditions'
import { CYBERPUNK_ENCOUNTERS } from './encounters'
import { CYBERPUNK_ITEMS } from './items'
import { CYBERPUNK_MOBS } from './mobs'

export const CYBERPUNK_CONTENT: WorldContent = {
  mobs: CYBERPUNK_MOBS,
  items: CYBERPUNK_ITEMS,
  encounters: CYBERPUNK_ENCOUNTERS,
  startingArea: CYBERPUNK_START_AREA,
  conditions: CYBERPUNK_CONDITIONS,
}
