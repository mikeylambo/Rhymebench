import { useState } from 'react';
import type { MultiResult, PhraseCandidate } from '@rhyme/engine';
import { useStore } from '../lib/store.js';
import { useAsync } from '../lib/useAsync.js';
import { EmptyState, TierHeader, WordChip } from '../components/ui.js';

const BUCKETS: Array<{ key: keyof MultiBuckets; label: string; color: string }> = [
  { key: 'exact', label: 'Exact cadence', color: 'perfect' },
  { key: 'strong', label: 'Strong', color: 'strong' },
  { key: 'loose', label: 'Loose', color: 'loose' },
  { key: 'experimental', label: 'Experimental', color: 'experimental' },
];

interface MultiBuckets {
  exact: PhraseCandidate[];
  strong: PhraseCandidate[];
  loose: PhraseCandidate[];
  experimental: PhraseCandidate[];
}

export function MultiBuilderView({ initial }: { initial?: string }) {
  const { engine, status } = useStore();
  const [input, setInput] = useState(initial ?? '');
  const [phrase, setPhrase] = useState(initial ?? '');
  const [explore, setExplore] = useState(false);

  const result = useAsync<MultiResult | null>(
    () => {
      if (!status.ready || !phrase.trim() || phrase.trim().split(/\s+/).length < 2) return Promise.resolve(null);
      return engine.buildMultis(phrase.trim(), { explore, perWord: explore ? 44 : 32, maxResults: 500 });
    },
    [engine, phrase, explore, status.ready],
    null,
  );

  const run = () => setPhrase(input);

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Multi Builder</h2>
        <p>Feed in a multi-word phrase and get back other phrases matching its cadence and sound-shape — not just its literal words. “automatic weapon” → “dramatic expression”.</p>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <span className="lead" aria-hidden="true">🎛️</span>
        <input
          value={input}
          placeholder="Enter a phrase — two or more words"
          aria-label="Phrase to match"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button className="btn primary" onClick={run}>Build</button>
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="chip-toggle">
          <button className={!explore ? 'on' : ''} aria-pressed={!explore} onClick={() => setExplore(false)}>Curated</button>
          <button className={explore ? 'on' : ''} aria-pressed={explore} onClick={() => setExplore(true)}>Explore mode</button>
        </div>
        {result && (
          <span className="hint">{result.syllables} syllables · {result.total} candidates{explore ? ' · filter relaxed' : ''}</span>
        )}
      </div>

      {explore && (
        <div className="hint" style={{ marginBottom: 12 }}>
          Phrase Exploration: filtering is relaxed rather than tightened — the loose and experimental buckets are surfaced so you can sift for the unexpected keeper.
        </div>
      )}

      {!phrase.trim() && <EmptyState icon="🧩">Enter a phrase like “heavy rotation” or “concrete jungle”.</EmptyState>}
      {phrase.trim() && phrase.trim().split(/\s+/).length < 2 && (
        <EmptyState icon="✌️">Multi Builder needs at least two words — try a phrase.</EmptyState>
      )}

      {result &&
        BUCKETS.filter((b) => explore || b.key === 'exact' || b.key === 'strong' || result.buckets[b.key].length).map((b) => {
          const items = result.buckets[b.key];
          if (!items.length && (b.key === 'loose' || b.key === 'experimental') && !explore) return null;
          return (
            <div key={b.key}>
              <TierHeader label={b.label} count={items.length} color={b.color} />
              {items.length === 0 ? (
                <div className="hint" style={{ marginBottom: 6 }}>Nothing in this bucket.</div>
              ) : (
                <div className="result-grid">
                  {items.slice(0, explore ? 120 : 60).map((c) => (
                    <WordChip key={c.phrase} word={c.phrase} band={b.color as 'perfect'} from={phrase.trim()} title={`match ${c.score.toFixed(2)}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
