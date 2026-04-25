import type { Character } from '../character'
import type { LogEntry } from '../log'
import type {
  EffectContext,
  EffectEvent,
  ElementFxEvent,
  FieldFxEvent,
} from './types'

let counter = 0
function nextId(): string {
  counter += 1
  return `fx-${Date.now()}-${counter}`
}

export function deriveEvents(ctx: EffectContext): EffectEvent[] {
  const events: EffectEvent[] = []

  if (ctx.prevStateKind !== 'fighting' && ctx.nextStateKind === 'fighting') {
    events.push({ id: nextId(), kind: 'enter-fight' })
  }

  const newEntries = ctx.nextLog.slice(ctx.prevLogLength)
  for (const entry of newEntries) {
    switch (entry.kind) {
      case 'chapter': {
        const chMeta = 'meta' in entry ? entry.meta : undefined
        if (chMeta?.levelTo !== undefined) {
          // Find the matching record for this level. Fall back to the last one.
          const levelTo = chMeta.levelTo
          const record =
            ctx.character.levelUps.find((r) => r.to === levelTo) ??
            ctx.character.levelUps[ctx.character.levelUps.length - 1]
          if (record) {
            const prior = ctx.character.levelUps.find((r) => r.to === record.from)
            const previousAt = prior?.at ?? ctx.character.createdAt
            const previousGold = prior?.goldAtLevelUp ?? 0
            events.push({
              id: nextId(),
              kind: 'level-up',
              record,
              previousAt,
              previousGold,
            })
          }
        } else if (
          entry.text.includes(' falls to the ') ||
          entry.text.includes(' falls. ')
        ) {
          events.push({ id: nextId(), kind: 'death' })
        }
        break
      }
      case 'damage': {
        const amount = entry.amount ?? 0
        // Character attacks start with the character's name (or "{name}'s
        // Fireball ..." for spells); mob attacks start with "The <mob>".
        const charIsAttacker = entry.text.startsWith(ctx.characterName)
        if (charIsAttacker) {
          events.push({ id: nextId(), kind: 'damage-dealt', amount })
        } else {
          events.push({
            id: nextId(),
            kind: 'damage-taken',
            amount,
            maxHp: ctx.character.maxHp,
          })
        }
        break
      }
      case 'heal': {
        // All heal entries today target the character — the game only emits
        // heal logs from rest ticks, heal spells cast on self, and the like.
        events.push({
          id: nextId(),
          kind: 'heal-self',
          amount: entry.amount ?? 0,
          maxHp: ctx.character.maxHp,
        })
        break
      }
      case 'consume': {
        // Healing potions produce a `consume` entry (not `heal`) but still
        // restore HP — fire the same heal-self event so canvas/fullscreen
        // effects respond.
        if (entry.effect === 'heal') {
          events.push({
            id: nextId(),
            kind: 'heal-self',
            amount: entry.amount,
            maxHp: ctx.character.maxHp,
          })
        }
        break
      }
      case 'loot':
        events.push({ id: nextId(), kind: 'loot' })
        break
      case 'area':
        events.push({ id: nextId(), kind: 'new-area', name: entry.text })
        break
    }
  }

  return events
}

export function deriveFieldEvents(prev: Character, next: Character): FieldFxEvent[] {
  const out: FieldFxEvent[] = []

  const hpDelta = next.hp - prev.hp
  if (hpDelta !== 0) out.push({ id: nextId(), field: 'hp', delta: hpDelta })

  const magicDelta = next.magic - prev.magic
  if (magicDelta !== 0) out.push({ id: nextId(), field: 'magic', delta: magicDelta })

  const goldDelta = next.gold - prev.gold
  if (goldDelta !== 0) out.push({ id: nextId(), field: 'gold', delta: goldDelta })

  // Skip XP indicator on the tick a level-up happens. XP resets make the raw
  // diff misleading (often negative), and the level-up banner carries the win.
  if (next.level === prev.level) {
    const xpDelta = next.xp - prev.xp
    if (xpDelta !== 0) out.push({ id: nextId(), field: 'xp', delta: xpDelta })
  }

  return out
}

// Extracts elemental overlay events from newly-appended log entries. Each
// entry with `meta.element` fires one ElementFxEvent routed to the affected
// actor (character vs. mob). Used to drive the ElementOverlay component on
// the character viewport and the combat target panel.
export function deriveElementEvents(
  prevLogLength: number,
  nextLog: LogEntry[],
): ElementFxEvent[] {
  const out: ElementFxEvent[] = []
  const newEntries = nextLog.slice(prevLogLength)
  for (const entry of newEntries) {
    const meta = 'meta' in entry ? entry.meta : undefined
    if (!meta?.element) continue

    // Pick target based on what the entry describes:
    //   - damage entries: mob is target when text starts with the character's
    //     name (character is attacker); character is target otherwise.
    //   - condition entries: target = mob when meta.mobName is set and name
    //     isn't, else character.
    //   - heal entries: always the character.
    let target: ElementFxEvent['target']
    switch (entry.kind) {
      case 'damage': {
        const charIsAttacker = !!meta.name && entry.text.startsWith(meta.name)
        target = charIsAttacker ? 'mob' : 'character'
        break
      }
      case 'heal':
        target = 'character'
        break
      case 'condition-gain':
      case 'condition-tick':
      case 'condition-end':
        target = meta.mobName && !meta.name ? 'mob' : 'character'
        break
      default:
        continue
    }
    out.push({ id: nextId(), target, element: meta.element })
  }
  return out
}
