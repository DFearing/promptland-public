import Panel from './Panel'
import type { Character } from '../character'
import { ROOM_TYPE_VISUALS, roomKey, type Area } from '../areas'
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
  const meta = visual?.label

  return (
    <Panel title="Room" meta={meta} noPad>
      <div className="roomd">
        {room ? (
          <>
            <span className="roomd__name">{room.name}</span>
            <span className="roomd__desc">{room.description}</span>
          </>
        ) : (
          <span className="roomd__name roomd__name--dim">—</span>
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
        .roomd__name {
          font-family: var(--font-display);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--magic);
          font-size: var(--text-md);
          flex-shrink: 0;
        }
        .roomd__name--dim { color: var(--fg-3); }
        .roomd__desc {
          color: var(--fg-body, var(--fg-2));
          white-space: pre-line;
        }
      `}</style>
    </Panel>
  )
}
