import type { RoomType } from '../../areas'

/** Fantasy-world encounter table: room type → mob archetype ids. */
export const FANTASY_ENCOUNTERS: Record<RoomType, string[]> = {
  safe: [],
  corridor: ['cave_rat', 'cellar_spider'],
  chamber: ['cave_rat', 'cellar_spider', 'skeletal_scrap'],
  crypt: ['skeletal_scrap', 'lost_shade'],
  storage: ['cave_rat', 'cellar_spider'],
}
