import { useStore } from '../lib/store.js';

/**
 * The always-docked workspace: the Rhyme Palette (pins collected while
 * exploring) and saved Rhyme Families. Both persist locally.
 */
export function SidePanel({ goSearch }: { goSearch: (w: string) => void }) {
  const { pins, removePin, clearPins, families, saveFamily, removeFamily } = useStore();

  const savePaletteAsFamily = () => {
    if (!pins.length) return;
    const name = prompt('Name this family', pins[0].word + ' family');
    if (name) saveFamily(name, pins.map((p) => p.word), 'palette');
  };

  return (
    <aside className="sidepanel">
      <div className="side-section">
        <h3>
          ★ Palette <span className="n">{pins.length}</span>
          <span style={{ flex: 1 }} />
          {pins.length > 0 && <button className="btn tiny ghost" onClick={clearPins}>Clear</button>}
        </h3>
        {pins.length === 0 ? (
          <div className="side-empty">Pin rhymes you like as you explore — they collect here so nothing good gets lost.</div>
        ) : (
          <>
            <div className="result-grid" style={{ marginTop: 6 }}>
              {pins.map((p) => (
                <span key={p.id} className="rword pinned" style={{ paddingRight: 8 }}>
                  <span className={`band-dot ${p.band}`} />
                  <button type="button" className="link-btn" onClick={() => goSearch(p.word)} aria-label={`Search ${p.word}`}>{p.word}</button>
                  <button className="pin" style={{ opacity: 1 }} onClick={() => removePin(p.id)} title="Remove" aria-label={`Remove ${p.word} from palette`}>✕</button>
                </span>
              ))}
            </div>
            <button className="btn tiny" style={{ marginTop: 10 }} onClick={savePaletteAsFamily}>Save palette as family →</button>
          </>
        )}
      </div>

      <div className="side-section" style={{ flex: 1 }}>
        <h3>🗂️ Families <span className="n">{families.length}</span></h3>
        {families.length === 0 ? (
          <div className="side-empty">Save a whole sound family from a search — a reusable resource you can pull into a later session.</div>
        ) : (
          families.map((f) => (
            <div key={f.id} className="fam-item">
              <div className="fam-name">
                <button type="button" className="link-btn" onClick={() => goSearch(f.seed !== 'palette' ? f.seed : f.words[0])}>{f.name}</button>
                <button className="btn tiny ghost" onClick={() => removeFamily(f.id)} aria-label={`Delete family ${f.name}`}>✕</button>
              </div>
              <div className="fam-words">
                {f.words.slice(0, 12).map((w) => (
                  <button type="button" key={w} className="link-btn" style={{ marginRight: 6 }} onClick={() => goSearch(w)}>{w}</button>
                ))}
                {f.words.length > 12 && <span className="faint">+{f.words.length - 12}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
