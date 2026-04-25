import type { Character } from '../character'
import type { LogEntry } from '../log'
import type { Mob } from '../mobs'
import type { Rng } from '../rng'
import { LOG_CAP, rollAmbush } from './tick'
import type { GameState } from './state'

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface BeginFightResult {
  state: GameState
  log: LogEntry[]
}

export interface BeginFightOptions {
  /** Prefix every generated narrative entry — e.g. `'[dev] '` so dev-panel-
   *  initiated fights read as staged rather than organic. Real encounters
   *  pass an empty string (default). */
  logPrefix?: string
  /** Skip the ambush roll. Used by dev actions that want a deterministic
   *  start-of-fight preview. Defaults to false (roll ambush). */
  skipAmbush?: boolean
  /** PRNG instance for the ambush roll. Required when skipAmbush is false. */
  rng: Rng
}

/**
 * Transition a playing session into a fresh combat encounter with `mob`.
 * Handles the narrative opener, ambush roll, and state mutation in one
 * place so tick-originated encounters and dev-panel spawns share the same
 * setup semantics — a bug fixed in either path is fixed in both.
 */
export function beginFight(
  character: Character,
  log: LogEntry[],
  mob: Mob,
  options: BeginFightOptions,
): BeginFightResult {
  const prefix = options.logPrefix ?? ''
  const append = (next: LogEntry[], entry: LogEntry): LogEntry[] =>
    [...next, entry].slice(-LOG_CAP)
  let out = append(log, {
    kind: 'narrative',
    text: `${prefix}A ${mob.name} bars the way. ${mob.description}`,
    meta: { mobName: mob.name, mobRarity: mob.rarity },
  })
  const ambush = options.skipAmbush
    ? undefined
    : rollAmbush(character, mob.level, options.rng) ?? undefined
  if (ambush) {
    const attackerName =
      ambush.side === 'character' ? character.name : `the ${mob.name}`
    const defenderName =
      ambush.side === 'character' ? `the ${mob.name}` : character.name
    out = append(out, {
      kind: 'narrative',
      text: `${prefix}${capitalize(attackerName)} catches ${defenderName} off guard! (Ambush — 2× damage)`,
      meta: { name: character.name, mobName: mob.name, mobRarity: mob.rarity },
    })
  }
  return {
    state: { kind: 'fighting', mob, ambush },
    log: out,
  }
}
