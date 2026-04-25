import type { Character, JournalEntry, JournalEntryKind } from '../character'
import { deathClause } from '../combat'
import type { LogEntry } from '../log'
import { Rng } from '../rng'
import { getSpell } from '../spells'
import type { WorldContent } from '../worlds'

/**
 * Derives journal entries from a state transition.
 *
 * Mirrors the effects pipeline (`deriveEvents`) in spirit: given a
 * before/after character snapshot plus the log entries produced during
 * the tick, returns the list of journal entries that should be
 * appended. All "first-ever" dedupe is resolved against the existing
 * journal on `next` — a second kill of a mob archetype produces no
 * journal entry even if the log says "loot/mobDefeat" for the same id.
 *
 * Staying pure + diff-based means:
 *   1. All journal logic is here, not scattered across tick handlers.
 *   2. Log entries carry the context (mobId, itemId, areaId, rarity,
 *      curated flag) and the character state carries the aggregate
 *      history (level, deaths, visitedRooms) — we read both.
 *   3. No need to thread a journal append through every sub-handler.
 */
export function deriveJournalEntries(
  prev: Character,
  next: Character,
  newLogEntries: readonly LogEntry[],
  world: WorldContent,
): JournalEntry[] {
  const adds: JournalEntry[] = []
  const now = Date.now()
  const existing = next.journal ?? []
  const seenInDerivation = new Set<string>() // kind:id keys guard against dup adds within this derivation

  // --- Area discovered -----------------------------------------------------
  // Diff visitedRooms for new area ids. The log may also carry `kind:
  // 'area'` with an areaId that predates the character's first visit
  // (e.g. discovery banner at character creation), so we union both
  // sources and dedupe via `existing`.
  const prevAreas = areaIdsFromVisitedRooms(prev.visitedRooms)
  const nextAreas = areaIdsFromVisitedRooms(next.visitedRooms)
  const areasFromLog = new Set<string>()
  for (const e of newLogEntries) {
    if (e.kind === 'area' && e.areaId) areasFromLog.add(e.areaId)
  }
  const journaledAreas = journaledAreaIdSet(existing)
  for (const areaId of new Set([...nextAreas].filter((a) => !prevAreas.has(a)).concat([...areasFromLog]))) {
    if (journaledAreas.has(areaId)) continue
    const key = `area-discovered:${areaId}`
    if (seenInDerivation.has(key)) continue
    seenInDerivation.add(key)
    const area = world.areas?.find((a) => a.id === areaId) ?? world.startingArea
    adds.push({
      at: now,
      areaId,
      kind: 'area-discovered',
      text: `Discovered ${area.name}.`,
    })
  }

  // --- Level-ups -----------------------------------------------------------
  // Diff character.level. A single tick can grant multiple levels via
  // XP overflow, so emit one entry per bump.
  if (next.level > prev.level) {
    for (let lvl = prev.level + 1; lvl <= next.level; lvl++) {
      adds.push({
        at: now,
        areaId: next.position.areaId,
        kind: 'level-up',
        text: `Reached level ${lvl}.`,
        meta: { fromLevel: lvl - 1, toLevel: lvl },
      })
    }
  }

  // --- Spells learned ------------------------------------------------------
  // Diff the character's known spell list. Spell unlocks today fire from
  // level-ups (see applyOneLevel in tick.ts) but the diff is intentionally
  // source-agnostic so future scroll-learned spells fall into the same
  // pipeline. Scoped to the area where the level happened — same as the
  // level-up entry so they cluster together in the panel.
  const prevSpells = new Set(prev.spells ?? [])
  const newSpellIds = (next.spells ?? []).filter((id) => !prevSpells.has(id))
  if (newSpellIds.length > 0) {
    for (const spellId of newSpellIds) {
      const spell = getSpell(next.worldId, spellId)
      const spellName = spell?.name ?? spellId
      adds.push({
        at: now,
        areaId: next.position.areaId,
        kind: 'spell-learned',
        text: `Learned ${spellName}.`,
        meta: { spellId, spellName },
      })
    }
  }

  // --- Deaths --------------------------------------------------------------
  // Diff deaths.length. Deaths are scoped to where they happened (from
  // the DeathRecord), not where the character respawned.
  const prevDeathCount = prev.deaths?.length ?? 0
  const nextDeathCount = next.deaths?.length ?? 0
  if (nextDeathCount > prevDeathCount) {
    for (let i = prevDeathCount; i < nextDeathCount; i++) {
      const record = next.deaths[i]
      if (!record) continue
      const mobName = record.mobName ?? 'something'
      const roomPhrase = record.roomName ? ` in the ${record.roomName}` : ''
      // Use a fresh rotation-picked predicate for the journal entry,
      // independent of what the death log narrative showed. Two rolls
      // means the journal reads like a diary recap, not a transcript.
      const clause = record.cause ?? deathClause(mobName, undefined, Rng.random())
      const capClause = clause.charAt(0).toUpperCase() + clause.slice(1)
      adds.push({
        at: record.at,
        areaId: record.areaId,
        kind: 'death',
        text: `${capClause}${roomPhrase}.`,
        meta: { mobName, roomName: record.roomName, cause: record.cause },
      })
    }
  }

  // --- Mob first-defeat / boss-defeat -------------------------------------
  // Scan new log entries for `kind: 'loot'` with `mobDefeat: true`.
  // Dedupe by mobId against existing journal + within-derivation set so
  // a second defeat of the same archetype in the same tick doesn't
  // double-log. `curated` bit on the log entry promotes the kind to
  // boss-defeat; set-piece kills read louder in the panel.
  const journaledMobIds = journaledIdSet(existing, 'mob-first-defeat')
  for (const kind of ['boss-defeat', 'mob-first-defeat'] as const) {
    for (const id of journaledIdSet(existing, kind)) journaledMobIds.add(id)
  }
  for (const e of newLogEntries) {
    if (e.kind !== 'loot') continue
    if (!e.meta?.mobDefeat) continue
    const mobId = e.meta.mobId
    if (!mobId) continue
    if (journaledMobIds.has(mobId)) continue
    const isBoss = e.meta.curated === true
    // Gate unit first-kill entries on rarity: common/uncommon archetypes
    // are "so what" kills and flood the journal. Rare+ or curated bosses
    // make the cut. Boss kills bypass the rarity filter because curated
    // is an explicit flag that promotes them unconditionally.
    if (!isBoss) {
      const rarity = e.meta.mobRarity
      const isRarePlus =
        rarity === 'rare' || rarity === 'epic' || rarity === 'legendary'
      if (!isRarePlus) continue
    }
    const key = `mob:${mobId}`
    if (seenInDerivation.has(key)) continue
    seenInDerivation.add(key)
    journaledMobIds.add(mobId)
    const journalKind: JournalEntryKind = isBoss ? 'boss-defeat' : 'mob-first-defeat'
    const roomName = e.meta.roomName
    const mobName = e.meta.mobName ?? mobId
    adds.push({
      at: now,
      areaId: e.meta.areaId ?? next.position.areaId,
      kind: journalKind,
      text: isBoss
        ? `Defeated ${mobName}${roomName ? ` in the ${roomName}` : ''}.`
        : `First kill: ${mobName}.`,
      meta: {
        mobId,
        mobName,
        mobRarity: e.meta.mobRarity,
        roomName,
      },
    })
  }

  // --- Item first-loot -----------------------------------------------------
  // Loot lines without `mobDefeat` are item pickups. Only log
  // equipment, scrolls, and rare+ junk — every cave-rat-tail would
  // flood the journal otherwise. Dedupe against existing + this
  // derivation.
  //
  // Batched-pickup lines (multiple items per log entry) carry an
  // `items` array; iterate it so each item gets its own first-find
  // gate. Legacy single-item entries fall back to the top-level
  // itemName/itemId fields.
  const journaledItemIds = journaledIdSet(existing, 'item-first-loot')
  for (const e of newLogEntries) {
    if (e.kind !== 'loot') continue
    const meta = e.meta
    if (!meta) continue
    if (meta.mobDefeat) continue
    const candidates = meta.items && meta.items.length > 0
      ? meta.items.map((it) => ({
          id: it.id,
          name: it.name,
          rarity: it.rarity ?? 'common',
        }))
      : meta.itemId
        ? [{
            id: meta.itemId,
            name: meta.itemName ?? '',
            rarity: meta.itemRarity ?? 'common',
          }]
        : []
    for (const candidate of candidates) {
      const itemId = candidate.id
      if (!itemId) continue
      if (journaledItemIds.has(itemId)) continue
      const key = `item:${itemId}`
      if (seenInDerivation.has(key)) continue
      const def = world.items.find((i) => i.id === itemId)
      if (!def) continue
      const rarity = candidate.rarity
      // Gate first-item entries on rare+ — mirrors the effects
      // pipeline (see effects/derive.ts) so a rare+ pickup lights
      // up BOTH the fullscreen banner and the journal; common/
      // uncommon pickups stay out of both surfaces.
      const isRarePlus =
        rarity === 'rare' || rarity === 'epic' || rarity === 'legendary'
      if (!isRarePlus) continue
      seenInDerivation.add(key)
      journaledItemIds.add(itemId)
      adds.push({
        at: now,
        areaId: meta.areaId ?? next.position.areaId,
        kind: 'item-first-loot',
        text: `First find: ${candidate.name || def.name}.`,
        meta: {
          itemId,
          itemName: candidate.name || def.name,
          itemRarity: rarity,
        },
      })
    }
  }

  return adds
}

// --- internal helpers -----------------------------------------------------

function areaIdsFromVisitedRooms(keys: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const k of keys) {
    const areaId = k.split(':')[0]
    if (areaId) out.add(areaId)
  }
  return out
}

function journaledAreaIdSet(journal: readonly JournalEntry[]): Set<string> {
  const out = new Set<string>()
  for (const e of journal) {
    if (e.kind === 'area-discovered') out.add(e.areaId)
  }
  return out
}

function journaledIdSet(
  journal: readonly JournalEntry[],
  kind: JournalEntryKind,
): Set<string> {
  const out = new Set<string>()
  for (const e of journal) {
    if (e.kind !== kind) continue
    if (kind === 'item-first-loot' && e.meta?.itemId) out.add(e.meta.itemId)
    else if ((kind === 'mob-first-defeat' || kind === 'boss-defeat') && e.meta?.mobId)
      out.add(e.meta.mobId)
  }
  return out
}
