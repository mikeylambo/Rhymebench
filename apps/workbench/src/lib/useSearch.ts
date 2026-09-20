/**
 * Runs one wide rhyme search per query (debounced) and caches the full scored
 * result set. The Distance slider then filters this set client-side, so
 * dragging re-ranks in real time without re-querying the engine.
 */
import { useEffect, useRef, useState } from 'react';
import type { RhymeResult } from '@rhyme/engine';
import { useStore } from './store.js';

const WIDE = 0.82; // gather everything out to "experimental"; slider narrows.

export function useWideSearch(query: string, ready: boolean) {
  const { engine } = useStore();
  const [results, setResults] = useState<RhymeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (!ready || !q) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    window.clearTimeout(timer.current);
    // Debounce so typing stays smooth; the spinner (busy=true) has already
    // painted by the time this fires. The search itself is synchronous.
    timer.current = window.setTimeout(() => {
      const r = engine.search(q, { maxDistance: WIDE, limit: 400 });
      setResults(r);
      setBusy(false);
    }, 200);
    return () => window.clearTimeout(timer.current);
  }, [query, ready, engine]);

  return { results, busy };
}
