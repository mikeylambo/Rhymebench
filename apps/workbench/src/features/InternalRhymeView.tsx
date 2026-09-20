import { Fragment, useMemo, useState } from 'react';
import type { InternalRhymeResult } from '@rhyme/engine';
import { useStore } from '../lib/store.js';
import { useAsync } from '../lib/useAsync.js';
import { EmptyState } from '../components/ui.js';

// Distinct cluster colours (assigned by ranked cluster id).
const COLORS = ['#4ecb8d', '#6ea8fe', '#f0a63a', '#c07de0', '#ef6f8e', '#48c9c9', '#d4d24e', '#e08a4e'];

const SAMPLE = 'My lyrics deliver a mirror that shimmers, the sinner considers the figures grow bigger';

export function InternalRhymeView() {
  const { engine, status } = useStore();
  const [line, setLine] = useState('');
  const [threshold, setThreshold] = useState(0.8);

  const result = useAsync<InternalRhymeResult | null>(
    () => (status.ready && line.trim() ? engine.findInternalRhymes(line, threshold) : Promise.resolve(null)),
    [engine, line, threshold, status.ready],
    null,
  );

  // Map each character range (word) to the colour of the strongest cluster it
  // participates in, so we can paint the line.
  const wordColor = useMemo(() => {
    const map = new Map<string, string>(); // "start-end" -> color
    if (!result) return map;
    result.clusters.forEach((c) => {
      const color = COLORS[c.id % COLORS.length];
      for (const m of c.members) {
        const s = result.syllables[m];
        const kkey = `${s.charStart}-${s.charEnd}`;
        if (!map.has(kkey)) map.set(kkey, color);
      }
    });
    return map;
  }, [result]);

  // Render the original line, colouring participating words.
  const rendered = useMemo(() => {
    if (!line) return null;
    const parts: Array<{ text: string; color?: string }> = [];
    const re = /[A-Za-z']+|[^A-Za-z']+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const isWord = /[A-Za-z']/.test(m[0][0]);
      const color = isWord ? wordColor.get(`${m.index}-${m.index + m[0].length}`) : undefined;
      parts.push({ text: m[0], color });
    }
    return parts;
  }, [line, wordColor]);

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Internal Rhyme Finder</h2>
        <p>Paste a line or bar and see the internal rhymes light up — matching sounds anywhere in the line, not just at the end, including non-adjacent ones.</p>
      </div>

      <textarea
        className="raw"
        rows={3}
        value={line}
        placeholder="Paste a bar…"
        onChange={(e) => setLine(e.target.value)}
      />
      <div className="row wrap" style={{ justifyContent: 'space-between', margin: '10px 0 4px' }}>
        <button className="btn tiny ghost" onClick={() => setLine(SAMPLE)}>Try a sample bar</button>
        <div className="row" style={{ gap: 8 }}>
          <span className="hint">Strictness</span>
          <input type="range" className="distance" style={{ width: 130 }} min={0.68} max={0.95} step={0.01} value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} />
          <span className="hint mono">{threshold.toFixed(2)}</span>
        </div>
      </div>

      {!line.trim() && <EmptyState icon="🧵">Drop in a bar to find the internal rhymes woven through it.</EmptyState>}

      {result && (
        <>
          <div className="panel" style={{ marginTop: 12 }}>
            <p className="panel-title">The bar</p>
            <div className="bar-render">
              {rendered?.map((p, i) =>
                p.color ? (
                  <span
                    key={i}
                    className="syl-word"
                    style={{ color: p.color, background: `${p.color}1e`, boxShadow: `inset 0 -2px 0 ${p.color}` }}
                  >
                    {p.text}
                  </span>
                ) : (
                  <Fragment key={i}>{p.text}</Fragment>
                ),
              )}
            </div>
          </div>

          <div className="panel">
            <p className="panel-title">{result.clusters.length} rhyme {result.clusters.length === 1 ? 'cluster' : 'clusters'} · {result.syllables.length} syllables</p>
            {result.clusters.length === 0 ? (
              <div className="hint">No internal rhymes detected at this strictness. Slide left to loosen.</div>
            ) : (
              result.clusters.map((c) => (
                <div key={c.id} className="row wrap" style={{ marginBottom: 8, alignItems: 'baseline' }}>
                  <span className="band-dot" style={{ background: COLORS[c.id % COLORS.length] }} />
                  <span className="mono faint" style={{ minWidth: 34 }}>{c.vowel}</span>
                  <span style={{ color: COLORS[c.id % COLORS.length], fontWeight: 600 }}>
                    {[...new Set(c.members.map((m) => result.syllables[m].text))].join('  ·  ')}
                  </span>
                  <span className="hint">{c.members.length} hits · {(c.strength * 100).toFixed(0)}%</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
