import type { Area, Room, RoomArchetype, RoomFlavor } from '../../areas'
import { roomKey } from '../../areas'

const ROOM_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'safe', satisfies: ['fatigue'] },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 3, y: 0, z: 0, type: 'portal' },
  { x: 0, y: 1, z: 0, type: 'inn', satisfies: ['fatigue', 'hunger'] },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 3, y: 1, z: 0, type: 'shrine' },
  { x: 0, y: 2, z: 0, type: 'corridor' },
  { x: 1, y: 2, z: 0, type: 'storage' },
  { x: 2, y: 2, z: 0, type: 'entrance' },
  { x: 3, y: 2, z: 0, type: 'corridor' },
  { x: 0, y: 3, z: 0, type: 'corridor' },
  { x: 1, y: 3, z: 0, type: 'storage' },
  { x: 2, y: 3, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 3, y: 3, z: 0, type: 'shrine', satisfies: ['fatigue'] },
]

const ROOM_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'Crew Bunk',
    description: 'Four racks in two pairs, thin foam mattresses, lockers still half-stenciled with names.',
    satisfyText: { fatigue: '{name} climbs into an empty rack and lets the hull hum rock them under.' },
  },
  '1,0,0': {
    name: 'Primary Corridor',
    description: 'Safety stripes along the deck, a flicker overhead, and somewhere a loose panel rattles.',
  },
  '2,0,0': {
    name: 'Rec Lounge',
    description: 'A viewport to nothing useful. A card table still has a half-finished hand dealt across it.',
  },
  '3,0,0': {
    name: 'Airlock Prep',
    description: 'Helmet lockers and a decontamination arch. The arch’s lights cycle slowly.',
  },
  '0,1,0': {
    name: 'Mess Hall',
    description: 'Auto-galley still warm, trays stacked where they fell. The coffee line is shuttered but not locked.',
    satisfyText: {
      fatigue: '{name} folds onto a bench with their head on their arms and dozes.',
      hunger: '{name} coaxes the galley into a stiff protein ration and eats it standing.',
    },
  },
  '1,1,0': {
    name: 'Cross Junction',
    description: 'Four corridors meet under a damaged signage board. Only the arrow for MED is still lit.',
  },
  '3,1,0': {
    name: 'Med Bay',
    description: 'An empty surgical pod, a tray of tools tipped onto the deck. Disinfectant hangs in the air.',
  },
  '0,2,0': {
    name: 'Service Ladder',
    description: 'A grille ladder drops through the deck into ducted gloom. Warm air rises in steady pulses.',
  },
  '1,2,0': {
    name: 'Cargo Hold',
    description: 'A half-emptied bay, crates strapped haphazardly against the bulkhead. Tie-downs creak.',
  },
  '2,2,0': {
    name: 'Reactor Core',
    description: 'Blue light, a low pressure on the teeth. The dosimeter you don’t have is screaming.',
  },
  '3,2,0': {
    name: 'Drive Conduit',
    description: 'A narrow passage between two walls of sealed piping. Too warm to linger.',
  },
  '0,3,0': {
    name: 'Sealed Bulkhead',
    description: 'The door past this point is welded, not locked. Someone wanted it to stay that way.',
  },
  '1,3,0': {
    name: 'Arms Locker',
    description: 'An empty wall rack. The racks have rust along the bolts. Something was taken, or handed out.',
  },
  '2,3,0': {
    name: 'Gardens',
    description: 'Hydroponic racks gone wild, fronds reaching between the lights. Something here is still edible.',
    satisfyText: { hunger: '{name} strips a handful of pale leaves and makes themselves eat.' },
  },
  '3,3,0': {
    name: 'Obs Deck',
    description: 'Floor-to-ceiling ports on real stars. The only silence on the ship that feels chosen.',
    satisfyText: { fatigue: '{name} lets the star-field drift across their eyes until they close.' },
  },
}

const rooms: Record<string, Room> = Object.fromEntries(
  ROOM_ARCHETYPES.map((a) => {
    const key = roomKey(a.x, a.y, a.z)
    const flavor = ROOM_FLAVORS[key]
    if (!flavor) throw new Error(`Sci-fi world is missing flavor for room at ${key}`)
    return [key, { ...a, ...flavor }]
  }),
)

export const SCIFI_START_AREA: Area = {
  id: 'derelict_frigate',
  name: 'Derelict Frigate Lerwick',
  level: 1,
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms,
}
