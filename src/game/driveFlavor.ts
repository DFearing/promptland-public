import type { Rng } from '../rng'
import type { Drive } from './drives'

// Log lines for when a character's primary drive shifts. Called from
// the explore tick — the picker gets a name substitution and returns a
// one-liner to push as a narrative entry. Multiple variants per drive
// (7-10 each) so a long session doesn't see the same line twice.

const HUNGER_LINES: readonly string[] = [
  "{name}'s belly rumbles aggressively and can no longer be ignored.",
  "{name}'s stomach turns inside out demanding attention.",
  "{name}'s thoughts start drifting to the last warm meal they had.",
  '{name} catches themselves looking at a nearby mushroom a little too long.',
  '{name} swallows, dry, and starts weighing any detour that leads to food.',
  "{name}'s pace slows; hunger is doing the thinking now.",
  '{name} licks chapped lips and mutters something about a hot bowl.',
  '{name} starts planning their next stop around where a meal might be.',
  "{name}'s stomach folds into a knot and demands satisfaction.",
]

const FATIGUE_LINES: readonly string[] = [
  "{name}'s boots feel twice as heavy as they did a moment ago.",
  "{name}'s eyelids start drooping between steps.",
  '{name} considers sitting down for just a second, just one.',
  "{name}'s shoulders have been aching for hours and they only just noticed.",
  "{name}'s limbs move like they belong to someone else.",
  '{name} starts yearning for a quiet bed somewhere.',
  "{name}'s breath comes slower; the body wants rest, now.",
  '{name} rubs at tired eyes and keeps moving out of stubbornness.',
  "{name}'s feet drag; every step is a negotiation.",
]

const GREED_LINES: readonly string[] = [
  "{name}'s thoughts turn to coin and how much lighter their purse is than they'd like.",
  '{name} starts calculating what the next haul could buy.',
  '{name} daydreams about the weight of a full coin pouch.',
  '{name} eyes every shadowy corner for a glint of gold.',
  "{name}'s fingers itch for something shiny to call their own.",
  "{name}'s appetite for treasure starts crowding out every other thought.",
  '{name} starts wondering which way the richest troubles lie.',
  "{name}'s inner merchant wakes up and starts asking for a cut.",
  '{name} silently promises themselves the next fight will pay better.',
]

const CURIOSITY_LINES: readonly string[] = [
  '{name} catches themselves staring at a distant door nobody has opened.',
  "{name}'s attention drifts to the unmapped parts of the area.",
  '{name} can feel the edge of the map tugging at them.',
  '{name} pauses, wondering what might be around the next bend.',
  '{name} feels the old itch — the places left unseen.',
  "{name}'s map memory surfaces and highlights every blank spot.",
  '{name} starts mentally drawing lines toward rooms they have not yet visited.',
  '{name} wants to know, and the wanting is louder than the walking.',
  '{name} feels the explorer in them stirring awake.',
]

const WEIGHT_LINES: readonly string[] = [
  '{name} shifts the pack on their shoulders; it has grown heavy.',
  "{name}'s load is pulling at every step.",
  '{name} starts wondering what they could part with next time a merchant is in sight.',
  '{name} pauses to shift the weight of their gear, wincing.',
  '{name} catches themselves bent forward from the load.',
  "{name}'s steps are shorter now — the bag has earned its own gravity.",
  '{name} starts glancing at items with an eye to offloading.',
  '{name} adjusts the straps; everything they own is demanding a second opinion.',
]

// Piety lines fire when the shrine pull becomes the dominant goal — the
// character's thoughts turn to the gods (or net, or archive) and a
// chapel-shaped destination starts to feel overdue. Kept faith-neutral
// so the same pool reads under fantasy / cyberpunk / sci-fi without
// re-skinning per world.
const PIETY_LINES: readonly string[] = [
  "{name}'s thoughts turn to the silence above the lanterns.",
  '{name} feels watched, as if from a long way off, and the feeling is not unkind.',
  '{name} remembers a candle they did not light.',
  '{name} starts looking for a place quiet enough to be heard in.',
  "{name}'s steps slow at the thought of an altar — a prayer is overdue.",
  '{name} catches themselves listening for something the road never says back.',
  '{name} feels the weight of a debt no purse will settle.',
  '{name} starts wanting somewhere lit by something other than torches.',
]

const LINES_BY_DRIVE: Record<Drive, readonly string[]> = {
  hunger: HUNGER_LINES,
  fatigue: FATIGUE_LINES,
  greed: GREED_LINES,
  curiosity: CURIOSITY_LINES,
  weight: WEIGHT_LINES,
  piety: PIETY_LINES,
}

/** Pick a narrative line announcing the character is now pursuing the
 *  given drive. Returns null when no variants exist (shouldn't happen
 *  for the five drives we ship). */
export function driveShiftLine(drive: Drive, characterName: string, rng: Rng): string | null {
  const pool = LINES_BY_DRIVE[drive]
  if (!pool || pool.length === 0) return null
  const tmpl = rng.pick(pool)
  return tmpl.replace(/\{name\}/g, characterName)
}
