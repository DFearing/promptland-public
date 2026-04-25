import type { Character } from './types'
import { getWorldManifest } from '../worlds'

export interface CharacterDisplay {
  worldName?: string
  speciesName?: string
  className?: string
}

export function describeCharacter(character: Character): CharacterDisplay {
  const world = getWorldManifest(character.worldId)
  return {
    worldName: world?.name,
    speciesName: world?.species.find((s) => s.id === character.speciesId)?.name,
    className: world?.classes.find((c) => c.id === character.classId)?.name,
  }
}
