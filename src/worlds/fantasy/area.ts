import type { Area, Room, RoomArchetype, RoomFlavor } from '../../areas'
import { roomKey } from '../../areas'

// Hand-authored fantasy areas. The shape-first LLM pipeline owns
// generated areas; these are the fixed backbone the player always
// encounters in the same place: a starting town (no portals — you have
// to leave first), a transition area to the west, the Barrow dungeon
// beyond it, and an east chain of river → forest → mini-boss cave.

function buildArea(
  archetypes: RoomArchetype[],
  flavors: Record<string, RoomFlavor>,
  areaId: string,
): Record<string, Room> {
  return Object.fromEntries(
    archetypes.map((a) => {
      const key = roomKey(a.x, a.y, a.z)
      const flavor = flavors[key]
      if (!flavor) throw new Error(`${areaId} is missing flavor for room at ${key}`)
      return [key, { ...a, ...flavor }]
    }),
  )
}

// ---------------------------------------------------------------------------
// Millhaven — starting town. 5×3 footprint with two walk-off-edge exits on
// opposite sides (no portals in the first area; the first portal is one
// room deep into Barrow Approach). Plaza at the centre, inn/shrine/shop
// on the cardinals, well on the south edge, two "market edge" chambers
// at the top corners.
//
//   x:  0          1          2          3          4
//  y=0: chamber    corridor   inn        corridor   chamber
//  y=1: exit(W)    shrine     safe       shop       exit(E)
//  y=2: (gap)      corridor   water      corridor   (gap)
// ---------------------------------------------------------------------------

const MILLHAVEN_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'chamber' },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'inn', satisfies: ['fatigue', 'hunger'] },
  { x: 3, y: 0, z: 0, type: 'corridor' },
  { x: 4, y: 0, z: 0, type: 'chamber' },
  {
    x: 0, y: 1, z: 0, type: 'exit',
    destination: { areaId: 'barrow-approach', x: 2, y: 1, z: 0 },
  },
  { x: 1, y: 1, z: 0, type: 'shrine', satisfies: ['fatigue'] },
  { x: 2, y: 1, z: 0, type: 'safe' },
  { x: 3, y: 1, z: 0, type: 'shop', satisfies: ['weight'] },
  {
    x: 4, y: 1, z: 0, type: 'exit',
    destination: { areaId: 'mill-stream', x: 0, y: 1, z: 0 },
  },
  { x: 1, y: 2, z: 0, type: 'corridor' },
  { x: 2, y: 2, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 3, y: 2, z: 0, type: 'corridor' },
  { x: 4, y: 2, z: 0, type: 'corridor' },
]

const MILLHAVEN_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: "Weaver's Hall",
    description:
      'A drafty hall used as a makeshift market on trade days. Bolts of wool hang from the rafters; the floor is stained dark from a century of wet boots.',
  },
  '1,0,0': {
    name: 'Market Lane',
    description:
      'A narrow cobbled lane crowded with tilted stalls and the smell of bread. Locals side-step each other without looking.',
  },
  '2,0,0': {
    name: 'The Crow & Cup',
    description:
      'Low beams, smoke-stained rafters, a fire that gives more light than warmth. Three tables, one tap, a keep who pretends not to listen.',
    satisfyText: {
      fatigue: '{name} claims a corner bench and sleeps badly until morning.',
      hunger: "{name} orders whatever is warm and doesn't ask what it is.",
    },
  },
  '3,0,0': {
    name: "Potter's Row",
    description:
      'A line of shuttered workshops. Clay dust never fully settles; you can taste it on the back of your tongue.',
  },
  '4,0,0': {
    name: 'The Old Smithy',
    description:
      "A smithy with a cold forge. The anvil is still here because it's too heavy to steal. Iron filings crunch underfoot.",
  },
  '0,1,0': {
    name: 'West Gate',
    description:
      'Two timbers leaning on each other more than standing. The road west climbs into broken country and, eventually, older places than the town.',
  },
  '1,1,0': {
    name: 'Shrine of Saint Maren',
    description:
      'A painted niche in an old oak — the face worn to a smear, the hands still folded. Fresh flowers at the root: locals still notice her.',
    satisfyText: {
      fatigue:
        '{name} sits at the root of the oak and breathes slowly until the weight lifts a little.',
    },
  },
  '2,1,0': {
    name: 'Market Square',
    description:
      'The heart of Millhaven — a flagstoned square where the lanes converge. A cart rests tipped against the well, and a dog sleeps in the sun.',
  },
  '3,1,0': {
    name: "Harwick's Sundries",
    description:
      'A narrow shop wedged between a tannery and a collapsed wall. Harwick keeps odd hours, a locked cabinet under the counter, and a very long memory.',
    satisfyText: {
      weight:
        '{name} dumps a load of goods on the counter. Harwick counts, weighs, and names a price without looking up.',
    },
  },
  '4,1,0': {
    name: 'East Gate',
    description:
      'Little more than a gap in a low wall where the cart track strikes off toward the Mill Stream. The stones on either side are older than the wall.',
  },
  '1,2,0': {
    name: 'Mill Track',
    description:
      "A rutted path along the millstream. The wheel hasn't turned in years; moss has taken the paddles.",
  },
  '2,2,0': {
    name: 'The Village Well',
    description:
      'A broad stone well at the junction of three lanes. The rope is new; the stone is older than the village. The water is cold even in summer.',
    satisfyText: {
      hunger: '{name} drinks long from the bucket, hands cupped against the cold.',
    },
  },
  '3,2,0': {
    name: 'Old Mill Road',
    description:
      'A cart track between the mill and the southern fields, overgrown at the edges. The ruts are filled with standing water that never quite dries.',
  },
  '4,2,0': {
    name: 'Overgrown Fence',
    description:
      'A sagging fence of split oak runs between the smithy yard and the southern pasture. Bramble has claimed half of it; the rest leans at angles that suggest giving up.',
  },
}

export const FANTASY_START_AREA: Area = {
  id: 'millhaven',
  name: 'Millhaven',
  kind: 'settlement',
  level: 1,
  startX: 2,
  startY: 1,
  startZ: 0,
  rooms: buildArea(MILLHAVEN_ARCHETYPES, MILLHAVEN_FLAVORS, 'millhaven'),
}

// ---------------------------------------------------------------------------
// Barrow Approach — west of Millhaven. A short transition area whose
// north-west corner holds the Barrow Gate portal. This is the FIRST
// portal the player encounters — Millhaven itself has none.
//
//   x:  0          1          2
//  y=0: portal     corridor   chamber
//  y=1: (gap)      chamber    exit(E)
// ---------------------------------------------------------------------------

const BARROW_APPROACH_ARCHETYPES: RoomArchetype[] = [
  {
    x: 0, y: 0, z: 0, type: 'portal',
    destination: { areaId: 'barrow-of-fallen-king', x: 0, y: 0, z: 0 },
  },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 1, y: 1, z: 0, type: 'chamber' },
  {
    x: 2, y: 1, z: 0, type: 'exit',
    destination: { areaId: 'millhaven', x: 0, y: 1, z: 0 },
  },
]

const BARROW_APPROACH_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'The Barrow Gate',
    description:
      'An earthen mound split by a stone arch older than the village. Cold air moves outward across the threshold. The passage descends.',
  },
  '1,0,0': {
    name: 'Overgrown Path',
    description:
      'A dirt path half-swallowed by bramble. Whoever keeps it clear does the bare minimum, and not recently.',
  },
  '2,0,0': {
    name: 'Standing Stones',
    description:
      'Nine waist-high stones in a ring at the edge of a clearing. The grass between them is shorter than it should be, as if something grazes here that no one sees.',
  },
  '1,1,0': {
    name: 'Weathered Cairn',
    description:
      "A shoulder-high cairn on a knoll, its topmost stones fallen away. Offerings — bread, coins, a child's braid — rest in the hollow.",
  },
  '2,1,0': {
    name: 'The Road Back',
    description:
      'The track bends toward Millhaven, visible through the trees. A weatherworn signpost leans west, too faded to read.',
  },
}

export const FANTASY_BARROW_APPROACH: Area = {
  id: 'barrow-approach',
  name: 'Barrow Approach',
  kind: 'wilderness',
  level: 2,
  startX: 2,
  startY: 1,
  startZ: 0,
  rooms: buildArea(BARROW_APPROACH_ARCHETYPES, BARROW_APPROACH_FLAVORS, 'barrow-approach'),
}

// ---------------------------------------------------------------------------
// Barrow of the Fallen King — dungeon reached via the Barrow Gate portal
// in Barrow Approach. Single staircase at (1,1): the Sunken Vault sits
// directly under the Hall of the Fallen King. The rest of z=1 fans SE
// through coords absent from z=0 so the map shows one ladder icon.
//
//   z=0 (x right, y down):
//   x:  0              1               2
//  y=0: portal         corridor        crypt
//  y=1: crypt          chamber         storage
//  y=2: crypt          crypt           (gap)
//
//   z=1:
//   x:  1              2               3
//  y=1: chamber
//  y=2: (gap)          storage         storage
//  y=3: (gap)          crypt           crypt
// ---------------------------------------------------------------------------

const BARROW_ARCHETYPES: RoomArchetype[] = [
  {
    x: 0, y: 0, z: 0, type: 'portal',
    destination: { areaId: 'barrow-approach', x: 0, y: 0, z: 0 },
  },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'crypt' },
  { x: 0, y: 1, z: 0, type: 'crypt' },
  { x: 1, y: 1, z: 0, type: 'chamber' },
  { x: 2, y: 1, z: 0, type: 'storage' },
  { x: 0, y: 2, z: 0, type: 'crypt' },
  { x: 1, y: 2, z: 0, type: 'crypt' },
  { x: 1, y: 1, z: 1, type: 'chamber' },
  { x: 2, y: 2, z: 1, type: 'storage' },
  { x: 3, y: 2, z: 1, type: 'storage' },
  { x: 2, y: 3, z: 1, type: 'crypt' },
  { x: 3, y: 3, z: 1, type: 'crypt' },
]

const BARROW_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'The Stone Archway',
    description:
      'A low arch of fitted stone framed by two weathered pillars. Beyond it, the earthen slope climbs back toward the Barrow Gate. The passage goes two ways.',
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
  '1,1,1': {
    name: 'The Sunken Vault',
    description:
      'The ceiling has partially collapsed, exposing raw earth and the underside of the throne room above. Water pools in the cracks between flagstones. The air tastes of iron.',
  },
  '2,2,1': {
    name: 'The Deep Reliquary',
    description:
      'A vault below the vault. The shelves here are intact, and the items on them are covered in a fine dust that reforms overnight. Someone is still cataloguing.',
  },
  '3,2,1': {
    name: 'The Bone Library',
    description:
      'Stone shelves hold scrolls that crumble at a glance and tablets scored with script too small to read by torchlight. The dust here has not settled — it hangs.',
  },
  '2,3,1': {
    name: 'The Sealed Antechamber',
    description:
      'A narrow room with a door that was bricked shut from the outside. The bricks have been removed — not recently, but not by the builders.',
  },
  '3,3,1': {
    name: 'The Final Watch',
    description:
      'A low crypt with six stone sarcophagi arranged in a circle, lids removed and leaning against the walls. The occupants are absent. Their weapons are not.',
  },
}

export const FANTASY_BARROW_AREA: Area = {
  id: 'barrow-of-fallen-king',
  kind: 'dungeon',
  name: 'Barrow of the Fallen King',
  level: 7,
  rarity: 'rare',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: buildArea(BARROW_ARCHETYPES, BARROW_FLAVORS, 'barrow-of-fallen-king'),
}

// ---------------------------------------------------------------------------
// Mill Stream — east of Millhaven. Linear river path; the top row is all
// water so "the water is on the north side" as the player walks east.
// Two `exit` edges, one back to Millhaven, one onward to the Thornwood.
//
//   x:  0          1          2          3          4
//  y=0: water      water      water      water      water
//  y=1: exit(W)    corridor   water      corridor   exit(E)
// ---------------------------------------------------------------------------

const MILL_STREAM_ARCHETYPES: RoomArchetype[] = [
  { x: 0, y: 0, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 1, y: 0, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 2, y: 0, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 3, y: 0, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 4, y: 0, z: 0, type: 'water', satisfies: ['hunger'] },
  {
    x: 0, y: 1, z: 0, type: 'exit',
    destination: { areaId: 'millhaven', x: 4, y: 1, z: 0 },
  },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 2, y: 1, z: 0, type: 'water', satisfies: ['hunger'] },
  { x: 3, y: 1, z: 0, type: 'corridor' },
  {
    x: 4, y: 1, z: 0, type: 'exit',
    destination: { areaId: 'thornwood-clearing', x: 0, y: 0, z: 0 },
  },
]

const MILL_STREAM_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'River Bend North',
    description:
      'A slow bend where the stream widens and eddies pull at the reeds. Silver fish ghost along the gravel in the shallows.',
  },
  '1,0,0': {
    name: 'Reedbank',
    description:
      'Tall reeds lean with the current, bent in one direction like a combed beard. Mosquitos drone above the slack water.',
  },
  '2,0,0': {
    name: 'Ford Pool',
    description:
      'A broader pool where the stream runs shallow and clear over round stones. Someone has laid a line of flat rocks to ford it.',
  },
  '3,0,0': {
    name: 'Still Water',
    description:
      'The current stalls here against a low earthen dam. The surface is dark and flat; something heavier than a fish lives under it.',
  },
  '4,0,0': {
    name: 'Downstream Pool',
    description:
      'The water picks up again below the dam, chuckling over stones worn smooth. A heron is standing, perfectly still, about fifty paces away.',
  },
  '0,1,0': {
    name: 'Back to Millhaven',
    description:
      'The cart track runs back toward the East Gate. Beyond it the red tile roofs of the village show through the trees.',
  },
  '1,1,0': {
    name: 'Stream Path',
    description:
      'A narrow path of packed earth running east alongside the water. The stream sings on your left the whole way.',
  },
  '2,1,0': {
    name: 'The Stepping Stones',
    description:
      'The path gives out for a few strides and the stream spreads into a shallow ford. You cross dry-footed on flat, moss-rimmed stones.',
  },
  '3,1,0': {
    name: 'Reed Path',
    description:
      'The trail re-forms on the far side of the ford, cutting through a wall of reeds that rattle against each other in the wind.',
  },
  '4,1,0': {
    name: 'Path to the Wood',
    description:
      'The reeds thin and the first trees of the Thornwood close in overhead. The sound of the stream fades behind you.',
  },
}

export const FANTASY_MILL_STREAM: Area = {
  id: 'mill-stream',
  kind: 'wilderness',
  name: 'The Mill Stream',
  level: 2,
  startX: 0,
  startY: 1,
  startZ: 0,
  rooms: buildArea(MILL_STREAM_ARCHETYPES, MILL_STREAM_FLAVORS, 'mill-stream'),
}

// ---------------------------------------------------------------------------
// Thornwood Clearing — forest with the player's first real encounter
// pressure. Chamber-heavy so the encounter table rolls on nearly every
// traversal. Two exits — one back to the stream, one onward to the
// cave mouth at Barrowdown.
//
//   x:  0          1          2          3          4
//  y=0: exit(W)    corridor   chamber
//  y=1: (gap)      corridor   (gap)      chamber
//  y=2: (gap)      (gap)      corridor   corridor   exit(E)
// ---------------------------------------------------------------------------

const THORNWOOD_ARCHETYPES: RoomArchetype[] = [
  {
    x: 0, y: 0, z: 0, type: 'exit',
    destination: { areaId: 'mill-stream', x: 4, y: 1, z: 0 },
  },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 3, y: 1, z: 0, type: 'chamber' },
  { x: 2, y: 2, z: 0, type: 'corridor' },
  { x: 3, y: 2, z: 0, type: 'corridor' },
  {
    x: 4, y: 2, z: 0, type: 'exit',
    destination: { areaId: 'barrowdown-cave', x: 0, y: 0, z: 0 },
  },
]

const THORNWOOD_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'Path from the Stream',
    description:
      'The trail breaks from the reeds and threads between the first Thornwood pines. Needles muffle your footsteps.',
  },
  '1,0,0': {
    name: 'Forest Path',
    description:
      'A narrow game trail beaten down by deer and whatever follows them. The canopy closes overhead like a slow lid.',
  },
  '2,0,0': {
    name: 'Moss Hollow',
    description:
      'A hollow blanketed in green moss, so thick it takes sound with it. Fallen logs radiate out from a central stump someone once used as a table.',
  },
  '1,1,0': {
    name: 'Shaded Bend',
    description:
      'The trail doubles back under a low branch. Something has been stripping bark from this tree in a ring at shoulder height.',
  },
  '3,1,0': {
    name: 'Dappled Clearing',
    description:
      'A wide clearing where the canopy opens. Sunlight lies in patches on the forest floor, and flies hang in the bright spots.',
  },
  '2,2,0': {
    name: 'Root Hollow',
    description:
      "A gap under the exposed roots of an old oak, big enough to stand in. Something's been sleeping here — the earth's still warm.",
  },
  '3,2,0': {
    name: 'Old Trail',
    description:
      "A wider, harder-packed trail than you'd expect this deep. Someone uses it. The hoofprints are bigger than a horse's.",
  },
  '4,2,0': {
    name: 'Cave Mouth',
    description:
      'The trees thin against a low outcrop of grey stone. A dark, uneven opening at its base exhales cold, damp air.',
  },
}

export const FANTASY_THORNWOOD: Area = {
  id: 'thornwood-clearing',
  kind: 'wilderness',
  name: 'Thornwood Clearing',
  level: 3,
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: buildArea(THORNWOOD_ARCHETYPES, THORNWOOD_FLAVORS, 'thornwood-clearing'),
}

// ---------------------------------------------------------------------------
// Barrowdown Cave — first mini-boss. z=0 is the cave surface with a
// cave-mouth exit back to the Thornwood and an "entrance" cell at (2,1)
// that doubles as the top of the ladder. z=1 is a small underlayer ending
// in the boss chamber. Single staircase at (2,1) so only one ladder
// icon shows on the map.
//
//   z=0:
//   x:  0          1          2
//  y=0: exit(W)    corridor   chamber
//  y=1: (gap)      corridor   entrance   (← top of ladder)
//
//   z=1:
//   x:  2          3          4
//  y=1: chamber    chamber    entrance   ←  boss at (3,1,1); stairs down at (4,1,1)
//  y=2: corridor   storage               ←  chest antechamber
//
//   z=2:                                   ← old forgotten passage
//   x:  4          5          6          7
//  y=1: chamber    corridor   corridor   portal   ←  portal hub at the end
// ---------------------------------------------------------------------------

const BARROWDOWN_ARCHETYPES: RoomArchetype[] = [
  {
    x: 0, y: 0, z: 0, type: 'exit',
    destination: { areaId: 'thornwood-clearing', x: 4, y: 2, z: 0 },
  },
  { x: 1, y: 0, z: 0, type: 'corridor' },
  { x: 2, y: 0, z: 0, type: 'chamber' },
  { x: 1, y: 1, z: 0, type: 'corridor' },
  { x: 2, y: 1, z: 0, type: 'entrance' },
  { x: 2, y: 1, z: 1, type: 'chamber' },
  { x: 2, y: 2, z: 1, type: 'corridor' },
  { x: 3, y: 2, z: 1, type: 'storage' },
  { x: 3, y: 1, z: 1, type: 'chamber' },
  // Hidden stairwell behind the Marrow Lord's lair — only reachable by
  // defeating the boss. Drops down to a long-forgotten passage on z=2.
  { x: 4, y: 1, z: 1, type: 'entrance' },
  // Old forgotten passage on z=2 — bottom of the stairs, two corridor
  // segments, then the Portal Hub itself at the far end.
  { x: 4, y: 1, z: 2, type: 'chamber' },
  { x: 5, y: 1, z: 2, type: 'corridor' },
  { x: 6, y: 1, z: 2, type: 'corridor' },
  // Portal Hub — the single multi-destination portal at the deepest
  // point of the authored world. Placed at the end of the forgotten
  // passage so the player must defeat the boss AND walk the long hall
  // to reach it.
  { x: 7, y: 1, z: 2, type: 'portal', permanentFrontier: true, portalHub: true },
]

const BARROWDOWN_FLAVORS: Record<string, RoomFlavor> = {
  '0,0,0': {
    name: 'Cave Mouth',
    description:
      'A jagged slit in the rock, barely wider than a man. The Thornwood trail falls away behind you; the dark in front is a different kind of dark.',
  },
  '1,0,0': {
    name: 'Shallow Passage',
    description:
      'A low-ceilinged tunnel where the stone is still streaked with root and leaf-litter. Daylight reaches only a dozen paces.',
  },
  '2,0,0': {
    name: 'The Antechamber',
    description:
      'The passage opens into a rounded cavity, tall enough to stand easily. Dripping water has built a pale crust along one wall.',
  },
  '1,1,0': {
    name: 'Dripping Crawlway',
    description:
      'A narrow seam between slabs of wet rock. You can hear water moving below your feet, though you can\'t see it.',
  },
  '2,1,0': {
    name: 'The Descent',
    description:
      'A shaft drops into black. A rope ladder, gone grey with damp, has been lashed to a stake. It creaks under no weight.',
  },
  '2,1,1': {
    name: 'Bottom of the Descent',
    description:
      'The ladder ends on a flat stone floor slick with silt. The air is noticeably colder and smells faintly of wet iron.',
  },
  '2,2,1': {
    name: 'Narrow Burrow',
    description:
      'A worked passage, too regular to be natural but too rough to be finished. Something has been widening it, one bite at a time.',
  },
  '3,2,1': {
    name: 'Treasure Alcove',
    description:
      'A small side-chamber with a fallen chest tipped against the far wall. Coins have spilled out and rolled into corners. Nothing has bothered to pick them up.',
  },
  '3,1,1': {
    name: 'Lair of the Marrow Lord',
    description:
      'A domed chamber lit by a pale fungal glow. Bones are piled along the walls in deliberate patterns, and one large shape at the centre shifts as you enter.',
  },
  '4,1,1': {
    name: 'Hidden Stair',
    description:
      'A narrow stairwell, half-buried behind a pile of bones the Marrow Lord had been arranging. The steps descend into colder air. They are worn smooth in the centre — many feet have come this way, but none recently.',
  },
  '4,1,2': {
    name: 'Dust-Choked Landing',
    description:
      'The stairs end in a low antechamber buried in dust thick enough to muffle sound. Whatever air moves down here moves slowly. A worked passage leads away east.',
  },
  '5,1,2': {
    name: 'Hall of Worn Stones',
    description:
      'The corridor is taller than the cave above and lined with dressed masonry, the joints so close they need no mortar. The work is meticulous; the cracks are old. Nothing has been mended in living memory.',
  },
  '6,1,2': {
    name: 'The Long Walk',
    description:
      'The passage stretches further than the cave above could possibly hold. Torchlight ahead fades into emptiness. Whoever cut this passage cared more about reach than about any one place along it.',
  },
  '7,1,2': {
    name: 'The Forgotten Threshold',
    description:
      'The corridor opens into a vast circular hall that has no business existing inside this stone. The ceiling vanishes upward into a darkness that swallows torchlight. Black-veined pillars ring a slow-shifting nothing at the centre — a doorway, plainly, but one nobody has stepped through in centuries. Dust hangs in the still air. Whatever sovereign or order raised this place, the world has long since forgotten them.',
  },
}

export const FANTASY_BARROWDOWN_CAVE: Area = {
  id: 'barrowdown-cave',
  kind: 'dungeon',
  name: 'Barrowdown Cave',
  level: 4,
  rarity: 'uncommon',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: buildArea(BARROWDOWN_ARCHETYPES, BARROWDOWN_FLAVORS, 'barrowdown-cave'),
}
