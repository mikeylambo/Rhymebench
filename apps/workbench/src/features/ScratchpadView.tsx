import { useRef } from 'react';
import { useStore } from '../lib/store.js';
import { usePersistentState } from '../lib/storage.js';

/**
 * The Bar Pad: a lightweight place to work found rhymes into actual lines,
 * without a full song editor. Persists locally, same as Barsmith's Bar Pad.
 * Pinned words and saved families sit alongside as a tap-to-insert reference.
 */
export function ScratchpadView() {
  const { pins, families } = useStore();
  const [text, setText] = usePersistentState('scratchpad', '');
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (word: string) => {
    const ta = ref.current;
    if (!ta) return setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${word} `);
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setText((t) => t.slice(0, start) + word + t.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + word.length;
    });
  };

  const lines = text.split('\n').filter((l) => l.trim()).length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Scratchpad</h2>
        <p>Work your found rhymes into actual bars. Tap any pinned word or family below to drop it in at the cursor. Everything saves to this device.</p>
      </div>

      <textarea
        aria-label="Scratchpad"
        ref={ref}
        className="raw"
        rows={12}
        style={{ fontSize: 16, lineHeight: 1.9, fontFamily: 'var(--mono)' }}
        value={text}
        placeholder={'Write your bars here…\nPull rhymes from the palette below.'}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="hint" style={{ margin: '6px 2px 18px' }}>{lines} lines · {words} words</div>

      <div className="panel">
        <p className="panel-title">Palette — tap to insert</p>
        {pins.length === 0 ? (
          <div className="side-empty">Nothing pinned yet. Pin rhymes from Search first.</div>
        ) : (
          <div className="result-grid">
            {pins.map((p) => (
              <button key={p.id} className="rword" style={{ cursor: 'pointer' }} onClick={() => insert(p.word)}>
                <span className={`band-dot ${p.band}`} /> {p.word}
              </button>
            ))}
          </div>
        )}
      </div>

      {families.length > 0 && (
        <div className="panel">
          <p className="panel-title">Families — tap a word to insert</p>
          {families.map((f) => (
            <div key={f.id} style={{ marginBottom: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>{f.name}</div>
              <div className="result-grid">
                {f.words.slice(0, 30).map((w) => (
                  <button key={w} className="rword" style={{ cursor: 'pointer' }} onClick={() => insert(w)}>{w}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
