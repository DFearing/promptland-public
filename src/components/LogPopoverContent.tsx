import type { Area } from '../areas'
import { ROOM_TYPE_VISUALS, roomKey as makeRoomKey } from '../areas'
import type { Character, InventoryItem } from '../character'
import { describeCharacter, xpToNextLevel } from '../character'
import type { BonusBreakdown } from '../game'
import type { ItemDef } from '../items'
import type { MobTemplate } from '../mobs'
import { formatRelative } from '../util/time'

export type Subject =
  | { kind: 'room'; areaId: string; roomKey: string; name: string }
  | { kind: 'mob'; name: string }
  | { kind: 'item'; id: string; name: string }
  | { kind: 'character' }
  | { kind: 'effect'; name: string }
  | { kind: 'stat-bonus'; stat: string; breakdown: BonusBreakdown }

export interface SubjectContext {
  character: Character
  area?: Area
  mobs?: MobTemplate[]
  items?: ItemDef[]
  /** Names of mobs that have fallen in this session. Derived from the
   *  current log so popovers can say DEAD instead of Hostile for a corpse
   *  the player clicks on after the fight. */
  defeatedMobs?: Set<string>
}

export interface SubjectActions {
  onClose: () => void
  onShowRoom?: (areaId: string, roomKey: string) => void
}

interface Props {
  subject: Subject
  ctx: SubjectContext
  actions: SubjectActions
}

export default function LogPopoverContent({ subject, ctx, actions }: Props) {
  switch (subject.kind) {
    case 'room':
      return <RoomContent subject={subject} ctx={ctx} actions={actions} />
    case 'mob':
      return <MobContent subject={subject} ctx={ctx} />
    case 'item':
      return <ItemContent subject={subject} ctx={ctx} />
    case 'character':
      return <CharacterContent ctx={ctx} />
    case 'effect':
      return <EffectContent subject={subject} />
    case 'stat-bonus':
      return <StatBonusContent subject={subject} />
  }
}

function RoomContent({
  subject,
  ctx,
  actions,
}: {
  subject: Extract<Subject, { kind: 'room' }>
  ctx: SubjectContext
  actions: SubjectActions
}) {
  const room = ctx.area?.id === subject.areaId
    ? ctx.area.rooms[subject.roomKey]
    : undefined
  const here = ctx.area && ctx.area.id === ctx.character.position.areaId
    ? makeRoomKey(ctx.character.position.x, ctx.character.position.y, ctx.character.position.z)
    : null
  const isHere = here === subject.roomKey

  return (
    <>
      <h3 className="popover__title popover__title--room">{room?.name ?? subject.name}</h3>
      <p className="popover__meta">
        Room
        {room?.type ? ` · ${ROOM_TYPE_VISUALS[room.type].label}` : ''}
        {isHere ? ' · current location' : ''}
      </p>
      {room?.description ? (
        <p className="popover__body">{room.description}</p>
      ) : (
        <p className="popover__body popover__body--muted">
          You haven't been here yet.
        </p>
      )}
      {actions.onShowRoom && (
        <div className="popover__actions">
          <button
            type="button"
            className="popover__btn"
            onClick={() => {
              actions.onShowRoom!(subject.areaId, subject.roomKey)
              actions.onClose()
            }}
          >
            Show on map
          </button>
        </div>
      )}
    </>
  )
}

function MobContent({
  subject,
  ctx,
}: {
  subject: Extract<Subject, { kind: 'mob' }>
  ctx: SubjectContext
}) {
  // Rarity-prefixed names come through from combat (e.g. "Strong Cave Rat").
  // Try an exact match first, then fall back to a suffix match against the
  // base template name so popovers work for modified spawns.
  const mob =
    ctx.mobs?.find((m) => m.name === subject.name) ??
    ctx.mobs?.find((m) => subject.name.endsWith(m.name))
  const dead = ctx.defeatedMobs?.has(subject.name) ?? false
  return (
    <>
      <h3
        className={
          'popover__title popover__title--mob' +
          (dead ? ' popover__title--dead' : '')
        }
      >
        {subject.name}
      </h3>
      <p className={'popover__meta' + (dead ? ' popover__meta--dead' : '')}>
        {dead ? 'DEAD' : 'Hostile'}
      </p>
      {mob ? (
        <p className="popover__body">{mob.description}</p>
      ) : (
        <p className="popover__body popover__body--muted">
          No details for this creature.
        </p>
      )}
    </>
  )
}

function ItemContent({
  subject,
  ctx,
}: {
  subject: Extract<Subject, { kind: 'item' }>
  ctx: SubjectContext
}) {
  const def = ctx.items?.find((i) => i.id === subject.id)
  // Pull the most recent matching inventory entry — for repeat archetypes
  // we surface the highest-level / freshest pickup so the popover
  // describes a representative example. Equipped slots are inspected too
  // because a worn item won't appear in the loose inventory list.
  const owned = findOwnedItem(ctx.character, subject.id)
  return (
    <>
      <h3 className="popover__title popover__title--item">{def?.name ?? subject.name}</h3>
      <p className="popover__meta">
        Item
        {owned?.level ? ` · Lv ${owned.level}` : ''}
        {def?.value != null ? ` · worth ${def.value}` : ''}
        {def?.stackable ? ' · stackable' : ''}
      </p>
      {def?.description ? (
        <p className="popover__body">{def.description}</p>
      ) : (
        <p className="popover__body popover__body--muted">No details.</p>
      )}
      {owned?.acquired && (
        <p className="popover__meta popover__meta--acquired">
          {acquiredLine(owned.acquired)}
        </p>
      )}
    </>
  )
}

function acquiredLine(a: NonNullable<InventoryItem['acquired']>): string {
  const when = formatRelative(a.at)
  switch (a.source) {
    case 'mob':
      return a.mobName
        ? a.roomName
          ? `Won from ${a.mobName} in the ${a.roomName} · ${when}`
          : `Won from ${a.mobName} · ${when}`
        : `Won in battle · ${when}`
    case 'starting':
      return `Carried from the start · ${when}`
    case 'shop':
      return `Purchased · ${when}`
    case 'dev':
      return `Conjured · ${when}`
    default:
      return when
  }
}

function findOwnedItem(c: Character, archetypeId: string): InventoryItem | null {
  const candidates: InventoryItem[] = []
  for (const it of c.inventory ?? []) {
    if (it.archetypeId === archetypeId) candidates.push(it)
  }
  for (const slot of [
    c.equipped.weapon,
    c.equipped.offhand,
    c.equipped.armor,
    c.equipped.head,
    c.equipped.arms,
    c.equipped.hands,
    c.equipped.legs,
    c.equipped.feet,
    c.equipped.cape,
    c.equipped.amulet,
    c.equipped.ring1,
    c.equipped.ring2,
  ]) {
    if (slot?.archetypeId === archetypeId) candidates.push(slot)
  }
  if (candidates.length === 0) return null
  // Prefer the freshest acquisition so the popover stays current after
  // multiple drops of the same archetype.
  candidates.sort((a, b) => (b.acquired?.at ?? 0) - (a.acquired?.at ?? 0))
  return candidates[0]
}

function CharacterContent({ ctx }: { ctx: SubjectContext }) {
  const c = ctx.character
  const d = describeCharacter(c)
  const subtitle = [d.speciesName, d.className].filter(Boolean).join(' · ')
  const nextXp = xpToNextLevel(c.level)
  return (
    <>
      <h3 className="popover__title popover__title--name">{c.name}</h3>
      <p className="popover__meta">
        Level {c.level}
        {subtitle ? ` · ${subtitle}` : ''}
        {d.worldName ? ` · ${d.worldName}` : ''}
      </p>
      <p className="popover__body">
        HP {c.hp} / {c.maxHp}
        {' · '}
        XP {c.xp} / {nextXp}
      </p>
      <p className="popover__meta">
        STR {c.stats.strength} · DEX {c.stats.dexterity} · CON {c.stats.constitution}
        {' · '}
        INT {c.stats.intelligence} · WIS {c.stats.wisdom} · CHA {c.stats.charisma}
      </p>
    </>
  )
}

function EffectContent({
  subject,
}: {
  subject: Extract<Subject, { kind: 'effect' }>
}) {
  return (
    <>
      <h3 className="popover__title popover__title--effect">{subject.name}</h3>
      <p className="popover__body popover__body--muted">
        Effects and spells aren't tracked in the data model yet.
      </p>
    </>
  )
}

function StatBonusContent({
  subject,
}: {
  subject: Extract<Subject, { kind: 'stat-bonus' }>
}) {
  const { stat, breakdown } = subject
  return (
    <>
      <h3 className="popover__title popover__title--effect">{stat} bonus</h3>
      <p className="popover__meta">
        +{breakdown.total} from {breakdown.sources.length}{' '}
        {breakdown.sources.length === 1 ? 'source' : 'sources'}
      </p>
      {breakdown.sources.length === 0 ? (
        <p className="popover__body popover__body--muted">No contributors.</p>
      ) : (
        <ul className="popover__list">
          {breakdown.sources.map((s, i) => (
            <li key={i} className="popover__list-row">
              <span className="popover__list-name">
                {s.name}
                {s.slot && (
                  <span className="popover__list-slot"> ({s.slot})</span>
                )}
              </span>
              <span className="popover__list-val">+{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
