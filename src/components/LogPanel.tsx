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
  onSelectRoom?: (areaId: string, roomKey: string) => void
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
  world?: WorldContent,
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
  // thing when drunk, not a common-rarity thing. Applied via a CSS var
  // so themes can redefine --hp / --mp without touching this code.
  const potionColor = (effect: NonNullable<LogMeta['potionEffect']>) =>
    effect === 'heal' ? 'var(--hp)' : 'var(--mp)'
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
  if (meta.xpText) {
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

function Highlight({
  text,
  meta,
  world,
  onSubjectClick,
}: {
  text: string
  meta?: LogMeta
  world?: WorldContent
  onSubjectClick?: SubjectClickHandler
}) {
  if (!meta) return <>{text}</>
  const parts = buildParts(meta, world, onSubjectClick)
  if (parts.length === 0) return <>{text}</>

  const chunks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    let bestIdx = text.length
    let bestPart: HighlightPart | null = null
    for (const part of parts) {
      if (!part.match) continue
      const idx = text.indexOf(part.match, i)
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx
        bestPart = part
      }
    }
    if (!bestPart) {
      chunks.push(<Fragment key={key++}>{text.slice(i)}</Fragment>)
      break
    }
    if (bestIdx > i) {
      chunks.push(<Fragment key={key++}>{text.slice(i, bestIdx)}</Fragment>)
    }
    const matched = text.slice(bestIdx, bestIdx + bestPart.match.length)
    chunks.push(<Fragment key={key++}>{bestPart.render(matched)}</Fragment>)
    i = bestIdx + bestPart.match.length
  }
  return <>{chunks}</>
}

function LogLine({
  entry,
  world,
  onSubjectClick,
}: {
  entry: LogEntry
  world?: WorldContent
  onSubjectClick?: SubjectClickHandler
}) {
  const meta = 'meta' in entry ? entry.meta : undefined

  switch (entry.kind) {
    case 'narrative':
      return (
        <p className="logp__line logp__line--narrative">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'system':
      return <p className="logp__line logp__line--system">{entry.text}</p>

    case 'chapter':
      return (
        <p className="logp__line logp__line--chapter">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
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

    case 'damage':
      // Line keeps body color; the verb span carries the severity styling so
      // "the" / "a" / punctuation don't drag an effect along with it.
      return (
        <p className="logp__line logp__line--narrative">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'heal':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
          {typeof entry.amount === 'number' ? (
            <span className="logp__tag logp__tag--hp"> (+{entry.amount} HP)</span>
          ) : null}
        </p>
      )

    case 'loot':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'consume': {
      const tag = entry.effect === 'heal' ? `+${entry.amount} HP` : `+${entry.amount} MP`
      const tagClass =
        entry.effect === 'restore-magic'
          ? 'logp__tag logp__tag--mp'
          : 'logp__tag logp__tag--hp'
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
          <span className={tagClass}> ({tag})</span>
        </p>
      )
    }

    case 'equip':
      return (
        <p className="logp__line logp__line--action">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'death-loss':
      return (
        <p className="logp__line logp__line--loss">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )

    case 'condition-gain': {
      const cls =
        'logp__line ' +
        (entry.polarity === 'buff' ? 'logp__line--buff' : 'logp__line--debuff')
      return (
        <p className={cls}>
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )
    }

    case 'condition-tick':
      return (
        <p className="logp__line logp__line--debuff">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
          {entry.amount > 0 ? <span className="logp__tag"> (−{entry.amount} HP)</span> : null}
        </p>
      )

    case 'condition-end':
      return (
        <p className="logp__line logp__line--cond-end">
          <Highlight text={entry.text} meta={meta} world={world} onSubjectClick={onSubjectClick} />
        </p>
      )
  }
}

export default function LogPanel({
  character,
  entries,
  state,
  paused,
  onSelectRoom,
}: Props) {
  const lines = entries ?? sampleEntries(character.name)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showDeaths, setShowDeaths] = useState(false)
  const [popover, setPopover] = useState<{ subject: Subject; anchor: DOMRect } | null>(null)

  const world = getWorldContent(character.worldId)
  const area = world?.startingArea

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

    // Render roomName as a clickable link when we have a key and a handler.
    const roomNode: ReactNode = d.roomName
      ? onSelectRoom && d.roomKey && d.areaId ? (
          <button
            type="button"
            className="logp__tok logp__tok--room logp__tok--link"
            data-tip="Show on map"
            onClick={() => {
              onSelectRoom(d.areaId, d.roomKey!)
              setShowDeaths(false)
            }}
          >
            {d.roomName}
          </button>
        ) : (
          <span className="logp__tok logp__tok--room">{d.roomName}</span>
        )
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
              area,
              mobs: world?.mobs,
              items: world?.items,
              defeatedMobs,
            }}
            actions={{
              onClose: () => setPopover(null),
              onShowRoom: onSelectRoom,
            }}
          />
        )}
      </Popover>
      <div className="logp-wrap">
        <div className="logp" ref={scrollRef}>
          {lines.map((entry, i) => (
            <LogLine key={i} entry={entry} world={world} onSubjectClick={onSubjectClick} />
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
        .logp__tag {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          color: var(--accent-hot);
        }
        /* HP / MP restore tags paint in their respective stat colors so
           "(+8 HP)" and "(+6 MP)" read as the stat they're healing
           rather than the generic accent. Paired with the effect-colored
           potion name above. */
        .logp__tag--hp { color: var(--hp); text-shadow: 0 0 3px currentColor; }
        .logp__tag--mp { color: var(--mp); text-shadow: 0 0 3px currentColor; }
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
