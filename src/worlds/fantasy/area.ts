import type { Area, Room, RoomArchetype, RoomFlavor } from '../../areas'
import { roomKey } from '../../areas'

// Grid + mechanical layout only. No names or descriptions here.
const ROOM_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'safe', satisfies: ['fatigue'] },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 3, y: 0, z: 0, type: 'safe' },
  { x: 0, y: 1, z: 0, type: 'safe', satisfies: ['fatigue'] },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 3, y: 1, z: 0, type: 'chamber' },
  { x: 0, y: 2, z: 0, type: 'corridor' },
  { x: 1, y: 2, z: 0, type: 'chamber', satisfies: ['hunger'] },
  { x: 2, y: 2, z: 0, type: 'crypt' },
  { x: 3, y: 2, z: 0, type: 'corridor' },
  { x: 0, y: 3, z: 0, type: 'corridor' },
  { x: 1, y: 3, z: 0, type: 'storage' },
  { x: 2, y: 3, z: 0, type: 'storage', satisfies: ['hunger'] },
  { x: 3, y: 3, z: 0, type: 'safe', satisfies: ['fatigue'] },
]

// Keyed by roomKey(x, y, z). Clean seam for an LLM flavor provider later.
const ROOM_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'Entrance Hall',
    description: 'A cracked archway admits a cold draft. Dust-blurred footprints fade into the dark.',
    satisfyText: { fatigue: '{name} slumps against the threshold and lets the cold keep them company.' },
  },
  '1,0,0': {
    name: 'Sconce Corridor',
    description: 'Rust-streaked sconces flank the passage. One still sputters, green and wrong.',
  },
  '2,0,0': {
    name: 'Collapsed Vestry',
    description: 'Half the ceiling has come down. A pew juts from the rubble like a broken rib.',
  },
  '3,0,0': {
    name: 'Iron Door',
    description: 'A black iron door stands bolted from the far side. It breathes outward, faintly warm.',
  },
  '0,1,0': {
    name: 'Statue Niche',
    description: 'A weathered statue of some forgotten saint weeps rust down its cheeks.',
    satisfyText: { fatigue: '{name} murmurs to the weeping saint until their breathing slows.' },
  },
  '1,1,0': {
    name: 'Central Crossing',
    description: 'Four passages meet under a faded compass rose carved into the flagstones.',
  },
  '3,1,0': {
    name: "Scribe's Alcove",
    description: 'A ruined lectern, its book long rotted away. Ink stains the stone like bruises.',
  },
  '0,2,0': {
    name: 'Mossy Stair',
    description: 'A short flight of cracked steps, each tread furred with pale moss.',
  },
  '1,2,0': {
    name: 'Water Room',
    description: 'A cistern overflows silently. The water is too still, too clear.',
    satisfyText: { hunger: '{name} kneels by the cistern and drinks long and careful.' },
  },
  '2,2,0': {
    name: 'Beast Pen',
    description: 'Iron rings hang from the walls. Long scratches, deliberate and patient, score the stone.',
  },
  '3,2,0': {
    name: 'Side Passage',
    description: 'A narrow cut through the rock, sloping gently upward.',
  },
  '0,3,0': {
    name: 'Dead End',
    description: 'The passage simply stops. The wall here is different — newer, clumsier.',
  },
  '1,3,0': {
    name: 'Forgotten Cell',
    description: 'Rusted chains, a bone-dry water dish, a name scratched into the stone: EIL.',
  },
  '2,3,0': {
    name: 'Grain Store',
    description: 'Heaps of black, unrecognisable grain. Something has been nesting here.',
    satisfyText: { hunger: '{name} crams fistfuls of the dark grain down — grim, but fed.' },
  },
  '3,3,0': {
    name: 'Sunken Chapel',
    description: 'An ankle-deep pool covers the floor. Candles float on it, unlit.',
    satisfyText: { fatigue: '{name} sits in the cold water and lets the drifting candles watch them.' },
  },
}

const rooms: Record<string, Room> = Object.fromEntries(
  ROOM_ARCHETYPES.map((a) => {
    const key = roomKey(a.x, a.y, a.z)
    const flavor = ROOM_FLAVORS[key]
    if (!flavor) throw new Error(`Fantasy world is missing flavor for room at ${key}`)
    return [key, { ...a, ...flavor }]
  }),
)

export const FANTASY_START_AREA: Area = {
  id: 'antechamber',
  name: 'The Forgotten Antechamber',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms,
}
