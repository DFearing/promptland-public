import { visitedKey } from '../areas'
import { ZERO_DRIVES } from '../game/drives'
import { getWorldContent } from '../worlds'
import type { Character } from './types'

// Fallback world if a loaded character predates world-scoped content or has an
// unknown worldId. Fantasy is the only world with content today.
const FALLBACK_WORLD_ID = 'fantasy'

function resolveStartingArea(worldId?: string) {
  const id = worldId && getWorldContent(worldId) ? worldId : FALLBACK_WORLD_ID
  const content = getWorldContent(id)
  if (!content) {
    throw new Error(`No world content registered for '${id}'. Is the fantasy content missing?`)
  }
  return content.startingArea
}

// Additive defaults — every field that Character gained *after* the original
// creation flow. One place to grow when the schema gains another.
export function makeDefaults(worldId?: string): Pick<
  Character,
  | 'gold'
  | 'position'
  | 'visitedRooms'
  | 'deaths'
  | 'levelUps'
  | 'drives'
  | 'lastSafePosition'
  | 'equipped'
  | 'conditions'
> {
  const area = resolveStartingArea(worldId)
  const start = { areaId: area.id, x: area.startX, y: area.startY, z: area.startZ }
  return {
    gold: 0,
    position: start,
    visitedRooms: [visitedKey(area.id, area.startX, area.startY, area.startZ)],
    deaths: [],
    levelUps: [],
    drives: { ...ZERO_DRIVES },
    lastSafePosition: start,
    equipped: {},
    conditions: [],
  }
}

export function migrateCharacter(raw: unknown): Character {
  const partial = (raw ?? {}) as Partial<Character>
  return { ...makeDefaults(partial.worldId), ...partial } as Character
}
