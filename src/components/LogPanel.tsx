import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Panel from './Panel'
import type { Character } from '../character'
import type { GameState } from '../game'
import { rarityColor } from '../items'
import type { LogEntry, LogMeta } from '../log'
import { getWorldContent, type WorldContent } from '../worlds'
import HistoryDialog from './HistoryDialog'
import Popover from './Popover'
import LogPopoverContent, { type Subject } from './LogPopoverContent'

type SubjectClickHandler = (
  subject: Subject,
  e: React.MouseEvent<HTMLButtonElement>,
) => void

interface Props {
  character: Character
  entries?: LogEntry[]
  state?: GameState
  paused?: boolean
  /** When true, numeric amounts (HP / MP / XP / condition damage) render
   *  as exact values. When false, they render as qualitative descriptors
   *  — the shipping default. Controlled from Settings → Appearance. */
  showNumbers?: boolean
}

function describeState(state?: GameState): ReactNode {
  if (!state) return null
  switch (state.kind) {
    case 'exploring': return 'Exploring'
    case 'resting': return 'Resting'
    case 'meditating': return 'Meditating'
    case 'using-room': return 'Using room'
    case 'fighting':
      return (
        <>
          Fighting: <span className="logp__tok logp__tok--mob">{state.mob.name}</span>
        </>
      )
  }
}

function stateTip(state: GameState | undefined, paused: boolean): string | undefined {
  if (paused) return 'Paused — ticks are frozen. Resume to continue.'
  if (!state) return undefined
  switch (state.kind) {
    case 'exploring':
      return 'Exploring — moving room to room, pulled by whichever drive is loudest.'
    case 'resting':
      return 'Resting — catching breath in a safe spot. HP recovery scales with level and CON.'
    case 'meditating':
      return 'Meditating — breath-work regenerates MP (and some HP). Gated on INT or WIS ≥ 12.'
    case 'using-room':
      return 'Using room — drinking, eating, or otherwise interacting with the current room. Shops and portals will use this same state.'
    case 'fighting':
      return `Fighting — in combat with the ${state.mob.name}. Each tick is one round.`
  }
}

// Maps a heal amount into a qualitative power descriptor. Tiers are tuned
// against the shipped spell + potion amounts so each tier captures a
// couple of steps — lesser-heal spells (6 HP) and minor potions (3 HP)
// land in the lowest bands; greater-heal spells (14 HP) and larger
// potions (18 HP) in the middle; anything beyond is reserved for future
// high-tier sources. Zero-heal entries fall through to null so the
// caller can skip the tag entirely.
function healPowerDescriptor(amount: number): string {
  if (amount <= 0) return 'no effect'
  if (amount < 6) return 'a faint mend'
  if (amount < 12) return 'a modest mend'
  if (amount < 20) return 'a strong mend'
  if (amount < 35) return 'a potent mend'
  return 'a miraculous mend'
}

// Mirror of healPowerDescriptor for MP restores. Tuned against shipped
// mana-tincture amounts so each tier captures a meaningful step: tiny
// sips, usable top-ups, full-cup swigs, and anything beyond reads as
// rare/legendary territory.
function manaPowerDescriptor(amount: number): string {
  if (amount <= 0) return 'no effect'
  if (amount < 5) return 'a faint shimmer'
  if (amount < 10) return 'a modest surge'
  if (amount < 18) return 'a strong surge'
  if (amount < 30) return 'a potent surge'
  return 'a brilliant surge'
}

function sampleEntries(name: string): LogEntry[] {
  return [
    { kind: 'chapter', text: `${name} stirs.` },
    { kind: 'narrative', text: `${name} stands at the edge of an unnamed place.` },
    { kind: 'narrative', text: 'A faint breeze carries the scent of somewhere else.' },
    { kind: 'system', text: 'Someone, somewhere, is watching her do this. She does not know.' },
  ]
}

interface HighlightPart {
  match: string
  render: (matched: string) => ReactNode
}

function conditionDescription(
  name: string,
  world?: WorldContent,
): string | undefined {
  const defs = world?.conditions
  if (!defs || defs.length === 0) return undefined
  const lowered = name.toLowerCase()
  return defs.find((d) => d.name.toLowerCase() === lowered)?.description
}

function buildParts(
  meta: LogMeta,
  world: WorldContent | undefined,
  showNumbers: boolean,
  onSubjectClick?: SubjectClickHandler,
): HighlightPart[] {
  const parts: HighlightPart[] = []
  if (meta.name) {
    parts.push({
      match: meta.name,
      render: (t) => <span className="logp__tok logp__tok--name">{t}</span>,
    })
  }
  if (meta.mobName) {
    const mobName = meta.mobName
    parts.push({
      match: mobName,
      render: (t) =>
        onSubjectClick ? (
          <button
            type="button"
            className="logp__tok logp__tok--mob logp__tok--link"
            onClick={(e) => onSubjectClick({ kind: 'mob', name: mobName }, e)}
          >
            {t}
          </button>
        ) : (
          <span className="logp__tok logp__tok--mob">{t}</span>
        ),
    })
  }
  // Items render as [Name] to set them apart from mob / room / player tokens.
  // Brackets live in the rendered JSX only; the source text stays clean.
  // Equip messages reference two items (new + replaced), so this is split
  // into a helper called once per item. The color is resolved by the
  // caller so potions can paint by effect (HP / MP) while loot and equip
  // keep painting by rarity — both going through the same click path.
  const pushItemPart = (
    itemId: string,
    itemName: string,
    color: string,
  ) => {
    const style = { color }
    parts.push({
      match: itemName,
      render: (t) =>
        onSubjectClick ? (
          <button
            type="button"
            className="logp__tok logp__tok--item logp__tok--link"
            style={style}
            onClick={(e) => onSubjectClick({ kind: 'item', id: itemId, name: itemName }, e)}
          >
            [{t}]
          </button>
        ) : (
          <span className="logp__tok logp__tok--item" style={style}>
            [{t}]
          </span>
        ),
    })
  }
  // Potion effect overrides rarity — a Healing Draught reads as an HP
  // thing when drunk, not a common-rarity thing. Painted in the log's
  // HP/MP tokens so the potion bracket matches the stat tag it's paired
  // with (e.g. "[Healing Draught]" and "(+8 HP)" share a color).
  const potionColor = (effect: NonNullable<LogMeta['potionEffect']>) =>
    effect === 'heal' ? 'var(--log-hp, var(--hp))' : 'var(--log-mp, var(--mp))'
  if (meta.itemName && meta.itemId) {
    const color = meta.potionEffect
      ? potionColor(meta.potionEffect)
      : rarityColor(meta.itemRarity ?? 'common')
    pushItemPart(meta.itemId, meta.itemName, color)
  }
  if (meta.replacedItemName && meta.replacedItemId) {
    pushItemPart(
      meta.replacedItemId,
      meta.replacedItemName,
      rarityColor(meta.replacedItemRarity ?? 'common'),
    )
  }
  if (meta.goldText) {
    parts.push({
      match: meta.goldText,
      render: (t) => <span className="logp__tok logp__tok--gold">{t}</span>,
    })
  }
  if (meta.xpText && showNumbers) {
    parts.push({
      match: meta.xpText,
      render: (t) => <span className="logp__tok logp__tok--xp">{t}</span>,
    })
  }
  if (meta.conditionName) {
    const condTip = conditionDescription(meta.conditionName, world)
    parts.push({
      match: meta.conditionName,
      render: (t) => (
        <span className="logp__tok logp__tok--cond" data-tip={condTip}>
          {t}
        </span>
      ),
    })
    const lowered = meta.conditionName.toLowerCase()
    if (lowered !== meta.conditionName) {
      parts.push({
        match: lowered,
        render: (t) => (
          <span className="logp__tok logp__tok--cond" data-tip={condTip}>
            {t}
          </span>
        ),
      })
    }
  }
  if (meta.direction) {
    parts.push({
      match: meta.direction,
      render: (t) => <span className="logp__tok logp__tok--dir">{t}</span>,
    })
  }
  if (meta.spellName) {
    parts.push({
      match: meta.spellName,
      render: (t) => <span className="logp__tok logp__tok--spell">{t}</span>,
    })
  }
  if (meta.verb && meta.severity) {
    const severity = meta.severity
    // Heavy / severe / critical verbs get asterisk decorators so the
    // strongest hits read as "important" even when scrolling past. One
    // star for heavy, two for severe, three for critical. Dimmer than
    // the verb itself so the hit word still leads.
    const stars =
      severity === 'critical'
        ? '***'
        : severity === 'severe'
          ? '**'
          : severity === 'heavy'
            ? '*'
            : ''
    parts.push({
      match: meta.verb,
      render: (t) => (
        <span className={`logp__tok logp__tok--verb logp__tok--sev-${severity}`}>
          {stars ? <span className="logp__verb-star">{stars} </span> : null}
          {t}
          {stars ? <span className="logp__verb-star"> {stars}</span> : null}
        </span>
      ),
    })
  }
  if (meta.roomName) {
    const areaId = meta.areaId
    const roomKey = meta.roomKey
    const roomName = meta.roomName
    const canClick = !!areaId && !!roomKey && !!onSubjectClick
    parts.push({
      match: roomName,
      render: (t) =>
        canClick ? (
          <button
            type="button"
            className="logp__tok logp__tok--room logp__tok--link"
            onClick={(e) =>
              onSubjectClick!(
                { kind: 'room', areaId: areaId!, roomKey: roomKey!, name: roomName },
                e,
              )
            }
          >
            {t}
          </button>
        ) : (
          <span className="logp__tok logp__tok--room">{t}</span>
        ),
    })
  }
  return parts
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Pull every "+N HP", "−N HP", "+N MP", "−N MP" substring out of `text`
// and produce a HighlightPart per unique token. Used by the Highlight
// scanner so inline stat mentions (meditate's "(+8 MP · +2 HP)",
// potion chatter, rest ticks, condition damage, etc.) paint in their
// respective stat colors rather than sitting as plain body text.
function statMentionParts(text: string): HighlightPart[] {
  const out: HighlightPart[] = []
  const seen = new Set<string>()
  const push = (
    regex: RegExp,
    kind: 'hp' | 'mp',
  ) => {
    const cls =
      kind === 'hp'
        ? 'logp__tok logp__tok--hp'
        : 'logp__tok logp__tok--mp'
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (seen.has(m[0])) continue
      seen.add(m[0])
      const match = m[0]
      out.push({
        match,
        render: (t) => <span className={cls}>{t}</span>,
      })
    }
  }
  push(/[+−-]\d+\s*HP\b/g, 'hp')
  push(/[+−-]\d+\s*MP\b/g, 'mp')
  return out
}

function Highlight({
  text,
  meta,
  world,
  showNumbers,
  onSubjectClick,
}: {
  text: string
  meta?: LogMeta
  world?: WorldContent
  showNumbers: boolean
  onSubjectClick?: SubjectClickHandler
}) {
  // When numbers are hidden, strip the "(+N XP)" parenthetical that the
  // tick loop bakes into loot / chapter text — keeps the sentence clean
  // instead of leaving an empty "()" dangling.
  let displayText = text
  if (!showNumbers && meta?.xpText) {
    displayText = displayText.replace(
      new RegExp(`\\s*\\(\\s*${escapeRegex(meta.xpText)}\\s*\\)`, 'g'),
      '',
    )
  }
  // Inline HP/MP mentions paint in stat colors whether or not meta is
  // populated — some entries carry them in text without other meta
  // (meditate's "(+8 MP · +2 HP)" is the canonical case).
  const statParts = showNumbers ? statMentionParts(displayText) : []
  if (!meta) {
    if (statParts.length === 0) return <>{displayText}</>
  }
  const parts = [
    ...(meta ? buildParts(meta, world, showNumbers, onSubjectClick) : []),
    ...statParts,
  ]
  if (parts.length === 0) return <>{displayText}</>

  const chunks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < displayText.length) {
    let bestIdx = displayText.length
    let bestPart: HighlightPart | null = null
    for (const part of parts) {
      if (!part.match) continue
      const idx = displayText.indexOf(part.match, i)
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx
        bestPart = part
      }
    }
    if (!bestPart) {
      chunks.push(<Fragment key={key++}>{displayText.slice(i)}</Fragment>)
      break
    }
    if (bestIdx > i) {
      chunks.push(<Fragment key={key++}>{displayText.slice(i, bestIdx)}</Fragment>)
    }
    const matched = displayText.slice(bestIdx, bestIdx + bestPart.match.length)
    chunks.push(<Fragment key={key++}>{bestPart.render(matched)}</Fragment>)
    i = bestIdx + bestPart.match.length
  }
  return <>{chunks}</>
}

// Strips trailing "(+N HP)" / "(+N MP)" / "(+N MP · +N HP)" from a heal line
// so meditate-style entries that embed their numbers in the text stay clean
// when the user has hidden log numbers. Conservative regex — only kills the
// final parenthetical when it's composed of space-separated "+N UNIT" parts.
const INLINE_NUMERIC_PAREN = /\s*\(\s*[+\-−]?\d+\s*(?:HP|MP|XP)(?:\s*[·\-/,]\s*[+\-−]?\d+\s*(?:HP|MP|XP))*\s*\)\s*$/i
function stripInlineNumbers(text: string): string {
  return text.replace(INLINE_NUMERIC_PAREN, '')
}

function LogLine({
  entry,
  world,
  showNumbers,
  onSubjectClick,
}: {
  entry: LogEntry
  world?: WorldContent
  showNumbers: boolean
  onSubjectClick?: SubjectClickHandler
}) {
  const meta = 'meta' in entry ? entry.meta : undefined

  switch (entry.kind) {
    case 'narrative':
      return (
        <p className="logp__line logp__line--narrative">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'system':
      return <p className="logp__line logp__line--system">{entry.text}</p>

    case 'chapter':
      return (
        <p className="logp__line logp__line--chapter">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'area':
      return (
        <p className="logp__line logp__line--area">
          <span className="logp__area-label">New Area</span>
          <span className="logp__area-title">
            <span className="logp__area-glyph">✦</span>
            <span className="logp__area-name">{entry.text}</span>
            <span className="logp__area-glyph">✦</span>
          </span>
        </p>
      )

    case 'dialogue':
      return (
        <p className="logp__line logp__line--dialogue">
          {entry.speaker ? <span className="logp__speaker">{entry.speaker}: </span> : null}
          {entry.text}
        </p>
      )

    case 'damage': {
      // Line keeps body color; the verb span carries the severity styling so
      // "the" / "a" / punctuation don't drag an effect along with it. When
      // the user wants numbers, trail a compact tag showing final damage,
      // the attacker's pre-defense roll, and the defender's reduction —
      // "(3 dmg · 7 ATK − 4 DEF)" — so combat math is legible.
      const showDmg =
        showNumbers &&
        typeof entry.amount === 'number' &&
        typeof meta?.attackPower === 'number' &&
        typeof meta?.defense === 'number'
      return (
        <p className="logp__line logp__line--narrative">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
          {showDmg ? (
            <span className="logp__tag">
              {' ('}
              <span className="logp__tag-part--dmg">{entry.amount} DMG</span>
              {' · '}
              <span className="logp__tag-part--atk">{meta!.attackPower} ATK</span>
              {' − '}
              <span className="logp__tag-part--def">{meta!.defense} DEF</span>
              {')'}
            </span>
          ) : null}
        </p>
      )
    }

    case 'heal': {
      // Meditate and similar rest ticks embed "(+N MP · +N HP)" directly in
      // their text rather than carrying an amount field — strip that when
      // the player has numbers hidden so the story stays clean.
      const text = showNumbers ? entry.text : stripInlineNumbers(entry.text)
      const tag =
        typeof entry.amount === 'number'
          ? showNumbers
            ? `+${entry.amount} HP`
            : healPowerDescriptor(entry.amount)
          : null
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
          {tag ? (
            <span className="logp__tag">
              {' ('}
              <span className="logp__tag-part--hp">{tag}</span>
              {')'}
            </span>
          ) : null}
        </p>
      )
    }

    case 'loot':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'consume': {
      const tag = showNumbers
        ? entry.effect === 'heal'
          ? `+${entry.amount} HP`
          : `+${entry.amount} MP`
        : entry.effect === 'heal'
          ? healPowerDescriptor(entry.amount)
          : manaPowerDescriptor(entry.amount)
      const partClass =
        entry.effect === 'restore-magic'
          ? 'logp__tag-part--mp'
          : 'logp__tag-part--hp'
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
          <span className="logp__tag">
            {' ('}
            <span className={partClass}>{tag}</span>
            {')'}
          </span>
        </p>
      )
    }

    case 'equip':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'death-loss':
      return (
        <p className="logp__line logp__line--loss">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'condition-gain': {
      const cls =
        'logp__line ' +
        (entry.polarity === 'buff' ? 'logp__line--buff' : 'logp__line--debuff')
      return (
        <p className={cls}>
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )
    }

    case 'condition-tick':
      return (
        <p className="logp__line logp__line--debuff">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
          {showNumbers && entry.amount > 0 ? (
            <span className="logp__tag">
              {' ('}
              <span className="logp__tag-part--hp">−{entry.amount} HP</span>
              {')'}
            </span>
          ) : null}
        </p>
      )

    case 'condition-end':
      return (
        <p className="logp__line logp__line--cond-end">
          <Highlight text={entry.text} meta={meta} world={world} showNumbers={showNumbers} onSubjectClick={onSubjectClick} />
        </p>
      )
  }
}

export default function LogPanel({
  character,
  entries,
  state,
  paused,
  showNumbers,
}: Props) {
  const lines = entries ?? sampleEntries(character.name)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showDeaths, setShowDeaths] = useState(false)
  const [popover, setPopover] = useState<{ subject: Subject; anchor: DOMRect } | null>(null)

  const world = getWorldContent(character.worldId)
  const areas = world?.areas ?? (world ? [world.startingArea] : undefined)

  // Derive the set of mob names that have fallen this session from the log.
  // The game marks each defeat with `meta.mobDefeat: true`; we collect the
  // name so popovers on a clicked mob can say DEAD instead of Hostile.
  const defeatedMobs = useMemo(() => {
    const set = new Set<string>()
    for (const entry of lines) {
      const meta = 'meta' in entry ? entry.meta : undefined
      if (meta?.mobDefeat && meta.mobName) set.add(meta.mobName)
    }
    return set
  }, [lines])

  const onSubjectClick: SubjectClickHandler = (subject, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({ subject, anchor: rect })
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const life = character.deaths.length + 1
  const deathItems = character.deaths.map((d) => {
    // Highlight the mob name in cause if we know it. Renders as a clickable
    // token that opens the mob popover on top of the deaths dialog.
    const causeNode: ReactNode = (() => {
      if (!d.mobName) return d.cause
      const idx = d.cause.indexOf(d.mobName)
      if (idx < 0) return d.cause
      const mobName = d.mobName
      return (
        <>
          {d.cause.slice(0, idx)}
          <button
            type="button"
            className="logp__tok logp__tok--mob logp__tok--link"
            onClick={(e) => onSubjectClick({ kind: 'mob', name: mobName }, e)}
          >
            {mobName}
          </button>
          {d.cause.slice(idx + mobName.length)}
        </>
      )
    })()

    const roomNode: ReactNode = d.roomName
      ? <span className="logp__tok logp__tok--room">{d.roomName}</span>
      : null

    return {
      at: d.at,
      text: roomNode ? (
        <>{causeNode} in the {roomNode}.</>
      ) : (
        <>{causeNode}.</>
      ),
    }
  })

  const stateLabel: ReactNode = paused ? 'Paused' : describeState(state)
  const stateTooltip = stateTip(state, !!paused)

  const metaNode = (
    <span className="logp__meta">
      {stateLabel != null && stateLabel !== '' && (
        <span
          className={'logp__state' + (paused ? ' logp__state--paused' : '')}
          data-tip={stateTooltip}
        >
          {stateLabel}
        </span>
      )}
      <button
        type="button"
        className="logp__lives"
        data-tip="See the ways you've died"
        onClick={() => setShowDeaths(true)}
      >
        Life {life}
      </button>
    </span>
  )

  return (
    <Panel title="Log" meta={metaNode} className="scanlines flicker">
      <HistoryDialog
        open={showDeaths}
        title={`${character.name} — Deaths`}
        items={deathItems}
        emptyText="Still alive."
        onClose={() => setShowDeaths(false)}
      />
      <Popover
        open={popover != null}
        anchor={popover?.anchor ?? null}
        onClose={() => setPopover(null)}
      >
        {popover && (
          <LogPopoverContent
            subject={popover.subject}
            ctx={{
              character,
              areas,
              mobs: world?.mobs,
              items: world?.items,
              defeatedMobs,
            }}
          />
        )}
      </Popover>
      <div className="logp-wrap">
        <div className="logp" ref={scrollRef}>
          {lines.map((entry, i) => (
            <LogLine key={i} entry={entry} world={world} showNumbers={!!showNumbers} onSubjectClick={onSubjectClick} />
          ))}
          <p className="logp__line logp__line--tail cursor">
            <span className="logp__invis">.</span>
          </p>
        </div>
      </div>
      <style>{`
        .logp-wrap {
          position: relative;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
        }
        .logp {
          flex: 1;
          overflow-y: auto;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: var(--leading-log);
          color: var(--fg-1);
          min-height: 0;
          padding-right: var(--sp-1);
        }
        .logp__line { margin: 0 0 var(--sp-1) 0; }
        .logp__line--narrative { color: var(--fg-body, var(--fg-2)); }
        /* Action lines (loot / heal / consume / equip) used to flood the
           whole row with --accent-hot, dragging connecting words ("a",
           "the", "gathers", "pockets") along for the ride. Body color
           stays neutral now; the meaning-carrying tokens (item name,
           gold, HP / MP tag) bring their own accent. Same treatment the
           --loss / --buff / --debuff rules below already use. */
        .logp__line--action { color: var(--fg-body, var(--fg-2)); }
        /* Damage verbs — the *only* part of a damage line that should carry
           severity emphasis. Articles ("the"), names, and punctuation stay
           in the narrative body color. */
        .logp__tok--verb { font-weight: 500; }
        /* Asterisks wrapping the strongest verbs — sit at ~60% opacity
           so they frame the verb without stealing its emphasis. Inherit
           the verb's color so severity coloring flows through. */
        .logp__verb-star { opacity: 0.6; font-weight: 400; }
        .logp__tok--sev-grazing { color: var(--fg-3); font-weight: 400; }
        .logp__tok--sev-light { color: var(--fg-2); }
        .logp__tok--sev-solid { color: var(--accent); }
        .logp__tok--sev-heavy { color: var(--warn); text-shadow: var(--glow-sm); }
        /* High-tier verbs use the themeable --verb-emph (warm orange by
           default, dark red on light themes, green on mud-classic). The old
           rules added a same-color glow that made orange text smear into a
           fuzzy halo on black; the new emphasis is a tight black outline so
           the orange stays crisp and the bold/letter-spacing carry the
           visual weight. */
        .logp__tok--sev-severe {
          color: var(--verb-emph);
          font-weight: 600;
          font-style: italic;
          letter-spacing: 0.03em;
          text-shadow: 0 0 1px #000, 0 1px 1px rgba(0, 0, 0, 0.85);
        }
        .logp__tok--sev-critical {
          color: var(--verb-emph);
          font-weight: 800;
          font-style: italic;
          letter-spacing: 0.04em;
          font-size: 1.05em;
          text-shadow: 0 0 1px #000, 0 1px 2px rgba(0, 0, 0, 0.9);
        }
        .logp__line--system {
          color: var(--fg-2);
          font-style: italic;
        }
        .logp__line--chapter {
          color: var(--accent-hot);
          text-shadow: var(--glow-sm);
          letter-spacing: 0.02em;
          margin-top: var(--sp-2);
        }
        /* Area-entry announcement — two-line banner wrapped in dashed
           rules so stepping into a new region feels like a scene break
           rather than one more log line. Small "New Area" label on top,
           big glyph-flanked title below. Pulls the eye even while
           scrolling fast. */
        .logp__line--area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          margin: var(--sp-4) 0;
          padding: var(--sp-2) 0;
          border-top: 1px dashed var(--accent);
          border-bottom: 1px dashed var(--accent);
          text-align: center;
        }
        .logp__area-label {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--fg-2);
          opacity: 0.85;
        }
        .logp__area-title {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-3);
          color: var(--accent-hot);
          font-family: var(--font-display);
          font-size: var(--text-lg);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-shadow: var(--glow-md);
        }
        .logp__area-glyph {
          color: var(--accent);
          font-size: var(--text-xl);
          line-height: 1;
          opacity: 0.85;
        }
        .logp__area-name {
          font-weight: 500;
        }
        .logp__line--dialogue { color: var(--speech); }
        /* Loss / buff / debuff lines used to flood the whole row with one
           accent color, dragging connecting words ("loses", "is", "drops
           the", "suffers from") along for the ride. Body color stays
           neutral now; the meaning-carrying tokens (item name, condition
           name, XP / HP tags) bring their own accent. Italic on loss
           keeps it visually distinct without leaning on color alone. */
        .logp__line--loss { color: var(--fg-body, var(--fg-2)); font-style: italic; }
        .logp__line--buff { color: var(--fg-body, var(--fg-2)); }
        .logp__line--debuff { color: var(--fg-body, var(--fg-2)); }
        .logp__line--cond-end { color: var(--fg-2); font-style: italic; }
        .logp__tok--cond { color: var(--magic); font-style: italic; }
        .logp__speaker {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--fg-2);
        }
        /* Tag wrapper is layout/typography only — no color. Parens and
           separators inside the tag stay in body-text color; each
           numeric value brings its own color via a .logp__tag-part--*
           class on an inner span, so the eye tracks the numbers while
           the punctuation fades into prose. */
        .logp__tag {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
        }
        /* Inner value spans — paired with the same stat colors the
           inline prose tokens (.logp__tok--hp/mp) use, so "(+8 HP)"
           in a tag and "+8 HP" inline read identically. */
        .logp__tag-part--hp  { color: var(--log-hp, var(--hp)); text-shadow: 0 0 3px currentColor; }
        .logp__tag-part--mp  { color: var(--log-mp, var(--mp)); text-shadow: 0 0 3px currentColor; }
        .logp__tag-part--dmg { color: var(--log-neutral, var(--fg-1)); }
        .logp__tag-part--atk { color: var(--log-hp, var(--bad)); }
        .logp__tag-part--def { color: var(--log-muted, var(--fg-dim)); }
        /* Inline stat mentions — "+8 MP" and "+2 HP" appearing inside a
           log entry's body text rather than as a trailing tag. Share the
           stat colors and glow treatment with the tags so "(+8 HP)" and
           "+8 HP" read identically whether they're parenthetical tag or
           inline prose. */
        .logp__tok--hp { color: var(--log-hp, var(--hp)); text-shadow: 0 0 3px currentColor; font-variant-numeric: tabular-nums; }
        .logp__tok--mp { color: var(--log-mp, var(--mp)); text-shadow: 0 0 3px currentColor; font-variant-numeric: tabular-nums; }
        .logp__tok--name { color: var(--player, var(--accent-hot)); font-weight: 500; text-shadow: 0 0 3px currentColor; }
        .logp__tok--dir { color: var(--dir, var(--link)); text-shadow: 0 0 3px currentColor; font-variant-caps: all-small-caps; letter-spacing: 0.05em; }
        .logp__tok--mob { color: var(--bad); }
        .logp__tok--room { color: var(--magic); }
        .logp__tok--item { color: var(--good); }
        .logp__tok--cond { color: var(--magic); font-style: italic; }
        /* Spell names paint in the MP color so the source of magical
           damage / heals reads as a magic-stat thing rather than a regular
           weapon swing. Glow keeps it consistent with the other emphasis
           tokens on the line. */
        .logp__tok--spell { color: var(--mp); text-shadow: 0 0 3px currentColor; font-weight: 500; }
        .logp__tok--gold {
          color: #ffb040;
          text-shadow: 0 0 4px rgba(255, 176, 64, 0.4);
          font-variant-numeric: tabular-nums;
        }
        .logp__tok--xp {
          color: #ffffff;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
        }
        .logp__tok--link {
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          /* color comes from the sibling --name/--mob/--item/--room class */
          cursor: pointer;
          text-decoration: none;
        }
        .logp__tok--link:hover, .logp__tok--link:focus-visible {
          outline: none;
          text-shadow: var(--glow-sm);
        }
        .logp__line--tail { margin: 0; color: var(--fg-3); }
        .logp__invis { opacity: 0; }
        .logp__meta { display: inline-flex; align-items: center; gap: var(--sp-2); }
        .logp__state {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-2);
          padding: 2px var(--sp-2);
          border: 1px dashed var(--line-2);
        }
        .logp__state--paused {
          color: var(--warn);
          border-style: solid;
          border-color: var(--warn);
          text-shadow: var(--glow-sm);
        }
        .logp__lives {
          background: var(--bg-2);
          border: 1px solid var(--line-2);
          padding: 2px var(--sp-2);
          color: var(--fg-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          font-variant-numeric: tabular-nums;
          transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), text-shadow var(--dur-fast) var(--ease-crt);
        }
        .logp__lives:hover, .logp__lives:focus-visible {
          outline: none;
          color: var(--accent-hot);
          border-color: var(--line-3);
          text-shadow: var(--glow-sm);
        }
      `}</style>
    </Panel>
  )
}
