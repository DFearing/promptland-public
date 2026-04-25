import type { Area, Room, RoomArchetype, RoomFlavor } from '../../areas'
import { roomKey } from '../../areas'

// Grid + mechanical layout only. No names or descriptions here.
const ROOM_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'safe', satisfies: ['fatigue', 'hunger'] },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 3, y: 0, z: 0, type: 'safe', satisfies: ['fatigue'] },
  { x: 0, y: 1, z: 0, type: 'safe', satisfies: ['fatigue'] },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 3, y: 1, z: 0, type: 'chamber' },
  { x: 0, y: 2, z: 0, type: 'corridor' },
  { x: 1, y: 2, z: 0, type: 'chamber' },
  { x: 2, y: 2, z: 0, type: 'crypt' },
  { x: 3, y: 2, z: 0, type: 'corridor' },
  { x: 0, y: 3, z: 0, type: 'corridor' },
  { x: 1, y: 3, z: 0, type: 'storage' },
  { x: 2, y: 3, z: 0, type: 'storage', satisfies: ['hunger'] },
  { x: 3, y: 3, z: 0, type: 'safe', satisfies: ['fatigue'] },
]

const ROOM_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'Noodle Stand',
    description: 'Plastic stools under a buzzing awning. The broth is hot and the vendor never looks up.',
    satisfyText: {
      fatigue: '{name} slumps on the counter while the vendor wipes the same spot.',
      hunger: '{name} eats a bowl of something slippery and nameless.',
    },
  },
  '1,0,0': {
    name: 'Neon Alley',
    description: 'Rain slicks the pavement under pink and blue signage. A broken vending machine weeps coolant.',
  },
  '2,0,0': {
    name: 'Crowded Market',
    description: 'Stalls press wall to wall. A drone pauses overhead, decides it is not interested, moves on.',
  },
  '3,0,0': {
    name: 'Coffin Hotel',
    description: 'A wall of numbered hatches. Your breath fogs the intake grille.',
    satisfyText: { fatigue: '{name} seals the hatch and lets the white-noise track do its work.' },
  },
  '0,1,0': {
    name: 'Dim Apartment',
    description: 'Somebody abandoned this place mid-coffee. The cup is still faintly warm.',
    satisfyText: { fatigue: '{name} drops onto a stranger’s mattress and is asleep before the light dies.' },
  },
  '1,1,0': {
    name: 'Service Duct',
    description: 'A crawlspace between two buildings. Ductwork hisses overhead.',
  },
  '3,1,0': {
    name: 'Corp Lobby',
    description: 'Black glass floor, brass accents, cameras pretending not to track. Receptionist is a hologram stuck on loop.',
  },
  '0,2,0': {
    name: 'Maintenance Stairs',
    description: 'Concrete echoes and a faint smell of ozone from the transformer below.',
  },
  '1,2,0': {
    name: 'Drone Yard',
    description: 'Dismantled drones on pallets. Half of them twitch, intermittently, when you look away.',
  },
  '2,2,0': {
    name: 'Server Catacomb',
    description: 'Racks rising to a ceiling you can’t see. Every LED is a held breath.',
  },
  '3,2,0': {
    name: 'Fiber Trunk',
    description: 'A bundle of optical cable as thick as your arm runs along the wall, buzzing faintly.',
  },
  '0,3,0': {
    name: 'Dead Conduit',
    description: 'The corridor ends in a bricked-up archway. Someone spray-painted a prayer on it.',
  },
  '1,3,0': {
    name: 'Data Cage',
    description: 'A caged-off room full of legacy hardware. A decade of dust muffles the hum.',
  },
  '2,3,0': {
    name: 'Trash Hopper',
    description: 'Warm rot and crushed packaging. Something edible is always near the top.',
    satisfyText: { hunger: '{name} peels back a half-sealed meal kit and wolfs it before the conscience catches up.' },
  },
  '3,3,0': {
    name: 'Rooftop Greenhouse',
    description: 'Vines crawl over a rust-eaten lattice. The city lights bleed through the cracked panes.',
    satisfyText: { fatigue: '{name} stretches out in the wet leaves and listens to the rain.' },
  },
}

const rooms: Record<string, Room> = Object.fromEntries(
  ROOM_ARCHETYPES.map((a) => {
    const key = roomKey(a.x, a.y, a.z)
    const flavor = ROOM_FLAVORS[key]
    if (!flavor) throw new Error(`Cyberpunk world is missing flavor for room at ${key}`)
    return [key, { ...a, ...flavor }]
  }),
)

export const CYBERPUNK_START_AREA: Area = {
  id: 'night_city_block',
  name: 'Block Seven',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms,
}
