import type { Character } from '../character'
import type { EffectContext, EffectEvent, FieldFxEvent } from './types'

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
      case 'chapter':
        if (entry.text.includes(' rises to level ')) {
          events.push({ id: nextId(), kind: 'level-up' })
        } else if (entry.text.includes(' falls to the ') || entry.text.includes(' falls. ')) {
          events.push({ id: nextId(), kind: 'death' })
        }
        break
      case 'damage': {
        const amount = entry.amount ?? 0
        // Character name appears AFTER "lashes at" when the mob is attacking the character.
        const charIsTarget = entry.text.includes(`at ${ctx.characterName}`)
        if (charIsTarget) {
          events.push({ id: nextId(), kind: 'damage-taken', amount })
        } else {
          events.push({ id: nextId(), kind: 'damage-dealt', amount })
        }
        break
      }
      case 'loot':
        events.push({ id: nextId(), kind: 'loot' })
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
