import type { Character } from '../character/types'
import { getSpellList } from './library'
import type { SpellDef } from './types'

/**
 * Scripted spell progression — magic-using classes pick up new spells as they
 * level. A class is considered "magic-using" when its starting kit already
 * includes at least one spell (see WorldManifest.classes[].startingSpells).
 * Pure melee classes never unlock spells from progression.
 *
 * Progression is driven by `SpellDef.unlockLevel`:
 *   - lv1:  Magic Missile / Icepick / Psi-Bolt       (basic damage)
 *   - lv5:  Fireball / Overload / Mind Storm         (heavier damage)
 *   - lv7:  Chain Lightning / Daemon Cascade / ...   (multi-hit)
 *   - lv10: Ice Armor / Hardline / Cryo-Carapace     (self buff, +DEF)
 *   - lv15: True Heal / Trauma Reboot / Total Regen  (expensive self heal)
 *
 * Beyond level 15 we fall through to `generateSpellForLevel`, which today is
 * a deterministic stub that scales a generic bolt. The real LLM-integration
 * plan is to cache generated entries onto the character like curated content
 * (flagging `SpellDef.generated = true` so the cache-rehydrate path can tell
 * them apart).
 */

/** True when the class the character rolled actually cares about spells.
 *  Detected by looking at what they know or what they started with — if the
 *  character has at least one known spell, progression fires on level-up.
 *  Pure fighters (warrior, samurai) keep an empty `spells` array and skip
 *  the unlock path entirely. */
export function isMagicUser(character: Character): boolean {
  return (character.spells?.length ?? 0) > 0
}

/** Spells that match `unlockLevel === level` in the character's world. The
 *  returned list is already filtered to the ones the character hasn't
 *  learned yet so callers don't need to dedupe. */
export function unlocksForLevel(character: Character, level: number): SpellDef[] {
  const known = new Set(character.spells ?? [])
  return getSpellList(character.worldId).filter(
    (s) => s.unlockLevel === level && !known.has(s.id),
  )
}

/**
 * Stub for post-level-15 LLM-generated spells.
 *
 * This is a PLACEHOLDER: a real implementation would call the LLM with the
 * character's world/class context, cache the result on the character the way
 * curated content is cached, and flag `generated: true`. The stub returns a
 * scaled generic spell so the build stays green and the unlock pipeline is
 * testable end-to-end.
 *
 * TODO: replace with LLM generation + per-character cache. Wire into
 *       WORLD_SPELLS lookup so `getSpell(worldId, id)` finds generated spells
 *       as well as curated ones.
 */
export function generateSpellForLevel(
  character: Character,
  level: number,
): SpellDef {
  const n = Math.max(1, level - 14)
  const magicCost = 10 + n * 3
  const damage = 6 + n * 2
  return {
    id: `gen_spell_${character.worldId}_${level}`,
    name: `Ascendant Bolt ${n}`,
    level: 5,
    magicCost,
    description:
      'An emergent pattern from deeper practice. The world scripts stopped; the character kept going.',
    target: 'enemy',
    targetKind: 'mob',
    effect: { kind: 'damage', amount: damage },
    scrollIntRequirement: 18,
    unlockLevel: level,
    element: 'electric',
    generated: true,
  }
}

export interface SpellUnlockResult {
  /** Spells newly added to the character's known list. */
  unlocked: SpellDef[]
  /** True if any unlocked spell came from the generator (vs. curated). */
  includesGenerated: boolean
}

/**
 * Resolves the spells unlocked at `level`. For level ≤ 15 we look at curated
 * `unlockLevel` entries. For level ≥ 16 the LLM stub fires. No-op when the
 * character isn't a magic user or the curated slate at this level is already
 * known.
 */
export function spellUnlocksAt(
  character: Character,
  level: number,
): SpellUnlockResult {
  if (!isMagicUser(character)) return { unlocked: [], includesGenerated: false }
  const curated = unlocksForLevel(character, level)
  if (curated.length > 0) {
    return { unlocked: curated, includesGenerated: false }
  }
  // Past the scripted slate — LLM path (stubbed).
  if (level > 15) {
    return {
      unlocked: [generateSpellForLevel(character, level)],
      includesGenerated: true,
    }
  }
  return { unlocked: [], includesGenerated: false }
}
