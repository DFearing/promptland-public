import Panel from './Panel'
import type { Character } from '../character'
import { ROOM_TYPE_VISUALS, roomKey, type Area } from '../areas'
import { getWorldContent } from '../worlds'

interface Props {
  character: Character
  /** null/undefined = follow the character's current room. */
  selectedKey?: string | null
}

const EMPTY_AREA: Area = {
  id: 'unknown',
  name: 'Unknown',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: {},
}

export default function RoomDescPanel({ character, selectedKey }: Props) {
  const area = getWorldContent(character.worldId)?.startingArea ?? EMPTY_AREA
  const { position } = character
  const currentKey = roomKey(position.x, position.y, position.z)
  const shownKey = selectedKey ?? currentKey
  const room = area.rooms[shownKey]
  const visual = room ? ROOM_TYPE_VISUALS[room.type] : undefined
  // Pinned means the user clicked a non-current room on the map — the panel
  // is displaying that room's description and will keep displaying it even
  // as the character moves. Surfacing this visually (meta badge + warm
  // outline) makes it obvious the panel isn't auto-following.
  const isPinned = !!selectedKey && selectedKey !== currentKey
  const meta = isPinned ? (
    <span className="roomd__meta-pinned">📌 Pinned</span>
  ) : (
    visual?.label
  )

  return (
    <Panel title="Room" meta={meta}>
      <div className={'roomd' + (isPinned ? ' roomd--pinned' : '')}>
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
          padding: var(--sp-2);
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
          box-shadow: var(--shadow-inset);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: var(--leading-normal, 1.45);
          overflow-y: auto;
          transition: border-color var(--dur-fast) var(--ease-crt),
                      box-shadow var(--dur-fast) var(--ease-crt);
        }
        /* Pinned state: warn-colored border + inner glow that matches the
           yellow/orange dashed outline on the map's selected tile, so the
           two UI states (selected tile + pinned panel) read as the same
           "you're inspecting this room, not where you are" mode. */
        .roomd--pinned {
          border-color: var(--warn);
          box-shadow: var(--shadow-inset), inset 0 0 10px color-mix(in srgb, var(--warn) 18%, transparent);
        }
        .roomd__meta-pinned {
          color: var(--warn);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-shadow: 0 0 6px color-mix(in srgb, var(--warn) 40%, transparent);
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
