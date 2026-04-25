import type { RoomType } from '../../areas'

/** Sci-fi-world encounter table: room type → mob archetype ids. */
export const SCIFI_ENCOUNTERS: Record<RoomType, string[]> = {
  safe: [],
  corridor: ['maintenance_bot', 'vent_crawler'],
  chamber: ['maintenance_bot', 'vent_crawler', 'boarding_drone'],
  crypt: ['boarding_drone', 'reactor_wraith'],
  storage: ['maintenance_bot', 'vent_crawler'],
  inn: [],
  water: ['vent_crawler'],
  portal: [],
  entrance: ['maintenance_bot'],
  shop: [],
  shrine: [],
}
