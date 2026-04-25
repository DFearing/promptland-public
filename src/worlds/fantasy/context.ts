import type { WorldContextDefaults } from '../../llm/templates'

// Code-authored LLM prompt context for the fantasy world. Empty strings render
// as nothing. Every prompt for this world receives `world` as a shared header;
// scope-specific blobs are layered in on top depending on what's being
// generated.
//
// Voice target: low-fantasy, candle-lit, medieval European. Spare sensory
// prose over florid imagery. Wear, rust, weather. Magic is rare enough to
// startle. See src/worlds/fantasy/area.ts for the voice these prompts should
// reproduce.
export const FANTASY_CONTEXT: WorldContextDefaults = {
  world:
    'Fantasy here is low-magic and grounded: iron, wood, rain, candle-smoke. Magic is rare enough that a cantrip still draws stares. Vocabulary skews medieval European — guilds, shrines, keeps, warrens, freeholds — not high Tolkien. Gods are worshipped but usually silent. Violence is bloody and consequential. Prefer spare, sensory prose over florid imagery. Avoid modern idiom, gunpowder, and industrial terms.',
  // Shared rarity ladder — applies to every template when a rarity is passed.
  // `common` is intentionally absent; the scope's `any` baseline already is
  // the common voice. Each blob carries both voice (tone, register) and
  // length guidance, so the templates no longer need hard character caps.
  rarity: {
    uncommon:
      'Uncommon. One distinctive detail sets this apart from the ordinary — a named material, an unusual marking, a visible history of use. Length: one full sentence, around 100-150 characters. Voice is observant, not reverent.',
    rare:
      'Rare. A named feature, a regional style, or local reputation. Someone cared about this, or feared it. Length: one weighted sentence, around 150-220 characters. No padding; every clause earns its place.',
    epic:
      'Epic. History is visible in it: a previous owner, a known event, an acknowledged power. Length: 1-2 sentences, around 220-320 characters. Rhythm slows; one concrete image should stay with the player.',
    legendary:
      'Legendary — songworthy. A name, a maker, a curse, or a moment preserved in it. Length: 2-3 sentences, around 300-450 characters. Formal and weighted, almost liturgical. Let the prose carry the rarity; never announce it.',
  },
  item: {
    junk: {
      any: 'Junk is trash with texture: a broken buckle, a cracked clay pipe, a knucklebone worn smooth. One concrete object. Value should be ambiguous — a keepsake, a curio, or something a rag-trader will weigh by the handful.',
    },
    consumable: {
      any: "Consumables are homemade or apothecary-grade: stoppered vials, waxed cloth bundles, crusted poultices, honey-jars, salted strips of meat. Name the form before the effect — a 'stoppered vial of red' before a 'healing potion'.",
    },
    equipment: {
      any: 'Equipment is forged, carved, or cured — never manufactured. Wear shows. Prefer material words (iron, bronze, leather, oak, horn) over adjectives. A sword is a sword; save "gleaming" for when it matters. Magical equipment is rare and acknowledged as such.',
    },
    scroll: {
      any: "Scrolls are hand-copied onto vellum, goatskin, or scavenged paper, often badly. The scribe's hand shows through: a nervous priest, a drunken apprentice, a condemned mage. Binding is string, wax, or a twist of hair.",
    },
  },
  mob: {
    any: 'Fantasy mobs lean physical and desperate: cave vermin, brigands, hungry beasts, cursed men, bog-things, dishonoured knights. Names are 1-3 words with at most one modifier (a noun with one adjective or compound). Something in the name or description should suggest hard use — mange, rust, a limp, a grudge.',
  },
  area: {
    settlement: {
      any: 'Settlements are small: a clutch of wooden houses around a shrine, a market behind a palisade, a freehold at a crossroads. The road through is mud three seasons of the year. Name one inn, one god, one grievance. People are wary of outsiders but will trade.',
    },
    wilderness: {
      any: 'Wilderness is indifferent, not beautiful. Tangled trees, wet air, paths that are suggestions. Something has passed through recently — droppings, broken branches, a boot print deeper on one side. The weather is usually working against you.',
    },
    dungeon: {
      any: "Dungeons are someone's old project — a tomb, a prison, a buried temple, a dwarfhold gone feral. The builders are gone, their marks remain: stonework, sconces, a carved god no one worships anymore. Humidity. Bats. The sound of water in another room.",
    },
    ruin: {
      any: 'Ruins are half-reclaimed. Roots push through flagstones; ivy has eaten half the wall. Whatever this was — a manor, a tower, a chapel, a battlefield — a newer, meaner thing has moved in. The stone remembers, the tenants do not.',
    },
  },
  room: {
    safe: {
      any: "Safe rooms are reprieve, not comfort. A dry corner, a burned-out hearth, a collapsed passage the thing can't fit through. The character can sit here, but they won't sleep deep. Show the quiet, then hint at what's beyond it.",
    },
    corridor: {
      any: 'Corridors are transit with character. Note the floor (flagstone, packed dirt, rotted board), one feature (a sconce, a crack, a mural worn smooth), and one trace of prior occupants (a dropped coin, a scorch mark, graffiti scratched low).',
    },
    chamber: {
      any: "Chambers held a purpose once — a scribe's room, a kitchen, a council hall, a guardroom — and that purpose is half-visible. Furniture is broken or missing. One unexpected detail (a birdsnest, a bloodstain, a melted candle) hints at who's been here since.",
    },
    crypt: {
      any: 'Crypts are stone and silence: sarcophagi, niches, bone-shelves. Carvings praise the long-forgotten dead in a dead tongue. The air is dry and tastes of dust; the only sound is your own breath. Something should not be where it was left.',
    },
    storage: {
      any: 'Storage rooms are memory made material: sacks of ruined grain, splintered crates, rope too brittle to use, barrels with the hoops sprung. Most of it is worthless; one thing is not. Rats. Mould. The smell of something that was once food.',
    },
    inn: {
      any: "Inns are the warmest thing in a cold country: hearth-smoke, ale fumes, the low murmur of travellers avoiding eye contact. Floors stained, tables knife-scored. Someone is always singing badly. The innkeep knows more than they say.",
    },
    water: {
      any: 'Water rooms give honest drink — a cistern, a well, a stone basin older than the building around it. The water is cold even in summer and tastes faintly of mineral. Old offerings sometimes bob at the edge.',
    },
    portal: {
      any: 'Portals are doors that should not be: a stone archway with no wall, a spiral of chalk on the flagstones, a mirror that shows the wrong room. Step through and the air changes temperature. Few makers of such things are left now.',
    },
    entrance: {
      any: 'Entrances announce a threshold: the mouth of a cave, a broken gate, a stair descending into colder air. Warnings carved in a hand that is not from around here. Whoever came through last either came back changed, or did not come back.',
    },
    shop: {
      any: 'Shops are small and cluttered: a counter of scarred wood, shelves crowded behind, a ledger the shopkeep pretends not to consult. Merchandise is haggled over rather than priced. A locked cabinet under the counter holds what they do not display.',
    },
    shrine: {
      any: 'Shrines are small bright rooms in dark places: a painted statue worn smooth at the feet, a candle burning itself hollow, coins and beads left by hands you will never see. The saint here is lesser-known — a local martyr, a hedgerow guardian.',
    },
  },
  lore: {
    any: 'Fantasy lore carries the weight of centuries without grand cosmic stakes. Kingdoms rose and fell; saints lived and were martyred; a plague reshaped a generation. The speaker should sound like they are quoting someone older. Prefer concrete proper nouns (Thornfall, Aelric, the Grey Watch) over generic titles (the Empire, the Chosen One).',
  },
}
