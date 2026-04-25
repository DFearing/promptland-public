export interface LogMeta {
  name?: string
  direction?: string
  areaId?: string
  roomKey?: string
  roomName?: string
  mobName?: string
  itemName?: string
  conditionName?: string
}

export type ConsumeKind = 'heal' | 'restore-magic'
export type EquipSlotKind = 'weapon' | 'armor'
export type ConditionPolarityKind = 'buff' | 'debuff'

export type LogEntry =
  | { kind: 'narrative'; text: string; meta?: LogMeta }
  | { kind: 'system'; text: string }
  | { kind: 'chapter'; text: string; meta?: LogMeta }
  | { kind: 'area'; text: string }
  | { kind: 'dialogue'; speaker?: string; text: string }
  | { kind: 'damage'; text: string; amount?: number; meta?: LogMeta }
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
