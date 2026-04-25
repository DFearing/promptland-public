interface Props {
  onExit?: () => void
  onSettings?: () => void
  onBack?: () => void
}

export default function Topbar({ onExit, onSettings, onBack }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <span className="topbar__wordmark">UNDERSTUDY</span>
      </div>
      <div className="topbar__right">
        {onExit && (
          <button type="button" className="topbar__btn" onClick={onExit}>
            ← Roster
          </button>
        )}
        {onBack ? (
          <button type="button" className="topbar__btn" onClick={onBack}>
            ← Back
          </button>
        ) : onSettings ? (
          <button type="button" className="topbar__btn" onClick={onSettings}>
            Settings
          </button>
        ) : null}
      </div>

      <style>{`
        .topbar { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--line-2); background: var(--bg-1); flex-shrink: 0; }
        .topbar__left { display: flex; align-items: baseline; min-width: 0; }
        .topbar__wordmark { font-family: var(--font-display); font-size: var(--text-2xl); letter-spacing: 0.08em; color: var(--accent-hot); text-shadow: var(--glow-md); }
        .topbar__right { display: flex; gap: var(--sp-1); align-items: center; flex-shrink: 0; }
        .topbar__btn { padding: 5px var(--sp-3); background: transparent; color: var(--fg-2); border: 1px solid var(--line-2); cursor: pointer; font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.1em; text-transform: uppercase; transition: color var(--dur-fast) var(--ease-crt), border-color var(--dur-fast) var(--ease-crt), background var(--dur-fast) var(--ease-crt); }
        .topbar__btn:hover { color: var(--accent-hot); border-color: var(--line-3); background: var(--bg-2); text-shadow: var(--glow-sm); }
      `}</style>
    </header>
  )
}
