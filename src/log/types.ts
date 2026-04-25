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
  /** Marks the log entry as a mob's defeat announcement. Lets downstream
   *  surfaces (popovers, history) distinguish "this mob just died" loot
   *  lines from ordinary gold/item pickups that also carry `mobName`. */
  mobDefeat?: boolean
}

export type ConsumeKind = 'heal' | 'restore-magic'
export type EquipSlotKind = 'weapon' | 'armor'
export type ConditionPolarityKind = 'buff' | 'debuff'
export type DamageSeverity = 'grazing' | 'light' | 'solid' | 'heavy' | 'severe' | 'critical'

export type LogEntry =
  | { kind: 'narrative'; text: string; meta?: LogMeta }
  | { kind: 'system'; text: string }
  | { kind: 'chapter'; text: string; meta?: LogMeta }
  | {
      kind: 'area'
      text: string
      /** Rarity of the area just discovered. Drives the fullscreen
       *  banner variant — rare+ get the "Rare Area Discovered" treatment. */
      rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
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
