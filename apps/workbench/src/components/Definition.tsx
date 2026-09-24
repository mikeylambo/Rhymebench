import { useStore } from '../lib/store.js';
import { useAsync } from '../lib/useAsync.js';
import type { Definition as Def } from '../lib/engineClient.js';

/**
 * Offline WordNet definition for a word (worker-side lookup, lazy-loaded). Falls
 * back to the base form — "designed" shows "design" — and says so. Renders nothing
 * for words outside the definitions set, so it never shows an empty box.
 */
export function Definition({ word }: { word: string }) {
  const { engine, status } = useStore();
  const w = word.trim().toLowerCase();
  const def = useAsync<Def | null>(
    () => (status.ready && w && /^[a-z']+$/.test(w) ? engine.define(w) : Promise.resolve(null)),
    [engine, w, status.ready],
    null,
  );
  if (!def) return null;
  return (
    <div className="definition" aria-label={`Definition of ${def.word}`}>
      {def.word !== w && <span className="hint">from “{def.word}” · </span>}
      {def.senses.map((s, i) => (
        <p key={i}>
          {s.pos && <span className="pos">{s.pos}</span>}
          {s.text}
        </p>
      ))}
    </div>
  );
}
