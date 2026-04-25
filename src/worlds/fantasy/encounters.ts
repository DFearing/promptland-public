import type { RoomType } from '../../areas'

/** Fantasy-world encounter table: room type → mob archetype ids. */
export const FANTASY_ENCOUNTERS: Record<RoomType, string[]> = {
  safe: [],
  // Village outskirts: small vermin, crows, the occasional wolf.
  corridor: ['cave_rat', 'barrow_crow', 'marsh_adder', 'ragged_wolf', 'cellar_spider'],
  // The ruined mill and similar derelict structures: vermin + undead traces.
  chamber: ['cave_rat', 'cellar_spider', 'skeletal_scrap', 'barrow_crow'],
  // Deep undead territory.
  crypt: ['skeletal_scrap', 'lost_shade'],
  storage: ['cave_rat', 'cellar_spider'],
  inn: [],
  // Damp places attract adders and spiders.
  water: ['cellar_spider', 'marsh_adder'],
  portal: [],
  // The barrow mouth — heavier threat.
  entrance: ['barrow_crow', 'skeletal_scrap', 'hollow_knight'],
  shop: [],
  shrine: [],
  exit: [],
}
