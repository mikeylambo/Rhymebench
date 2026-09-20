import { useState } from 'react';
import { useStore } from '../lib/store.js';
import { uid } from '../lib/storage.js';
import { useAsync } from '../lib/useAsync.js';
import type { Scheme, SchemeColumn } from '../lib/types.js';
import { EmptyState } from '../components/ui.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LETTER_COLORS = ['#4ecb8d', '#6ea8fe', '#f0a63a', '#c07de0', '#ef6f8e', '#48c9c9'];

export function SchemeView() {
  const { engine, status, schemes, setSchemes } = useStore();
  const [activeId, setActiveId] = useState<string | null>(schemes[0]?.id ?? null);
  const active = schemes.find((s) => s.id === activeId) ?? null;

  const update = (fn: (s: Scheme) => Scheme) =>
    setSchemes(schemes.map((s) => (s.id === activeId ? fn(s) : s)));

  const newScheme = () => {
    const s: Scheme = {
      id: uid(),
      name: `Scheme ${schemes.length + 1}`,
      columns: [{ id: uid(), letter: 'A', query: '', words: [] }],
    };
    setSchemes([s, ...schemes]);
    setActiveId(s.id);
  };

  const addColumn = () =>
    update((s) => ({
      ...s,
      columns: [...s.columns, { id: uid(), letter: LETTERS[s.columns.length] ?? '·', query: '', words: [] }],
    }));

  const removeColumn = (cid: string) =>
    update((s) => ({ ...s, columns: s.columns.filter((c) => c.id !== cid) }));

  const setColumn = (cid: string, patch: Partial<SchemeColumn>) =>
    update((s) => ({ ...s, columns: s.columns.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Scheme Builder</h2>
        <p>Hold several rhyme families side by side (A / B / C…) and build a scheme across multiple lines at once. Save the whole set for later.</p>
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {schemes.map((s) => (
            <button
              key={s.id}
              className={`btn tiny ${s.id === activeId ? 'primary' : 'ghost'}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.name}
            </button>
          ))}
          <button className="btn tiny" onClick={newScheme}>＋ New scheme</button>
        </div>
        {active && (
          <button className="btn tiny ghost" onClick={() => { setSchemes(schemes.filter((s) => s.id !== active.id)); setActiveId(null); }}>
            Delete scheme
          </button>
        )}
      </div>

      {!active && <EmptyState icon="🎼">Create a scheme, then add rhyme families side by side.</EmptyState>}

      {active && (
        <>
          <div className="field" style={{ marginBottom: 14, maxWidth: 320 }}>
            <span className="lead">🏷️</span>
            <input value={active.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} />
          </div>

          <div className="scheme-cols">
            {active.columns.map((col, i) => (
              <SchemeColumnCard
                key={col.id}
                col={col}
                color={LETTER_COLORS[i % LETTER_COLORS.length]}
                ready={status.ready}
                search={(q) => engine.search(q, { maxDistance: 0.35, limit: 40 }).then((rs) => rs.map((r) => r.word))}
                onChange={(patch) => setColumn(col.id, patch)}
                onRemove={() => removeColumn(col.id)}
              />
            ))}
            <button className="scheme-col" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)' }} onClick={addColumn}>
              ＋ Add family
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SchemeColumnCard({
  col,
  color,
  ready,
  search,
  onChange,
  onRemove,
}: {
  col: SchemeColumn;
  color: string;
  ready: boolean;
  search: (q: string) => Promise<string[]>;
  onChange: (patch: Partial<SchemeColumn>) => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState(col.query);
  const raw = useAsync(() => (ready && q.trim() ? search(q.trim()) : Promise.resolve([])), [q, ready], [] as string[]);
  const suggestions = raw.filter((w) => !col.words.includes(w)).slice(0, 18);

  return (
    <div className="scheme-col">
      <div className="col-head">
        <span className="letter" style={{ background: `${color}22`, color }}>{col.letter}</span>
        <input
          className="mono"
          style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 8px', outline: 'none', fontSize: 12 }}
          value={q}
          placeholder="seed word…"
          onChange={(e) => { setQ(e.target.value); onChange({ query: e.target.value }); }}
        />
        <button className="btn tiny ghost" onClick={onRemove} title="Remove family">✕</button>
      </div>

      {col.words.length > 0 && (
        <div className="result-grid">
          {col.words.map((w) => (
            <span key={w} className="rword pinned" style={{ paddingRight: 8 }}>
              <span className="band-dot" style={{ background: color }} />
              {w}
              <button className="pin" style={{ opacity: 1 }} onClick={() => onChange({ words: col.words.filter((x) => x !== w) })}>✕</button>
            </span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Tap to add</div>
          <div className="result-grid">
            {suggestions.map((w) => (
              <button key={w} className="rword" style={{ cursor: 'pointer' }} onClick={() => onChange({ words: [...col.words, w] })}>
                {w} <span className="faint">＋</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
