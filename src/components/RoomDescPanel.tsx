import Panel from './Panel'
import type { Character } from '../character'
import { ROOM_TYPE_VISUALS, roomKey, type Area } from '../areas'
import { rarityLabel } from '../items'
import { getWorldContent } from '../worlds'

interface Props {
  character: Character
}

const EMPTY_AREA: Area = {
  id: 'unknown',
  name: 'Unknown',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: {},
}

export default function RoomDescPanel({ character }: Props) {
  const worldContent = getWorldContent(character.worldId)
  const area =
    worldContent?.areas?.find((a) => a.id === character.position.areaId) ??
    worldContent?.startingArea ??
    EMPTY_AREA
  const { position } = character
  const currentKey = roomKey(position.x, position.y, position.z)
  const room = area.rooms[currentKey]
  const visual = room ? ROOM_TYPE_VISUALS[room.type] : undefined

  // Area-derived rarity + level. Rooms don't carry their own rarity/level
  // (only Areas do), so this communicates "what tier of area this room
  // sits in" — rendered in the Panel's subtitle slot directly below the
  // "ROOM" title. Kept uncolored; rarity still drives the word "UNCOMMON"
  // etc., but the tint is dropped so the chip family reads consistently
  // across panels.
  const areaRarity = area.rarity ?? 'common'
  const areaLevel = area.level
  const subText = areaLevel != null
    ? `${rarityLabel(areaRarity)} · Lv ${areaLevel}`
    : rarityLabel(areaRarity)
  const subtitle = room ? <span>{subText}</span> : null

  // Panel meta mirrors MapPanel's two-line layout: the room name on top,
  // the room type (e.g. "CHAMBER") below in the smaller meta-chip style.
  // Puts the room's identity next to the "ROOM" title rather than buried
  // in the body, and lets the body be description-only.
  const meta = room ? (
    <span className="roomd__meta">
      <span className="roomd__meta-name">{room.name}</span>
      {visual?.label && (
        <span className="roomd__meta-type">{visual.label}</span>
      )}
    </span>
  ) : null

  return (
    <Panel title="Room" subtitle={subtitle} meta={meta} noPad>
      <div className="roomd">
        {room ? (
          <span className="roomd__desc">{room.description}</span>
        ) : (
          <span className="roomd__empty">—</span>
        )}
      </div>
      <style>{`
        .roomd {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-3) var(--sp-4);
          background: var(--bg-inset);
          font-family: var(--font-body);
          font-size: var(--text-xs);
          line-height: var(--leading-normal, 1.45);
          overflow-y: auto;
        }
        /* Meta stack — room name on top (display font), room type below
           (smaller mono chip). Right-aligned so both lines hang off the
           Panel header's right edge together, matching MapPanel's area
           name + kind pairing. */
        .roomd__meta {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          line-height: 1.1;
        }
        .roomd__meta-name {
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .roomd__meta-type {
          font-family: var(--font-mono);
          font-size: calc(var(--text-xs) * 0.9);
          color: var(--fg-3);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .roomd__desc {
          color: var(--fg-body, var(--fg-2));
          white-space: pre-line;
        }
        .roomd__empty { color: var(--fg-3); font-style: italic; }
      `}</style>
    </Panel>
  )
}
