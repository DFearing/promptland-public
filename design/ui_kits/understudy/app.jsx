/* App shell — routes between game / creation / settings. */

const App = () => {
  const [screen, setScreen] = React.useState('game');  // 'game' | 'create' | 'settings'
  const [speed, setSpeed] = React.useState('1x');
  const [theme, setTheme] = React.useState('mud');

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', color: 'var(--fg-1)', overflow: 'hidden',
    }} className="flicker">
      <Topbar
        onOpenSettings={() => setScreen('settings')}
        onNewChar={() => setScreen('create')}
        speed={speed} onSpeed={setSpeed}
        theme={theme} onTheme={setTheme}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {screen === 'game' && <GameView speed={speed} onSpeed={setSpeed} />}
        {screen === 'create' && (
          <CharacterCreation
            onCancel={() => setScreen('game')}
            onDone={() => setScreen('game')}
          />
        )}
        {screen === 'settings' && <Settings onBack={() => setScreen('game')} />}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
