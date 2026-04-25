import { currentTitle, currentTitleIndex } from './titles'
import type { Character } from './types'

export type ActorContext = 'log' | 'log-milestone' | 'npc-greeting'

/** Title index at which the character's personal name starts appearing in
 *  routine log lines — before this they're "the Wayfarer", anonymous. */
const INTRODUCED_AT = 5
/** Title index at which the title rejoins the name in the log — they're
 *  now known well enough that both appear together ("Wayfarer Hiro"). */
const KNOWN_AT = 15
/** Title index at which the title moves from leading the name to trailing
 *  it — "Hiro the Warlock". Marks the transition from working
 *  adventurer to recognized hero. */
const LEGENDARY_AT = 25

/** Compose the character's displayed actor name for a given context. See
 *  docs at the call sites for which context to pass; the three forms are:
 *  "Wayfarer Hiro" (early), bare "Hiro" (mid), "Hiro the Warlock" (late),
 *  with NPC greetings also capable of the anonymous title-only "Wayfarer"
 *  at the bottom end. Falls back to the bare name when the character has
 *  no title yet (shouldn't happen in shipping worlds — every world
 *  defines a `birthTitle` — but handled gracefully). */
export function formatActorName(c: Character, ctx: ActorContext = 'log'): string {
  const title = currentTitle(c).text
  const name = c.name
  const idx = currentTitleIndex(c.level)
  if (!title) return name

  if (ctx === 'npc-greeting') {
    // Birth title ("Wayfarer") is class-neutral and stands alone. Every
    // other tier includes the name — class-specific titles like
    // "Apprentice" / "Novice" without a name read as a missing word
    // ("catches Apprentice off guard!").
    if (idx === 0) return title
    if (idx < LEGENDARY_AT) return `${title} ${name}`
    return `${name} the ${title}`
  }

  if (ctx === 'log-milestone') {
    if (idx < LEGENDARY_AT) return `${title} ${name}`
    return `${name} the ${title}`
  }

  // 'log' — routine third-person line. Four-stage identity arc matching
  // the sheet header's star tiers: anonymous title → personal name →
  // title and name together → title inverted behind the name.
  if (idx < INTRODUCED_AT) return title                     // "Wayfarer"
  if (idx < KNOWN_AT)      return name                      // "Hiro"
  if (idx < LEGENDARY_AT)  return `${title} ${name}`        // "Wayfarer Hiro"
  return `${name} the ${title}`                             // "Hiro the Warlord"
}
