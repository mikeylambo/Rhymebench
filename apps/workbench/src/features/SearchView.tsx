import { useEffect, useMemo, useState } from 'react';
import type { RhymeResult } from '@rhyme/engine';
import { useStore } from '../lib/store.js';
import { useWideSearch } from '../lib/useSearch.js';
import { EmptyState, Spinner, TierHeader, WordChip } from '../components/ui.js';
import { Microscope } from '../components/Microscope.js';

const TIERS: RhymeResult['tier'][] = ['perfect', 'multi', 'slant', 'assonance'];
const TIER_LABEL: Record<string, string> = {
  perfect: 'Perfect',
  multi: 'Multis',
  slant: 'Slant',
  assonance: 'Assonance',
};

function distanceLabel(d: number): string {
  if (d < 0.15) return 'Exact rhymes only';
  if (d < 0.35) return 'Perfect + strong slant';
  if (d < 0.6) return 'Out into slant territory';
  if (d < 0.8) return 'Loose — assonance & near-vowels';
  return 'Experimental — the far edge';
}

export function SearchView({ word, setWord }: { word: string; setWord: (w: string) => void }) {
  const { engine, status, saveFamily } = useStore();
  const [mode, setMode] = useState<'rhymes' | 'homophones'>('rhymes');
  const [distance, setDistance] = useState(0.5);
  const [soundOpen, setSoundOpen] = useState(false);
  const [lockMode, setLockMode] = useState<'lock' | 'subst'>('lock');
  const [mask, setMask] = useState<boolean[]>([]);

  const { results, busy } = useWideSearch(word, status.ready);
  const pron = useMemo(() => (status.ready && word.trim() ? engine.resolve(word.trim()) : null), [engine, word, status.ready]);

  // reset the lock mask whenever the resolved word changes shape
  useEffect(() => {
    setMask(pron ? new Array(pron.phones.length).fill(false) : []);
  }, [pron]);

  const homophones = useMemo(
    () => (mode === 'homophones' && status.ready && word.trim() ? engine.findHomophones(word.trim(), 80) : []),
    [engine, word, mode, status.ready],
  );

  // filter the wide result set by the slider, then group by band
  const minScore = 1 - distance;
  const grouped = useMemo(() => {
    const g: Record<string, RhymeResult[]> = { perfect: [], multi: [], slant: [], assonance: [] };
    for (const r of results) if (r.score >= minScore) g[r.tier].push(r);
    return g;
  }, [results, minScore]);
  const totalShown = TIERS.reduce((n, b) => n + grouped[b].length, 0);

  const anyLocked = mask.some(Boolean);
  const lockResults = useMemo(() => {
    if (!pron || !anyLocked || !word.trim()) return [];
    if (lockMode === 'lock') return engine.findByLockedSegments(word.trim(), mask, { limit: 120 });
    const idx = mask.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    return engine.findBySubstitution(word.trim(), idx, { limit: 120 });
  }, [engine, word, mask, lockMode, pron, anyLocked]);

  const toggleMask = (i: number) =>
    setMask((m) => {
      const next = m.slice();
      if (lockMode === 'subst') {
        // substitution varies one segment at a time — single select
        const wasOn = next[i];
        next.fill(false);
        next[i] = !wasOn;
      } else {
        next[i] = !next[i];
      }
      return next;
    });

  const lockScope = (kind: 'rime' | 'vowels' | 'clear') => {
    if (!pron) return;
    const next = new Array(pron.phones.length).fill(false);
    if (kind === 'rime') for (let i = pron.rimeStart; i < pron.phones.length; i++) next[i] = true;
    if (kind === 'vowels') pron.phones.forEach((p, i) => { if (/\d/.test(p)) next[i] = true; });
    setMask(next);
  };

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Rhyme Search</h2>
        <p>Search a word and navigate its whole sound-space — from perfect rhymes out through slant, or lock individual sounds and hunt for matches.</p>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <span className="lead">🔍</span>
        <input
          value={word}
          autoFocus
          placeholder="Type a word — try “position”, “money”, or slang like “drip”"
          onChange={(e) => setWord(e.target.value)}
        />
        {busy && <Spinner />}
      </div>

      <div className="row wrap" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
        <div className="chip-toggle">
          <button className={mode === 'rhymes' ? 'on' : ''} onClick={() => setMode('rhymes')}>Rhymes</button>
          <button className={mode === 'homophones' ? 'on' : ''} onClick={() => setMode('homophones')}>Homophones</button>
        </div>
        {pron && (
          <div className="row" style={{ gap: 10 }}>
            <span className="mono faint" style={{ fontSize: 12 }}>/{pron.phones.join(' ')}/</span>
            <span className="hint">{pron.source === 'cmu' ? 'dictionary' : pron.source === 'slang' ? 'slang supplement' : 'G2P fallback'}</span>
          </div>
        )}
      </div>

      {mode === 'rhymes' && (
        <>
          <div className="panel">
            <p className="panel-title">Rhyme Distance</p>
            <div className="slider-wrap">
              <input
                type="range"
                className="distance"
                min={0}
                max={1}
                step={0.01}
                value={distance}
                onChange={(e) => setDistance(parseFloat(e.target.value))}
              />
              <div className="slider-scale">
                <span>Exact</span><span>Strong</span><span>Loose</span><span>Experimental</span>
              </div>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>{distanceLabel(distance)} · {totalShown} results</div>
          </div>

          {!word.trim() && <EmptyState icon="🎧">Start typing to explore the sound-space.</EmptyState>}
          {word.trim() && !busy && totalShown === 0 && (
            <EmptyState icon="🫥">No rhymes at this distance. Slide toward <em>Loose</em> to widen the net.</EmptyState>
          )}

          {TIERS.map((b) =>
            grouped[b].length ? (
              <div key={b}>
                <TierHeader label={TIER_LABEL[b]} count={grouped[b].length} color={b} />
                <div className="result-grid">
                  {grouped[b].map((r) => (
                    <WordChip
                      key={r.word}
                      word={r.word}
                      band={r.tier}
                      source={r.source}
                      from={word.trim()}
                      onClick={setWord}
                      title={`${r.tier} · score ${r.score.toFixed(2)}${r.depth >= 2 ? ` · ${r.depth}-syllable` : ''}`}
                    />
                  ))}
                </div>
                {b === 'perfect' && grouped[b].length > 2 && (
                  <button
                    className="btn tiny ghost"
                    style={{ marginTop: 8 }}
                    onClick={() => saveFamily(`${word.trim()} — perfect`, grouped[b].slice(0, 40).map((r) => r.word), word.trim())}
                  >
                    ＋ Save these as a rhyme family
                  </button>
                )}
              </div>
            ) : null,
          )}
        </>
      )}

      {mode === 'homophones' && (
        <>
          <div className="hint" style={{ margin: '4px 0 12px' }}>
            Words that sound identical or nearly identical despite different spelling — the double-meaning toolkit.
          </div>
          {word.trim() && homophones.length === 0 && <EmptyState icon="👥">No homophones found for “{word.trim()}”.</EmptyState>}
          {homophones.length > 0 && (
            <>
              <TierHeader label="True homophones" count={homophones.filter((h) => h.identical).length} color="perfect" />
              <div className="result-grid">
                {homophones.filter((h) => h.identical).map((h) => (
                  <WordChip key={h.word} word={h.word} band="perfect" source={h.source} from={word.trim()} onClick={setWord} />
                ))}
              </div>
              <TierHeader label="Near-homophones" count={homophones.filter((h) => !h.identical).length} color="slant" />
              <div className="result-grid">
                {homophones.filter((h) => !h.identical).map((h) => (
                  <WordChip key={h.word} word={h.word} band="slant" source={h.source} from={word.trim()} onClick={setWord} title={`sound match ${h.score.toFixed(2)}`} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Sound tools: locking + substitution microscope */}
      {pron && pron.phones.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p className="panel-title" style={{ margin: 0 }}>Sound Tools — the microscope</p>
            <button className="btn tiny ghost" onClick={() => setSoundOpen((o) => !o)}>{soundOpen ? 'Hide' : 'Show'}</button>
          </div>
          {soundOpen && (
            <div style={{ marginTop: 12 }}>
              <div className="chip-toggle" style={{ marginBottom: 10 }}>
                <button className={lockMode === 'lock' ? 'on' : ''} onClick={() => { setLockMode('lock'); lockScope('clear'); }}>🔒 Lock &amp; vary the rest</button>
                <button className={lockMode === 'subst' ? 'on' : ''} onClick={() => { setLockMode('subst'); lockScope('clear'); }}>🔁 Substitute one sound</button>
              </div>
              <div className="hint" style={{ marginBottom: 8 }}>
                {lockMode === 'lock'
                  ? 'Click phonemes to lock them. Results keep exactly those sounds and vary everything else.'
                  : 'Click one phoneme to change it. Results hold every other sound fixed.'}
              </div>
              <Microscope pron={pron} selected={mask} mode={lockMode} onToggle={toggleMask} />
              {lockMode === 'lock' && (
                <div className="scope-row">
                  <button className="btn tiny" onClick={() => lockScope('rime')}>Lock the rime</button>
                  <button className="btn tiny" onClick={() => lockScope('vowels')}>Lock the vowel spine</button>
                  <button className="btn tiny ghost" onClick={() => lockScope('clear')}>Clear</button>
                </div>
              )}

              {anyLocked && (
                <div style={{ marginTop: 12 }}>
                  <TierHeader
                    label={lockMode === 'lock' ? 'Preserving locked sounds' : 'Varying one sound'}
                    count={lockResults.length}
                    color="strong"
                  />
                  {lockResults.length === 0 ? (
                    <div className="hint">No candidates — try locking fewer segments.</div>
                  ) : (
                    <div className="result-grid">
                      {lockResults.map((r) => (
                        <WordChip key={r.word} word={r.word} band={r.band} source={r.source} from={word.trim()} onClick={setWord} title={`score ${r.score.toFixed(2)}`} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
