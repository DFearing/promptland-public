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
  /** Whether sound is muted (sound.enabled === false). Drives the mute
   *  button's pressed/label state. */
  muted?: boolean
  /** Toggle mute from the topbar. Absent ⇒ no mute control rendered. */
  onToggleMute?: () => void
}

// Branch comes from Vite's `define` at build time. Treat the default / release
// branch as noise — only show the branch suffix when we're on a side branch.
const BRANCH = __GIT_BRANCH__
const HIDE_BRANCHES = new Set(['main', 'master', 'unknown', ''])

// Width of the LED tick counter in digits. Matches the roster's counter so
// both readouts read as the same instrument.
const TICK_DIGITS = 5

function formatTicks(n: number): { text: string; ghost: string } {
  const clamped = Math.max(0, Math.floor(n))
  const capped = clamped > 99999 ? 99999 : clamped
  const text = String(capped).padStart(TICK_DIGITS, '0')
  const ghost = '8'.repeat(TICK_DIGITS)
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
      <div className="topbar__left">
        <span className="topbar__wordmark">UNDERSTUDY</span>
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
        {showPause && (
          <button
            type="button"
            className={
              'topbar__icon-btn' +
              (paused ? ' topbar__icon-btn--active' : '')
            }
            aria-pressed={paused}
            aria-label={paused ? 'Resume' : 'Pause'}
            data-tip={paused ? 'Resume the game' : 'Pause the game'}
            onClick={onTogglePause}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        )}
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
              {TICK_SPEEDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={
                    'topbar__speed-btn' +
                    (tickSpeed === s.id ? ' topbar__speed-btn--active' : '')
                  }
                  aria-pressed={tickSpeed === s.id}
                  onClick={() => onPickTickSpeed?.(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {showVolume && (
          <div
            className="topbar__volume-wrap"
            data-tip="Master sound volume."
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
            <span className="topbar__volume-val">{volumePct}%</span>
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
            {muted ? '🔇' : '🔊'}
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
          </div>
        )}
        {onExit && (
          <button
            type="button"
            className="topbar__btn topbar__btn--roster"
            onClick={onExit}
          >
            ← Roster
          </button>
        )}
        {onBack ? (
          <button type="button" className="topbar__btn" onClick={onBack}>
            ← Back
          </button>
        ) : onSettings ? (
          <button
            type="button"
            className="topbar__btn topbar__btn--settings"
            onClick={onSettings}
          >
            Settings
          </button>
        ) : null}
      </div>

      <style>{`
        /* 3-column grid keeps the center cluster geometrically centered no
           matter how wide the left/right sections grow. justify-content:
           space-between would have drifted the speed picker depending on
           the version label width. */
        .topbar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--line-2); background: var(--bg-1); flex-shrink: 0; gap: var(--sp-3); }
        .topbar__left { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
        /* Center cell holds the speed picker and volume slider side by side.
           gap keeps them legible without an explicit divider; both clusters
           share the same label styling so they read as one row of controls. */
        .topbar__center { display: flex; justify-content: center; align-items: center; gap: var(--sp-3); min-width: 0; flex-wrap: wrap; }
        /* Pause + mute — square icon buttons that flank the center cluster.
           Compact, theme-coloured, and aria-pressed when active so the
           toggle state reads from screen readers and from the visible
           highlight. The glyphs (❚❚ / ▶ / 🔊 / 🔇) keep the row terse
           without competing with the speed/volume labels. */
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
        .topbar__volume-wrap { display: inline-flex; align-items: center; gap: var(--sp-2); }
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
        .topbar__wordmark { font-family: var(--font-display); font-size: var(--text-2xl); letter-spacing: 0.08em; color: var(--accent-hot); text-shadow: var(--glow-md); }
        .topbar__version {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          color: var(--fg-2);
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
          text-shadow: none;
        }
        .topbar__version-num { color: var(--fg-2); }
        .topbar__version-sep { color: var(--fg-3); }
        .topbar__version-branch { color: var(--magic); text-shadow: var(--glow-sm); letter-spacing: 0.06em; }
        .topbar__right { display: flex; gap: var(--sp-1); align-items: center; flex-shrink: 0; justify-content: flex-end; }
        .topbar__btn { padding: 5px var(--sp-3); background: transparent; color: var(--fg-2); border: 1px solid var(--line-2); cursor: pointer; font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.1em; text-transform: uppercase; transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .topbar__btn:hover { color: var(--accent-hot); border-color: var(--line-3); background: var(--bg-2); text-shadow: var(--glow-sm); }
        .topbar__btn--roster { color: var(--fg-1); }
        .topbar__btn--roster:hover { color: var(--fg-1); text-shadow: 0 0 6px var(--fg-1); }
        .topbar__btn--settings { color: var(--warn); }
        .topbar__btn--settings:hover { color: var(--warn); text-shadow: 0 0 6px var(--warn); }

        /* Same retro 7-seg treatment as the roster so the two read as the
           same instrument — dim ghost segments behind the lit value. */
        .topbar__ticks {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px var(--sp-2);
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
      `}</style>
    </header>
  )
}
