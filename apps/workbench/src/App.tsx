import { useState } from 'react';
import { useStore } from './lib/store.js';
import { SidePanel } from './components/SidePanel.js';
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
    <div className="loader">
      <div className="logo">Rhyme Workbench<span className="dot">.</span></div>
      <div className="track"><div className="fill" style={{ width: `${status.progress * 100}%` }} /></div>
      <div className="msg">{status.error ? `⚠︎ ${status.error}` : status.message}</div>
    </div>
  );
}

export default function App() {
  const { status } = useStore();
  const [tab, setTab] = useState<Tab>('write');
  const [word, setWord] = useState('position');

  const goSearch = (w: string) => {
    setWord(w);
    setTab('search');
  };

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
      <header className="topbar">
        <div className="brand">
          <h1>Rhyme Workbench<span className="dot">.</span></h1>
          <span className="tag">explore the sound-space</span>
        </div>
        <div className="spacer" />
        <div className="status-pill">
          <span className="beacon" />
          {status.wordCount.toLocaleString()} words · offline
        </div>
      </header>

      <div className={`body ${showRail ? '' : 'no-rail'}`}>
        <nav className="rail">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="glyph">{t.glyph}</span>
              <span className="lbl">{t.label}</span>
            </button>
          ))}
        </nav>

        <main className="main">
          {tab === 'write' && <WriteView />}
          {tab === 'search' && <SearchView word={word} setWord={setWord} />}
          {tab === 'multi' && <MultiBuilderView />}
          {tab === 'internal' && <InternalRhymeView />}
          {tab === 'scheme' && <SchemeView />}
          {tab === 'scratch' && <ScratchpadView />}
        </main>

        {showRail && <SidePanel goSearch={goSearch} />}
      </div>
    </div>
  );
}
