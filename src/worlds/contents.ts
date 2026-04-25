import { CYBERPUNK_CONTENT } from './cyberpunk'
import { FANTASY_CONTENT } from './fantasy'
import { SCIFI_CONTENT } from './scifi'
import type { WorldContent } from './types'

// World content registry. Add new worlds here; nothing else has to change.
export const WORLD_CONTENTS: Record<string, WorldContent> = {
  fantasy: FANTASY_CONTENT,
  cyberpunk: CYBERPUNK_CONTENT,
  scifi: SCIFI_CONTENT,
}

export function getWorldContent(id: string): WorldContent | undefined {
  return WORLD_CONTENTS[id]
}

export function hasWorldContent(id: string): boolean {
  return id in WORLD_CONTENTS
}
