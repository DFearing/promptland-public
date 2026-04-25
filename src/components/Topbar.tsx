import pkg from '../../package.json'
import { TICK_MS } from '../game'
import { TICK_SPEEDS, type TickSpeedId } from '../themes'
import { formatDuration } from '../util/time'

interface Props {
  onExit?: () => void
  onSettings?: () => void
  onBack?: () => void
  /** When provided (during gameplay), a retro 7-seg tick readout renders
   *  next to the roster button. */
  ticks?: number
  /** Whether the game is currently paused. Drives the pause-button label /
   *  pressed state. Absent in non-playing phases — the button is hidden. */
  paused?: boolean
  /** Toggle pause/resume from the topbar. Absent ⇒ no pause control rendered. */
  onTogglePause?: () => void
  /** Current tick-speed for the playing character — drives the centered
   *  selector. Absent in non-playing phases (the selector is hidden). */
  tickSpeed?: TickSpeedId
  /** Callback when the user picks a new speed in the topbar. The App
   *  layer writes it to the character and flips `tickSpeedAuto` off so
   *  the ramp doesn't re-overwrite the choice. */
  onPickTickSpeed?: (id: TickSpeedId) => void
  /** Master sound volume (0..1) for the topbar slider. Absent in
   *  non-playing phases — the slider is hidden alongside the speed picker. */
  volume?: number
  /** Live volume callback. App writes to soundManager + persists. */
  onSetVolume?: (volume: number) => void
  /** Whether sound is muted via the topbar button. Independent of the
   *  Settings-tab `enabled` flag — muting here preserves volume and keeps
   *  the slider visible. When sound is disabled in Settings this prop is
   *  left absent so the entire audio cluster disappears. */
  muted?: boolean
  /** Toggle mute from the topbar. Absent ⇒ no mute control rendered. */
  onToggleMute?: () => void
  /** Pulses true briefly when a save lands. Triggers the inline
   *  "saving" indicator next to the tick counter. Absent in non-
   *  playing phases. */
  saving?: boolean
}

// Branch comes from Vite's `define` at build time. Treat the default / release
// branch as noise — only show the branch suffix when we're on a side branch.
const BRANCH = __GIT_BRANCH__
const HIDE_BRANCHES = new Set(['main', 'master', 'unknown', ''])

// Tick counter always shows at least two leading zeros, so it reads as a
// proper LED instrument rather than a plain number. Width grows with
// the value: 0 → "000", 9 → "009", 99 → "0099", 1000 → "001000", etc.
// Rule: width = digitCount + 2.
const TICK_LEADING_ZEROS = 2

function formatTicks(n: number): { text: string; ghost: string } {
  const clamped = Math.max(0, Math.floor(n))
  const raw = String(clamped)
  const width = raw.length + TICK_LEADING_ZEROS
  const text = raw.padStart(width, '0')
  const ghost = '8'.repeat(width)
  return { text, ghost }
}

export default function Topbar({
  onExit,
  onSettings,
  onBack,
  ticks,
  paused,
  onTogglePause,
  tickSpeed,
  onPickTickSpeed,
  volume,
  onSetVolume,
  muted,
  onToggleMute,
  saving,
}: Props) {
  const showBranch = !HIDE_BRANCHES.has(BRANCH)
  const tickRead = ticks !== undefined ? formatTicks(ticks) : null
  const showSpeed = tickSpeed !== undefined && !!onPickTickSpeed
  const showVolume = volume !== undefined && !!onSetVolume
  const showPause = paused !== undefined && !!onTogglePause
  const showMute = muted !== undefined && !!onToggleMute
  const volumePct = showVolume ? Math.round((volume ?? 0) * 100) : 0
  return (
    <header className="topbar">
      <div className="topbar__inner">
      <div className="topbar__left">
        <span className="topbar__wordmark">
          <span className="topbar__wordmark-main">Prompt</span>
          <span className="topbar__wordmark-tail">land</span>
        </span>
        <span
          className="topbar__version"
          data-tip={
            showBranch
              ? `Build v${pkg.version} on branch ${BRANCH}`
              : 'Build version'
          }
        >
          <span className="topbar__version-num">v{pkg.version}</span>
          {showBranch && (
            <>
              <span className="topbar__version-sep">·</span>
              <span className="topbar__version-branch">{BRANCH}</span>
            </>
          )}
        </span>
      </div>
      <div className="topbar__center">
        {showSpeed && (
          <div
            className="topbar__speed-wrap"
            data-tip="How fast the game plays."
          >
            <span className="topbar__speed-label">Game Speed</span>
            <div
              className="topbar__speed"
              role="group"
              aria-label="Game speed"
            >
              {showPause && (
                <button
                  type="button"
                  className={
                    'topbar__speed-btn' +
                    (paused ? ' topbar__speed-btn--active' : '')
                  }
                  aria-pressed={paused}
                  aria-label="Pause"
                  data-tip="Pause the game"
                  onClick={onTogglePause}
                >
                  ❚❚
                </button>
              )}
              {TICK_SPEEDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={
                    'topbar__speed-btn' +
                    (!paused && tickSpeed === s.id ? ' topbar__speed-btn--active' : '')
                  }
                  aria-pressed={!paused && tickSpeed === s.id}
                  onClick={() => {
                    if (paused) onTogglePause?.()
                    onPickTickSpeed?.(s.id)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {showVolume && (
          <div
            className={
              'topbar__volume-wrap' +
              (muted ? ' topbar__volume-wrap--muted' : '')
            }
            data-tip={muted ? 'Muted — drag to unmute.' : 'Master sound volume.'}
          >
            <span className="topbar__speed-label">Volume</span>
            <input
              type="range"
              className="topbar__volume"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => onSetVolume?.(Number(e.target.value))}
              aria-label="Sound volume"
            />
            <span className="topbar__volume-val">{muted ? '' : `${volumePct}%`}</span>
          </div>
        )}
        {showMute && (
          <button
            type="button"
            className={
              'topbar__icon-btn' +
              (muted ? ' topbar__icon-btn--active' : '')
            }
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            data-tip={muted ? 'Unmute sound' : 'Mute sound'}
            onClick={onToggleMute}
          >
            {muted ? 'M' : 'S'}
          </button>
        )}
      </div>
      <div className="topbar__right">
        {tickRead && (
          <div
            className="topbar__ticks"
            data-tip={`${ticks} ticks lived (~${formatDuration(
              (ticks ?? 0) * TICK_MS.exploring,
            )})`}
          >
            <span className="topbar__ticks-ghost" aria-hidden="true">{tickRead.ghost}</span>
            <span className="topbar__ticks-val">{tickRead.text}</span>
            {saving && (
              <span className="topbar__save-pulse" aria-label="Saving" data-tip="Autosaving">
                ●
              </span>
            )}
          </div>
        )}
        {onExit && (
          <button
            type="button"
            className="topbar__btn topbar__btn--roster"
            onClick={onExit}
          >
            <span className="topbar__btn-arrow" aria-hidden="true">←</span>
            <span>Roster</span>
          </button>
        )}
        {onBack ? (
          <button type="button" className="topbar__btn" onClick={onBack}>
            <span className="topbar__btn-arrow" aria-hidden="true">←</span>
            <span>Back</span>
          </button>
        ) : onSettings ? (
          <button
            type="button"
            className="topbar__btn topbar__btn--settings"
            onClick={onSettings}
            data-tip="Open Settings"
          >
            {/* Inline settings gear — 8 filled teeth around a circular body
                with a hex-style hole. Reads as a proper cog even at 14px, and
                it's all `fill="currentColor"` so the rotate-on-hover sweep
                still tracks the warn-colored label via inherited color. */}
            <svg
              className="topbar__btn-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <g>
                <rect x="6.5" y="0.5" width="3" height="2.5" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(45 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(90 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(135 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(180 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(225 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(270 8 8)" />
                <rect x="6.5" y="0.5" width="3" height="2.5" transform="rotate(315 8 8)" />
              </g>
              <path
                fillRule="evenodd"
                d="M8 3 A 5 5 0 1 1 8 13 A 5 5 0 1 1 8 3 Z M8 6 A 2 2 0 1 0 8 10 A 2 2 0 1 0 8 6 Z"
              />
            </svg>
            Settings
          </button>
        ) : null}
      </div>
      </div>

      <style>{`
        /* Two-layer topbar: outer shell spans the viewport so the hairline
           divider runs edge-to-edge; inner clamp matches the .game grid's
           max-width + horizontal padding so the right edge of the topbar's
           content column lines up with the right edge of the map column.
           See App.css for the paired .game container. */
        .topbar {
          border-bottom: 1px solid var(--line-2);
          background: var(--bg-1);
          flex-shrink: 0;
        }
        .topbar__inner {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          max-width: 1600px;
          margin: 0 auto;
          padding: var(--sp-2) var(--sp-3);
          gap: var(--sp-3);
          box-sizing: border-box;
        }
        .topbar__left { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
        /* Center cell holds the speed picker and volume slider side by side.
           Bigger gap (sp-6) spreads the two clusters so they read as
           distinct controls rather than one continuous row. Both share
           the same label styling so the visual kinship is still obvious. */
        .topbar__center { display: flex; justify-content: center; align-items: center; gap: var(--sp-6); min-width: 0; flex-wrap: wrap; }
        /* Mute — square icon button in the center cluster.
           Compact, theme-coloured, and aria-pressed when active so the
           toggle state reads from screen readers and from the visible
           highlight. The glyphs (🔊 / 🔇) keep the row terse without
           competing with the speed/volume labels. */
        .topbar__icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 24px;
          padding: 0;
          background: var(--bg-inset);
          border: 1px solid var(--line-2);
          color: var(--fg-2);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          line-height: 1;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .topbar__icon-btn:hover, .topbar__icon-btn:focus-visible {
          outline: none;
          color: var(--accent-hot);
          border-color: var(--line-3);
          background: var(--bg-2);
          text-shadow: var(--glow-sm);
        }
        .topbar__icon-btn--active {
          color: var(--warn);
          border-color: var(--warn);
          text-shadow: var(--glow-sm);
        }
        .topbar__icon-btn--active:hover { color: var(--warn); border-color: var(--warn); }

        /* Speed picker — label + segmented row of 0.5×–2× buttons.
           The wrap groups them so a single hover-tooltip covers the whole
           cluster. Label uses the topbar's display font to read as a
           heading rather than a button. */
        .topbar__speed-wrap { display: inline-flex; align-items: center; gap: var(--sp-2); }
        .topbar__speed-label {
          font-family: var(--font-display);
          font-size: var(--text-xs);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--fg-3);
        }
        .topbar__speed { display: inline-flex; border: 1px solid var(--line-2); background: var(--bg-inset); }
        .topbar__speed-btn {
          padding: 4px var(--sp-2);
          background: transparent;
          color: var(--fg-3);
          border: none;
          border-right: 1px solid var(--line-1);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
          transition: color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt);
        }
        .topbar__speed-btn:last-child { border-right: none; }
        .topbar__speed-btn:hover { color: var(--fg-1); background: var(--bg-2); }
        .topbar__speed-btn--active { color: var(--accent-hot); background: var(--bg-3); text-shadow: var(--glow-sm); }

        /* Volume slider — same label treatment as the speed picker, with a
           short range input + percentage readout. Custom thumb/track styling
           keeps it on-theme; native chrome would slap a system blue puck on
           our CRT palette. */
        .topbar__volume-wrap {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          transition: opacity var(--dur-fast) var(--ease-crt);
        }
        /* Muted — fade the whole volume cluster so it reads as inert
           without disabling it. Slider still accepts input; dragging it
           auto-unmutes (see App.handleSetVolume). The percentage readout
           blanks rather than swapping to a word so the row doesn't
           reflow (the min-width on .topbar__volume-val reserves the
           space so nothing shifts). Mute state is telegraphed by the
           40% opacity + the mute button icon next to the slider. */
        .topbar__volume-wrap--muted { opacity: 0.4; }
        .topbar__volume {
          -webkit-appearance: none;
          appearance: none;
          width: 90px;
          height: 4px;
          background: var(--bg-3);
          border: 1px solid var(--line-2);
          outline: none;
          cursor: pointer;
        }
        .topbar__volume::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          background: var(--accent-hot);
          border: 1px solid var(--line-3);
          box-shadow: var(--glow-sm);
          cursor: pointer;
        }
        .topbar__volume::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: var(--accent-hot);
          border: 1px solid var(--line-3);
          box-shadow: var(--glow-sm);
          cursor: pointer;
          border-radius: 0;
        }
        .topbar__volume:focus-visible { border-color: var(--line-3); }
        .topbar__volume-val {
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--accent-hot);
          font-variant-numeric: tabular-nums;
          min-width: 36px;
          text-align: right;
          text-shadow: var(--glow-sm);
        }
        /* Wordmark is two parts: "Prompt" at full size + "land" rendered in
           small caps at ~70% size. The two-tier typography keeps the display
           font's presence while avoiding the SHOUTING read of full all-caps.
           Both parts share the panel-heading color (--fg-2) so the wordmark
           tracks the rest of the chrome (ROOM, MAP) rather than lighting up
           in a brighter accent. */
        .topbar__wordmark {
          display: inline-flex;
          align-items: baseline;
          gap: 1px;
          font-family: var(--font-display);
          color: var(--fg-2);
          text-shadow: none;
        }
        /* Both halves share the same font face, casing, and tracking —
           only the size differs. Keeps the wordmark reading as one
           logotype with a deliberate size step instead of two competing
           styles. */
        .topbar__wordmark-main {
          font-size: var(--text-2xl);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .topbar__wordmark-tail {
          font-size: calc(var(--text-2xl) * 0.68);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .topbar__version {
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: var(--text-xs);
          color: var(--fg-3);
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
          text-shadow: none;
        }
        .topbar__version-num { color: var(--fg-3); }
        .topbar__version-sep { color: var(--fg-3); opacity: 0.6; }
        .topbar__version-branch { color: var(--magic); text-shadow: var(--glow-sm); letter-spacing: 0.06em; }
        .topbar__right { display: flex; gap: var(--sp-2); align-items: center; flex-shrink: 0; justify-content: flex-end; }
        /* All topbar buttons share the same box so tick counter + buttons
           line up cleanly. inline-flex + align-items:center fixes the
           "← Roster" arrow drift that was happening with plain inline
           rendering — the Unicode ← glyph sits a couple pixels below the
           cap-height in our display font and it was reading as visually
           low before this. */
        .topbar__btn {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          padding: 5px var(--sp-3);
          background: transparent;
          color: var(--fg-2);
          border: 1px solid var(--line-2);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-sm);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1;
          transition: color var(--dur-fast) var(--ease-crt),
                      border-color var(--dur-fast) var(--ease-crt),
                      background var(--dur-fast) var(--ease-crt);
        }
        .topbar__btn:hover { color: var(--accent-hot); border-color: var(--line-3); background: var(--bg-2); text-shadow: var(--glow-sm); }
        /* Mono font for the back-arrow glyph so its metrics match the
           display-font label on the baseline. No vertical translate —
           previous -1px tweak drifted the arrow high once the wordmark's
           baseline shifted. Relying on the font's own metrics keeps the
           arrow centered with the label across theme and scale changes. */
        .topbar__btn-arrow { display: inline-block; font-family: var(--font-mono); }
        .topbar__btn--roster { color: var(--fg-1); }
        .topbar__btn--roster:hover { color: var(--fg-1); text-shadow: 0 0 6px var(--fg-1); }
        .topbar__btn--settings { color: var(--warn); }
        .topbar__btn--settings:hover { color: var(--warn); text-shadow: 0 0 6px var(--warn); }
        /* Icon reads as light-gray chrome against the warn-colored label —
           the button's color applies to the text, the icon gets a quieter
           own color so it feels like an icon, not a second accent. Spins a
           quarter-turn on hover for the "settings gear winding" touch. */
        .topbar__btn-icon {
          flex-shrink: 0;
          color: var(--fg-3);
          transition: transform var(--dur-med) var(--ease-crt),
                      color var(--dur-fast) var(--ease-crt);
        }
        .topbar__btn--settings:hover .topbar__btn-icon { transform: rotate(45deg); color: var(--fg-2); }

        /* Same retro 7-seg treatment as the roster so the two read as the
           same instrument — dim ghost segments behind the lit value.
           Vertical box matches .topbar__btn exactly: box-sizing
           border-box + matching padding + line-height 1 lets the bigger
           text-md glyphs sit at the same height as the text-sm button
           labels. */
        .topbar__ticks {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 3px var(--sp-3);
          background: #000;
          border: 1px solid var(--line-1);
          box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.9);
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          font-size: var(--text-md);
          letter-spacing: 0.14em;
          line-height: 1;
          cursor: default;
        }
        .topbar__ticks-ghost {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(120, 255, 120, 0.08);
          letter-spacing: inherit;
          pointer-events: none;
        }
        .topbar__ticks-val {
          position: relative;
          color: #9effa0;
          text-shadow: 0 0 4px #4cff6a, 0 0 8px rgba(80, 255, 120, 0.45);
        }
        /* Tiny save pulse — transient dot in the top-right corner of
           the tick readout. Fades in quickly and fades out over the
           1.4s window the App sets for the flash flag. */
        .topbar__save-pulse {
          position: absolute;
          top: 2px;
          right: 4px;
          font-size: 8px;
          line-height: 1;
          color: var(--good, #9effa0);
          text-shadow: 0 0 4px currentColor;
          animation: save-pulse 1.4s var(--ease-crt) forwards;
          pointer-events: none;
        }
        @keyframes save-pulse {
          0% { opacity: 0; transform: scale(0.6); }
          15% { opacity: 1; transform: scale(1.1); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </header>
  )
}
