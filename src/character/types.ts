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
  /** Mob HP remaining at the moment of the kill. Combined with
   *  `mobMaxHp` it powers the "how close did you come" quip on the
   *  death card. Absent on deaths recorded before this field existed
   *  or on deaths not caused by combat (poison, traps, etc). */
  mobRemainingHp?: number
  /** Mob's max HP. See `mobRemainingHp`. */
  mobMaxHp?: number
}

/** A killing blow the character was saved from at the last instant. Recorded
 *  when a character at the Anointed favor tier (>= 900) would have died and
 *  the deity intervenes — the blow is converted, not blocked. The favor
 *  reset to 0 is the cost. Distinct from `DeathRecord` so the level-up
 *  segment summary can show "saved twice this segment" alongside deaths. */
export interface SavedRecord {
  at: number
  /** Killer / cause clause (same shape as DeathRecord.cause). */
  cause: string
  areaId: string
  roomName?: string
  roomKey?: string
  mobName?: string
}

/** Active divine blessing applied at a shrine. Tier mirrors the favor tier
 *  the character was at *when the blessing was applied* — higher tiers
 *  unlock stronger combat/regen effects (see src/game/favor.ts). Decays
 *  one tick at a time; absent when no blessing is active. */
export interface ActiveBlessing {
  /** 1–4. Effects unlock cumulatively: tier 2 includes tier 1, etc. */
  tier: 1 | 2 | 3 | 4
  /** Ticks until the blessing wears off. Decremented every tick. */
  ticksRemaining: number
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
  /** Number of deaths suffered during the segment that ended at this
   *  level-up. Snapshotted from \`character.deaths\` whose timestamps
   *  fall after the previous segment's start. Absent on records
   *  written before this field existed. */
  deathsThisLevel?: number
  /** Spells unlocked at this level-up (curated `unlockLevel` matches
   *  plus the LLM-stub past level 15). Empty / absent when none.
   *  Snapshotted here so the level-up card and history dialog can
   *  list them without re-running the unlock pipeline. */
  learnedSpells?: LevelUpLearnedSpell[]
  /** Favor tier name at the moment of level-up (e.g. "Witnessed"). When
   *  absent the level-up card hides the favor row entirely (pre-feature
   *  records or characters who never sacrificed). */
  endFavorTierName?: string
  /** Favor tier name at the start of this segment. When higher than
   *  `endFavorTierName` the card renders "(up from X)" so the upgrade
   *  reads as a milestone. Same as `endFavorTierName` when no change. */
  startFavorTierName?: string
  /** True when the character crossed into a strictly higher favor tier
   *  during this segment. Used by the level-up card to decorate the
   *  favor row as an upgrade (sparkler / glow / "↑"). */
  favorTierUpgraded?: boolean
  /** Number of times the deity intervened to save the character at the
   *  moment of death during this segment (Anointed-tier death-save).
   *  Snapshotted from `character.saved` whose timestamps fall after the
   *  segment's start. */
  savesThisLevel?: number
}

export interface LevelUpLearnedSpell {
  id: string
  name: string
  /** Spell tier (1–5), used to color the entry in the level-up card. */
  level: 1 | 2 | 3 | 4 | 5
}

/** Running tally for the level the character is currently inside. Reset
 *  at every level-up and snapshotted into the LevelUpRecord. */
export interface LevelSegment {
  startedAt: number
  startGold: number
  bestItem?: { name: string; rarity: Rarity; value: number }
  baddestEnemy?: { name: string; rarity: Rarity; xpReward: number }
  /** Favor tier the character was at when this segment began. Recorded
   *  so the level-up card can show a tier transition ("Touched →
   *  Witnessed") instead of just the end tier. Absent on segments
   *  created before this field existed; treated as the current tier
   *  (no upgrade reported). */
  startFavorTier?: 0 | 1 | 2 | 3 | 4
}

export interface Character {
  id: string
  name: string
  worldId: string
  worldVersion: string
  speciesId: string
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
  /** Standing with the world's deity. Earned 1-for-1 by sacrificing items
   *  (plus a +5 tithe when sacrificing at a shrine), spent passively as
   *  shrine-rest blessings, and reset to 0 on any death — including the
   *  Anointed-tier death save (gods don't like a loser). 0 to FAVOR_MAX
   *  (1000). Absent on pre-feature saves; treated as 0. */
  favor?: number
  /** Lifetime list of times the deity intervened to save the character at
   *  the moment of death. Populated when favor was >= 900 (Anointed) at
   *  death time. The save resets favor to 0. Absent on pre-feature saves;
   *  treated as []. */
  saved?: SavedRecord[]
  /** Active divine blessing applied at the last shrine rest, decaying one
   *  tick at a time. Tier matches the character's favor tier when the
   *  blessing was applied. Absent when no blessing is active or the
   *  character has never rested at a shrine. */
  blessing?: ActiveBlessing
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
  /** Mob archetype IDs / template IDs encountered at least once. Used to
   *  track first-encounter discovery effects. */
  discoveredMobs?: string[]
  /** Item archetype IDs looted at least once. Used to track first-discovery
   *  effects for new item types. */
  discoveredItems?: string[]
  /** Keys of rooms whose `firstOnly` curated encounter has already been
   *  defeated. Format: `${areaId}:${x},${y},${z}` (visitedKey). A room
   *  listed here falls back to the random encounter pool instead of
   *  re-spawning its curated boss. Absent on pre-feature saves —
   *  treated as `[]`. */
  defeatedRooms?: string[]
  /** How many times this character has been greeted by a fixed NPC,
   *  keyed by `${areaId}:${npcId}` (an NPC's id is unique within its
   *  area, but two areas can each carry an NPC with the same id —
   *  scoping by areaId keeps the counters separate). 0 = never met,
   *  1 = first meeting just happened, 2+ = subsequent regular visits.
   *  Absent on pre-feature saves — treated as `{}`.
   *
   *  Growth: this map gains one entry per unique NPC the character ever
   *  greets and is never pruned. In practice areas cap at ~20 rooms with
   *  ≤2 NPCs each, so a long-running character would still need to
   *  visit dozens of areas before this becomes measurable. If memory
   *  pressure ever shows up here, prune entries whose areaId is no
   *  longer in `visitedRooms` (NPCs in unvisited areas can't be
   *  re-greeted, so their counter is effectively dead state). */
  npcInteractionCounts?: Record<string, number>
  /** Chronological journal of milestone events — area discoveries,
   *  first mob kills, first loot pickups, level-ups, deaths. Grouped
   *  by area in the Journal tab. Absent on pre-feature saves —
   *  treated as `[]`. */
  journal?: JournalEntry[]
  /** Most recent top drive (hunger / fatigue / greed / curiosity /
   *  weight) observed during explore. Used to detect top-drive
   *  transitions and emit flavor log lines when the character's
   *  primary concern shifts. Absent ⇒ no prior top drive. Stored as
   *  the raw Drive string (matches Drives' keys) or null when no
   *  drive is above threshold. */
  lastTopDrive?: import('../game/drives').Drive | null
  /** Ranger trap state — when set, the next mob encountered in the
   *  current room eats flat damage before combat begins. The ranger
   *  "lays" the trap during exploration; it consumes on first trigger.
   *
   *  TODO: implementation is currently minimal (damage applied at
   *  encounter-spawn time, no placement UI). Future work: tie this to
   *  specific rooms via `roomKey`, expire traps after N ticks, and let
   *  the player see a "trap set" indicator in the Topbar. */
  trap?: { damage: number; roomKey?: string }
  /** Per-character PRNG state — a 32-bit integer consumed and re-stamped
   *  each tick by Rng.fromState / Rng.save. All game-state randomness
   *  flows through this so (character, seed, tick-sequence) replays
   *  identically. */
  rngState: number
  /** Pending post-combat loot held in a strange chest. While locked, items
   *  are *won* but not yet *seen* — they aren't in the inventory, the
   *  player can't equip them, and combat keeps using the prior loadout.
   *  When the timer hits zero the chest unlatches: items merge into
   *  inventory, auto-equip runs, and the standard "picks up" loot line
   *  fires (so journal first-finds key off the same moment the player
   *  sees the item). Subsequent kills while a chest is locked merge into
   *  it and bump the timer. Gold-only kills skip the chest entirely.
   *
   *  This is the diegetic surface that hides any post-combat asynchrony
   *  (issue #75: per-descriptor sprite generation). The chest exists as
   *  a real gameplay beat on its own — generation just runs invisibly
   *  inside the lock window when that lands. */
  lockedChest?: LockedChest
}

export interface LockedChest {
  /** Items waiting to be revealed. Already fully resolved (rarity, level,
   *  acquisition metadata) at lock time so nothing rolls again on unlock. */
  items: InventoryItem[]
  /** Coin queued in the chest. Released alongside items on unlock. */
  gold: number
  /** Ticks until the chest unlatches. Decremented at the top of every tick
   *  regardless of state so a long fight doesn't pin the chest shut. */
  ticksLeft: number
  /** Most recent kill that contributed to the chest. Used for unlock-log
   *  flavor and to scope the unlock entry's areaId for the journal. */
  source?: {
    mobName?: string
    areaId?: string
    roomName?: string
  }
}

/** Kinds of achievement / milestone tracked in the character's journal. */
export type JournalEntryKind =
  | 'area-discovered'
  | 'mob-first-defeat'
  | 'boss-defeat'
  | 'item-first-loot'
  | 'level-up'
  | 'spell-learned'
  | 'death'
  /** The character crossed into a higher favor tier this tick. */
  | 'favor-tier-up'
  /** Anointed-tier death-save fired — the deity intervened. */
  | 'death-save'

export interface JournalEntry {
  /** Wall-clock ms when the entry was recorded. */
  at: number
  /** Area id this entry is scoped to — drives Journal-panel grouping. */
  areaId: string
  kind: JournalEntryKind
  /** One-line human-readable summary for the Journal-panel list. */
  text: string
  /** Optional structured metadata for richer rendering (rarity colors,
   *  icons) without re-parsing `text`. */
  meta?: JournalEntryMeta
}

export interface JournalEntryMeta {
  mobId?: string
  mobName?: string
  mobRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  itemId?: string
  itemName?: string
  itemRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  roomName?: string
  fromLevel?: number
  toLevel?: number
  cause?: string
  /** Spell id and display name on a `spell-learned` entry. The id maps to
   *  the world spell library so the journal can resolve the description /
   *  level for a future popover. */
  spellId?: string
  spellName?: string
  /** Favor tier index (0-4) on a `favor-tier-up` entry — drives color
   *  ramping the same way the sheet's favor row does. */
  tier?: 0 | 1 | 2 | 3 | 4
  /** Tier display name on a `favor-tier-up` or `death-save` entry —
   *  pre-resolved so the panel doesn't have to look up the manifest. */
  tierName?: string
}
