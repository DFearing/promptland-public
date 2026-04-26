import type { Character, LevelSegment, LevelUpRecord } from '../character'
import { castingStatValue, formatActorName, resolveTitle, titleIndexForLevel, xpToNextLevel } from '../character'
import type { StatCode } from '../worlds/types'
import type { LogEntry } from '../log'
import { Rng } from '../rng'
import { registerGeneratedSpell, spellUnlocksAt, type SpellDef } from '../spells'
import { getWorldManifest } from '../worlds'
import { favorTier, favorTierName } from './favor'
import { append } from './logCap'

// Randomized verbs for the level-up chapter entry — keeps the log from
// reading like a template every single time. Emoji is appended by applyXp.
const LEVEL_UP_VERBS = [
  'rises',
  'ascends',
  'climbs',
  'levels up',
  'steps up',
  'advances',
  'elevates',
  'strides forward',
  'soars',
  'breaks through',
]

// Funny rotations for the title-earned chapter line. All take bare name
// + bare title text — the line announces a fresh title, so it shouldn't
// route through formatActorName (which would try to pre-apply that very
// title). Tone is wry / understated, matching the dry game voice.
const TITLE_EARNED_LINES: Array<(name: string, title: string) => string> = [
  (n, t) => `Now everyone's gotta call ${n} the ${t}.`,
  (n, t) => `${n}'s a ${t} now, apparently.`,
  (n, t) => `Word's getting around. They're calling ${n} the ${t}.`,
  (n, t) => `The archive scratches in another line: ${n}, the ${t}.`,
  (n, t) => `Add another line to the books — ${n}, the ${t}.`,
  (n, t) => `${n} has earned a new title: ${t}. Whether ${n} wanted one or not.`,
]

export interface ApplyOneLevelOptions {
  /** XP cost recorded in the LevelUpRecord. Defaults to `xpToNextLevel(from)`
   *  so the dialog's "XP gained" column stays coherent when the helper is
   *  invoked outside the combat grind (e.g. the dev panel). */
  xpGained?: number
  /** Prepended to the chapter + narrative log lines. Dev-triggered level-ups
   *  use `[dev] ` so the log makes the synthetic origin obvious. */
  logPrefix?: string
  /** Clock injection for determinism in tests. */
  now?: number
  /** Per-character PRNG for deterministic verb/title picks. */
  rng: Rng
}

interface LevelGain {
  hp: number
  mp: number
  nextStats: Character['stats']
  /** Pretty "+1 STR / +1 CON" summary, or empty string for non-bump levels. */
  statText: string
}

/** Applies a single level-up's worth of gains (HP, MP, periodic stat bumps)
 *  plus the matching LevelUpRecord and narration. Shared between the combat
 *  XP flow (`applyXp`) and dev-panel handlers so both paths grow the
 *  character identically. */
export function applyOneLevel(
  character: Character,
  options: ApplyOneLevelOptions,
): { character: Character; logEntries: LogEntry[] } {
  const now = options.now ?? Date.now()
  const from = character.level
  const to = from + 1
  const gains = levelGainsFor(character, character.stats, to)
  const segment: LevelSegment = character.segment ?? {
    startedAt: character.createdAt,
    startGold: character.gold,
  }
  // Deaths this segment = death timestamps after the segment started.
  // Falls back to the previous level-up time (or createdAt) for characters
  // saved before `segment` was tracked, so old saves still get a sensible
  // count on their next level-up.
  const previousLevelUpAt =
    character.levelUps[character.levelUps.length - 1]?.at ?? character.createdAt
  const segmentStart = character.segment?.startedAt ?? previousLevelUpAt
  const deathsThisLevel = character.deaths.filter((d) => d.at > segmentStart).length
  // Saves this level mirrors the deaths counter — same segment-start
  // timestamp, same array-filter pattern. Pre-feature characters have
  // no `saved` array and report 0.
  const savesThisLevel = (character.saved ?? []).filter((s) => s.at > segmentStart).length
  // Favor tier transition for the level-up card. Snapshot the names
  // (not just indices) so the renderer doesn't have to look up the
  // manifest. Pre-feature segments default startFavorTier to the end
  // tier — no upgrade reported.
  const manifest = getWorldManifest(character.worldId)
  const endFavorTier = favorTier(character.favor)
  const startFavorTier = character.segment?.startFavorTier ?? endFavorTier
  const endFavorTierName = favorTierName(endFavorTier, manifest)
  const startFavorTierName = favorTierName(startFavorTier, manifest)
  const favorTierUpgraded = endFavorTier > startFavorTier
  // Resolve spell unlocks before constructing the record so the record
  // can snapshot them. `spellUnlocksAt` only reads `character.spells` and
  // `character.worldId`, so passing the pre-level-up character (with the
  // post-level number as the second arg) gives the same result as the
  // previous `baseUpdated`-based call.
  const unlockResult = spellUnlocksAt(character, to)
  const spellsKnown = new Set(character.spells ?? [])
  const learnedSpells: SpellDef[] = []
  for (const spell of unlockResult.unlocked) {
    if (spellsKnown.has(spell.id)) continue
    spellsKnown.add(spell.id)
    learnedSpells.push(spell)
    if (unlockResult.includesGenerated) {
      // Only generated entries need runtime registration; curated ones are
      // already in WORLD_SPELLS.
      registerGeneratedSpell(spell)
    }
  }

  const record: LevelUpRecord = {
    at: now,
    from,
    to,
    goldAtLevelUp: character.gold,
    xpGained: options.xpGained ?? xpToNextLevel(from),
    bestItem: segment.bestItem
      ? { name: segment.bestItem.name, rarity: segment.bestItem.rarity }
      : undefined,
    baddestEnemy: segment.baddestEnemy,
    gains: { hp: gains.hp, mp: gains.mp, statText: gains.statText },
    deathsThisLevel,
    savesThisLevel: savesThisLevel > 0 ? savesThisLevel : undefined,
    endFavorTierName,
    startFavorTierName,
    favorTierUpgraded: favorTierUpgraded || undefined,
    learnedSpells: learnedSpells.length > 0
      ? learnedSpells.map((s) => ({ id: s.id, name: s.name, level: s.level }))
      : undefined,
  }
  const baseUpdated: Character = {
    ...character,
    level: to,
    maxHp: character.maxHp + gains.hp,
    hp: character.hp + gains.hp,
    maxMagic: character.maxMagic + gains.mp,
    magic: character.magic + gains.mp,
    stats: gains.nextStats,
    spells: learnedSpells.length > 0
      ? [...(character.spells ?? []), ...learnedSpells.map((s) => s.id)]
      : character.spells,
    levelUps: [...character.levelUps, record],
    segment: {
      startedAt: now,
      startGold: character.gold,
      // The next segment opens at whatever tier the character ends this
      // level-up at — that's the baseline for the next segment's
      // "(up from X)" comparison.
      startFavorTier: endFavorTier,
    },
  }
  const prefix = options.logPrefix ?? ''
  const verb = options.rng.pick(LEVEL_UP_VERBS)
  const logEntries: LogEntry[] = [
    {
      kind: 'chapter',
      text: `${prefix}🎉✨⭐ ${formatActorName(character, 'log-milestone')} ${verb} to level ${to}! ⭐✨🎉`,
      meta: { name: formatActorName(character, 'log-milestone'), levelTo: to },
    },
  ]
  const parts: string[] = []
  if (gains.hp > 0) parts.push(`+${gains.hp} HP`)
  if (gains.mp > 0) parts.push(`+${gains.mp} MP`)
  if (gains.statText) parts.push(gains.statText)
  if (parts.length > 0) {
    logEntries.push({
      kind: 'narrative',
      text: `${prefix}${formatActorName(character, 'log-milestone')} feels stronger. (${parts.join(' · ')})`,
      meta: { name: formatActorName(character, 'log-milestone') },
    })
  }

  for (const spell of learnedSpells) {
    logEntries.push({
      kind: 'chapter',
      text: `${prefix}${formatActorName(character, 'log-milestone')} unlocks a new spell: ${spell.name}!`,
      meta: { name: formatActorName(character, 'log-milestone'), spellName: spell.name },
    })
    if (spell.description) {
      logEntries.push({
        kind: 'narrative',
        text: `${prefix}${spell.description}`,
        meta: { name: formatActorName(character, 'log-milestone'), spellName: spell.name },
      })
    }
  }

  return { character: baseUpdated, logEntries }
}

/** Awards XP and loops level-ups while the new total exceeds the
 *  per-level threshold. Title-earned lines fire as a side effect of
 *  crossing a title-index boundary. Returns early when no XP is gained
 *  (combat lines that net zero — e.g. friendly-fire) so the call site
 *  can avoid the spread allocation. */
export function applyXp(
  character: Character,
  gained: number,
  log: LogEntry[],
  rng: Rng,
): { character: Character; log: LogEntry[] } {
  if (gained <= 0) return { character, log }
  let working: Character = { ...character, xp: character.xp + gained }
  let updatedLog = log
  while (working.xp >= xpToNextLevel(working.level)) {
    const needed = xpToNextLevel(working.level)
    const { character: leveled, logEntries } = applyOneLevel(working, {
      xpGained: needed,
      rng,
    })
    working = { ...leveled, xp: working.xp - needed }
    for (const entry of logEntries) updatedLog = append(updatedLog, entry)
    // Does this new level grant a new title? `applyOneLevel` has already
    // bumped `working.level`, so the earned index reads straight off the
    // post-bump character without needing a projection.
    const titleIdx = titleIndexForLevel(working.level)
    if (titleIdx == null) continue
    const earned = resolveTitle(working, titleIdx)
    if (!earned.text) continue
    const titleLine = rng.pick(TITLE_EARNED_LINES)(character.name, earned.text)
    updatedLog = append(updatedLog, {
      kind: 'chapter',
      text: `🎉✨⭐ ${titleLine} ⭐✨🎉`,
      meta: {
        name: character.name,
        titleEarned: true,
        titleText: earned.text,
      },
    })
  }
  return { character: working, log: updatedLog }
}

/**
 * Per-level gains from a character's species + class. HP/MP are flat bumps
 * augmented by the CON / casting-stat mod — tougher bodies heal more, sharper
 * minds recover more magic. The casting stat defaults to `max(INT, WIS)` but
 * a class can pin it (Cleric → WIS) via `castingStat`.
 *
 * Two stat-bump tracks fire on level-up:
 *   - **Primary** (every `statBumpInterval` levels — class + species, additive)
 *   - **Secondary** (every `secondaryStatBumpInterval` levels, default 8 when
 *     the class declares a `secondaryStat`) — class only, +1 to the secondary.
 */
function levelGainsFor(
  character: Character,
  currentStats: Character['stats'],
  newLevel: number,
): LevelGain {
  const manifest = getWorldManifest(character.worldId)
  const species = manifest?.species.find((s) => s.id === character.speciesId)
  const klass = manifest?.classes.find((c) => c.id === character.classId)
  const classGrowth = klass?.growth ?? {}
  const speciesGrowth = species?.growth ?? {}

  const conMod = Math.max(0, Math.floor((currentStats.constitution - 10) / 2))
  const castingValue = castingStatValue(currentStats, klass?.castingStat)
  const mindMod = Math.max(0, Math.floor((castingValue - 10) / 2))
  const hp =
    (classGrowth.hpPerLevel ?? 0) + (speciesGrowth.hpPerLevel ?? 0) + conMod
  const mp =
    (classGrowth.mpPerLevel ?? 0) + (speciesGrowth.mpPerLevel ?? 0) + mindMod

  const interval = classGrowth.statBumpInterval ?? speciesGrowth.statBumpInterval ?? 0
  const primaryFires = interval > 0 && newLevel % interval === 0
  const secondaryInterval = klass?.secondaryStatBumpInterval ?? (klass?.secondaryStat ? 8 : 0)
  const secondaryFires = secondaryInterval > 0 && newLevel % secondaryInterval === 0

  const combined: Partial<Character['stats']> = {}
  if (primaryFires) {
    for (const key of Object.keys({
      ...(classGrowth.statBumps ?? {}),
      ...(speciesGrowth.statBumps ?? {}),
    }) as Array<keyof Character['stats']>) {
      const sum =
        (classGrowth.statBumps?.[key] ?? 0) +
        (speciesGrowth.statBumps?.[key] ?? 0)
      if (sum !== 0) combined[key] = (combined[key] ?? 0) + sum
    }
  }
  if (secondaryFires && klass?.secondaryStat) {
    const key = STAT_CODE_TO_KEY[klass.secondaryStat]
    combined[key] = (combined[key] ?? 0) + 1
  }

  if (Object.keys(combined).length === 0) {
    return { hp, mp, nextStats: currentStats, statText: '' }
  }
  const bumped = { ...currentStats }
  const bumpLabels: string[] = []
  for (const [k, v] of Object.entries(combined) as Array<[
    keyof Character['stats'],
    number,
  ]>) {
    bumped[k] = bumped[k] + v
    bumpLabels.push(`+${v} ${STAT_ABBR[k]}`)
  }
  return {
    hp,
    mp,
    nextStats: bumped,
    statText: bumpLabels.join(' '),
  }
}

const STAT_ABBR: Record<keyof Character['stats'], string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}

const STAT_CODE_TO_KEY: Record<StatCode, keyof Character['stats']> = {
  STR: 'strength',
  DEX: 'dexterity',
  CON: 'constitution',
  INT: 'intelligence',
  WIS: 'wisdom',
  CHA: 'charisma',
}
