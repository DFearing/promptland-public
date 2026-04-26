export interface LogMeta {
  name?: string
  direction?: string
  areaId?: string
  roomKey?: string
  roomName?: string
  mobName?: string
  itemId?: string
  itemName?: string
  itemRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  /** Second item referenced by the entry — used by equip messages where one
   *  item replaces another so both names can render as clickable [Brackets]. */
  replacedItemId?: string
  replacedItemName?: string
  replacedItemRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  /** Batched-pickup payload — a single loot line can reference N items.
   *  LogPanel tokenizes each `name` into a clickable bracketed link; journal
   *  derivation iterates through them so each gets its own first-find gate.
   *  The entry's top-level `itemName` / `itemId` / `itemRarity` still mirror
   *  the first item for backward compat with callers that haven't been
   *  taught about the array yet. */
  items?: Array<{
    id: string
    name: string
    rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
    /** Quantity picked up — rendered as "N× Name" when > 1. */
    qty?: number
  }>
  /** Raw gold amount when the entry mentions picking up or losing coin. */
  goldAmount?: number
  /** Rendered "NN gold" / "NN credits" substring in the entry text — log
   *  uses this to paint the coin amount in its currency color. */
  goldText?: string
  /** Rendered "+NN XP" substring — paint in the white XP color. */
  xpText?: string
  /** When present, this chapter entry is a level-up announcement — the
   *  effect pipeline derives a fullscreen event keyed to this level. */
  levelTo?: number
  /** When true, this chapter entry announces a newly-earned title. Drives
   *  the same sparkler decoration as level-up lines so titles feel like
   *  a celebrated event rather than a buried narrative beat. */
  titleEarned?: boolean
  /** New title text on a title-earned chapter entry. Stored alongside the
   *  flag so downstream surfaces (popovers, future fullscreen FX) can
   *  render the title without re-parsing the line. */
  titleText?: string
  conditionName?: string
  /** Spell name to highlight in the entry text (cast/scroll prelude, damage,
   *  heal). Painted in the MP color so spells read as their own thing. */
  spellName?: string
  /** When the entry is a consume, this signals how to paint the potion
   *  name — HP color for heal, MP color for mana. Kept separate from
   *  `itemRarity` because potions read as effect-colored, not rarity-
   *  colored, when drunk. */
  potionEffect?: 'heal' | 'restore-magic'
  /** Elemental overlay to show on the affected actor (character or mob).
   *  Used by effect derivation — never rendered as text. */
  element?: 'fire' | 'ice' | 'electric' | 'earth' | 'hack'
  /** Combat verb substring to highlight in a damage entry's text (e.g.
   *  "DEVASTATES!", "lands a blow on"). Paired with `severity` so the verb
   *  gets its emphasis without dragging "the" / "a" along for the ride. */
  verb?: string
  /** Damage severity — used to style the verb span when rendering. */
  severity?: DamageSeverity
  /** Attacker's raw offensive power for this strike — post-roll,
   *  pre-defense. Paired with `defense` in the log tag when the user
   *  has "Log numbers" enabled so they can see what the hit was trying
   *  to do before the defender chewed it down. */
  attackPower?: number
  /** Defender's damage reduction for this strike. For character attacks
   *  this is the mob's `defense`; for mob attacks this folds the
   *  character's dex mod and armor-derived defense bonus together so the
   *  user sees a single "what blocked it" number. */
  defense?: number
  /** Level-delta scale multiplier applied after `(attackPower − defense)` —
   *  the last math step before the final damage is floored at 1. Surfaced
   *  in the log tag as "· ×0.5 swing" when != 1.0 so the breakdown
   *  reconciles: final DMG = round(max(0, ATK − DEF) × scaleMult).
   *  Absent ⇒ no scaling applied (or 1.0, equivalently). */
  scaleMult?: number
  /** Marks the log entry as a mob's defeat announcement. Lets downstream
   *  surfaces (popovers, history) distinguish "this mob just died" loot
   *  lines from ordinary gold/item pickups that also carry `mobName`. */
  mobDefeat?: boolean
  /** Mob archetype id on defeat lines — used by journal derivation to
   *  dedupe first-ever kills by id (names alone are ambiguous because
   *  rarity prefixes them: "Cave Rat" and "rare Cave Rat" share id). */
  mobId?: string
  /** Mob rarity on defeat / encounter lines. Included alongside
   *  mobName in the log for display; journal derivation reads it to
   *  tag boss entries with the right rarity color. */
  mobRarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  /** True when the mob was spawned from a curated room encounter
   *  (not the random pool). Set on defeat lines so the journal can
   *  distinguish boss kills from ambient first-kills. */
  curated?: boolean
  /** Marks a narrative entry as the character's death line. Replaces
   *  the fragile "contains 'falls to the'" substring match the
   *  effects layer used to do — now that death verbs rotate, a flag
   *  is the only stable signal. */
  isDeath?: boolean
  /** Marks a `death-save` entry — the deity-intervention line that
   *  replaces a death when favor is at the Anointed tier. Effects
   *  layer keys off this flag to fire the death-save fullscreen
   *  card. Distinct from `isDeath` so the death banner doesn't
   *  also fire. */
  isSave?: boolean
  /** Stealth first-strike from rogue/ranger — paints the opener line
   *  and the follow-up damage with a distinct style. Transient flag;
   *  not used by journal derivation. */
  stealth?: boolean
  /** Ranger trap events — set on trap-lay and trap-fire lines so the
   *  log renderer can tint them consistently. */
  trap?: boolean
  /** Raw favor amount mentioned in the entry (sacrifice gain, donation
   *  tithe, blessing, death-save reset). Powers field-indicator deltas
   *  and journal accounting. */
  favorAmount?: number
  /** Rendered "+N favor" / "-N favor" substring in the entry text — log
   *  renderer paints it in the favor color so the gauge gain reads at a
   *  glance. World-themed nouns (favor / standing) are rendered through
   *  this same span. */
  favorText?: string
  /** Tier label set on `favor-tier-up` and `shrine-blessing` lines. Drives
   *  the entry's tint and the journal/popover summary. */
  tierName?: string
  /** Ordinal of the favor tier referenced in the entry (1–4). */
  tier?: 1 | 2 | 3 | 4
}

export type ConsumeKind = 'heal' | 'restore-magic'
export type EquipSlotKind = 'weapon' | 'armor'
export type ConditionPolarityKind = 'buff' | 'debuff'
export type DamageSeverity = 'grazing' | 'light' | 'solid' | 'heavy' | 'severe' | 'critical'

export type LogEntry =
  | { kind: 'narrative'; text: string; meta?: LogMeta }
  | { kind: 'system'; text: string }
  /** "Meta" log lines — world-shift speed bumps, autosave notifications.
   *  Italic + muted accent + leading ellipsis glyph so they read as
   *  out-of-diegesis asides rather than in-world narration. */
  | { kind: 'meta'; text: string; meta?: LogMeta }
  /** "Thought" log lines — drive focus shifts and other inner-monologue
   *  beats. Italic + soft accent + leading tilde glyph + small indent so
   *  they read as the character's interior life pivoting, distinct from
   *  the action stream around them. */
  | { kind: 'thought'; text: string; meta?: LogMeta }
  | { kind: 'chapter'; text: string; meta?: LogMeta }
  | {
      kind: 'area'
      text: string
      /** Rarity of the area just discovered. Drives the fullscreen
       *  banner variant — rare+ get the "Rare Area Discovered" treatment. */
      rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
      /** Area id, optional — journal derivation reads this so the
       *  discovered-area entry can be scoped correctly even when the
       *  character isn't yet standing inside the area this line
       *  announced. */
      areaId?: string
    }
  | { kind: 'dialogue'; speaker?: string; text: string }
  | { kind: 'damage'; text: string; amount?: number; severity?: DamageSeverity; meta?: LogMeta }
  | { kind: 'heal'; text: string; amount?: number; meta?: LogMeta }
  | { kind: 'loot'; text: string; meta?: LogMeta }
  | { kind: 'consume'; text: string; effect: ConsumeKind; amount: number; meta?: LogMeta }
  | { kind: 'equip'; text: string; slot: EquipSlotKind; meta?: LogMeta }
  | { kind: 'death-loss'; text: string; meta?: LogMeta }
  | {
      kind: 'condition-gain'
      text: string
      conditionId: string
      polarity: ConditionPolarityKind
      meta?: LogMeta
    }
  | { kind: 'condition-tick'; text: string; amount: number; conditionId: string; meta?: LogMeta }
  | { kind: 'condition-end'; text: string; conditionId: string; meta?: LogMeta }
  /** The character crossed into a higher favor tier this tick. Drives a
   *  rim-flash event and a journal entry. */
  | { kind: 'favor-tier-up'; text: string; meta?: LogMeta }
  /** A shrine blessing was applied during a shrine rest. Rendered in the
   *  favor color so it reads as a divine event distinct from a normal
   *  rest tick. */
  | { kind: 'shrine-blessing'; text: string; meta?: LogMeta }
  /** The character was saved from death by the deity at Anointed tier.
   *  Cost is favor reset to 0 (the deity bills the books). Mirrors a
   *  death line's `meta.isDeath` flag pattern via `meta.isSave: true` —
   *  the effects layer keys off that to fire the fullscreen card. */
  | { kind: 'death-save'; text: string; meta?: LogMeta }
