import { makeDefaults, maxHpFor, type Character, type InventoryItem } from '../../src/character'
import { uuid } from '../../src/util/uuid'
import { getWorldManifest } from '../../src/worlds'

export interface StartingCharacterSpec {
  world: string
  species: string
  class: string
  name?: string
}

// Mirrors CharacterCreation.tsx:56-96 exactly, minus the React bits, so the
// simulator starts from the same state a real player would.
export function makeStartingCharacter(spec: StartingCharacterSpec, seed?: number): Character {
  const world = getWorldManifest(spec.world)
  if (!world) throw new Error(`Unknown worldId: ${spec.world}`)
  const classDef = world.classes.find((c) => c.id === spec.class)
  if (!classDef) throw new Error(`Unknown classId: ${spec.class} in world ${spec.world}`)
  if (!world.species.some((s) => s.id === spec.species)) {
    throw new Error(`Unknown speciesId: ${spec.species} in world ${spec.world}`)
  }

  const stats = { ...classDef.startingStats }
  const startedAt = Date.now()
  const inventory: InventoryItem[] = classDef.startingInventory.map((t) => ({
    id: uuid(),
    ...t,
    level: 1,
    acquired: { at: startedAt, source: 'starting' },
  }))
  const maxHp = maxHpFor(stats)
  const maxMagic = classDef.startingMaxMagic
  const createdAt = Date.now()
  return {
    ...makeDefaults(world.id),
    id: uuid(),
    name: spec.name ?? 'Simulatrix',
    worldId: world.id,
    worldVersion: world.version,
    speciesId: spec.species,
    classId: spec.class,
    createdAt,
    level: 1,
    xp: 0,
    hp: Math.max(1, Math.ceil(maxHp * 0.6)),
    maxHp,
    magic: maxMagic,
    maxMagic,
    stats,
    inventory,
    spells: [...(classDef.startingSpells ?? [])],
    segment: { startedAt: createdAt, startGold: 0 },
    tickSpeed: '50',
    tickSpeedAuto: true,
    rngState: seed ?? (crypto.getRandomValues(new Uint32Array(1))[0]),
  } as Character
}
