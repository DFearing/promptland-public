import { useEffect, useMemo, useState } from 'react'

interface Props {
  /** Fires when the user dismisses the landing page. App routes to the
   *  next phase (roster or creating, depending on save state). */
  onEnter: () => void
}

// Mock flavor lines that cycle through the preview log. These aren't
// real-generated text — they're a scripted sampler so first-run visitors
// see what the game's log surface looks like before they've even
// configured an LLM. Kept short so they fit the single-column card
// without wrapping at typical widths.
const PREVIEW_LINES: { kind: 'area' | 'mob' | 'item' | 'combat' | 'level'; text: string }[] = [
  { kind: 'area', text: 'You enter the Cistern Locks — damp stone arches, green with lichen.' },
  { kind: 'mob', text: 'A Brackish Warden rears up from the water, barnacles clacking.' },
  { kind: 'combat', text: 'You strike for 8 bludgeoning damage. The warden keens.' },
  { kind: 'combat', text: 'The warden slams you for 4 piercing damage. You stagger.' },
  { kind: 'item', text: 'You pocket a Tidewatcher’s Locket — humming faintly with salt-magic.' },
  { kind: 'level', text: 'You feel sturdier. LEVEL 3 reached — HP, MP, and a new spell await.' },
  { kind: 'area', text: 'A narrow breach opens east, exhaling cool air and wet rope-smell.' },
]

// Preview sheet numbers tween over a few seconds on a gentle sinewave so
// the HP / MP / XP bars look alive without implying a specific game
// state. Values are capped to the maxes listed here.
const PREVIEW_MAX = { hp: 30, mp: 12, xp: 300 }

function useRollingIndex(length: number, intervalMs: number): number {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (length <= 0) return
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [length, intervalMs])
  return idx
}

function useAnimatedBars(): { hp: number; mp: number; xp: number } {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      setT(((now - start) / 1000) % 12)
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [])
  // Three offset sine waves so the three bars don't move in lockstep.
  const hp = Math.round(PREVIEW_MAX.hp * (0.5 + 0.35 * Math.sin(t * 0.8)))
  const mp = Math.round(PREVIEW_MAX.mp * (0.55 + 0.3 * Math.sin(t * 1.2 + 1.1)))
  const xp = Math.round(PREVIEW_MAX.xp * (0.35 + 0.25 * Math.sin(t * 0.5 + 2.4) + t * 0.01))
  return {
    hp: Math.max(0, Math.min(PREVIEW_MAX.hp, hp)),
    mp: Math.max(0, Math.min(PREVIEW_MAX.mp, mp)),
    xp: Math.max(0, Math.min(PREVIEW_MAX.xp, xp)),
  }
}

export default function Landing({ onEnter }: Props) {
  const rollIdx = useRollingIndex(PREVIEW_LINES.length, 2200)
  const { hp, mp, xp } = useAnimatedBars()

  // Show a short window of the rolling log at once (the current line + the
  // two preceding ones) so the panel reads as a stream rather than a
  // single-line crawl. Older lines dim; the current one is the brightest.
  const visible = useMemo(() => {
    const out: { kind: typeof PREVIEW_LINES[number]['kind']; text: string; age: number }[] = []
    for (let age = 2; age >= 0; age -= 1) {
      const i = (rollIdx - age + PREVIEW_LINES.length) % PREVIEW_LINES.length
      out.push({ ...PREVIEW_LINES[i], age })
    }
    return out
  }, [rollIdx])

  const hpPct = Math.round((hp / PREVIEW_MAX.hp) * 100)
  const mpPct = Math.round((mp / PREVIEW_MAX.mp) * 100)
  const xpPct = Math.round((xp / PREVIEW_MAX.xp) * 100)

  return (
    <div className="landing">
      <div className="landing__card">
        <header className="landing__header">
          <h1 className="landing__wordmark">
            <span className="landing__wordmark-main">Prompt</span>
            <span className="landing__wordmark-sub">land</span>
          </h1>
          <p className="landing__tagline">
            A game you don&rsquo;t play &mdash; you just watch as it grows
            on its own.
          </p>
          <p className="landing__tagline landing__tagline--sub">
            A better waste of tokens than OpenClaw <span aria-hidden="true">&#x1FAA6;</span>
          </p>
        </header>

        <section className="landing__copy">
          <p>
            Promptland is a watch-don&rsquo;t-play browser game. You pick a
            world, roll a character, and then step back. The tick loop
            runs on its own &mdash; your character explores, fights, loots,
            levels, and occasionally dies.
          </p>
          <p>
            The UI splits in two. On the <strong>left</strong>: your
            character sprite and sheet (stats, inventory, journal,
            spells). On the <strong>right</strong>: the live map and a
            rolling combat / discovery log. Everything persists to your
            browser, so closing the tab just pauses the run.
          </p>
          <p>
            The core loop is algorithmic and deterministic &mdash; combat
            math, drives, damage, loot rolls. A language model
            (Bring Your Own Key) only fills in the flavor: item
            descriptions, mob lore, spell names, room prose. Generated
            text is cached per entity, so repeat encounters don&rsquo;t
            burn fresh tokens.
          </p>
        </section>

        <section className="landing__preview" aria-label="Live preview">
          <div className="landing__preview-panel landing__preview-panel--sheet">
            <div className="landing__preview-panel-title">Sheet</div>
            <div className="landing__bar-row">
              <span className="landing__bar-label landing__bar-label--hp">HP</span>
              <div className="landing__bar">
                <div className="landing__bar-fill landing__bar-fill--hp" style={{ width: hpPct + '%' }} />
              </div>
              <span className="landing__bar-num">{hp} / {PREVIEW_MAX.hp}</span>
            </div>
            <div className="landing__bar-row">
              <span className="landing__bar-label landing__bar-label--mp">MP</span>
              <div className="landing__bar">
                <div className="landing__bar-fill landing__bar-fill--mp" style={{ width: mpPct + '%' }} />
              </div>
              <span className="landing__bar-num">{mp} / {PREVIEW_MAX.mp}</span>
            </div>
            <div className="landing__bar-row">
              <span className="landing__bar-label landing__bar-label--xp">XP</span>
              <div className="landing__bar">
                <div className="landing__bar-fill landing__bar-fill--xp" style={{ width: xpPct + '%' }} />
              </div>
              <span className="landing__bar-num">{xp} / {PREVIEW_MAX.xp}</span>
            </div>
            <p className="landing__preview-hint">
              Preview only &mdash; live sheet shows your character&rsquo;s
              real stats, drives, and inventory.
            </p>
          </div>

          <div className="landing__preview-panel landing__preview-panel--log">
            <div className="landing__preview-panel-title">Log</div>
            <ul className="landing__log">
              {visible.map((line, i) => (
                <li
                  key={i + '-' + line.text}
                  className={
                    'landing__log-line' +
                    ` landing__log-line--${line.kind}` +
                    ` landing__log-line--age${line.age}`
                  }
                >
                  {line.text}
                </li>
              ))}
            </ul>
            <p className="landing__preview-hint">
              Scripted sample &mdash; real runs generate their own flavor
              through your configured model.
            </p>
          </div>
        </section>

        <footer className="landing__footer">
          <button
            type="button"
            className="landing__cta"
            onClick={onEnter}
            autoFocus
          >
            [ Enter Promptland ]
          </button>
          <p className="landing__footer-hint">
            Revisit this from <em>Settings &rarr; About</em> any time.
          </p>
        </footer>
      </div>

      <style>{`
        .landing {
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--sp-6) var(--sp-4);
          background: var(--bg-0);
        }
        .landing__card {
          width: 100%;
          max-width: 860px;
          background: var(--bg-1);
          border: 1px solid var(--line-2);
          padding: var(--sp-6);
          display: flex;
          flex-direction: column;
          gap: var(--sp-5);
        }
        .landing__header {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          border-bottom: 1px solid var(--line-1);
          padding-bottom: var(--sp-4);
        }
        .landing__wordmark {
          margin: 0;
          font-family: var(--font-display);
          color: var(--accent-hot);
          text-shadow: var(--glow-md);
          letter-spacing: 0.02em;
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 0.04em;
        }
        .landing__wordmark-main {
          font-size: var(--text-3xl);
        }
        .landing__wordmark-sub {
          font-size: calc(var(--text-3xl) * 0.68);
          text-transform: lowercase;
          color: var(--fg-2);
          text-shadow: var(--glow-sm);
        }
        .landing__tagline {
          margin: 0;
          font-family: var(--font-body);
          font-size: var(--text-md);
          color: var(--fg-1);
          line-height: 1.5;
        }
        .landing__tagline--sub {
          font-size: var(--text-sm);
          color: var(--fg-3);
          font-style: italic;
        }
        .landing__copy {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.7;
          color: var(--fg-2);
        }
        .landing__copy p { margin: 0; }
        .landing__copy strong {
          color: var(--accent-hot);
          font-weight: 400;
          text-shadow: var(--glow-sm);
        }

        /* Preview row: sheet + log side-by-side on wide screens, stacked
           on narrow. Both panels mimic the in-game chrome (inset bg,
           hairline border, uppercase mono title) so the reader learns
           the visual vocabulary before hitting the game. */
        .landing__preview {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
          gap: var(--sp-3);
        }
        .landing__preview-panel {
          background: var(--bg-inset, var(--bg-2));
          border: 1px solid var(--line-1);
          padding: var(--sp-3);
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          min-height: 180px;
        }
        .landing__preview-panel-title {
          font-family: var(--font-display);
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--fg-3);
          border-bottom: 1px dashed var(--line-1);
          padding-bottom: 2px;
        }
        .landing__preview-hint {
          margin: auto 0 0 0;
          font-family: var(--font-body);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-style: italic;
          line-height: 1.5;
        }

        /* Animated sheet bars — label on the left, bar in the middle, num
           on the right. Matches the in-game sheet's three-column grid.
           Fills animate via inline width (no CSS transition needed; the
           RAF loop already paces the updates). */
        .landing__bar-row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          align-items: center;
          gap: var(--sp-2);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }
        .landing__bar-label {
          font-family: var(--font-display);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-size: var(--text-xs);
        }
        .landing__bar-label--hp { color: var(--bad); }
        .landing__bar-label--mp { color: var(--accent); }
        .landing__bar-label--xp { color: var(--warn, var(--accent-hot)); }
        .landing__bar {
          height: 10px;
          background: var(--bg-0);
          border: 1px solid var(--line-1);
          position: relative;
          overflow: hidden;
        }
        .landing__bar-fill {
          height: 100%;
          transition: width 300ms linear;
        }
        .landing__bar-fill--hp { background: var(--bad); box-shadow: 0 0 4px currentColor; color: var(--bad); }
        .landing__bar-fill--mp { background: var(--accent); box-shadow: 0 0 4px currentColor; color: var(--accent); }
        .landing__bar-fill--xp { background: var(--warn, var(--accent-hot)); box-shadow: 0 0 4px currentColor; color: var(--warn, var(--accent-hot)); }
        .landing__bar-num {
          color: var(--fg-3);
          font-variant-numeric: tabular-nums;
          min-width: 56px;
          text-align: right;
        }

        /* Rolling log preview — three lines visible, bottom one brightest,
           older lines dim out. The age class does the dimming so the
           crossfade reads as a gentle marquee rather than a jarring
           swap. */
        .landing__log {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          line-height: 1.5;
        }
        .landing__log-line {
          padding-left: var(--sp-2);
          border-left: 2px solid var(--line-1);
          transition: opacity 400ms var(--ease-crt, ease), color 400ms var(--ease-crt, ease);
        }
        .landing__log-line--age0 { opacity: 1; color: var(--fg-1); border-left-color: var(--accent-hot); }
        .landing__log-line--age1 { opacity: 0.66; color: var(--fg-2); }
        .landing__log-line--age2 { opacity: 0.35; color: var(--fg-3); }
        .landing__log-line--area { border-left-style: solid; }
        .landing__log-line--combat { border-left-color: var(--bad); }
        .landing__log-line--item { border-left-color: var(--warn, var(--accent-hot)); }
        .landing__log-line--level { border-left-color: var(--accent-hot); }

        .landing__footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-2);
          border-top: 1px solid var(--line-1);
          padding-top: var(--sp-4);
        }
        .landing__cta {
          padding: 10px 28px;
          background: var(--bg-2);
          border: 1px solid var(--line-3);
          color: var(--accent-hot);
          cursor: pointer;
          font-family: var(--font-display);
          font-size: var(--text-lg);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-shadow: var(--glow-md);
          transition:
            color var(--dur-fast, 150ms) var(--ease-crt, ease),
            border-color var(--dur-fast, 150ms) var(--ease-crt, ease),
            background var(--dur-fast, 150ms) var(--ease-crt, ease),
            text-shadow var(--dur-fast, 150ms) var(--ease-crt, ease);
        }
        .landing__cta:hover,
        .landing__cta:focus-visible {
          background: var(--bg-1);
          border-color: var(--accent-hot);
          text-shadow: var(--glow-lg);
          outline: none;
        }
        .landing__footer-hint {
          margin: 0;
          font-family: var(--font-body);
          font-size: var(--text-xs);
          color: var(--fg-3);
          font-style: italic;
        }
        .landing__footer-hint em {
          font-style: normal;
          color: var(--fg-2);
        }

        @media (max-width: 640px) {
          .landing__preview { grid-template-columns: 1fr; }
          .landing__wordmark-main { font-size: var(--text-2xl); }
          .landing__wordmark-sub { font-size: calc(var(--text-2xl) * 0.68); }
        }
      `}</style>
    </div>
  )
}
