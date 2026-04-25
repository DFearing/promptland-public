import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Panel from './Panel'
import type { Character } from '../character'
import {
  ROOM_TYPE_VISUALS,
  roomKey,
  visitedKey,
  type Area,
  type Position,
  type Room,
} from '../areas'
import { predictNextStep, type GameState } from '../game'
import { rarityLabel } from '../items'
import { formatRelative } from '../util/time'
import { getWorldContent } from '../worlds'

/** How many recent rooms (including current) participate in the trail-fade
 *  effect. The current room is darkest; each older step lightens one band
 *  until the background matches the baseline tile color. */
const TRAIL_LENGTH = 6

interface Props {
  character: Character
  state: GameState
}

const EMPTY_AREA: Area = {
  id: 'unknown',
  name: 'Unknown',
  startX: 0,
  startY: 0,
  startZ: 0,
  rooms: {},
}

// Arrow glyph for an 8-way compass delta. Returned string doubles as the
// ink rendered over the current-cell when we paint the next-step hint —
// we deliberately use the Unicode arrow set so the glyph inherits the
// cell's font stack and sits at the same visual weight as the room glyphs.
function arrowForDelta(dx: number, dy: number): string | null {
  const vx = Math.sign(dx)
  const vy = Math.sign(dy)
  if (vx === 0 && vy === 0) return null
  if (vx === 0 && vy < 0) return '↑'
  if (vx > 0 && vy < 0) return '↗'
  if (vx > 0 && vy === 0) return '→'
  if (vx > 0 && vy > 0) return '↘'
  if (vx === 0 && vy > 0) return '↓'
  if (vx < 0 && vy > 0) return '↙'
  if (vx < 0 && vy === 0) return '←'
  if (vx < 0 && vy < 0) return '↖'
  return null
}

// Compass-word form of the same 8-way delta — used in human-readable
// tooltips ("You: traveling northwest") where the Unicode glyph would
// read awkwardly. Screen coordinates are y-down, so negative y = north.
function directionNameForDelta(dx: number, dy: number): string | null {
  const vx = Math.sign(dx)
  const vy = Math.sign(dy)
  if (vx === 0 && vy === 0) return null
  if (vx === 0 && vy < 0) return 'north'
  if (vx > 0 && vy < 0) return 'northeast'
  if (vx > 0 && vy === 0) return 'east'
  if (vx > 0 && vy > 0) return 'southeast'
  if (vx === 0 && vy > 0) return 'south'
  if (vx < 0 && vy > 0) return 'southwest'
  if (vx < 0 && vy === 0) return 'west'
  if (vx < 0 && vy < 0) return 'northwest'
  return null
}

// Per-state overlay painted on the current-location cell. A generic
// direction arrow always read as "traveling" regardless of what the
// character was actually doing — resting, fighting, or mid-portal all
// showed the same glyph. This picks a state-specific icon so the map
// reflects the current activity at a glance.
//
// variant drives the CSS color + pulse treatment; glyph is the Unicode
// ink.
type ActivityVariant =
  | 'idle'
  | 'travel'
  | 'travel-portal'
  | 'fight'
  | 'rest'
  | 'meditate'
  | 'use-sell'
  | 'use-portal'
  | 'use-shrine'
  | 'use-satisfy'
  | 'generating'

type ActivityIndicator = {
  glyph: string
  variant: ActivityVariant
  tip: string
}

// Picks the glyph + variant that represents what the character is doing
// right now. The returned shape drives both the on-map player marker (the
// `@` used to sit here) and the live "You" legend entry. Always returns
// a non-null indicator so the player's cell is never empty.
//
// Tips are sentence-case action phrases — rendered as-is in tooltips and
// in the legend caption (no "You:" prefix). "Traveling west" /
// "Fighting Goblin" / "Resting" / "Standing here".
function activityIndicator(
  state: GameState,
  travelArrow: string | null,
  travelDirection: string | null,
  travelIsPortalHop: boolean,
): ActivityIndicator {
  switch (state.kind) {
    case 'exploring': {
      if (travelArrow) {
        if (travelIsPortalHop) {
          return {
            glyph: travelArrow,
            variant: 'travel-portal',
            tip: 'Stepping through a portal',
          }
        }
        return {
          glyph: travelArrow,
          variant: 'travel',
          tip: travelDirection ? `Traveling ${travelDirection}` : 'Traveling',
        }
      }
      // No predicted next step (no-op tick, blocked path). Render a neutral
      // "here, idle" marker so the cell/legend still has a player glyph.
      return { glyph: '◆', variant: 'idle', tip: 'Standing here' }
    }
    case 'fighting':
      return { glyph: '⚔', variant: 'fight', tip: `Fighting ${state.mob.name}` }
    case 'resting':
      return { glyph: 'Z', variant: 'rest', tip: 'Resting' }
    case 'meditating':
      return { glyph: '☯', variant: 'meditate', tip: 'Meditating' }
    case 'using-room':
      switch (state.action.kind) {
        case 'sell':
          return { glyph: '$', variant: 'use-sell', tip: 'Selling loot' }
        case 'traverse-portal':
          return { glyph: '◎', variant: 'use-portal', tip: 'Traversing a portal' }
        case 'sacrifice':
          return { glyph: '✝', variant: 'use-shrine', tip: 'Sacrificing at the shrine' }
        case 'satisfy':
          return { glyph: '✓', variant: 'use-satisfy', tip: 'Using this room' }
      }
      return { glyph: '◆', variant: 'idle', tip: 'Standing here' }
    case 'generating-area':
      return { glyph: '⧖', variant: 'generating', tip: 'Generating a new area' }
  }
}

// Inline SVG pin icon. Filled (solid tint) when pinned, outlined+muted
// when not. currentColor lets the surrounding CSS recolor based on state
// (pinned → --good green, unpinned → --fg-3 muted).
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 1.5h4v1H9.5l.8 4 2.2 1.5v1H8.8v4.5L8 14.5l-.8-1v-4.5H3.5v-1l2.2-1.5.8-4H6v-1z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Inline SVG book icon — opens the room index popup. Matches the visual
// weight of PinIcon (same 16x16 viewbox, same stroke width) so the two
// header controls read as a pair.
function BookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 3c2 0 4.5.25 6 1.5V14c-1.5-1.25-4-1.5-6-1.5V3zM14 3c-2 0-4.5.25-6 1.5V14c1.5-1.25 4-1.5 6-1.5V3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 4.5v9.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function MapPanel({ character, state }: Props) {
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

  // Classic fog-of-war "peek through the doorway": any same-floor room
  // grid-adjacent to a visited room is rendered dimmed even if the
  // character hasn't entered it. Mirrors the 8-way neighbor set used by
  // movement (areas/movement.ts → DIRS_2D), so what the character can
  // step into is exactly what the map glimpses.
  const seenInArea = useMemo(() => {
    const set = new Set<string>()
    const dirs: ReadonlyArray<readonly [number, number]> = [
      [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]
    for (const key of visitedInArea) {
      const [xs, ys] = key.split(',')
      const x = Number(xs)
      const y = Number(ys)
      for (const [dx, dy] of dirs) {
        const nx = x + dx
        const ny = y + dy
        const nkey = `${nx},${ny},${displayedZ}`
        if (visitedInArea.has(nkey)) continue
        if (set.has(nkey)) continue
        if (!area.rooms[roomKey(nx, ny, displayedZ)]) continue
        set.add(nkey)
      }
    }
    return set
  }, [area.rooms, displayedZ, visitedInArea])

  const bbox = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const consider = (key: string) => {
      const [xs, ys] = key.split(',')
      const x = Number(xs)
      const y = Number(ys)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    for (const key of visitedInArea) consider(key)
    for (const key of seenInArea) consider(key)
    return { minX, maxX, minY, maxY }
  }, [visitedInArea, seenInArea])

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

  // Predict where the character is heading next so we can paint a subtle
  // directional indicator on the current cell + ghost the target cell.
  // Wrapped in try/catch because `predictNextStep` runs the same projection
  // the live tick uses — any world-content hiccup (stale areaId, mid-pin
  // state) should degrade silently rather than break the map render.
  const worldForPredict = getWorldContent(character.worldId)
  const nextStep: Position | null = useMemo(() => {
    if (!worldForPredict) return null
    if (!charInDisplayedArea) return null
    try {
      return predictNextStep(character, worldForPredict)
    } catch {
      return null
    }
  }, [character, worldForPredict, charInDisplayedArea])
  // `next-step` key for the cell overlay — only meaningful when it's on
  // the same floor as the displayed map (cross-floor hops are painted via
  // stairs badges already).
  const nextStepKey =
    nextStep && nextStep.areaId === area.id && nextStep.z === displayedZ
      ? roomKey(nextStep.x, nextStep.y, nextStep.z)
      : null
  // Direction from the character's current cell to the predicted step.
  // Only meaningful while exploring — fighting / resting / etc. don't have
  // a "next cell," so we fall back to a state-specific glyph below.
  // Arrow glyph paints the on-map overlay; compass-word form drives the
  // "You: traveling west" tooltip.
  const nextStepArrow = nextStep && charInDisplayedArea && nextStep.z === position.z
    ? arrowForDelta(nextStep.x - position.x, nextStep.y - position.y)
    : null
  const nextStepDirection = nextStep && charInDisplayedArea && nextStep.z === position.z
    ? directionNameForDelta(nextStep.x - position.x, nextStep.y - position.y)
    : null
  // When the next-step lands on a portal tile that leads to a different
  // area, emphasize the portal with a dashed chevron (portal-hop indicator).
  const nextStepIsPortalHop = (() => {
    if (!nextStepKey) return false
    const room = area.rooms[nextStepKey]
    if (!room) return false
    if (room.type !== 'portal') return false
    return !!room.destination && room.destination.areaId !== area.id
  })()
  // Live activity indicator — the glyph + color that represents what the
  // character is doing right now. Replaces both (a) the static `@` that
  // used to mark the player's cell and (b) the tiny corner arrow that
  // only read as "traveling." Used for both the current-cell marker and
  // the live "You" entry in the legend. Computed regardless of
  // charInDisplayedArea so the legend stays live when the map is pinned
  // to another area.
  const indicator = activityIndicator(
    state,
    nextStepArrow,
    nextStepDirection,
    nextStepIsPortalHop,
  )

  const hasMultipleFloors = useMemo(() => {
    let firstZ: number | null = null
    for (const key in area.rooms) {
      const z = area.rooms[key].z
      if (firstZ === null) firstZ = z
      else if (z !== firstZ) return true
    }
    return false
  }, [area.rooms])

  // Panel meta is a two-line stack:
  //   Line 1: area name, display font — the world-state anchor.
  //   Line 2: area kind (settlement / wilderness / dungeon / ruin) in the
  //           smaller mono-chip style, mirroring the room-type line in
  //           RoomDescPanel so "rooms describe what this square is; areas
  //           describe what the whole place is" reads parallel.
  // Rarity-tint on the name was dropped — the chip reads as the panel
  // identity, not a tier indicator; rarity still lives on the book
  // dialog's per-room rarity badge where it matters. Floor indicator
  // lives as a floater inside the map grid (top-right) rather than
  // sharing the UI header.
  const areaKindLabel = area.kind ? area.kind.toUpperCase() : null
  const meta = (
    <span className="mapp__area">
      <span className="mapp__area-name">{area.name}</span>
      {areaKindLabel && (
        <span className="mapp__area-kind">{areaKindLabel}</span>
      )}
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
    // Caption is the bare action phrase — "Traveling west" / "Resting" /
    // "Fighting Goblin" — rendered without any "You:" prefix.
    hoveredLabel = indicator.tip
  } else if (hoveredLegend) {
    hoveredLabel =
      ROOM_TYPE_VISUALS[hoveredLegend as keyof typeof ROOM_TYPE_VISUALS]
        ?.label ?? null
  }

  // Book dialog — alphabetized list of discovered rooms in the displayed area.
  // Backing state lives here so the Panel header button can toggle it; the
  // popup itself renders inside the map body below the grid.
  const [bookOpen, setBookOpen] = useState(false)
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null)
  // Reset the dialog selection when the displayed area/floor changes — a
  // stale selection from the previous area reads as broken when no room
  // with that key exists here. Uses React's derive-from-props pattern
  // (compare prev key during render) instead of useEffect(setState), which
  // wastes a render pass and trips the react-hooks/set-state-in-effect rule.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const areaFloorKey = `${area.id}:${displayedZ}`
  const [prevAreaFloorKey, setPrevAreaFloorKey] = useState(areaFloorKey)
  if (areaFloorKey !== prevAreaFloorKey) {
    setPrevAreaFloorKey(areaFloorKey)
    setSelectedRoomKey(null)
  }

  // Lock the displayed area to whatever's showing when the user toggles on.
  // Unchecking drops back to following the character's current area.
  const titleExtra = (
    <span className="mapp__header-controls">
      <button
        type="button"
        className={'mapp__pin' + (isPinned ? ' mapp__pin--on' : '')}
        onClick={() => setPinnedAreaId(isPinned ? null : area.id)}
        aria-label={isPinned ? 'Unpin map — follow character' : 'Pin map to this area'}
        aria-pressed={isPinned}
        data-tip={isPinned ? 'Unpin map — follow character' : 'Pin map to this area'}
      >
        <PinIcon filled={isPinned} />
      </button>
      <button
        type="button"
        className={'mapp__book' + (bookOpen ? ' mapp__book--on' : '')}
        onClick={() => setBookOpen((v) => !v)}
        aria-label={bookOpen ? 'Close room index' : 'Open room index'}
        aria-pressed={bookOpen}
        data-tip="Room index — discovered rooms in this area"
      >
        <BookIcon />
      </button>
    </span>
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
      className="flicker"
      noPad
    >
      <div className="mapp">
        <div className="mapp__grid-wrap">
          {hasMultipleFloors && charInDisplayedArea && (
            <span className="mapp__area-floor mapp__area-floor--floater">
              <span className="mapp__area-floor-label">Floor</span>
              <span className="mapp__area-floor-value">{position.z + 1}</span>
            </span>
          )}
          {hasAny ? (
            <div
              className="mapp__grid"
              style={{
                gridTemplateColumns: `repeat(${bbox.maxX - bbox.minX + 1}, var(--mapp-cell))`,
                gridTemplateRows: `repeat(${bbox.maxY - bbox.minY + 1}, var(--mapp-cell))`,
              }}
            >
              {[...seenInArea].map((key) => {
                const [xs, ys, zs] = key.split(',')
                const x = Number(xs)
                const y = Number(ys)
                const z = Number(zs)
                const room = area.rooms[roomKey(x, y, z)]
                const visual = room ? ROOM_TYPE_VISUALS[room.type] : undefined
                return (
                  <div
                    key={`seen:${area.id}:${key}`}
                    className="mapp__cell mapp__cell--seen"
                    style={{
                      gridColumn: x - bbox.minX + 1,
                      gridRow: y - bbox.minY + 1,
                      ['--mapp-glyph-color' as string]: visual?.color ?? 'var(--fg-2)',
                    }}
                    aria-label="Glimpsed room"
                    data-tip="Glimpsed — step in to explore"
                  >
                    {visual && (
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
                    )}
                  </div>
                )
              })}
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
                // Predicted next step ghost overlay. Applies whenever the
                // tick projection lands on this tile (but only when it's
                // not the character's current cell — that already gets the
                // brighter "here" treatment). `nextStepIsPortalHop` pushes
                // the dashed-chevron variant, which reads as "step through"
                // rather than "walk to".
                const isNextStep = nextStepKey === key && !isCurrent
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
                      (isNextStep ? ' mapp__cell--next' : '') +
                      (isNextStep && nextStepIsPortalHop ? ' mapp__cell--next-portal' : '') +
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
                        className={`mapp__you mapp__you--${indicator.variant}`}
                        aria-label={indicator.tip}
                        data-tip={indicator.tip}
                      >
                        {indicator.glyph}
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
            data-tip={
              charInDisplayedArea
                ? indicator.tip
                : `${indicator.tip} (elsewhere)`
            }
            onPointerEnter={() => setHoveredLegend('you')}
            onPointerLeave={() => setHoveredLegend(null)}
          >
            <span
              className={`mapp__legend-glyph mapp__legend-glyph--you mapp__legend-glyph--you-${indicator.variant}`}
            >
              {indicator.glyph}
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
        {bookOpen && (
          <BookDialog
            area={area}
            displayedZ={displayedZ}
            hasMultipleFloors={hasMultipleFloors}
            visitedInArea={visitedInArea}
            selectedKey={selectedRoomKey}
            onSelect={setSelectedRoomKey}
            onClose={() => setBookOpen(false)}
          />
        )}
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
        /* Grid-wrap background reads as "undiscovered" — it fills both the
           padding around the grid and the 2px gap between visited tiles.
           Pure --bg-inset is near-black on most themes; mixing in a touch
           of --fg-3 lifts the color just enough to distinguish "unexplored
           terrain" from absolute black, without competing with the visited
           tiles (--bg-2). 8% is intentionally subtle — pick it up on
           attention, not at a glance. */
        .mapp__grid-wrap {
          flex: 1;
          min-height: 0;
          background: color-mix(in srgb, var(--bg-inset) 92%, var(--fg-3) 8%);
          padding: var(--sp-2);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: auto;
          position: relative;
        }
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
        /* Peeked tile — a same-floor neighbor of any visited room. The
           character hasn't been there, but the map "glimpses" what's next
           door. Renders the room-type glyph at low opacity over a
           background mid-way between unexplored and explored, so the eye
           reads the three states (unexplored / glimpsed / entered) as a
           clear hierarchy. No edge highlight, trail, match, or stairs
           overlay — those are reserved for explored territory. */
        .mapp__cell--seen {
          background: color-mix(in srgb, var(--bg-2) 55%, var(--bg-inset) 45%);
          border-color: color-mix(in srgb, var(--line-1) 50%, transparent);
          opacity: 0.55;
        }
        .mapp__cell--seen .mapp__glyph {
          text-shadow: none;
          color: color-mix(in srgb, var(--mapp-glyph-color, var(--fg-2)) 70%, transparent);
        }
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
        /* Player marker — formerly a static "@" glyph, now whatever glyph
           the ActivityIndicator picks for the current state (arrow when
           traveling, ⚔ when fighting, Z when resting, etc.). Scales with
           the tile to match room-type glyph size; each variant paints a
           state-specific color and, for motion states, a subtle opacity
           pulse that nudges the eye without competing with the main grid. */
        .mapp__you {
          position: relative;
          z-index: 1;
          line-height: 1;
          font-size: calc(var(--mapp-cell) * 0.6);
          font-weight: 700;
          font-family: var(--font-mono);
          text-shadow: 0 0 4px currentColor, 0 0 2px rgba(0, 0, 0, 0.75);
        }
        .mapp__you--idle { color: var(--accent-hot); }
        .mapp__you--travel { color: var(--accent-hot); }
        .mapp__you--travel-portal { color: var(--magic); }
        .mapp__you--fight {
          color: var(--bad);
          animation: mapp-activity-pulse 1.1s var(--ease-crt) infinite;
        }
        .mapp__you--rest {
          color: var(--good);
          animation: mapp-activity-pulse 2.4s var(--ease-crt) infinite;
        }
        .mapp__you--meditate {
          color: var(--magic);
          animation: mapp-activity-pulse 2.8s var(--ease-crt) infinite;
        }
        .mapp__you--use-sell { color: #d4b24c; }
        .mapp__you--use-portal {
          color: var(--magic);
          animation: mapp-activity-pulse 1.6s var(--ease-crt) infinite;
        }
        .mapp__you--use-shrine { color: var(--good); }
        .mapp__you--use-satisfy { color: var(--accent-hot); }
        .mapp__you--generating {
          color: var(--fg-3);
          animation: mapp-activity-pulse 1.4s var(--ease-crt) infinite;
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
        /* Legend "You" entry mirrors the on-map activity glyph's color
           but intentionally does NOT inherit the per-variant pulse
           animation — the legend is a static key, not a live pulse
           indicator, and a flashing glyph down there reads as a bug.
           The on-map marker still pulses; this block only sets colors. */
        .mapp__legend-glyph--you { color: var(--accent-hot); }
        .mapp__legend-glyph--you-idle { color: var(--accent-hot); }
        .mapp__legend-glyph--you-travel { color: var(--accent-hot); }
        .mapp__legend-glyph--you-travel-portal { color: var(--magic); }
        .mapp__legend-glyph--you-fight { color: var(--bad); }
        .mapp__legend-glyph--you-rest { color: var(--good); }
        .mapp__legend-glyph--you-meditate { color: var(--magic); }
        .mapp__legend-glyph--you-use-sell { color: #d4b24c; }
        .mapp__legend-glyph--you-use-portal { color: var(--magic); }
        .mapp__legend-glyph--you-use-shrine { color: var(--good); }
        .mapp__legend-glyph--you-use-satisfy { color: var(--accent-hot); }
        .mapp__legend-glyph--you-generating { color: var(--fg-3); }

        /* Panel meta stacks two lines: area name on top, area kind below.
           Right-aligned so each line hangs off the header's right edge
           without the shorter kind chip drifting away from the name. */
        .mapp__area {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          line-height: 1.1;
        }
        /* Floor chip — split label + value with a vertical divider. The
           --floater variant pins it to the top-right of the grid area so
           the floor indicator sits over the map content, not the UI
           chrome. Opaque bg + border so it stays legible over visited /
           trail-lit tiles underneath. */
        .mapp__area-floor {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border: 1px solid var(--line-2);
          background: var(--bg-inset);
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .mapp__area-floor--floater {
          position: absolute;
          top: var(--sp-2);
          right: var(--sp-2);
          z-index: 2;
          pointer-events: none;
          background: color-mix(in srgb, var(--bg-1) 88%, transparent);
        }
        .mapp__area-floor-label {
          color: var(--fg-3);
          letter-spacing: 0.14em;
        }
        .mapp__area-floor-value {
          color: var(--fg-2);
          font-weight: 600;
          padding-left: 6px;
          border-left: 1px solid var(--line-2);
        }
        /* Area name — display-font tag. Intentionally matches
           RoomDescPanel's .roomd__meta-name exactly (same font,
           weight, case) so the two panel headers read as visual
           parallels. The previous font-weight:600 made the name look
           noticeably brighter/heavier than the equivalent room name. */
        .mapp__area-name {
          font-family: var(--font-display);
          font-size: var(--text-md);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        /* Area-kind chip — intentionally smaller than the name above and
           styled like RoomDescPanel's room-type meta so the two panels
           read as parallel (area = whole place, room = this square). */
        .mapp__area-kind {
          font-family: var(--font-mono);
          font-size: calc(var(--text-xs) * 0.9);
          color: var(--fg-3);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        /* Header-control strip holds the pin + book icons. Each is a
           flat icon button (no text label) so the Panel header stays
           uncluttered; tooltips carry the long-form hint. */
        .mapp__header-controls {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mapp__pin,
        .mapp__book {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          padding: 0;
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg-3);
          cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease-crt),
                      color var(--dur-fast) var(--ease-crt),
                      box-shadow var(--dur-fast) var(--ease-crt);
        }
        .mapp__pin:hover,
        .mapp__book:hover {
          color: var(--fg-1);
          border-color: var(--line-3);
        }
        .mapp__pin:focus-visible,
        .mapp__book:focus-visible {
          outline: none;
          border-color: var(--line-3);
          box-shadow: 0 0 0 1px var(--accent-hot);
        }
        /* Green-lit pin is the "pinned" signal — currentColor picks up
           --good, so the inline SVG's stroke/fill glow green with a matching
           border + halo. */
        .mapp__pin--on {
          color: var(--good);
          border-color: var(--good);
          box-shadow: 0 0 8px color-mix(in srgb, var(--good) 55%, transparent);
        }
        .mapp__pin--on:hover { color: var(--good); }
        .mapp__book--on {
          color: var(--accent-hot);
          border-color: var(--accent-hot);
        }

        /* Book dialog — full-screen modal that opens over the game when
           the book button is tapped. Replaces the former corner popover,
           which cramped the room descriptions into a sidebar. Same visual
           pattern as ConfirmDialog / HistoryDialog so the dialog style
           reads as consistent across the app. Layout is two-pane: a
           scrollable room list on the left, a detail view on the right
           carrying description + origin metadata. */
        .mapp__book-modal {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-4);
        }
        .mapp__book-card {
          position: relative;
          width: 100%;
          max-width: 960px;
          max-height: 85vh;
          background: var(--bg-1);
          border: 1px solid var(--line-3);
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          font-family: var(--font-mono);
        }
        .mapp__book-card > .mapp__book-corner {
          position: absolute;
          font-family: var(--font-mono);
          font-size: var(--text-md);
          line-height: 1;
          color: var(--line-3);
          pointer-events: none;
          user-select: none;
        }
        .mapp__book-corner--tl { top: -6px; left: -4px; }
        .mapp__book-corner--tr { top: -6px; right: -4px; }
        .mapp__book-corner--bl { bottom: -6px; left: -4px; }
        .mapp__book-corner--br { bottom: -6px; right: -4px; }
        .mapp__book-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--sp-3);
          border-bottom: 1px solid var(--line-1);
          padding-bottom: var(--sp-2);
        }
        .mapp__book-title {
          font-family: var(--font-display);
          font-size: var(--text-xl);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
        }
        .mapp__book-count {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .mapp__book-close {
          background: transparent;
          border: none;
          color: var(--fg-3);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--text-lg);
          padding: 2px 8px;
          line-height: 1;
        }
        .mapp__book-close:hover,
        .mapp__book-close:focus-visible {
          color: var(--accent-hot);
          outline: none;
        }
        /* Two-pane body: list left (fixed narrow), detail right (fluid).
           Collapses to a single-column stack below 640px so the room
           detail isn't squeezed on narrow viewports. */
        .mapp__book-body {
          display: grid;
          grid-template-columns: minmax(220px, 300px) 1fr;
          gap: var(--sp-4);
          min-height: 0;
          flex: 1;
        }
        @media (max-width: 640px) {
          .mapp__book-body { grid-template-columns: 1fr; }
        }
        .mapp__book-list {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-y: auto;
          border: 1px solid var(--line-1);
          background: var(--bg-inset);
          min-height: 0;
        }
        .mapp__book-row {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--sp-2);
          padding: 6px var(--sp-2);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--line-1);
          color: var(--fg-1);
          font-family: inherit;
          font-size: var(--text-xs);
          text-align: left;
          cursor: pointer;
        }
        .mapp__book-row:hover,
        .mapp__book-row:focus-visible {
          background: var(--bg-2);
          outline: none;
        }
        .mapp__book-row--active {
          background: var(--bg-2);
          color: var(--accent-hot);
          box-shadow: inset 3px 0 0 var(--accent-hot);
        }
        .mapp__book-row-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .mapp__book-row-meta {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 1px;
          color: var(--fg-3);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .mapp__book-row-rarity {
          font-variant-caps: all-small-caps;
          letter-spacing: 0.06em;
          font-size: calc(var(--text-xs) * 0.95);
        }
        .mapp__book-row-type {
          color: var(--fg-3);
          font-size: calc(var(--text-xs) * 0.9);
        }
        /* Detail pane — fills the right column and scrolls independently
           when the description overflows. Arranged as a stack so
           title > metadata grid > prose description stays readable at
           any width. */
        .mapp__book-detail {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border: 1px solid var(--line-1);
          background: var(--bg-inset);
          overflow-y: auto;
          min-height: 0;
        }
        .mapp__book-detail-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-5);
          color: var(--fg-3);
          font-family: var(--font-body);
          font-style: italic;
          text-align: center;
        }
        .mapp__book-detail-title {
          margin: 0;
          color: var(--fg-1);
          font-family: var(--font-display);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-size: var(--text-lg);
          text-shadow: var(--glow-sm);
        }
        .mapp__book-detail-typerow {
          display: flex;
          gap: var(--sp-3);
          flex-wrap: wrap;
          color: var(--fg-3);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .mapp__book-detail-desc {
          color: var(--fg-1);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.6;
          white-space: pre-line;
        }
        /* Provenance block — stamped once per area from the GenerationMeta
           when the LLM produced it. Every row in the list shares the same
           origin because the area itself was generated in one call, but
           surfacing it in the detail pane reads as "this room came from
           here." Authored areas (no stamp) render a short fallback.
           margin-top: auto pins it to the bottom of the detail-pane flex
           column so the footer sits as a card-footer regardless of
           description length. */
        .mapp__book-origin {
          margin-top: auto;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 4px var(--sp-3);
          padding: var(--sp-2);
          background: var(--bg-2);
          border: 1px solid var(--line-1);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          line-height: 1.5;
        }
        .mapp__book-origin-label {
          color: var(--fg-3);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-size: calc(var(--text-xs) * 0.92);
        }
        .mapp__book-origin-value { color: var(--fg-1); }
        /* Authored fallback — rendered as a standalone footer paragraph,
           NOT inside the origin box, so it reads as its own element and
           doesn't visually blur into either the description or the
           metadata block. Italic body font + muted color + a light
           top border float it as a caption beneath the room card.
           margin-top: auto pushes it to the bottom of the flex column
           for the same card-footer anchoring as .mapp__book-origin. */
        .mapp__book-authored {
          margin: auto 0 0;
          padding-top: var(--sp-2);
          border-top: 1px solid var(--line-1);
          color: var(--fg-3);
          font-family: var(--font-body);
          font-style: italic;
          font-size: var(--text-xs);
        }
        .mapp__book-empty {
          padding: var(--sp-5);
          color: var(--fg-3);
          font-style: italic;
          font-family: var(--font-body);
          text-align: center;
        }

        /* Next-step indicator — ghost highlight on the predicted tile that
           the character is about to walk into. Paired with the directional
           variants of the player marker (.mapp__you--travel /
           --travel-portal) the reader can see "about to walk NE" before
           the tick fires — useful when portals teleport the player across
           the map. */
        .mapp__cell--next {
          outline: 1px dashed color-mix(in srgb, var(--accent-hot) 75%, transparent);
          outline-offset: -3px;
          box-shadow: inset 0 0 10px color-mix(in srgb, var(--accent-hot) 22%, transparent);
        }
        .mapp__cell--next-portal {
          outline-style: dashed;
          outline-color: color-mix(in srgb, var(--magic) 80%, transparent);
          box-shadow: inset 0 0 12px color-mix(in srgb, var(--magic) 30%, transparent),
                      0 0 10px color-mix(in srgb, var(--magic) 30%, transparent);
        }
        /* Shared pulse keyframe used by the per-variant .mapp__you--*
           rules above. Kept here (rather than inline with the player
           marker) so the legend "You" glyph can reuse it. */
        @keyframes mapp-activity-pulse {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.45; }
        }

      `}</style>
    </Panel>
  )
}

// Formats a wall-clock timestamp as "YYYY-MM-DD HH:MM" so the origin block
// in the book dialog can pair it with a relative "3 days ago" line, matching
// the existing HistoryDialog two-line time treatment.
function formatOriginTimestamp(ms: number): string {
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

// Fixed attribution + date for hand-authored areas that ship with the
// game. Renders in the same "when / by whom" footer position as
// LLM-generated provenance so both kinds of rooms carry parallel
// metadata. The date is the day the authored area set first landed in
// the repo (git history anchor point); edits since then are tracked by
// version control, not per-area.
const AUTHORED_BY = 'Promptland'
const AUTHORED_AT_MS = new Date('2026-04-22').getTime()

// Book dialog — centered full-screen modal listing every visited room on
// the currently displayed floor, alphabetized, with rarity/level. Click a
// row to reveal the room's description plus its area-level provenance
// (who triggered the LLM that created it, when, and with which model).
// Purely read-only — a reference index, not a navigation control, so
// fog-of-war still governs what can be seen (we drive directly off
// `visitedInArea`).
function BookDialog({
  area,
  displayedZ,
  hasMultipleFloors,
  visitedInArea,
  selectedKey,
  onSelect,
  onClose,
}: {
  area: Area
  displayedZ: number
  hasMultipleFloors: boolean
  visitedInArea: Set<string>
  selectedKey: string | null
  onSelect: (key: string | null) => void
  onClose: () => void
}) {
  type BookRow = {
    key: string
    name: string
    typeLabel: string
    room: Room
  }
  // Rooms don't carry their own rarity/level; borrow them from the enclosing
  // area so every row shares the same {rarity · Lx} badge. Pre-compute once
  // per area render so the row loop stays cheap.
  const areaRarity = area.rarity ?? 'common'
  const areaLevel = area.level
  const rarityBadge =
    areaLevel != null
      ? `${rarityLabel(areaRarity)} · Lv ${areaLevel}`
      : rarityLabel(areaRarity)
  const rows: BookRow[] = useMemo(() => {
    const out: BookRow[] = []
    for (const key of visitedInArea) {
      const room = area.rooms[key]
      if (!room) continue
      if (room.z !== displayedZ) continue
      out.push({
        key,
        name: room.name,
        typeLabel: ROOM_TYPE_VISUALS[room.type]?.label ?? '',
        room,
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [area, displayedZ, visitedInArea])

  const selected = selectedKey
    ? rows.find((r) => r.key === selectedKey) ?? null
    : null

  // Close on Escape — matches other modals (ConfirmDialog, HistoryDialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Title reflects the area (and floor when the area is multi-level) so
  // the player can tell at a glance which slice of the world this is.
  const titleText = hasMultipleFloors
    ? `${area.name} · Floor ${displayedZ + 1}`
    : area.name

  // Portal to document.body so the modal escapes the MapPanel's ancestor
  // stacking contexts — inside the panel tree the z-index was competing
  // with the log column and could open behind it.
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="mapp__book-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Room index"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mapp__book-card" role="document">
        <span className="mapp__book-corner mapp__book-corner--tl" aria-hidden="true">┏</span>
        <span className="mapp__book-corner mapp__book-corner--tr" aria-hidden="true">┓</span>
        <span className="mapp__book-corner mapp__book-corner--bl" aria-hidden="true">┗</span>
        <span className="mapp__book-corner mapp__book-corner--br" aria-hidden="true">┛</span>

        <div className="mapp__book-head">
          <span className="mapp__book-title">{titleText}</span>
          <span className="mapp__book-count">
            {rows.length} room{rows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="mapp__book-close"
            onClick={onClose}
            aria-label="Close room index"
          >
            ×
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="mapp__book-empty">No rooms discovered on this floor.</div>
        ) : (
          <div className="mapp__book-body">
            <ul className="mapp__book-list">
              {rows.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className={
                      'mapp__book-row' +
                      (row.key === selectedKey ? ' mapp__book-row--active' : '')
                    }
                    onClick={() =>
                      onSelect(row.key === selectedKey ? null : row.key)
                    }
                  >
                    <span className="mapp__book-row-name">{row.name}</span>
                    {row.typeLabel && (
                      <span className="mapp__book-row-type">{row.typeLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mapp__book-detail">
              {selected ? (
                <BookDetail
                  area={area}
                  row={selected}
                  rarityBadge={rarityBadge}
                />
              ) : (
                <div className="mapp__book-detail-placeholder">
                  Select a room to see its description and origin.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// Detail pane — one-row-at-a-time view on the right side of the book.
// Pulls description from the Room and provenance from the containing Area.
// Rooms of an LLM-generated area share that area's {generatedAt,
// createdBy, createdByModel} stamp; authored areas have none of those
// and render an abbreviated block.
function BookDetail({
  area,
  row,
  rarityBadge,
}: {
  area: Area
  row: { name: string; typeLabel: string; room: Room }
  rarityBadge: string
}) {
  const { room } = row
  const origin: Array<{ label: string; value: string }> = []
  if (area.createdBy) {
    origin.push({ label: 'Discovered by', value: area.createdBy })
  }
  if (area.generatedAt) {
    const abs = formatOriginTimestamp(area.generatedAt)
    const rel = formatRelative(area.generatedAt)
    origin.push({ label: 'Created', value: `${abs} (${rel})` })
  }
  if (area.createdByModel) {
    origin.push({ label: 'Generated by', value: area.createdByModel })
  }
  const isAuthored = !area.createdBy && !area.generatedAt
  return (
    <>
      <h3 className="mapp__book-detail-title">{row.name}</h3>
      {/* Card-style meta row: rarity+level on the left and the room type
          on the right. Both use the typerow's default muted theme color
          — the tier is communicated by the word itself (UNCOMMON, EPIC,
          etc.), not a separate tint, so the line reads as one consistent
          meta caption instead of two competing colors. */}
      <div className="mapp__book-detail-typerow">
        <span className="mapp__book-detail-rarity">{rarityBadge}</span>
        {row.typeLabel && <span>{row.typeLabel}</span>}
      </div>
      <div className="mapp__book-detail-desc">{room.description}</div>
      {/* Provenance footer, anchored to the bottom of the detail pane so
          it always reads as a card footer even when the description is
          short. Generated areas get the boxed key/value metadata;
          authored areas get a parallel "by whom + when" caption outside
          the box so it reads as its own element distinct from the
          description above it. */}
      {origin.length > 0 && (
        <div className="mapp__book-origin">
          {origin.map(({ label, value }) => (
            <span key={label} style={{ display: 'contents' }}>
              <span className="mapp__book-origin-label">{label}</span>
              <span className="mapp__book-origin-value">{value}</span>
            </span>
          ))}
        </div>
      )}
      {isAuthored && (
        <p className="mapp__book-authored">
          Authored by {AUTHORED_BY} · {formatOriginTimestamp(AUTHORED_AT_MS)}{' '}
          ({formatRelative(AUTHORED_AT_MS)})
        </p>
      )}
    </>
  )
}
