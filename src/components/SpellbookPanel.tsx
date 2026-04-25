import { useMemo } from 'react'
import type { Character, JournalEntry } from '../character'
import {
  getSpell,
  getSpellList,
  isMagicUser,
  type SpellDef,
  type SpellLevel,
} from '../spells'
import { formatRelative } from '../util/time'
import { getWorldManifest, type WorldContent } from '../worlds'

interface Props {
  character: Character
  world?: WorldContent
}

interface SpellAcquisition {
  /** Wall-clock ms when the spell entered the spellbook. Absent for
   *  starting spells (granted at character creation, no journal entry). */
  at?: number
  /** Area id where it was learned. Same caveat as `at`. */
  areaId?: string
}

interface KnownEntry {
  kind: 'known'
  spell: SpellDef
  acquired: SpellAcquisition
}

interface UnknownEntry {
  kind: 'unknown'
  /** Tier of the hidden spell — preserved so it sorts into the right
   *  section without revealing the name. */
  level: SpellLevel
  /** Stable key for React reconciliation — the spell id is fine since
   *  it's not displayed. */
  id: string
  /** Character level at which the spell will unlock. */
  unlockLevel: number
}

type TierEntry = KnownEntry | UnknownEntry

/** Spells more than this many character levels away stay completely
 *  hidden — they don't even show as Unknown. Keeps the spellbook from
 *  spoiling end-game surprises while still hinting at the next few
 *  unlocks. */
const UNKNOWN_REVEAL_RANGE = 5

const TIER_LEVELS: readonly SpellLevel[] = [1, 2, 3, 4, 5] as const

const TIER_LABEL: Record<SpellLevel, string> = {
  1: 'Tier I — Apprentice',
  2: 'Tier II — Adept',
  3: 'Tier III — Expert',
  4: 'Tier IV — Master',
  5: 'Tier V — Archmage',
}

/** Tier → tooltip accent color. Tiers 2–5 mirror the rarity ladder so
 *  the floating card carries the same identity as the spell name it's
 *  tied to. Tier 1 swaps out `--rarity-common` (a quiet neutral that
 *  reads as muted in the tooltip's bg-2 chrome) for `--rarity-uncommon`
 *  — the standard UI green used for green-tier loot — so the card
 *  stays legible and reads in the same family as everything else. */
const TIER_COLOR: Record<SpellLevel, string> = {
  1: 'var(--rarity-uncommon)',
  2: 'var(--rarity-uncommon)',
  3: 'var(--rarity-rare)',
  4: 'var(--rarity-epic)',
  5: 'var(--rarity-legendary)',
}

const TARGET_LABEL: Record<string, string> = {
  self: 'self',
  enemy: 'enemy',
  item: 'item',
}

const EFFECT_LABEL: Record<SpellDef['effect']['kind'], string> = {
  damage: 'damage',
  'multi-damage': 'multi-hit',
  'damage-over-time': 'damage over time',
  heal: 'heal',
  buff: 'buff',
  debuff: 'debuff',
  'teleport-safe': 'teleport',
  'item-enchant': 'item enchant',
}

function describeEffect(spell: SpellDef): string {
  const effect = spell.effect
  switch (effect.kind) {
    case 'damage':
      return `${effect.amount} ${EFFECT_LABEL.damage}`
    case 'multi-damage':
      return `${effect.hits}× ${effect.amount} ${EFFECT_LABEL.damage}`
    case 'heal':
      return `+${effect.amount} HP`
    case 'damage-over-time':
      return EFFECT_LABEL['damage-over-time']
    case 'buff':
      return EFFECT_LABEL.buff
    case 'debuff':
      return EFFECT_LABEL.debuff
    case 'teleport-safe':
      return 'recall to safety'
    case 'item-enchant':
      return `+${effect.amount} ${effect.bonus} on item`
  }
}

/** Build a spellId → most-recent `spell-learned` journal entry map. */
function indexLearnedBySpellId(journal: readonly JournalEntry[]): Map<string, JournalEntry> {
  const out = new Map<string, JournalEntry>()
  for (const entry of journal) {
    if (entry.kind !== 'spell-learned') continue
    const id = entry.meta?.spellId
    if (!id) continue
    const existing = out.get(id)
    if (!existing || entry.at > existing.at) out.set(id, entry)
  }
  return out
}

function areaNameFor(areaId: string | undefined, world: WorldContent | undefined): string | undefined {
  if (!areaId || !world) return undefined
  const area = world.areas?.find((a) => a.id === areaId) ?? world.startingArea
  return area?.name
}

function buildTooltip(spell: SpellDef, magicAbbr: string): string {
  const target = TARGET_LABEL[spell.targetKind ?? spell.target] ?? spell.target
  return [
    spell.description,
    '',
    `Cost: ${spell.magicCost} ${magicAbbr} · ${target} · ${describeEffect(spell)}`,
  ].join('\n')
}

export default function SpellbookPanel({ character, world }: Props) {
  const manifest = getWorldManifest(character.worldId)
  const magicLabel = manifest?.magicName ?? 'Magic'
  const magicAbbr = manifest?.magicAbbreviation ?? 'MP'

  const learnedIndex = useMemo(
    () => indexLearnedBySpellId(character.journal ?? []),
    [character.journal],
  )

  // Group the character's known spells by tier (1–5). Within each tier
  // sort newest-learned first so recent acquisitions surface to the top;
  // starting spells (no journal entry) fall to the bottom in name order.
  // Then append "Unknown" placeholders for spells the character is
  // within UNKNOWN_REVEAL_RANGE levels of unlocking — they tease the
  // next few tiers without spoiling specific spell names.
  const byTier = useMemo(() => {
    const tiers: Record<SpellLevel, TierEntry[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
    const seen = new Set<string>()
    for (const id of character.spells ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      const spell = getSpell(character.worldId, id)
      if (!spell) continue
      const learned = learnedIndex.get(id)
      tiers[spell.level].push({
        kind: 'known',
        spell,
        acquired: { at: learned?.at, areaId: learned?.areaId },
      })
    }
    for (const level of TIER_LEVELS) {
      tiers[level].sort((a, b) => {
        if (a.kind !== 'known' || b.kind !== 'known') return 0
        const at = a.acquired.at
        const bt = b.acquired.at
        if (at != null && bt != null) return bt - at
        if (at != null) return -1
        if (bt != null) return 1
        return a.spell.name.localeCompare(b.spell.name)
      })
    }
    if (isMagicUser(character)) {
      const knownIds = new Set(character.spells ?? [])
      const upcoming = getSpellList(character.worldId)
        .filter((s) =>
          typeof s.unlockLevel === 'number' &&
          s.unlockLevel > character.level &&
          s.unlockLevel - character.level <= UNKNOWN_REVEAL_RANGE &&
          !knownIds.has(s.id),
        )
        .sort((a, b) => (a.unlockLevel ?? 0) - (b.unlockLevel ?? 0))
      for (const spell of upcoming) {
        if (typeof spell.unlockLevel !== 'number') continue
        tiers[spell.level].push({
          kind: 'unknown',
          level: spell.level,
          id: spell.id,
          unlockLevel: spell.unlockLevel,
        })
      }
    }
    return tiers
  }, [character, learnedIndex])

  const totalKnown = TIER_LEVELS.reduce(
    (acc, lv) => acc + byTier[lv].filter((e) => e.kind === 'known').length,
    0,
  )

  if (!isMagicUser(character) && totalKnown === 0) {
    return (
      <div className="spellbook spellbook--empty">
        <p>{character.name} has not studied the arts.</p>
        <p className="spellbook__hint">
          Magic-using classes start with at least one spell. This character
          fights with steel and grit.
        </p>
        <style>{`
          .spellbook--empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            gap: var(--sp-2);
            font-family: var(--font-body);
            color: var(--fg-3);
            font-size: var(--text-sm);
            text-align: center;
            padding: var(--sp-4);
          }
          .spellbook__hint {
            color: var(--fg-3);
            font-size: var(--text-xs);
            font-style: italic;
            max-width: 28ch;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="spellbook">
      <div className="spellbook__header">
        <span className="spellbook__header-label">{magicLabel}</span>
        <span className="spellbook__header-value">
          {character.magic} / {character.maxMagic} {magicAbbr}
        </span>
      </div>

      <ul className="spellbook__list">
        {TIER_LEVELS.map((level) => {
          const entries = byTier[level]
          return (
            <li key={level} className={`spellbook__tier spellbook__tier--lv${level}`}>
              {(() => {
                const knownCount = entries.filter((e) => e.kind === 'known').length
                const unknownCount = entries.length - knownCount
                return (
                  <div className="spellbook__group">
                    <span className="spellbook__group-label">{TIER_LABEL[level]}</span>
                    <span className="spellbook__group-count">
                      {knownCount} learned
                      {unknownCount > 0 ? ` · ${unknownCount} unknown` : ''}
                    </span>
                  </div>
                )
              })()}
              {entries.length === 0 ? (
                <div className="spellbook__row spellbook__row--empty">
                  <span className="spellbook__empty-mark" aria-hidden="true">—</span>
                </div>
              ) : (
                <ul className="spellbook__sublist">
                  {entries.map((entry) => {
                    if (entry.kind === 'unknown') {
                      return (
                        <li
                          key={`unknown:${entry.id}`}
                          className="spellbook__row spellbook__row--unknown"
                          data-tip="An unlearned spell within reach."
                        >
                          <span className="spellbook__glyph" aria-hidden="true">✺</span>
                          <span className="spellbook__name spellbook__name--unknown">
                            Unknown
                          </span>
                          <span className="spellbook__meta">
                            <span className="spellbook__when spellbook__when--soon">
                              soon
                            </span>
                          </span>
                        </li>
                      )
                    }
                    const { spell, acquired } = entry
                    const areaName = areaNameFor(acquired.areaId, world)
                    const tip = buildTooltip(spell, magicAbbr)
                    const when = acquired.at != null ? formatRelative(acquired.at) : null
                    return (
                      <li
                        key={spell.id}
                        className="spellbook__row spellbook__row--known"
                        data-tip={tip}
                        data-tip-color={TIER_COLOR[spell.level]}
                      >
                        <span className="spellbook__glyph" aria-hidden="true">✺</span>
                        <span className="spellbook__name">{spell.name}</span>
                        <span className="spellbook__meta">
                          {when ? (
                            <>
                              <span className="spellbook__when">{when}</span>
                              {areaName && (
                                <>
                                  <span className="spellbook__sep" aria-hidden="true">·</span>
                                  <span className="spellbook__where">{areaName}</span>
                                </>
                              )}
                            </>
                          ) : (
                            <span className="spellbook__when spellbook__when--starting">
                              from the start
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <style>{`
        .spellbook {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .spellbook__header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 0 var(--sp-3) var(--sp-2);
          border-bottom: 1px solid var(--line-2);
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-3);
          flex-shrink: 0;
        }
        .spellbook__header-value {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          color: var(--mp);
          letter-spacing: 0.06em;
          text-transform: none;
        }
        .spellbook__list {
          list-style: none;
          margin: 0;
          padding: 0;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .spellbook__tier {
          display: block;
          border-bottom: 1px solid var(--line-2);
        }
        .spellbook__group {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--sp-2);
          padding: var(--sp-3) var(--sp-3) 2px;
          border-left: 3px solid var(--line-2);
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .spellbook__group-label { color: var(--fg-2); }
        .spellbook__group-count {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          text-transform: none;
          font-variant-numeric: tabular-nums;
        }
        /* Tier accent — paints the spell name and its leading glyph
           with the matching rarity color (tier-1 common → tier-5
           legendary) so spell tiers read in the same palette the game
           already uses for items and mob prefixes. Capstone tier keeps
           a soft glow for emphasis. Scoped to known rows so Unknown
           placeholders keep their italic --fg-3 treatment. */
        .spellbook__tier--lv1 .spellbook__row--known .spellbook__name,
        .spellbook__tier--lv1 .spellbook__row--known .spellbook__glyph { color: var(--rarity-common); text-shadow: none; }
        .spellbook__tier--lv2 .spellbook__row--known .spellbook__name,
        .spellbook__tier--lv2 .spellbook__row--known .spellbook__glyph { color: var(--rarity-uncommon); }
        .spellbook__tier--lv3 .spellbook__row--known .spellbook__name,
        .spellbook__tier--lv3 .spellbook__row--known .spellbook__glyph { color: var(--rarity-rare); }
        .spellbook__tier--lv4 .spellbook__row--known .spellbook__name,
        .spellbook__tier--lv4 .spellbook__row--known .spellbook__glyph { color: var(--rarity-epic); }
        .spellbook__tier--lv5 .spellbook__row--known .spellbook__name,
        .spellbook__tier--lv5 .spellbook__row--known .spellbook__glyph { color: var(--rarity-legendary); text-shadow: var(--glow-sm); }
        .spellbook__sublist {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        /* Compact one-line row: glyph · name · meta-on-the-right.
           Cost / target / effect / description live in the tooltip
           (data-tip), keeping the panel scannable. */
        .spellbook__row {
          display: grid;
          grid-template-columns: 24px 1fr auto;
          align-items: baseline;
          gap: 0 var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          border-top: 1px solid var(--line-1);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--fg-2);
          line-height: 1.4;
        }
        .spellbook__row--empty {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-style: italic;
          font-size: var(--text-xs);
          padding: var(--sp-1) var(--sp-3) var(--sp-2);
        }
        .spellbook__empty-mark {
          grid-column: 1 / -1;
          padding-left: 24px;
          letter-spacing: 0.4em;
          color: var(--fg-3);
        }
        .spellbook__glyph {
          color: var(--mp);
          font-family: var(--font-mono);
          text-align: center;
          padding-top: 1px;
          text-shadow: 0 0 3px currentColor;
        }
        .spellbook__name {
          color: var(--mp);
          font-weight: 500;
          font-family: var(--font-display);
          letter-spacing: 0.04em;
          text-shadow: 0 0 3px currentColor;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .spellbook__row--unknown .spellbook__glyph {
          color: var(--fg-3);
          text-shadow: none;
          opacity: 0.6;
        }
        .spellbook__name--unknown {
          color: var(--fg-3);
          font-style: italic;
          font-weight: 400;
          text-shadow: none;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .spellbook__row--unknown .spellbook__meta { opacity: 0.85; }
        .spellbook__meta {
          display: inline-flex;
          align-items: baseline;
          gap: var(--sp-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .spellbook__when {
          font-variant-numeric: tabular-nums;
        }
        .spellbook__when--starting,
        .spellbook__when--soon {
          font-style: italic;
        }
        .spellbook__sep { opacity: 0.6; }
        .spellbook__where { color: var(--fg-2); }
      `}</style>
    </div>
  )
}
