import type { DamageFamily } from './verbs'

// Combined attack+kill flavor lines for severe / critical killing blows.
// When the fight loop lands a strike that both crosses the severity bar
// AND zeroes the mob, the standard "damage line + defeat line" pair is
// replaced with a single line drawn from this table — keyed by damage
// family so a sword kill, a fireball kill, and a hack kill each read
// distinct.
//
// Hard rule: NO MOB ANATOMY. Mobs are generic — they have no skull,
// no spine, no neck, no guts. Templates describe the action and the
// outcome ("cleaves cleanly in half", "buries under stone") without
// naming body parts. "{name}" expands to the attacker, "{mob}" expands
// to the target.

type Family = DamageFamily | 'generic'

const SLASH_KILLS: readonly string[] = [
  '{name} cleaves the {mob} cleanly in half.',
  '{name} carves the {mob} from end to end.',
  '{name} slices the {mob} into ribbons.',
  '{name} severs the {mob} with a single sweep.',
  '{name} reduces the {mob} to ruin with a final cut.',
  '{name} cuts the {mob} down where it stands.',
  '{name} opens the {mob} from one end to the other.',
  '{name} ends the {mob} with a clean stroke.',
  '{name} splits the {mob} with a final swing.',
  '{name} cleaves through the {mob} and the fight ends with it.',
]

const CRUSH_KILLS: readonly string[] = [
  '{name} hammers the {mob} into stillness.',
  '{name} drives the {mob} to the ground and leaves it there.',
  '{name} pulps the {mob} with a final blow.',
  '{name} flattens the {mob} into the dirt.',
  '{name} pounds the {mob} into the earth.',
  '{name} smashes the {mob} apart in one swing.',
  '{name} batters the {mob} until nothing answers back.',
  '{name} crushes the {mob} into a heap.',
  '{name} hammers the {mob} into the floor and walks on.',
  '{name} delivers a final blow that ends the {mob} for good.',
]

const PIERCE_KILLS: readonly string[] = [
  '{name} runs the {mob} through completely.',
  '{name} pins the {mob} in place permanently.',
  '{name} skewers the {mob} clean through.',
  '{name} drives the point home and the {mob} falls still.',
  '{name} punctures the {mob} with a final, decisive thrust.',
  '{name} stakes the {mob} where it stands.',
  '{name} drives a final point through the {mob}.',
  '{name} ends the {mob} with one perfect thrust.',
  '{name} runs the {mob} clean through and leaves it there.',
  '{name} buries the point in the {mob} and twists it free.',
]

const FIRE_KILLS: readonly string[] = [
  '{name} reduces the {mob} to a smear of ash.',
  '{name} immolates the {mob} where it stands.',
  '{name} engulfs the {mob} in a final wash of flame.',
  '{name} burns the {mob} to nothing.',
  '{name} sets the {mob} alight and watches it crumble.',
  '{name} cooks the {mob} until only embers remain.',
  '{name} scorches the {mob} into oblivion.',
  '{name} ignites the {mob} until there is nothing left to burn.',
  '{name} torches the {mob} until the air is empty of it.',
  '{name} burns the {mob} away in a single furious instant.',
]

const ICE_KILLS: readonly string[] = [
  '{name} freezes the {mob} solid and shatters it.',
  '{name} encases the {mob} in ice and lets it crack apart.',
  '{name} flash-freezes the {mob} into stillness.',
  '{name} entombs the {mob} in frost forever.',
  '{name} frosts the {mob} until it splinters.',
  '{name} stills the {mob} in unbreaking cold.',
  '{name} traps the {mob} inside its own brittle silence.',
  '{name} freezes the {mob} so fast it never finishes its last sound.',
  '{name} drops the {mob} into a final, glassy hush.',
  '{name} chills the {mob} past the point it can ever return from.',
]

const ELECTRIC_KILLS: readonly string[] = [
  '{name} lights the {mob} up with a final arc.',
  '{name} grounds the {mob} once and for all.',
  '{name} sends a final surge through the {mob}.',
  '{name} fries the {mob} into smoking silence.',
  '{name} discharges into the {mob} until nothing twitches.',
  '{name} cooks the {mob} from the inside out.',
  '{name} electrocutes the {mob} into a final spasm.',
  '{name} jolts the {mob} until it stops jolting back.',
  '{name} pours current into the {mob} and the fight ends with a crack.',
  '{name} snaps a final bolt through the {mob}.',
]

const EARTH_KILLS: readonly string[] = [
  '{name} buries the {mob} under a final cascade of stone.',
  '{name} crushes the {mob} beneath a slab of rock.',
  '{name} entombs the {mob} where it falls.',
  '{name} grinds the {mob} into the bedrock.',
  '{name} dissolves the {mob} into the dust it came from.',
  '{name} pins the {mob} under a weight it cannot lift.',
  '{name} swallows the {mob} into the ground.',
  '{name} buries the {mob} deep and leaves no marker.',
  '{name} returns the {mob} to the earth in pieces.',
  '{name} smothers the {mob} under unyielding stone.',
]

const HACK_KILLS: readonly string[] = [
  '{name} corrupts the {mob} until its routines flatline.',
  '{name} crashes the {mob} for good.',
  '{name} kernel-panics the {mob} into permanent stop.',
  '{name} purges the {mob} from the local stack.',
  '{name} hard-resets the {mob} into zeroes.',
  '{name} formats the {mob} where it stands.',
  '{name} forks the {mob} until it forks itself to death.',
  '{name} drops the {mob}’s session and never reopens it.',
  '{name} terminates the {mob} with extreme prejudice.',
  '{name} writes a final null over the {mob}.',
]

const CLAW_KILLS: readonly string[] = [
  '{name} strikes the {mob} down with bare hands.',
  '{name} tears into the {mob} until it goes still.',
  '{name} ends the {mob} with one final swing.',
  '{name} lays into the {mob} until it gives up entirely.',
  '{name} batters the {mob} into stillness.',
  '{name} rips the {mob} apart with a savage final strike.',
  '{name} pounds the {mob} into the ground.',
  '{name} ends the {mob} with raw force.',
  '{name} drops the {mob} with a single brutal blow.',
  '{name} delivers a finishing strike that the {mob} cannot answer.',
]

const GENERIC_KILLS: readonly string[] = [
  '{name} ends the {mob} in a single decisive blow.',
  '{name} brings the {mob} down for good.',
  '{name} drops the {mob} where it stands.',
  '{name} finishes the {mob} on the spot.',
  '{name} delivers the killing blow to the {mob}.',
  '{name} ends the fight with the {mob} in one stroke.',
  '{name} fells the {mob} with a final, definitive strike.',
  '{name} closes the fight with the {mob} on the floor.',
  '{name} puts the {mob} down with terrible finality.',
  '{name} strikes the {mob} a final time and it does not rise.',
]

export const KILL_LINES_BY_FAMILY: Record<Family, readonly string[]> = {
  slash: SLASH_KILLS,
  crush: CRUSH_KILLS,
  pierce: PIERCE_KILLS,
  fire: FIRE_KILLS,
  ice: ICE_KILLS,
  electric: ELECTRIC_KILLS,
  earth: EARTH_KILLS,
  hack: HACK_KILLS,
  claw: CLAW_KILLS,
  generic: GENERIC_KILLS,
}

/** Picks a combined kill line for the given family, substituting in the
 *  attacker and target names. Unknown / undefined families fall through
 *  to the generic pool so a kill never goes unflavored. */
export function pickCombinedKillLine(
  family: Family | undefined,
  characterName: string,
  mobName: string,
): string {
  const set =
    family !== undefined && KILL_LINES_BY_FAMILY[family] !== undefined
      ? KILL_LINES_BY_FAMILY[family]
      : KILL_LINES_BY_FAMILY.generic
  const tpl = set[Math.floor(Math.random() * set.length)]
  return tpl.replace(/\{name\}/g, characterName).replace(/\{mob\}/g, mobName)
}
