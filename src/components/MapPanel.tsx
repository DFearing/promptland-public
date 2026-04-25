import { useMemo, useState } from 'react'
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

/** Scale + vertical nudge (in ems) for the "@" player marker so its ink
 *  size and vertical center line up with the balanced legend glyphs.
 *  Matches the glyphScale / glyphYOffset pattern on RoomTypeVisual —
 *  values come from tools/measure-glyphs.mjs. */
const YOU_SCALE = 0.85
const YOU_Y_OFFSET = -0.05

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

export default function MapPanel({ character }: Props) {
  const worldContent = getWorldContent(character.worldId)
  const currentArea =
    worldContent?.areas?.find((a) => a.id === character.position.areaId) ??
    worldContent?.startingArea ??
    EMPTY_AREA
  // When pinned, the map keeps showing whatever area was visible when the
  // user checked the box, even if the character moves to a different area.
  // Stores the pinned area id so state survives re-renders; resolves to the
  // actual Area at render time so stale snapshots don't linger if the area
  // data shifts.
  const [pinnedAreaId, setPinnedAreaId] = useState<string | null>(null)
  const pinnedArea = pinnedAreaId
    ? worldContent?.areas?.find((a) => a.id === pinnedAreaId) ?? null
    : null
  const area = pinnedArea ?? currentArea
  const isPinned = pinnedArea != null
  const { position, visitedRooms } = character

  // The map renders one floor at a time. Without this filter, rooms at the
  // same (x, y) but different z all collapse into the same grid cell and
  // fight for visibility — most visibly, going up to z=1 while a z=0 room
  // is already visited at the same (x, y) hides the @ under the older
  // glyph. Pick the current floor when the character is in this area, and
  // fall back to the area's starting floor for pinned views of other
  // areas (there's no selector UI yet; this keeps the default sane).
  const displayedZ =
    character.position.areaId === area.id ? position.z : area.startZ

  const visitedInArea = useMemo(() => {
    const prefix = `${area.id}:`
    const suffix = `,${displayedZ}`
    const set = new Set<string>()
    for (const key of visitedRooms) {
      if (!key.startsWith(prefix)) continue
      const coords = key.slice(prefix.length)
      if (coords.endsWith(suffix)) set.add(coords)
    }
    return set
  }, [area.id, displayedZ, visitedRooms])

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
  // Only mark the `@` tile when the character is actually standing in the
  // area we're rendering. With a pin active the displayed area can be
  // somewhere the character left behind, in which case no room on this map
  // should read as "current location."
  const charInDisplayedArea = character.position.areaId === area.id

  // Rolling trail of the last TRAIL_LENGTH distinct room keys, most recent
  // first. Not persisted to storage — the trail is a session-local
  // visualization, and resetting on reload is fine (the map itself still
  // remembers visits). Uses React's "adjust state on prop change during
  // render" pattern: compare currentKey against prevKey, and if it changed,
  // update both. React restarts the render in place before any child sees
  // the stale values. https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevKey, setPrevKey] = useState(currentKey)
  const [history, setHistory] = useState<string[]>(() => [currentKey])
  if (currentKey !== prevKey) {
    setPrevKey(currentKey)
    setHistory((prev) =>
      prev[0] === currentKey
        ? prev
        : [currentKey, ...prev.filter((k) => k !== currentKey)].slice(
            0,
            TRAIL_LENGTH,
          ),
    )
  }
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
      {hasMultipleFloors && charInDisplayedArea && (
        <span className="mapp__area-floor">F{position.z + 1}</span>
      )}
      <span className="mapp__area-name" style={{ color: areaColor }}>
        {area.name}
      </span>
    </span>
  )

  // Which legend glyph is being hovered. Stored as its semantic id —
  // either 'you' or a RoomType id — so we can both (a) paint the matching
  // caption text and (b) highlight every map cell of that type while the
  // pointer is parked on the glyph. Null means nothing hovered.
  const [hoveredLegend, setHoveredLegend] = useState<string | null>(null)

  // Count of visited rooms per type in the currently displayed area.
  // Surfaced in the legend caption while a glyph is hovered so the player
  // can see "how many of these have I discovered here?" without scanning
  // the grid.
  const visitedCountByType = useMemo(() => {
    const counts: Partial<Record<string, number>> = {}
    for (const key of visitedInArea) {
      const t = area.rooms[key]?.type
      if (t) counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [area.rooms, visitedInArea])

  let hoveredLabel: string | null = null
  if (hoveredLegend === 'you') {
    hoveredLabel = 'You'
  } else if (hoveredLegend) {
    hoveredLabel =
      ROOM_TYPE_VISUALS[hoveredLegend as keyof typeof ROOM_TYPE_VISUALS]
        ?.label ?? null
  }

  // Lock the displayed area to whatever's showing when the user toggles on.
  // Unchecking drops back to following the character's current area.
  const titleExtra = (
    <label
      className="mapp__pin"
      data-tip={isPinned ? 'Unpin map — follow character' : 'Pin map to this area'}
    >
      <input
        type="checkbox"
        className="mapp__pin-input"
        checked={isPinned}
        onChange={(e) => setPinnedAreaId(e.target.checked ? area.id : null)}
      />
      <span className="mapp__pin-label">Pin</span>
    </label>
  )

  // Legend shows every room type in the game so the key strip is a stable
  // reference the player's eye can memorize (filtering per area made the
  // row reshuffle every time the character stepped through a portal).
  // Order is hand-tuned to interleave visual weights — heavy filled
  // glyphs (▣ ◉), medium outlines (□ ⌂ ✝ ☆ ↯), and sparse/thin glyphs
  // (· I $ ≈) alternate rather than clustering — so the bar reads as
  // evenly weighted rather than "three big then three small."
  const legendEntries = useMemo(
    () =>
      (
        [
          'portal',    // heavy filled
          'corridor',  // sparse dot (scaled big)
          'chamber',   // medium outline
          'shop',      // tall thin
          'water',     // wide flat
          'storage',   // heavy filled
          'entrance',  // lightning
          'exit',      // arrow
          'crypt',     // tall thin
          'safe',      // medium outline
          'inn',       // thin
          'shrine',    // medium outline
        ] as const
      ).map((id) => ({ id, visual: ROOM_TYPE_VISUALS[id] })),
    [],
  )

  return (
    <Panel
      title="Map"
      titleExtra={titleExtra}
      meta={meta}
      className="scanlines flicker"
      noPad
    >
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
                const [xs, ys, zs] = key.split(',')
                const x = Number(xs)
                const y = Number(ys)
                const z = Number(zs)
                const fullKey = visitedKey(area.id, x, y, position.z)
                const isCurrent = charInDisplayedArea && key === currentKey
                const room = area.rooms[key]
                const visual = room ? ROOM_TYPE_VISUALS[room.type] : undefined
                // Derived stairs indicator: a small corner badge shows
                // whenever the area has a room at the same (x, y) on the
                // floor above / below. Purely structural — we don't wait
                // for the other floor to be visited, so the player learns
                // "this tile goes up/down" on first arrival (matches the
                // D-pad's U/D dim logic, which also probes raw rooms).
                const hasUp = area.rooms[roomKey(x, y, z + 1)] != null
                const hasDown = area.rooms[roomKey(x, y, z - 1)] != null
                const stairsGlyph = hasUp && hasDown ? '↕' : hasUp ? '↑' : hasDown ? '↓' : null
                const stairsTip =
                  hasUp && hasDown
                    ? 'Stairs up & down'
                    : hasUp
                      ? 'Stairs up'
                      : hasDown
                        ? 'Stairs down'
                        : ''
                // Edge detection: draw a bright border on any side that
                // doesn't touch another visited tile on the same floor so
                // the outline of the mapped region is legible even when
                // the area is only partially revealed.
                const neighborVisited = (nx: number, ny: number): boolean =>
                  visitedInArea.has(`${nx},${ny},${z}`)
                const edgeN = !neighborVisited(x, y - 1)
                const edgeS = !neighborVisited(x, y + 1)
                const edgeE = !neighborVisited(x + 1, y)
                const edgeW = !neighborVisited(x - 1, y)
                // Highlight every tile whose type (or @ marker) matches
                // the glyph currently hovered in the legend below. The
                // 'you' case uses its own highlight color so it doesn't
                // pick up the underlying room type's tint when the
                // character is standing on a portal / shrine / etc.
                const isLegendMatch =
                  hoveredLegend != null &&
                  (hoveredLegend === 'you'
                    ? isCurrent
                    : room?.type === hoveredLegend)
                const isYouMatch = hoveredLegend === 'you' && isCurrent
                const baseTip = room
                  ? visual
                    ? `${room.name} · ${visual.label}`
                    : room.name
                  : ''
                const tip = stairsTip
                  ? baseTip
                    ? `${baseTip} · ${stairsTip}`
                    : stairsTip
                  : baseTip
                // Trail band 0 = current room (darkest), rising bands lighten
                // back toward the baseline. Non-trail cells get band -1 and
                // render with no darkening at all.
                const trailBand = trailIndexByKey.get(key) ?? -1
                return (
                  <div
                    key={fullKey}
                    className={
                      'mapp__cell' +
                      (isCurrent ? ' mapp__cell--current' : '') +
                      (trailBand >= 0 && !isCurrent ? ' mapp__cell--trail' : '') +
                      (isLegendMatch ? ' mapp__cell--match' : '') +
                      (isYouMatch ? ' mapp__cell--match-you' : '') +
                      (edgeN ? ' mapp__cell--edge-n' : '') +
                      (edgeS ? ' mapp__cell--edge-s' : '') +
                      (edgeE ? ' mapp__cell--edge-e' : '') +
                      (edgeW ? ' mapp__cell--edge-w' : '')
                    }
                    style={{
                      gridColumn: x - bbox.minX + 1,
                      gridRow: y - bbox.minY + 1,
                      ['--mapp-glyph-color' as string]: visual?.color ?? 'var(--fg-2)',
                      ['--mapp-trail-alpha' as string]:
                        trailBand >= 0
                          ? (0.55 * (1 - trailBand / TRAIL_LENGTH)).toFixed(3)
                          : '0',
                    }}
                    aria-label={tip || 'Unknown room'}
                    data-tip={tip}
                  >
                    {isCurrent ? (
                      <span
                        className="mapp__you"
                        style={{
                          fontSize: `calc(var(--mapp-cell) * 0.55 * ${YOU_SCALE})`,
                        }}
                      >
                        @
                      </span>
                    ) : visual ? (
                      <span
                        className="mapp__glyph"
                        style={
                          visual.glyphScale
                            ? { fontSize: `calc(var(--mapp-cell) * 0.55 * ${visual.glyphScale})` }
                            : undefined
                        }
                      >
                        {visual.glyph}
                      </span>
                    ) : null}
                    {stairsGlyph && (
                      <span className="mapp__stairs" aria-hidden="true">
                        {stairsGlyph}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mapp__placeholder">No rooms to remember yet.</div>
          )}
        </div>
        <div className="mapp__legend-group">
          <ul className="mapp__legend" aria-label="Map key">
          <li
            className="mapp__legend-item"
            data-tip={charInDisplayedArea ? 'You are here' : 'You are elsewhere'}
            onPointerEnter={() => setHoveredLegend('you')}
            onPointerLeave={() => setHoveredLegend(null)}
          >
            <span
              className="mapp__legend-glyph mapp__legend-glyph--you"
              style={{
                fontSize: `calc(var(--mapp-legend-size) * ${YOU_SCALE})`,
                transform: `translateY(${YOU_Y_OFFSET}em)`,
              }}
            >
              @
            </span>
          </li>
          {legendEntries.map(({ id, visual }) => {
            const count = visitedCountByType[id] ?? 0
            const noun = visual?.label?.toLowerCase() ?? id
            const tip =
              count === 0
                ? `No ${noun}s discovered here`
                : count === 1
                  ? `1 ${noun} discovered`
                  : `${count} ${noun}s discovered`
            return (
            <li
              key={id}
              className="mapp__legend-item"
              data-tip={tip}
              onPointerEnter={() => setHoveredLegend(id)}
              onPointerLeave={() => setHoveredLegend(null)}
            >
              <span
                className="mapp__legend-glyph"
                style={{
                  color: visual?.color ?? 'var(--fg-2)',
                  ...(visual?.glyphScale
                    ? { fontSize: `calc(var(--mapp-legend-size) * ${visual.glyphScale})` }
                    : null),
                  ...(visual?.glyphYOffset
                    ? { transform: `translateY(${visual.glyphYOffset}em)` }
                    : null),
                }}
              >
                {visual?.glyph ?? '?'}
              </span>
            </li>
            )
          })}
          </ul>
          <div className="mapp__legend-label">{hoveredLabel ?? 'Legend'}</div>
        </div>
      </div>
      <style>{`
        /* Cell size has been bumped twice — 22 → 33 → 50px — so rooms read
           as prominent tiles instead of faint specks. The room description
           panel that used to sit under the grid now lives to the left as its
           own panel, giving both the grid and the description full vertical
           height. */
        .mapp { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-3); --mapp-cell: 50px; --mapp-legend-size: 32px; }
        /* Legend group picks up its own inner padding so the icons and
           caption don't sit flush against the Panel frame after the
           Panel's own body padding was dropped (via noPad) to let the
           grid's black extend edge-to-edge. */
        .mapp__legend-group { display: flex; flex-direction: column; gap: 6px; padding: 0 var(--sp-3) var(--sp-3); }
        .mapp__grid-wrap { flex: 1; min-height: 0; background: var(--bg-inset); padding: var(--sp-2); display: flex; align-items: center; justify-content: center; overflow: auto; }
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
          cursor: default;
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
        /* Edge detection — sides of visited tiles with no visited neighbor
           on the same floor get a brighter, thicker border so the outline of
           the explored region reads at a glance. Sides adjacent to another
           visited tile stay on the default subtle border. Each edge
           modifier overrides only its own side so the four can combine
           freely (a corner cell lights up on two sides, etc.). */
        .mapp__cell--edge-n { border-top: 2px solid var(--line-3); }
        .mapp__cell--edge-s { border-bottom: 2px solid var(--line-3); }
        .mapp__cell--edge-e { border-right: 2px solid var(--line-3); }
        .mapp__cell--edge-w { border-left: 2px solid var(--line-3); }
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
        /* Match highlight — painted when the user hovers a legend glyph.
           Every tile whose type matches lights up with a glyph-colored
           outline + glow so you can see every instance at once. outline
           sits inside the cell border (offset -2) and doesn't push the
           grid layout the way a thicker border would, while the outer
           shadow broadcasts the color to neighbors. */
        .mapp__cell--match {
          outline: 2px solid var(--mapp-glyph-color, var(--fg-2));
          outline-offset: -2px;
          box-shadow: 0 0 0 2px var(--mapp-glyph-color, var(--fg-2)),
                      0 0 14px 2px var(--mapp-glyph-color, var(--fg-2));
          z-index: 2;
        }
        /* When hovering the @ legend entry, the highlight paints in the
           player-accent color instead of the underlying room type's
           glyph color — otherwise standing on a portal / shrine / etc
           makes the "you are here" highlight indistinguishable from the
           room-type highlight for that same cell. */
        .mapp__cell--match-you {
          outline-color: var(--accent-hot);
          box-shadow: 0 0 0 2px var(--accent-hot),
                      0 0 14px 2px var(--accent-hot);
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
        /* Stairs badge — sits in the top-right corner, derived from the
           area having a room at the same (x, y) on an adjacent floor.
           Kept small and semi-transparent so it reads as metadata on top
           of the main room glyph rather than competing with it. */
        .mapp__stairs {
          position: absolute;
          top: 1px;
          right: 2px;
          line-height: 1;
          font-size: calc(var(--mapp-cell) * 0.32);
          color: var(--fg-2);
          opacity: 0.85;
          text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
          pointer-events: none;
          z-index: 2;
        }
        .mapp__placeholder { color: var(--fg-3); font-style: italic; font-family: var(--font-body); font-size: var(--text-sm); }

        /* Legend strip — sits as a flat footer at the bottom of the map
           panel (no separate background/border so it reads as part of the
           map, not a sub-panel). Every room type renders always so the row
           doesn't reshuffle as the character moves between areas. Labels
           are dropped; tooltips name the type on hover. */
        .mapp__legend-label {
          margin: 0;
          text-align: center;
          font-family: var(--font-mono);
          font-size: 13px;
          line-height: 1;
          color: var(--fg-2);
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }
        /* Equal-width grid columns give each glyph the same slot regardless
           of its intrinsic glyph width or per-type scale — space-between
           on a flex row left the narrow ⌂ slot feeling isolated while the
           wide ▣ / ◉ slots felt crowded. */
        .mapp__legend {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 1fr;
          row-gap: var(--sp-1);
        }
        .mapp__legend-item {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--mapp-legend-size);
          line-height: 1;
          cursor: help;
        }
        /* Legend glyphs use a wide mix of Unicode codepoints (⌂, ·, ✝, ≈, ☆,
           etc.) whose ink sits at very different heights inside their em box.
           Pinning the box to --mapp-legend-size (not 1em) means the box
           stays a constant 32×32 regardless of which per-type glyphScale
           is applied — so scaled-up glyphs overflow visibly without
           inflating the row height. */
        .mapp__legend-glyph {
          display: grid;
          place-items: center;
          width: var(--mapp-legend-size);
          height: var(--mapp-legend-size);
          overflow: visible;
          font-family: var(--font-mono);
          line-height: 1;
          vertical-align: middle;
          text-shadow: 0 0 3px currentColor;
        }
        .mapp__legend-glyph--you { color: var(--accent-hot); }

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

        /* Pin toggle sits inline with the "MAP" title. The monospaced label
           matches the meta/panel tone; the native checkbox is kept visible
           because a labeled checkbox is a clearer affordance than a custom
           icon in a panel header full of game text. */
        .mapp__pin {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-3);
          cursor: pointer;
          user-select: none;
        }
        .mapp__pin:hover { color: var(--fg-2); }
        /* Custom checkbox — the native one renders bright white on dark
           themes and never picks up the theme's phosphor tone. Strip the
           UA look (appearance: none) and draw a square in --fg-3 that
           fills with --accent-hot when checked. */
        .mapp__pin-input {
          appearance: none;
          -webkit-appearance: none;
          margin: 0;
          width: 12px;
          height: 12px;
          border: 1px solid var(--fg-3);
          background: transparent;
          cursor: pointer;
          display: inline-block;
          vertical-align: middle;
          transition: border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .mapp__pin-input:hover { border-color: var(--fg-2); }
        .mapp__pin-input:checked {
          background: var(--accent-hot);
          border-color: var(--accent-hot);
          box-shadow: inset 0 0 0 2px var(--bg-1);
        }
        .mapp__pin-label { line-height: 1; }
        .mapp__pin:has(.mapp__pin-input:checked) { color: var(--accent-hot); }
      `}</style>
    </Panel>
  )
}
