import { useMemo } from 'react'
import Panel from './Panel'
import type { Character } from '../character'
import { roomKey, visitedKey, type Area, type Room } from '../areas'
import { getWorldContent } from '../worlds'

interface Props {
  character: Character
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
}

const EMPTY_AREA: Area = {
  id: 'unknown',
  name: 'Unknown',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: {},
}

export default function MapPanel({ character, selectedKey: externalSelected, onSelect }: Props) {
  const area = getWorldContent(character.worldId)?.startingArea ?? EMPTY_AREA
  const { position, visitedRooms } = character

  const visitedInArea = useMemo(() => {
    const prefix = `${area.id}:`
    const set = new Set<string>()
    for (const key of visitedRooms) {
      if (key.startsWith(prefix)) set.add(key.slice(prefix.length))
    }
    return set
  }, [area.id, visitedRooms])

  const bbox = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const key of visitedInArea) {
      const [xs, ys] = key.split(',')
      const x = Number(xs)
      const y = Number(ys)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { minX, maxX, minY, maxY }
  }, [visitedInArea])

  const currentKey = roomKey(position.x, position.y, position.z)
  const shownKey = externalSelected ?? currentKey
  const shownRoom: Room | undefined = area.rooms[shownKey]

  const hasAny = visitedInArea.size > 0

  const hasMultipleFloors = useMemo(() => {
    let firstZ: number | null = null
    for (const key in area.rooms) {
      const z = area.rooms[key].z
      if (firstZ === null) firstZ = z
      else if (z !== firstZ) return true
    }
    return false
  }, [area.rooms])

  const meta = hasMultipleFloors
    ? `F${position.z + 1} · ${area.name}`
    : area.name

  return (
    <Panel title="Map" meta={meta} className="scanlines flicker">
      <div className="mapp">
        <div className="mapp__grid-wrap">
          {hasAny ? (
            <div
              className="mapp__grid"
              style={{
                gridTemplateColumns: `repeat(${bbox.maxX - bbox.minX + 1}, var(--mapp-cell))`,
                gridTemplateRows: `repeat(${bbox.maxY - bbox.minY + 1}, var(--mapp-cell))`,
              }}
            >
              {[...visitedInArea].map((key) => {
                const [xs, ys] = key.split(',')
                const x = Number(xs)
                const y = Number(ys)
                const fullKey = visitedKey(area.id, x, y, position.z)
                const isCurrent = key === currentKey
                const isSelected = key === shownKey
                return (
                  <button
                    key={fullKey}
                    type="button"
                    className={
                      'mapp__cell' +
                      (isCurrent ? ' mapp__cell--current' : '') +
                      (isSelected && !isCurrent ? ' mapp__cell--selected' : '')
                    }
                    style={{
                      gridColumn: x - bbox.minX + 1,
                      gridRow: y - bbox.minY + 1,
                    }}
                    onClick={() => onSelect?.(key === currentKey ? null : key)}
                    aria-label={area.rooms[key]?.name ?? 'Unknown room'}
                    title={area.rooms[key]?.name ?? ''}
                  >
                    {isCurrent && <span className="mapp__you">@</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mapp__placeholder">No rooms to remember yet.</div>
          )}
        </div>
        <div className="mapp__room">
          {shownRoom ? (
            <>
              <div className="mapp__room-name">{shownRoom.name}</div>
              <p className="mapp__room-desc">{shownRoom.description}</p>
            </>
          ) : (
            <div className="mapp__room-name mapp__room-name--dim">—</div>
          )}
        </div>
      </div>
      <style>{`
        .mapp { flex: 1; min-height: 0; display: flex; flex-direction: row; gap: var(--sp-3); --mapp-cell: 28px; }
        .mapp__grid-wrap { background: var(--bg-inset); box-shadow: var(--shadow-inset); border: 1px solid var(--line-1); padding: var(--sp-3); display: flex; align-items: center; justify-content: center; min-width: 800px; min-height: 300px; flex-shrink: 0; }
        .mapp__grid { display: grid; gap: 2px; }
        .mapp__cell { width: var(--mapp-cell); height: var(--mapp-cell); background: var(--bg-2); border: 1px solid var(--line-1); padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--fg-2); font-family: var(--font-mono); font-size: var(--text-sm); transition: border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .mapp__cell:hover { border-color: var(--line-3); }
        .mapp__cell--selected { border-color: var(--line-3); background: var(--bg-3); }
        .mapp__cell--current { border-color: var(--line-3); background: var(--bg-3); color: var(--accent-hot); text-shadow: var(--glow-sm); }
        .mapp__you { line-height: 1; }
        .mapp__placeholder { color: var(--fg-3); font-style: italic; font-family: var(--font-body); font-size: var(--text-sm); }
        .mapp__room { flex: 1; min-width: 0; padding-left: var(--sp-3); border-left: 1px solid var(--line-1); font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); line-height: var(--leading-log); overflow-y: auto; }
        .mapp__room-name { font-family: var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; color: var(--magic); font-size: var(--text-md); }
        .mapp__room-name--dim { color: var(--fg-3); }
        .mapp__room-desc { margin: var(--sp-1) 0 0 0; color: var(--fg-2); }
      `}</style>
    </Panel>
  )
}
