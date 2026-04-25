/* Character creation wizard — 4 steps. */

const WORLDS = [
  { k: 'fantasy', name: 'Fantasy', blurb: 'A kingdom in slow decline. Rust on the armor. Moths in the lantern.' },
  { k: 'cyberpunk', name: 'Cyberpunk', blurb: 'A city that forgot to turn off. The rain knows your name.' },
  { k: 'scifi', name: 'Sci-Fi', blurb: 'A station in a slow orbit around a star that is cooling faster than expected.' },
  { k: 'post', name: 'Post-apocalypse', blurb: 'The quiet has been quiet for a while now.' },
];

const SPECIES = {
  fantasy: ['Human', 'Half-elf', 'Dwarf', 'Halfling', 'Tiefling', 'Gnome'],
  cyberpunk: ['Augmented', 'Baseline', 'Construct', 'Edited'],
  scifi: ['Terran', 'Colonist', 'Synthetic', 'Xenoform'],
  post: ['Survivor', 'Mutant', 'Scavver', 'Untouched'],
};

const CLASSES = {
  fantasy: ['Ranger', 'Scholar', 'Thief', 'Cleric', 'Knight', 'Warlock'],
  cyberpunk: ['Netrunner', 'Solo', 'Fixer', 'Medtech'],
  scifi: ['Engineer', 'Marine', 'Pilot', 'Xenologist'],
  post: ['Hunter', 'Mechanic', 'Medic', 'Walker'],
};

const GENDERS = ['Woman', 'Man', 'Nonbinary', 'Unspecified'];

const NAMES = {
  fantasy: ['Fenra', 'Halden', 'Iosef', 'Mirren', 'Tovi', 'Ashe'],
  cyberpunk: ['Quill', 'Jax', 'Nova', 'Rook', 'Cass', 'Zero'],
  scifi: ['Vela', 'Orin', 'Lira', 'Kade', 'Ember', 'Six'],
  post: ['Creek', 'Hollis', 'March', 'Wren', 'Ash', 'Mote'],
};

const ChoiceGrid = ({ options, value, onChange, cols = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
    {options.map(o => {
      const k = o.k || o;
      const name = o.name || o;
      const blurb = o.blurb;
      const selected = value === k;
      return (
        <button key={k} onClick={() => onChange(k)} style={{
          textAlign: 'left',
          background: selected ? 'var(--bg-3)' : 'var(--bg-1)',
          border: '1px solid ' + (selected ? 'var(--line-3)' : 'var(--line-2)'),
          boxShadow: selected ? 'var(--glow-sm)' : 'none',
          color: 'var(--fg-1)',
          padding: '10px 14px',
          cursor: 'pointer',
          minHeight: blurb ? 80 : 50,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: selected ? 'var(--accent-hot)' : 'var(--fg-1)',
            textShadow: selected ? 'var(--glow-sm)' : 'none',
          }}>{name}</span>
          {blurb && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-3)', fontStyle: 'italic', lineHeight: 1.5 }}>{blurb}</span>}
        </button>
      );
    })}
  </div>
);

const CharacterCreation = ({ onCancel, onDone }) => {
  const [step, setStep] = React.useState(0);
  const [pick, setPick] = React.useState({ world: null, species: null, gender: null, klass: null, name: '' });

  React.useEffect(() => {
    if (pick.world && !pick.name) {
      const pool = NAMES[pick.world];
      setPick(p => ({ ...p, name: pool[Math.floor(Math.random() * pool.length)] }));
    }
  }, [pick.world]);

  const steps = [
    { k: 'world', title: 'Choose a world' },
    { k: 'species', title: 'Choose a species' },
    { k: 'gender', title: 'Choose a gender' },
    { k: 'klass', title: 'Choose a class' },
    { k: 'review', title: 'Confirm' },
  ];
  const current = steps[step];
  const canAdvance = (() => {
    if (current.k === 'world') return !!pick.world;
    if (current.k === 'species') return !!pick.species;
    if (current.k === 'gender') return !!pick.gender;
    if (current.k === 'klass') return !!pick.klass;
    return true;
  })();

  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40, boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%', maxWidth: 760,
        background: 'var(--bg-1)', border: '1px solid var(--line-2)',
        padding: 32,
      }}>
        {/* progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
          {steps.map((s, i) => (
            <React.Fragment key={s.k}>
              <span style={{ color: i === step ? 'var(--accent-hot)' : (i < step ? 'var(--fg-2)' : 'var(--fg-dim)') }}>
                {i < step ? '[x]' : (i === step ? '[·]' : '[ ]')} {s.k}
              </span>
              {i < steps.length - 1 && <span style={{ color: 'var(--fg-dim)' }}>·</span>}
            </React.Fragment>
          ))}
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--accent-hot)', textShadow: 'var(--glow-sm)', marginBottom: 6 }}>
          {current.title}
        </h2>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-3)', marginBottom: 22, fontStyle: 'italic' }}>
          You are not the one in the story. You are choosing who will be.
        </div>

        {/* step body */}
        <div style={{ marginBottom: 24 }}>
          {current.k === 'world' && (
            <ChoiceGrid options={WORLDS} value={pick.world} onChange={v => setPick({ ...pick, world: v, species: null, klass: null })} cols={2} />
          )}
          {current.k === 'species' && (
            <ChoiceGrid options={SPECIES[pick.world]} value={pick.species} onChange={v => setPick({ ...pick, species: v })} cols={3} />
          )}
          {current.k === 'gender' && (
            <ChoiceGrid options={GENDERS} value={pick.gender} onChange={v => setPick({ ...pick, gender: v })} cols={4} />
          )}
          {current.k === 'klass' && (
            <ChoiceGrid options={CLASSES[pick.world]} value={pick.klass} onChange={v => setPick({ ...pick, klass: v })} cols={3} />
          )}
          {current.k === 'review' && (
            <div>
              <div style={{
                background: 'var(--bg-inset)', boxShadow: 'var(--shadow-inset)',
                border: '1px solid var(--line-1)', padding: 20, fontFamily: 'var(--font-body)', fontSize: 14,
                color: 'var(--fg-1)', lineHeight: 1.7, marginBottom: 18,
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--accent-hot)', textShadow: 'var(--glow-sm)', letterSpacing: '0.04em' }}>{pick.name}</div>
                <div style={{ color: 'var(--fg-2)', marginBottom: 10 }}>
                  {pick.gender} · {pick.species} · {pick.klass}
                </div>
                <div style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>
                  She has not been born yet. In a moment, she will be, and you will watch her
                  make her first mistake.
                </div>
              </div>
              <Field label="Name" value={pick.name} onChange={v => setPick({ ...pick, name: v })} />
            </div>
          )}
        </div>

        {/* nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="ghost" onClick={() => step === 0 ? onCancel() : setStep(step - 1)}>
            {step === 0 ? 'Cancel' : '← Back'}
          </Button>
          <Button
            variant="primary"
            onClick={() => canAdvance && (step === steps.length - 1 ? onDone(pick) : setStep(step + 1))}
            style={{ opacity: canAdvance ? 1 : 0.4, cursor: canAdvance ? 'pointer' : 'not-allowed' }}
          >
            {step === steps.length - 1 ? 'Begin' : 'Continue →'}
          </Button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CharacterCreation });
