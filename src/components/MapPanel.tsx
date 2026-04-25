import { useEffect, useMemo, useRef, useState } from 'react'
import Panel from './Panel'
import type { Character } from '../character'
import {
  ROOM_TYPE_VISUALS,
  roomKey,
  visitedKey,
  type Area,
} from '../areas'
import { rarityColor } from '../items'
import { getWorldContent } from '../worlds'

/** How many recent rooms (including current) participate in the trail-fade
 *  effect. The current room is darkest; each older step lightens one band
 *  until the background matches the baseline tile color. */
const TRAIL_LENGTH = 6

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
  const worldContent = getWorldContent(character.worldId)
  const area =
    worldContent?.areas?.find((a) => a.id === character.position.areaId) ??
    worldContent?.startingArea ??
    EMPTY_AREA
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

  // Rolling trail of the last TRAIL_LENGTH distinct room keys, most recent
  // first. Rebuilt in a ref+state pair so re-renders see an updated list
  // without spamming state writes when the position doesn't change. Not
  // persisted to storage — the trail is a session-local visualization, and
  // resetting on reload is fine (the map itself still remembers visits).
  const historyRef = useRef<string[]>([currentKey])
  const [history, setHistory] = useState<string[]>(historyRef.current)
  useEffect(() => {
    const prev = historyRef.current
    if (prev[0] === currentKey) return
    const next = [currentKey, ...prev.filter((k) => k !== currentKey)].slice(
      0,
      TRAIL_LENGTH,
    )
    historyRef.current = next
    setHistory(next)
  }, [currentKey])
  const trailIndexByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < history.length; i++) map.set(history[i], i)
    return map
  }, [history])

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

  // Area name gets the rarity color so it reads as a first-class world-state
  // element. Absent rarity falls through to `common`. Rendering the meta as
  // JSX (rather than a string) lets us color just the name while keeping any
  // floor prefix in a neutral muted tone.
  const areaColor = rarityColor(area.rarity ?? 'common')
  const meta = (
    <span className="mapp__area">
      {hasMultipleFloors && (
        <span className="mapp__area-floor">F{position.z + 1}</span>
      )}
      <span className="mapp__area-name" style={{ color: areaColor }}>
        {area.name}
      </span>
    </span>
  )

  // Pull together the room-type entries that actually appear in this area
  // for the legend strip below the grid. Filtering to "what's been visited"
  // would shrink the legend to nothing on a fresh game; instead we list
  // every type the area itself contains so the player can recognize an
  // icon the moment they walk into the room. `entrance` is omitted because
  // the @ player marker takes its place visually.
  const legendEntries = useMemo(() => {
    const seen = new Set<string>()
    for (const key in area.rooms) {
      const room = area.rooms[key]
      if (room.type === 'entrance') continue
      seen.add(room.type)
    }
    return Array.from(seen).map((id) => ({ id, visual: ROOM_TYPE_VISUALS[id as keyof typeof ROOM_TYPE_VISUALS] }))
  }, [area.rooms])

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
                const room = area.rooms[key]
                const visual = room ? ROOM_TYPE_VISUALS[room.type] : undefined
                const tip = room
                  ? visual
                    ? `${room.name} · ${visual.label}`
                    : room.name
                  : ''
                // Trail band 0 = current room (darkest), rising bands lighten
                // back toward the baseline. Non-trail cells get band -1 and
                // render with no darkening at all.
                const trailBand = trailIndexByKey.get(key) ?? -1
                return (
                  <button
                    key={fullKey}
                    type="button"
                    className={
                      'mapp__cell' +
                      (isCurrent ? ' mapp__cell--current' : '') +
                      (isSelected && !isCurrent ? ' mapp__cell--selected' : '') +
                      (trailBand >= 0 && !isCurrent ? ' mapp__cell--trail' : '')
                    }
                    style={{
                      gridColumn: x - bbox.minX + 1,
                      gridRow: y - bbox.minY + 1,
                      // Per-type color applies only when the cell isn't the
                      // current room — the current-room style wins with the
                      // accent-hot player glyph on top of the type color.
                      ['--mapp-glyph-color' as string]: visual?.color ?? 'var(--fg-2)',
                      // Trail alpha ramps from ~0.55 at the current room
                      // down to 0 at TRAIL_LENGTH, interpolated so each step
                      // fades uniformly back to the baseline tile color.
                      ['--mapp-trail-alpha' as string]:
                        trailBand >= 0
                          ? (0.55 * (1 - trailBand / TRAIL_LENGTH)).toFixed(3)
                          : '0',
                    }}
                    onClick={() => {
                      // Clicking either the current-player tile or the
                      // already-pinned tile clears the selection (panel
                      // resumes auto-following). Anything else pins that
                      // tile instead.
                      const alreadyPinned = externalSelected === key
                      onSelect?.(key === currentKey || alreadyPinned ? null : key)
                    }}
                    aria-label={tip || 'Unknown room'}
                    data-tip={tip}
                  >
                    {isCurrent ? (
                      <span className="mapp__you">@</span>
                    ) : visual ? (
                      <span className="mapp__glyph">{visual.glyph}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mapp__placeholder">No rooms to remember yet.</div>
          )}
        </div>
        {legendEntries.length > 0 && (
          <ul className="mapp__legend" aria-label="Map key">
            <li className="mapp__legend-item" data-tip="Your character's current location">
              <span className="mapp__legend-glyph mapp__legend-glyph--you">@</span>
              <span className="mapp__legend-label">You</span>
            </li>
            {legendEntries.map(({ id, visual }) => (
              <li
                key={id}
                className="mapp__legend-item"
                data-tip={visual?.hint ?? visual?.label ?? id}
              >
                <span
                  className="mapp__legend-glyph"
                  style={{ color: visual?.color ?? 'var(--fg-2)' }}
                >
                  {visual?.glyph ?? '?'}
                </span>
                <span className="mapp__legend-label">{visual?.label ?? id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <style>{`
        /* Cell size has been bumped twice — 22 → 33 → 50px — so rooms read
           as prominent tiles instead of faint specks. The room description
           panel that used to sit under the grid now lives to the left as its
           own panel, giving both the grid and the description full vertical
           height. */
        .mapp { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-2); --mapp-cell: 50px; }
        .mapp__grid-wrap { flex: 1; min-height: 0; background: var(--bg-inset); box-shadow: var(--shadow-inset); border: 1px solid var(--line-1); padding: var(--sp-2); display: flex; align-items: center; justify-content: center; overflow: auto; }
        .mapp__grid { display: grid; gap: 2px; }
        /* Cell background layers: the base tile color, plus a trail-accent
           overlay controlled by --mapp-trail-alpha. The overlay is the
           accent color at low opacity — darkening pure-black was invisible
           on near-black tile backgrounds, but a warm accent tint fading
           from recent-visited to nothing reads on any theme. The overlay
           lives on a pseudo-element so trail fade, selected highlight, and
           current marker can stack without fighting over the same
           property. */
        .mapp__cell {
          position: relative;
          width: var(--mapp-cell);
          height: var(--mapp-cell);
          background: var(--bg-2);
          border: 1px solid var(--line-1);
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--fg-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          transition: border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .mapp__cell::before {
          content: '';
          position: absolute;
          inset: 0;
          background: color-mix(
            in srgb,
            var(--accent) calc(var(--mapp-trail-alpha, 0) * 55%),
            transparent
          );
          pointer-events: none;
          transition: background var(--dur-base) var(--ease-crt);
        }
        .mapp__cell:hover { border-color: var(--line-3); }
        /* Selected tile gets a dashed warn-colored (yellow/orange) outline —
           distinct from the accent-hot solid ring on the current-player
           tile, so "pinned for inspection" and "this is where I am" read
           as two separate UI states at a glance. */
        .mapp__cell--selected {
          outline: 2px dashed var(--warn);
          outline-offset: -3px;
          border-color: var(--warn);
          box-shadow: 0 0 6px var(--warn);
        }
        .mapp__cell--selected::after {
          content: '';
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--warn) 12%, transparent);
          pointer-events: none;
        }
        /* Current-player tile — brightest treatment of the bunch, with a
           glowing accent border and a stronger warm overlay on the trail
           pseudo-element (band 0 of the recency ramp). */
        .mapp__cell--current {
          border-color: var(--accent-hot);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
          box-shadow: 0 0 10px var(--accent-hot),
                      inset 0 0 10px color-mix(in srgb, var(--accent-hot) 25%, transparent);
        }
        .mapp__cell--current::before {
          background: color-mix(in srgb, var(--accent-hot) 18%, transparent);
        }
        /* Player marker scales with the tile, matching the room-type glyph
           size. Previously a fixed tiny font that vanished on 50px tiles.
           position+z-index keep it above the trail overlay pseudo-element. */
        .mapp__you {
          position: relative;
          z-index: 1;
          line-height: 1;
          font-size: calc(var(--mapp-cell) * 0.6);
          font-weight: 700;
        }
        /* Per-type glyph color injected by the cell style. Font size scales
           with cell size so the glyphs stay readable at any tile scale. */
        .mapp__glyph {
          line-height: 1;
          color: var(--mapp-glyph-color, var(--fg-2));
          text-shadow: 0 0 3px var(--mapp-glyph-color, transparent);
          font-size: calc(var(--mapp-cell) * 0.55);
          position: relative;
          z-index: 1;
        }
        .mapp__placeholder { color: var(--fg-3); font-style: italic; font-family: var(--font-body); font-size: var(--text-sm); }

        /* Legend strip — sits below the grid, wraps when narrow. Each item
           is a glyph + label pair painted in the type's accent color so the
           UI doubles as a quick-glance reference for "what does ⌂ mean?". */
        .mapp__legend {
          list-style: none;
          margin: 0;
          padding: var(--sp-1) var(--sp-2);
          display: flex;
          flex-wrap: wrap;
          gap: var(--sp-1) var(--sp-3);
          background: var(--bg-inset);
          border: 1px solid var(--line-1);
          box-shadow: var(--shadow-inset);
        }
        .mapp__legend-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-2);
          letter-spacing: 0.04em;
          cursor: default;
        }
        .mapp__legend-glyph {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          text-shadow: 0 0 3px currentColor;
        }
        .mapp__legend-glyph--you { color: var(--accent-hot); }
        .mapp__legend-label {
          color: var(--fg-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        /* Panel meta used to render area name in tiny dim text that was easy
           to overlook. It now reads as a display-font tag colored by area
           rarity, with an optional floor prefix kept muted for contrast. */
        .mapp__area {
          display: inline-flex;
          align-items: baseline;
          gap: var(--sp-1);
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.06em;
          text-transform: none;
        }
        .mapp__area-floor {
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .mapp__area-name {
          text-shadow: 0 0 6px currentColor, 0 0 2px rgba(0, 0, 0, 0.6);
          font-weight: 600;
        }
      `}</style>
    </Panel>
  )
}
