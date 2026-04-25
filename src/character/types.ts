import type { Position } from '../areas/types'
import type { ActiveCondition } from '../conditions'
import type { Drives } from '../game/drives'
import type { Rarity } from '../items/rarity'
import type { TickSpeedId } from '../themes/types'

export interface StatBlock {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export interface InventoryItem {
  id: string
  /** Archetype id in world.items. Absent for starting-inventory flavor items
   * that don't correspond to a world-scoped archetype. */
  archetypeId?: string
  name: string
  description?: string
  quantity?: number
  /** Rarity rolled at pickup. Adds a flat bonus on top of the level-scaled
   *  base stats (see `equipBonusesFor` in game/equip.ts). Absent ⇒ treated
   *  as 'common'. Starting-inventory flavor items don't carry a rarity. */
  rarity?: Rarity
  /** Item level rolled at drop time. Scales the archetype's base stats —
   *  higher-level items have stronger bases regardless of rarity. Defaults
   *  to 1 when absent (starting gear and pre-feature saves). */
  level?: number
  /** When and how this item was acquired — used by item popovers to remind
   *  the player where their best gear came from. */
  acquired?: ItemAcquisition
}

export interface ItemAcquisition {
  /** Wall-clock ms when the item entered the inventory. */
  at: number
  /** Where it came from. */
  source: 'starting' | 'mob' | 'dev' | 'shop'
  /** Mob the kill loot dropped from (when source === 'mob'). */
  mobName?: string
  /** Mob's rarity at the moment of the drop, for the colored badge in the
   *  popover line. */
  mobRarity?: Rarity
  /** Coarse "where" — area + room name when known. */
  areaId?: string
  roomName?: string
}

export interface Equipped {
  weapon?: InventoryItem
  /** Second one-handed weapon when the main-hand weapon is 1H. Always empty
   *  while the main-hand is 2H. */
  offhand?: InventoryItem
  /** Torso armor. Name retained for save-compat reasons. */
  armor?: InventoryItem
  head?: InventoryItem
  arms?: InventoryItem
  hands?: InventoryItem
  legs?: InventoryItem
  feet?: InventoryItem
  cape?: InventoryItem
  amulet?: InventoryItem
  ring1?: InventoryItem
  ring2?: InventoryItem
}

export interface DeathRecord {
  at: number
  cause: string
  areaId: string
  roomName?: string
  roomKey?: string
  mobName?: string
}

export interface LevelUpRecord {
  at: number
  from: number
  to: number
  /** Gold pile at the moment of level-up (for per-segment delta math). */
  goldAtLevelUp?: number
  /** Total XP accumulated during the segment that ended here. Redundant
   *  with \`xpToNextLevel(from)\` today but future difficulty tuning may
   *  diverge — snapshot it so UI doesn't have to recompute. */
  xpGained?: number
  /** Best item the character picked up between \`(levelUps[i-1].at, at]\`.
   *  "Best" = highest rarity tier, tiebroken by item value. */
  bestItem?: { name: string; rarity: Rarity }
  /** Toughest mob slain during this segment. "Baddest" = highest rarity,
   *  tiebroken by xpReward. */
  baddestEnemy?: { name: string; rarity: Rarity; xpReward: number }
  /** Gains granted at this level-up. HP / MP are the flat species+class
   *  bumps plus the CON / MIND stat-mod. `statText` is the pretty summary
   *  ("+1 STR +1 CON") — empty on levels that aren't a stat-bump multiple.
   *  Absent on records written before this field existed. */
  gains?: { hp: number; mp: number; statText: string }
}

/** Running tally for the level the character is currently inside. Reset
 *  at every level-up and snapshotted into the LevelUpRecord. */
export interface LevelSegment {
  startedAt: number
  startGold: number
  bestItem?: { name: string; rarity: Rarity; value: number }
  baddestEnemy?: { name: string; rarity: Rarity; xpReward: number }
}

export interface Character {
  id: string
  name: string
  worldId: string
  worldVersion: string
  speciesId: string
  genderId: string
  classId: string
  createdAt: number
  level: number
  xp: number
  hp: number
  maxHp: number
  magic: number
  maxMagic: number
  gold: number
  stats: StatBlock
  inventory: InventoryItem[]
  equipped: Equipped
  position: Position
  visitedRooms: string[]
  deaths: DeathRecord[]
  levelUps: LevelUpRecord[]
  drives: Drives
  lastSafePosition?: Position
  conditions: ActiveCondition[]
  /** Spell ids from the world spell library that the character can cast.
   *  Empty for classes without magical access. */
  spells: string[]
  /** Running tally for the current level. Absent on characters from before
   *  this field existed — treated as if the segment started at createdAt. */
  segment?: LevelSegment
  /** Number of game ticks this character has lived through. Incremented at
   *  the top of every `runTick`. Rendered on the roster card as a 7-seg LED
   *  counter. Absent on characters from before this field existed — treated
   *  as 0 until the next tick bumps it. */
  ticks?: number
  /** LLM-generated titles keyed by title index. Sparse — only populated for
   *  indexes past the hand-authored ladder (index ≥ 40, i.e. level > 100).
   *  Absent on characters from before this field existed. See titles.ts. */
  generatedTitles?: Record<number, string>
  /** Ticks remaining before the character will sit down to rest or meditate
   *  again. Set to a small positive value when leaving the resting / meditating
   *  states so they don't immediately chain rest → meditate or meditate → rest
   *  in the same safe room. Decremented each `explore` tick, treated as 0 when
   *  absent. */
  restCooldown?: number
  /** Tick-speed override for this character. When absent, the App falls back
   *  to the legacy global setting from localStorage. New characters get
   *  '50' (0.5×) so the early game has room to breathe; the topbar control
   *  writes here, and the auto-ramp in tick.ts steps it up over time until
   *  it hits '100' (1×). */
  tickSpeed?: TickSpeedId
  /** When true, the auto-ramp in tick.ts may step `tickSpeed` upward. Set
   *  to true on character creation; flipped to false the moment the user
   *  picks a speed manually so the ramp doesn't fight their choice. Absent
   *  on pre-feature saves, treated as false (no ramp for legacy chars). */
  tickSpeedAuto?: boolean
}
