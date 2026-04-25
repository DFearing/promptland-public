// Death-phrase rotation for character and mob "falls to the X" lines.
//
// Before: every death read "X falls to the Y." Flat.
// After: random pick from ~15 framings so a character with a long run
//        of deaths doesn't see the same line each time. When the caller
//        knows the damage family that landed the killing blow (fire,
//        ice, lightning, slash, pierce, crush, poison, …), the rotation
//        swaps in a family-specific framing — a fireball kill reads
//        "is reduced to ash", a slash kill "is cleaved in two", etc.
//
// Kept in /combat rather than /game because the phrase is combat-
// authored (pairs the victim + killer in grammatical frames). The
// journal and death-record helpers call through here so the verb is
// consistent across the log line, the journal entry, and the record
// cause string.

import type { Rng } from '../rng'
import type { DamageFamily } from './verbs'

/** Returns a "X falls to the Y" / "X is slain by the Y" type sentence
 *  with an active verb picked from the rotation. Always includes the
 *  subject and killer names — caller doesn't need to assemble frames.
 *  When `family` is provided and has a flavored pool, rolls against
 *  that pool ~60% of the time so family flavor dominates without
 *  fully replacing the generic rotation. */
export function deathSentence(
  victim: string,
  killer: string,
  family: DamageFamily | 'poison' | undefined,
  rng: Rng,
): string {
  const frame = pickFrame(family, rng)
  return frame.replace('{victim}', victim).replace('{killer}', killer)
}

/** Returns just the predicate "falls to the X" / "is cut down by the X"
 *  suitable for stamping into a DeathRecord.cause field or a journal
 *  entry where the victim's name is already in the surrounding prose.
 *  Accepts the same family hint as deathSentence so the record's cause
 *  string reads "is reduced to ash by the Fire Drake" rather than the
 *  generic "falls to the Fire Drake". */
export function deathClause(
  killer: string,
  family: DamageFamily | 'poison' | undefined,
  rng: Rng,
): string {
  const frame = pickFrame(family, rng)
  return frame.replace('{victim} ', '').replace('{killer}', killer)
}

// Generic framings, tonally matched so any one drops cleanly into the
// existing prose rhythm. Every frame has "{victim}" as the leading
// subject and "{killer}" wrapped by any needed article — deathClause
// strips the victim token to leave a predicate.
const GENERIC_FRAMES: readonly string[] = [
  '{victim} falls to the {killer}',
  '{victim} is slain by the {killer}',
  '{victim} is cut down by the {killer}',
  '{victim} is struck down by the {killer}',
  '{victim} is laid low by the {killer}',
  '{victim} is unmade by the {killer}',
  '{victim} is undone by the {killer}',
  '{victim} is bested by the {killer}',
  '{victim} is broken by the {killer}',
  '{victim} meets their end against the {killer}',
  "{victim}'s story ends against the {killer}",
  '{victim} is dispatched by the {killer}',
  '{victim} crumples before the {killer}',
  '{victim} is claimed by the {killer}',
  '{victim} is worn down by the {killer}',
]

// Family-specific framings. Each pool is tonally tuned to the damage
// kind — fire burns, ice shatters, slash cleaves, etc. Kept small (3–5
// entries each) so the flavor is strong without drowning out the
// generic pool. The family table intentionally uses the same "{victim}
// … {killer}" shape so substitution works for both full sentence and
// clause callers.
const FAMILY_FRAMES: Partial<Record<DamageFamily | 'poison', readonly string[]>> = {
  fire: [
    '{victim} is reduced to ash by the {killer}',
    '{victim} is scorched hollow by the {killer}',
    '{victim} burns away under the {killer}',
    '{victim} is cremated by the {killer}',
  ],
  electric: [
    '{victim} falls crispy to the {killer}',
    '{victim} is flash-fried by the {killer}',
    '{victim} is burned out by the {killer}',
    '{victim} short-circuits before the {killer}',
  ],
  ice: [
    '{victim} shatters before the {killer}',
    '{victim} is frozen through by the {killer}',
    '{victim} is entombed in ice by the {killer}',
    '{victim} cracks apart under the {killer}',
  ],
  slash: [
    '{victim} is cleaved in two by the {killer}',
    '{victim} is carved apart by the {killer}',
    '{victim} is unseamed by the {killer}',
    '{victim} is hewn down by the {killer}',
  ],
  pierce: [
    '{victim} slumps, skewered by the {killer}',
    '{victim} is run through by the {killer}',
    '{victim} is pinned by the {killer}',
    '{victim} is transfixed by the {killer}',
  ],
  crush: [
    '{victim} crumples beneath the {killer}',
    '{victim} is pulverized by the {killer}',
    '{victim} is broken flat by the {killer}',
    '{victim} is smashed down by the {killer}',
  ],
  poison: [
    '{victim} chokes and collapses before the {killer}',
    '{victim} withers under the {killer}',
    "{victim}'s blood turns black from the {killer}",
    '{victim} is poisoned to death by the {killer}',
  ],
  earth: [
    '{victim} is buried beneath the {killer}',
    '{victim} is entombed by the {killer}',
    '{victim} is ground to rubble by the {killer}',
  ],
  hack: [
    '{victim} is deleted by the {killer}',
    '{victim} segfaults against the {killer}',
    '{victim} is corrupted through by the {killer}',
    '{victim} is null-routed by the {killer}',
  ],
  claw: [
    '{victim} is savaged by the {killer}',
    '{victim} is torn apart by the {killer}',
    '{victim} is mangled by the {killer}',
  ],
}

// Family flavor fires ~60% of the time when available — strong enough
// that a fireball kill usually reads fiery, loose enough that generic
// framings still pepper the rotation. Pure random (no family) always
// pulls from the generic pool.
const FAMILY_BIAS = 0.6

function pickFrame(family: DamageFamily | 'poison' | undefined, rng: Rng): string {
  const pool = family ? FAMILY_FRAMES[family] : undefined
  const useFamily = rng.chance(FAMILY_BIAS)
  if (pool && pool.length > 0 && useFamily) {
    return rng.pick(pool)
  }
  return rng.pick(GENERIC_FRAMES)
}

// Short predicate form: "is reduced to ash", "shatters", "is cleaved in
// two" — fits "The {victim} {predicate}." without dragging a killer
// token along. Used by the mob-dies log line so a fireball kill can
// print "The Goblin is reduced to ash." without having to force the
// character's name into the sentence. Family-specific pools first;
// generic fallbacks when no family is known or the family-biased roll
// misses.
const GENERIC_PREDICATES: readonly string[] = [
  'falls',
  'is slain',
  'is cut down',
  'is struck down',
  'is laid low',
  'is unmade',
  'is undone',
  'is broken',
  'crumples',
  'is dispatched',
]

const FAMILY_PREDICATES: Partial<Record<DamageFamily | 'poison', readonly string[]>> = {
  fire: ['is reduced to ash', 'burns away', 'is scorched hollow', 'is cremated'],
  electric: ['falls crispy', 'is flash-fried', 'is burned out', 'short-circuits'],
  ice: ['shatters', 'is frozen through', 'cracks apart', 'is entombed in ice'],
  slash: ['is cleaved in two', 'is carved apart', 'is unseamed', 'is hewn down'],
  pierce: ['slumps, skewered', 'is run through', 'is pinned', 'is transfixed'],
  crush: ['crumples', 'is pulverized', 'is broken flat', 'is smashed down'],
  poison: ['chokes and collapses', 'withers', 'goes still, poisoned'],
  earth: ['is buried', 'is entombed', 'is ground to rubble'],
  hack: ['is deleted', 'segfaults', 'is corrupted through', 'is null-routed'],
  claw: ['is savaged', 'is torn apart', 'is mangled'],
}

/** Short victim-predicate for "The {victim} {predicate}." log lines.
 *  Prefers a family-flavored pool when one exists, falls through to
 *  the generic pool otherwise. Never returns the empty string. */
export function pickDeathPredicate(family: DamageFamily | 'poison' | undefined, rng: Rng): string {
  const pool = family ? FAMILY_PREDICATES[family] : undefined
  const useFamily = rng.chance(FAMILY_BIAS)
  if (pool && pool.length > 0 && useFamily) {
    return rng.pick(pool)
  }
  return rng.pick(GENERIC_PREDICATES)
}
