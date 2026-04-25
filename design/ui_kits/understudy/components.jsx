/* UI kit component library — small, readable, cosmetic-only. */

/* --------- Atoms --------- */

const Button = ({ variant = 'default', children, onClick, style = {} }) => {
  const base = {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '6px 18px',
    background: 'var(--bg-1)',
    color: 'var(--fg-1)',
    border: '1px solid var(--line-2)',
    cursor: 'pointer',
    textShadow: 'var(--glow-sm)',
    transition: 'background 90ms, color 90ms, border-color 90ms',
  };
  const variants = {
    default: {},
    primary: { background: 'var(--bg-2)', color: 'var(--accent-hot)', borderColor: 'var(--line-3)', textShadow: 'var(--glow-md)' },
    ghost: { background: 'transparent', borderColor: 'var(--line-1)', color: 'var(--fg-2)', textShadow: 'none' },
    danger: { color: 'var(--bad)', borderColor: 'var(--bad)' },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} onClick={onClick}>{children}</button>;
};

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label style={{ display: 'block', marginBottom: 12 }}>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)', marginBottom: 4 }}>{label}</div>
    <input
      type={type}
      value={value || ''}
      placeholder={placeholder}
      onChange={e => onChange && onChange(e.target.value)}
      style={{
        width: '100%',
        background: 'var(--bg-inset)',
        color: 'var(--fg-1)',
        border: '1px solid var(--line-1)',
        boxShadow: 'var(--shadow-inset)',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        padding: '7px 9px',
        outline: 'none',
      }}
    />
  </label>
);

const Panel = ({ title, meta, children, flex = false, style = {} }) => (
  <div style={{
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    ...(flex && { flex: 1 }),
    ...style,
  }}>
    {title !== undefined && (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '8px 14px', borderBottom: '1px solid var(--line-1)',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>{title}</span>
        {meta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{meta}</span>}
      </div>
    )}
    <div style={{ padding: 14, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  </div>
);

/* --------- Topbar --------- */

const Topbar = ({ onOpenSettings, onNewChar, speed, onSpeed, theme, onTheme }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-1)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <img src="../../assets/logo/understudy-wordmark.svg" alt="Understudy" style={{ height: 30, color: 'var(--accent-hot)', filter: 'drop-shadow(0 0 4px rgba(168, 255, 176, 0.35))' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        fenra · life 7 · floor 4
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <SpeedControl value={speed} onChange={onSpeed} />
      <ThemePicker value={theme} onChange={onTheme} />
      <IconBtn onClick={onNewChar} label="new" />
      <IconBtn onClick={onOpenSettings} label="settings" icon="settings" />
    </div>
  </div>
);

const IconBtn = ({ label, onClick, icon }) => (
  <button onClick={onClick} style={{
    background: 'transparent', border: '1px solid var(--line-2)',
    color: 'var(--fg-2)', padding: '5px 10px', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }}>
    {icon && <img src={`../../assets/icons/${icon}.svg`} alt="" style={{ width: 12, height: 12, filter: 'brightness(0.8)' }} />}
    {label}
  </button>
);

const SpeedControl = ({ value, onChange }) => {
  const opts = [
    { k: 'pause', label: '⏸' },
    { k: '1x', label: '1×' },
    { k: '2x', label: '2×' },
    { k: '4x', label: '4×' },
  ];
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--line-2)', background: 'var(--bg-0)' }}>
      {opts.map((o, i) => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          background: value === o.k ? 'var(--bg-3)' : 'transparent',
          color: value === o.k ? 'var(--accent-hot)' : 'var(--fg-3)',
          border: 'none', borderRight: i < opts.length - 1 ? '1px solid var(--line-1)' : 'none',
          padding: '4px 12px', cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontSize: 18,
          textShadow: value === o.k ? 'var(--glow-sm)' : 'none',
        }}>{o.label}</button>
      ))}
    </div>
  );
};

const ThemePicker = ({ value, onChange }) => {
  const themes = [['mud', 'mud'], ['amber', 'amber'], ['phosphor', 'phos']];
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--line-2)' }}>
      {themes.map(([k, label], i) => (
        <button key={k} onClick={() => onChange(k)} style={{
          background: value === k ? 'var(--bg-3)' : 'transparent',
          color: value === k ? 'var(--accent-hot)' : 'var(--fg-3)',
          border: 'none', borderRight: i < themes.length - 1 ? '1px solid var(--line-1)' : 'none',
          padding: '5px 10px', cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>{label}</button>
      ))}
    </div>
  );
};

/* --------- Sprite viewport (placeholder) --------- */

const SpriteViewport = () => (
  <div style={{
    position: 'relative',
    background: 'radial-gradient(ellipse at center, var(--bg-1) 0%, var(--bg-0) 100%)',
    border: '1px solid var(--line-2)',
    aspectRatio: '1 / 1',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  }} className="scanlines">
    {/* Pixel placeholder sprite */}
    <svg viewBox="0 0 32 32" width="60%" height="60%" style={{ imageRendering: 'pixelated', filter: 'drop-shadow(0 0 3px rgba(123, 255, 136, 0.6))' }}>
      <g fill="var(--fg-1)">
        {/* head */}
        <rect x="13" y="6" width="6" height="6"/>
        {/* body */}
        <rect x="12" y="12" width="8" height="10"/>
        {/* arms */}
        <rect x="10" y="13" width="2" height="7"/>
        <rect x="20" y="13" width="2" height="7"/>
        {/* legs */}
        <rect x="12" y="22" width="3" height="5"/>
        <rect x="17" y="22" width="3" height="5"/>
        {/* bow */}
        <rect x="22" y="10" width="1" height="12" fill="var(--fg-3)"/>
      </g>
    </svg>
    <div style={{
      position: 'absolute', bottom: 6, left: 10, right: 10,
      display: 'flex', justifyContent: 'space-between',
      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
      letterSpacing: '0.12em', textTransform: 'uppercase',
    }}>
      <span>fenra</span>
      <span>the sunken chapel</span>
    </div>
  </div>
);

/* --------- Sheet panel --------- */

const SheetPanel = () => {
  const bars = [
    { k: 'HP', v: 38, max: 42, color: 'var(--good)', n: '38 / 42' },
    { k: 'MP', v: 11, max: 20, color: 'var(--magic)', n: '11 / 20' },
    { k: 'XP', v: 30, max: 100, color: 'var(--accent)', n: '1,204' },
  ];
  const stats = [
    ['STR', 14], ['DEX', 17], ['CON', 12],
    ['INT', 11], ['WIS', 15], ['CHA', 9],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', flex: 1 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent-hot)', fontFamily: 'var(--font-display)', fontSize: 18 }}>Fenra</span>
        <span style={{ color: 'var(--fg-3)', marginLeft: 6 }}>half-elf · ranger · lvl 4</span>
        <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--fg-3)' }}>
          Raised quiet. Prefers the forest's edge to its center.
        </div>
      </div>
      <div>
        {bars.map(b => (
          <div key={b.k} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 68px', gap: 8, alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.08em', color: 'var(--fg-2)' }}>{b.k}</span>
            <div style={{ height: 10, background: 'var(--bg-inset)', border: '1px solid var(--line-1)', boxShadow: 'var(--shadow-inset)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: (b.v / b.max * 100) + '%', background: b.color, boxShadow: 'var(--glow-sm)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.n}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {stats.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--fg-3)' }}>{k}</span>
              <span style={{ color: 'var(--fg-1)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Conditions</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <span style={{ border: '1px solid var(--warn)', color: 'var(--warn)', padding: '2px 6px' }}>hungry</span>
          <span style={{ border: '1px solid var(--line-2)', color: 'var(--fg-2)', padding: '2px 6px' }}>rested</span>
        </div>
      </div>
    </div>
  );
};

/* --------- Inventory panel --------- */

const INVENTORY = [
  { k: 'blackroot-lantern', name: 'Blackroot lantern', worn: true, weight: 0.6, qty: 1, rare: false, desc: 'A brass lantern, its glass fogged from the inside. Lights rooms that were dim. Does nothing in rooms that are dark.' },
  { k: 'short-bow', name: 'Short bow, worn', worn: true, weight: 1.1, qty: 1, rare: false, desc: 'The string is old. She has restrung it twice. It pulls thirty pounds on a good day.' },
  { k: 'bone-die', name: 'Bone die', worn: false, weight: 0.1, qty: 1, rare: true, desc: 'Six faces. All of them are sixes. She has not yet tried to roll it.' },
  { k: 'hardtack', name: 'Hardtack', worn: false, weight: 0.2, qty: 4, rare: false, desc: 'Survives water, time, and most teeth.' },
  { k: 'copper', name: 'Copper coin', worn: false, weight: 0, qty: 17, rare: false, desc: 'Seventeen of the realm\'s least-loved coin.' },
  { k: 'moth-wing', name: 'Moth wing, preserved', worn: false, weight: 0, qty: 1, rare: true, desc: 'It is warm to the touch. It should not be warm.' },
];

const InventoryPanel = () => {
  const [sel, setSel] = React.useState('blackroot-lantern');
  const item = INVENTORY.find(i => i.k === sel);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 0 }}>
        {INVENTORY.map(i => (
          <div key={i.k} onClick={() => setSel(i.k)} style={{
            display: 'grid', gridTemplateColumns: '22px 1fr 40px 38px',
            padding: '4px 6px', borderBottom: '1px solid var(--line-1)',
            cursor: 'pointer', alignItems: 'center',
            background: sel === i.k ? 'var(--bg-3)' : 'transparent',
            boxShadow: sel === i.k ? 'inset 0 0 0 1px var(--line-3)' : 'none',
            color: sel === i.k ? 'var(--accent-hot)' : 'var(--fg-1)',
          }}>
            <span style={{ color: 'var(--accent)' }}>{i.worn ? '[x]' : '[ ]'}</span>
            <span style={{ color: i.rare && sel !== i.k ? 'var(--magic)' : undefined }}>{i.name}</span>
            <span style={{ color: 'var(--fg-3)', textAlign: 'right' }}>{i.weight || '—'}</span>
            <span style={{ color: 'var(--fg-3)', textAlign: 'right' }}>×{i.qty}</span>
          </div>
        ))}
      </div>
      {item && (
        <div style={{
          borderTop: '1px solid var(--line-2)', padding: '8px 10px',
          background: 'var(--bg-inset)', boxShadow: 'var(--shadow-inset)',
          fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.55,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', color: item.rare ? 'var(--magic)' : 'var(--accent-hot)', marginBottom: 3 }}>
            {item.name}
          </div>
          {item.desc}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 4, letterSpacing: '0.1em' }}>
            weight · {item.weight || '—'}
          </div>
        </div>
      )}
    </div>
  );
};

/* --------- Map panel --------- */

/* simple 12x8 grid, with fog / visited / item / here / door / dead markers */
const MAP = (() => {
  const W = 14, H = 8;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.abs(x - 6) + Math.abs(y - 3);
    let state = 'fog';
    if (d < 4) state = 'visited';
    if (d < 2) state = 'visited';
    cells.push({ x, y, state });
  }
  // pepper
  const set = (x, y, state) => { const c = cells.find(c => c.x === x && c.y === y); if (c) c.state = state; };
  set(6, 3, 'here');
  set(7, 3, 'item');
  set(5, 4, 'dead');
  set(4, 2, 'door');
  set(8, 4, 'door');
  set(3, 3, 'visited');
  set(2, 3, 'visited');
  set(9, 3, 'visited');
  set(6, 5, 'visited');
  set(6, 6, 'visited');
  set(6, 1, 'visited');
  set(10, 3, 'visited');
  set(3, 4, 'visited');
  set(3, 5, 'item');
  return { W, H, cells };
})();

const MapPanel = () => {
  const [floor, setFloor] = React.useState(4);
  const [hover, setHover] = React.useState(null);
  const glyph = s => ({ fog: '·', visited: '◯', here: '◎', item: '✶', dead: '†', door: '□' })[s];
  const color = s => ({
    fog: 'var(--fg-dim)', visited: 'var(--fg-3)',
    here: 'var(--accent-hot)', item: 'var(--magic)',
    dead: 'var(--bad)', door: 'var(--fg-2)',
  })[s];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line-2)' }}>
          {[1, 2, 3, 4, 5].map(f => (
            <button key={f} onClick={() => setFloor(f)} style={{
              background: floor === f ? 'var(--bg-3)' : 'transparent',
              color: floor === f ? 'var(--accent-hot)' : (f <= 4 ? 'var(--fg-2)' : 'var(--fg-dim)'),
              border: 'none',
              borderRight: f < 5 ? '1px solid var(--line-1)' : 'none',
              padding: '3px 10px', cursor: f <= 4 ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.08em',
            }} disabled={f > 4}>F{f}</button>
          ))}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {hover ? hover.label : 'the sunken chapel'}
        </span>
      </div>
      <div style={{
        flex: 1, background: 'var(--bg-inset)', boxShadow: 'var(--shadow-inset)',
        border: '1px solid var(--line-1)', padding: 8, minHeight: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MAP.W}, 22px)`,
          gridAutoRows: '22px',
          gap: 1,
          fontFamily: 'var(--font-mono)', fontSize: 14,
        }}>
          {MAP.cells.map(c => {
            const label = { fog: 'unexplored', visited: 'empty room', here: 'you are here', item: 'unknown item', dead: 'she died here', door: 'door' }[c.state];
            return (
              <div key={`${c.x}-${c.y}`}
                onMouseEnter={() => setHover({ label })}
                onMouseLeave={() => setHover(null)}
                style={{
                  width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: c.state === 'here' ? '1px solid var(--line-3)' : (c.state === 'fog' ? '1px solid transparent' : '1px solid var(--line-1)'),
                  background: c.state === 'here' ? 'var(--bg-3)' : (c.state === 'fog' ? 'transparent' : 'var(--bg-1)'),
                  color: color(c.state),
                  boxShadow: c.state === 'here' ? 'var(--glow-sm)' : 'none',
                  cursor: c.state !== 'fog' ? 'pointer' : 'default',
                }}>{glyph(c.state)}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* --------- Log panel --------- */

const LOG = [
  { t: 'scene', text: '— New area: The Sunken Chapel', color: 'var(--fg-3)', italic: true },
  { t: 'narr', text: 'Fenra descends three flights of the staircase before she realizes it is the same flight. She turns around.' },
  { t: 'narr', text: 'A moth the size of a thumbnail drifts past her ear. She watches it leave.' },
  { t: 'sys',  text: '> The moth remembers the shape of her lantern.', color: 'var(--fg-3)' },
  { t: 'narr', text: 'The door at the landing is wet. She opens it.' },
  { t: 'narr', text: 'A goblin — thin, wrong-jawed — is waiting on the other side. It does not look surprised.' },
  { t: 'dmg',  text: 'She strikes it across the jaw.', tag: '−4 HP', tagColor: 'var(--bad)' },
  { t: 'speech', text: '"You are bleeding," says the moth, which is not a moth.', color: 'var(--speech)' },
  { t: 'loot', text: 'She pockets a bone die. It is heavier than it looks.', tag: '+ item', tagColor: 'var(--good)', itemLink: 'Bone die' },
  { t: 'narr', text: 'Someone, somewhere, is watching her do this. She does not know.', color: 'var(--fg-3)', italic: true },
];

const LogPanel = () => (
  <div style={{
    flex: 1, overflow: 'auto', padding: '10px 14px',
    fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.65, color: 'var(--fg-1)',
    minHeight: 0,
  }}>
    {LOG.map((e, i) => (
      <p key={i} style={{
        margin: '0 0 6px 0', color: e.color || 'var(--fg-1)',
        fontStyle: e.italic ? 'italic' : 'normal',
      }}>
        {e.itemLink
          ? e.text.split(e.itemLink).flatMap((p, j) => j === 0
              ? [p]
              : [<span key={j} style={{ color: 'var(--magic)', borderBottom: '1px dotted var(--magic)' }}>{e.itemLink}</span>, p])
          : e.text}
        {e.tag && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: e.tagColor, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>({e.tag})</span>}
      </p>
    ))}
    <p style={{ margin: 0, color: 'var(--fg-3)' }} className="cursor"><span style={{ opacity: 0 }}>.</span></p>
  </div>
);

/* --------- Tabs --------- */

const Tabs = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid var(--line-2)', background: 'var(--bg-0)' }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '0.08em', textTransform: 'uppercase',
        padding: '6px 14px',
        color: value === t ? 'var(--accent-hot)' : 'var(--fg-3)',
        background: value === t ? 'var(--bg-1)' : 'transparent',
        border: '1px solid transparent',
        borderColor: value === t ? 'var(--line-2) var(--line-2) transparent var(--line-2)' : 'transparent',
        borderBottom: value === t ? '1px solid var(--bg-1)' : '1px solid var(--line-2)',
        marginBottom: -1,
        cursor: 'pointer',
        textShadow: value === t ? 'var(--glow-sm)' : 'none',
      }}>{t}</button>
    ))}
  </div>
);

/* --------- Main game view --------- */

const GameView = ({ speed, onSpeed }) => {
  const [tab, setTab] = React.useState('Sheet');
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '340px 1fr',
      gridTemplateRows: 'auto 1fr',
      gap: 12, padding: 12, height: '100%',
      boxSizing: 'border-box', minHeight: 0,
    }}>
      {/* Left top: sprite */}
      <div style={{ gridColumn: 1, gridRow: 1 }}>
        <SpriteViewport />
      </div>
      {/* Left bottom: tabs */}
      <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Tabs tabs={['Sheet', 'Inventory']} value={tab} onChange={setTab} />
        <div style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderTop: 'none', padding: tab === 'Sheet' ? 14 : 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {tab === 'Sheet' ? <SheetPanel /> : <InventoryPanel />}
        </div>
      </div>
      {/* Right top: map */}
      <div style={{ gridColumn: 2, gridRow: 1, minHeight: 0 }}>
        <Panel title="MAP" meta="F4 · THE SUNKEN CHAPEL" style={{ height: '100%' }}>
          <MapPanel />
        </Panel>
      </div>
      {/* Right bottom: log */}
      <div style={{ gridColumn: 2, gridRow: 2, minHeight: 0 }}>
        <Panel title="LOG" meta="life 7 · 12 min" style={{ height: '100%' }}>
          <LogPanel />
        </Panel>
      </div>
    </div>
  );
};

Object.assign(window, {
  Button, Field, Panel, Topbar, IconBtn, SpeedControl, ThemePicker,
  SpriteViewport, SheetPanel, InventoryPanel, MapPanel, LogPanel, Tabs,
  GameView,
});
