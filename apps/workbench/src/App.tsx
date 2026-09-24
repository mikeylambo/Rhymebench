import { useEffect, useState } from 'react';
import { useStore } from './lib/store.js';
import { SidePanel } from './components/SidePanel.js';
import { DataDialog } from './components/DataDialog.js';
import { CrashTest } from './components/ErrorBoundary.js';
import { SearchView } from './features/SearchView.js';
import { MultiBuilderView } from './features/MultiBuilderView.js';
import { InternalRhymeView } from './features/InternalRhymeView.js';
import { SchemeView } from './features/SchemeView.js';
import { ScratchpadView } from './features/ScratchpadView.js';
import { WriteView } from './features/WriteView.js';

type Tab = 'write' | 'search' | 'multi' | 'internal' | 'scheme' | 'scratch';

const TABS: Array<{ id: Tab; glyph: string; label: string }> = [
  { id: 'write', glyph: '✍️', label: 'Write' },
  { id: 'search', glyph: '🔎', label: 'Search' },
  { id: 'multi', glyph: '🎛️', label: 'Multi' },
  { id: 'internal', glyph: '🧵', label: 'Internal' },
  { id: 'scheme', glyph: '🎼', label: 'Scheme' },
  { id: 'scratch', glyph: '✏️', label: 'Pad' },
];

function Loader() {
  const { status } = useStore();
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="logo">Rhyme Workbench<span className="dot">.</span></div>
      <div className="track" aria-hidden="true"><div className="fill" style={{ width: `${status.progress * 100}%` }} /></div>
      <div className="msg">{status.error ? `⚠︎ ${status.error}` : status.message}</div>
    </div>
  );
}

export default function App() {
  const { status } = useStore();
  const [tab, setTab] = useState<Tab>('write');
  const [word, setWord] = useState('position');
  const [showData, setShowData] = useState(false);
  const [crashTest, setCrashTest] = useState(() => location.hash === '#crash-test');

  useEffect(() => {
    const onHash = () => setCrashTest(location.hash === '#crash-test');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goSearch = (w: string) => {
    setWord(w);
    setTab('search');
  };

  if (crashTest) return <CrashTest />;

  if (!status.ready) {
    return (
      <div className="app">
        <Loader />
      </div>
    );
  }

  const showRail = tab !== 'internal';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="brand">
          <h1>Rhyme Workbench<span className="dot" aria-hidden="true">.</span></h1>
          <span className="tag">explore the sound-space</span>
        </div>
        <div className="spacer" />
        <div className="status-pill" title="Every lookup runs on this device — no network needed">
          <span className="beacon" aria-hidden="true" />
          {status.wordCount.toLocaleString()} words · on-device
        </div>
        <button className="btn tiny ghost" onClick={() => setShowData(true)} aria-haspopup="dialog">
          Data &amp; about
        </button>
      </header>

      <div className={`body ${showRail ? '' : 'no-rail'}`}>
        <nav className="rail" aria-label="Tools">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <span className="glyph" aria-hidden="true">{t.glyph}</span>
              <span className="lbl">{t.label}</span>
            </button>
          ))}
        </nav>

        <main className="main" id="main" tabIndex={-1}>
          {tab === 'write' && <WriteView />}
          {tab === 'search' && <SearchView word={word} setWord={setWord} />}
          {tab === 'multi' && <MultiBuilderView />}
          {tab === 'internal' && <InternalRhymeView />}
          {tab === 'scheme' && <SchemeView />}
          {tab === 'scratch' && <ScratchpadView />}
        </main>

        {showRail && <SidePanel goSearch={goSearch} />}
      </div>

      {showData && <DataDialog onClose={() => setShowData(false)} />}
    </div>
  );
}
