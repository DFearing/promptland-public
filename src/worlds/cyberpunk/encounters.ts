import type { RoomType } from '../../areas'

/** Cyberpunk-world encounter table: room type → mob archetype ids. */
export const CYBERPUNK_ENCOUNTERS: Record<RoomType, string[]> = {
  safe: [],
  corridor: ['street_punk', 'scav_hound'],
  chamber: ['street_punk', 'scav_hound', 'security_drone'],
  crypt: ['security_drone', 'netrunner_ghost'],
  storage: ['street_punk', 'scav_hound'],
}
