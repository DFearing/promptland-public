import type { Area, Room, RoomArchetype, RoomFlavor } from '../../areas'
import { roomKey } from '../../areas'

// Grid + mechanical layout only. No names or descriptions here.
//
// Millhaven — a small village at the edge of the Thornwood, z=0.
// Layout (x right, y down):
//
//   x:  0         1         2         3
//  y=0: inn       corridor  shop      corridor
//  y=1: shrine    water     corridor  corridor
//  y=2: corridor  chamber   entrance  (gap)
//  y=3: (gap)     portal    (gap)     (gap)
//
// The portal at (1,3) leads to the Barrow of the Fallen King.
// The entrance at (2,2) marks the barrow mouth (flavor only — the portal is the real link).
const MILLHAVEN_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'inn', satisfies: ['fatigue', 'hunger'] },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'shop', satisfies: ['weight'] },
  { x: 3, y: 0, z: 0, type: 'corridor' },
  { x: 0, y: 1, z: 0, type: 'shrine', satisfies: ['fatigue'] },
  { x: 1, y: 1, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 2, y: 1, z: 0, type: 'corridor' },
  { x: 3, y: 1, z: 0, type: 'corridor' },
  { x: 0, y: 2, z: 0, type: 'corridor' },
  { x: 1, y: 2, z: 0, type: 'chamber' },
  { x: 2, y: 2, z: 0, type: 'entrance' },
  {
    x: 1, y: 3, z: 0, type: 'portal',
    destination: { areaId: 'barrow-of-fallen-king', x: 0, y: 0, z: 0 },
  },
]

// Keyed by roomKey(x, y, z). Clean seam for an LLM flavor provider later.
const MILLHAVEN_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'The Crow & Cup',
    description:
      'Low beams, smoke-stained rafters, a fire that gives more light than warmth. Three tables, one tap, a keep who pretends not to listen.',
    satisfyText: {
      fatigue: '{name} claims a corner bench and sleeps badly until morning.',
      hunger: '{name} orders whatever is warm and doesn\'t ask what it is.',
    },
  },
  '1,0,0': {
    name: 'Market Square',
    description:
      'A muddy rectangle with a handful of tilted stalls. Market day was two days ago; the straw still smells of it.',
  },
  '2,0,0': {
    name: "Harwick's Sundries",
    description:
      'A narrow shop wedged between a tannery and a collapsed wall. Harwick keeps odd hours, a locked cabinet under the counter, and a very long memory.',
    satisfyText: {
      weight: '{name} dumps a load of goods on the counter. Harwick counts, weighs, and names a price without looking up.',
    },
  },
  '3,0,0': {
    name: 'Old North Road',
    description:
      'A cart-rutted track that points at the hills and loses confidence. The ruts are this deep from years of use; no one comes back the same way.',
  },
  '0,1,0': {
    name: 'Shrine of Saint Maren',
    description:
      'A painted niche in an old oak — the face worn to a smear, the hands still folded. Fresh flowers at the root: locals still notice her.',
    satisfyText: {
      fatigue:
        '{name} sits at the root of the oak and breathes slowly until the weight lifts a little.',
    },
  },
  '1,1,0': {
    name: 'The Village Well',
    description:
      'A broad stone well at the junction of three lanes. The rope is new; the stone is older than the village. The water is cold even in summer.',
    satisfyText: {
      hunger: '{name} drinks long from the bucket, hands cupped against the cold.',
    },
  },
  '2,1,0': {
    name: "Cooper's Lane",
    description:
      'A narrow gap between the cooperage wall and a rotting fence. The smell of fresh shavings and old vinegar follows you through.',
  },
  '3,1,0': {
    name: 'Thornwood Edge',
    description:
      'Where the road meets the tree-line, the ground goes soft and the oldest trees have closed back in on the path. Something in there moves without wind.',
  },
  '0,2,0': {
    name: 'Mill Track',
    description:
      'A rutted path along the millstream. The wheel hasn\'t turned in years; moss has taken the paddles. The water moves faster than the silence.',
  },
  '1,2,0': {
    name: 'Ruined Watermill',
    description:
      'Three walls still stand. The fourth is the stream now. Something nests in the rafters and drops silence on visitors.',
  },
  '2,2,0': {
    name: 'Barrow Gate',
    description:
      'An earthen mound split by a stone arch older than the village. Cold air moves outward across the threshold — slow and deliberate, like breathing.',
  },
  '1,3,0': {
    name: 'Standing Stones',
    description:
      'Nine waist-high stones in a ring at the edge of a clearing. The air between them shimmers with cold and purpose. Villagers do not come here after dark, and will not say why — but on certain nights the stones are warm to the touch, and anything that passes through does not come back the same way.',
  },
}

function buildArea(archetypes: RoomArchetype[], flavors: Record<string, RoomFlavor>, areaId: string): Record<string, Room> {
  return Object.fromEntries(
    archetypes.map((a) => {
      const key = roomKey(a.x, a.y, a.z)
      const flavor = flavors[key]
      if (!flavor) throw new Error(`${areaId} is missing flavor for room at ${key}`)
      return [key, { ...a, ...flavor }]
    }),
  )
}

export const FANTASY_START_AREA: Area = {
  id: 'millhaven',
  name: 'Millhaven',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: buildArea(MILLHAVEN_ARCHETYPES, MILLHAVEN_FLAVORS, 'millhaven'),
}

// ---------------------------------------------------------------------------
// Barrow of the Fallen King — a dungeon connected to Millhaven via portal.
//
// Layout (x right, y down):
//
//   x:  0              1               2
//  y=0: portal         corridor        crypt
//  y=1: crypt          chamber         storage
//  y=2: crypt          crypt           (gap)
//
// The portal at (0,0) returns to the Standing Stones in Millhaven.
// ---------------------------------------------------------------------------

const BARROW_ARCHETYPES: RoomArchetype[] = [
  {
    x: 0, y: 0, z: 0, type: 'portal',
    destination: { areaId: 'millhaven', x: 1, y: 3, z: 0 },
  },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'crypt' },
  { x: 0, y: 1, z: 0, type: 'crypt' },
  { x: 1, y: 1, z: 0, type: 'chamber' },
  { x: 2, y: 1, z: 0, type: 'storage' },
  { x: 0, y: 2, z: 0, type: 'crypt' },
  { x: 1, y: 2, z: 0, type: 'crypt' },
]

const BARROW_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'The Stone Archway',
    description:
      'A low arch of fitted stone framed by two weathered pillars. Beyond it, the Standing Stones of Millhaven are visible through a shimmer of cold air. The passage goes two ways.',
  },
  '1,0,0': {
    name: 'The Descending Hall',
    description:
      'A wide corridor with a vaulted ceiling brushing your head. Carved shields line the walls — the emblems worn to abstraction by damp and time.',
  },
  '2,0,0': {
    name: 'The Arming Chamber',
    description:
      'A long room lined with stone niches, each holding the corroded remnants of arms and armor. The owners of these effects have not left.',
  },
  '0,1,0': {
    name: "The Watcher's Cell",
    description:
      "A small square room with a stone chair facing the door. Whatever sat here did not rest — it waited. The posture of the bones suggests it is still waiting.",
  },
  '1,1,0': {
    name: 'The Hall of the Fallen King',
    description:
      'A high-vaulted chamber with a raised dais at the far end. An empty throne, too large for a man, looks out over nothing in particular. The air here is noticeably colder than the passage.',
  },
  '2,1,0': {
    name: 'The Reliquary',
    description:
      'Stone shelves, most collapsed, hold fragments of ceramic and tarnished metal. A few items remain intact — which means they have not yet been claimed.',
  },
  '0,2,0': {
    name: 'The Ossuary',
    description:
      'Walls of stacked bone stretching floor to ceiling, the architecture of the dead. The bones are very old. Some of them are moving.',
  },
  '1,2,0': {
    name: 'The Drowning Room',
    description:
      'The floor is damp and slopes toward a drain in the center that stopped draining decades ago. The low ceiling muffles sound entirely. Your footsteps disappear.',
  },
}

export const FANTASY_BARROW_AREA: Area = {
  id: 'barrow-of-fallen-king',
  name: 'Barrow of the Fallen King',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: buildArea(BARROW_ARCHETYPES, BARROW_FLAVORS, 'barrow-of-fallen-king'),
}
