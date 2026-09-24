import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedLine, PlayAction, PlaygroundResult, PlayMode } from '@rhyme/engine';
import { useStore } from '../lib/store.js';
import { load, save, usePersistentState } from '../lib/storage.js';
import { EmptyState, Spinner, TierHeader, WordChip } from '../components/ui.js';

/**
 * Write — the SlantSmith surface fused onto the engine. Type up to four lines,
 * tap any word, and get both halves at once: real sound targets from the
 * engine, and generated lines built on those same targets, fitted to your
 * line's cadence. Use / Copy / Chain turn it into an iteration loop.
 */

const MAX_LINES = 4;
const WORD_RE = /[A-Za-z']+/g;
const CLUSTER_COLORS = ['#4ade80', '#60a5fa', '#fb923c', '#c084fc', '#f472b6', '#2dd4bf'];
const DENSITY = ['', 'Light', 'Light+', 'Medium', 'Dense', 'Packed'];

const ACTIONS: Array<{ id: PlayAction; label: string; hint: string }> = [
  { id: 'slants', label: 'Find Slants', hint: 'Rhymes for the tapped word, and lines that land on them.' },
  { id: 'internals', label: 'Find Internals', hint: 'What already rhymes inside your line, and sounds to weave in.' },
  { id: 'dense', label: 'Densify', hint: 'Phrase-level matches and lines packed with rhyme.' },
];
const MODES: Array<{ id: PlayMode; label: string; hint: string }> = [
  { id: 'best', label: 'Best', hint: 'Strongest, most usable matches' },
  { id: 'clean', label: 'Clean', hint: 'Perfect rhymes and multis only' },
  { id: 'slant', label: 'Slant', hint: 'Near rhymes — the vowel holds, the edges bend' },
  { id: 'weird', label: 'Weird', hint: 'Loose assonance for the unexpected pick' },
];
const KIND_LABEL: Record<GeneratedLine['kind'], string> = {
  echo: 'your line, re-landed',
  end: 'end rhyme',
  internal: 'internal',
  dense: 'dense',
};

interface Token {
  text: string;
  start: number; // absolute offset in the full text (matches the engine's internal-rhyme offsets)
  end: number;
  line: number;
  index: number;
}

function tokenize(text: string): Token[][] {
  let offset = 0;
  return text.split('\n').map((ln, line) => {
    const toks: Token[] = [];
    let i = 0;
    for (const m of ln.matchAll(WORD_RE)) {
      if (!/[a-z]/i.test(m[0]) || m.index == null) continue;
      toks.push({ text: m[0], start: offset + m.index, end: offset + m.index + m[0].length, line, index: i++ });
    }
    offset += ln.length + 1;
    return toks;
  });
}

/** Replace tokens [from..to] on one line with `replacement`, leaving everything else verbatim. */
function replaceRange(text: string, line: number, from: number, to: number, replacement: string): string {
  const toks = tokenize(text)[line];
  if (!toks || !toks[from] || !toks[to]) return text;
  return text.slice(0, toks[from].start) + replacement + text.slice(toks[to].end);
}

const clean = (w: string) => w.toLowerCase().replace(/^'+|'+$/g, '');

interface Prefs {
  action: PlayAction;
  mode: PlayMode;
  syllables: number;
  density: number;
  count: number;
}

interface Run {
  text: string;
  line: number;
  index: number;
  target: string;
  seed: number;
}

/** Render a generated line with its real rhyme targets underlined. */
function Highlighted({ text, rhymes }: { text: string; rhymes: string[] }) {
  const set = new Set(rhymes.flatMap((r) => r.toLowerCase().split(/\s+/)));
  return (
    <>
      {text.split(/([A-Za-z']+)/).map((part, i) =>
        set.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

export function WriteView() {
  const { engine, status: engineStatus } = useStore();
  const [text, setText] = usePersistentState('write-text', '');
  const [prefs, setPrefs] = usePersistentState<Prefs>('write-prefs', {
    action: 'slants',
    mode: 'best',
    syllables: 0,
    density: 3,
    count: 4,
  });
  const [chain, setChain] = usePersistentState<string[]>('chain', []);
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const tokens = useMemo(() => tokenize(text), [text]);
  const lineCount = text ? text.split('\n').length : 0;
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  // Re-run whenever the tapped word or any dial changes. All work is in the worker.
  useEffect(() => {
    if (!run || !engineStatus.ready) return;
    let alive = true;
    setBusy(true);
    engine
      .playground({ text: run.text, target: run.target, line: run.text.split('\n')[run.line] ?? '', ...prefs, seed: run.seed })
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setBusy(false);
      })
      .catch(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [run, prefs, engineStatus.ready, engine]);

  const select = (tok: Token, fullText = text) => {
    setShowAll(false);
    setNote('');
    setRun({ text: fullText, line: tok.line, index: tok.index, target: clean(tok.text), seed: 1 });
  };

  const find = () => {
    if (!text.trim()) {
      setNote('Type a line first.');
      taRef.current?.focus();
      return;
    }
    let tok = run ? tokens[run.line]?.[run.index] : undefined;
    if (!tok) {
      for (let l = tokens.length - 1; l >= 0 && !tok; l--) tok = tokens[l][tokens[l].length - 1];
    }
    if (tok) select(tok);
  };

  const reset = () => {
    setText('');
    setRun(null);
    setResult(null);
    setNote('');
  };

  /** Swap a sound target (or phrase) into the line where the tapped word sits. */
  const swapIn = (replacement: string, span = 1) => {
    if (!run) return;
    const from = Math.max(0, run.index - span + 1);
    const next = replaceRange(text, run.line, from, run.index, replacement);
    if (next === text) return;
    setText(next);
    const newIndex = from + (replacement.match(WORD_RE)?.length ?? 1) - 1;
    const tok = tokenize(next)[run.line]?.[newIndex];
    if (tok) select(tok, next);
  };

  /** USE a generated line: it becomes the next line (up to four), then explore its last word. */
  const useLine = (line: string) => {
    const lines = text.replace(/\n+$/, '').split('\n');
    let next: string;
    let li: number;
    if (!text.trim()) {
      next = line;
      li = 0;
    } else if (lines.length < MAX_LINES) {
      next = [...lines, line].join('\n');
      li = lines.length;
    } else {
      lines[MAX_LINES - 1] = line;
      next = lines.join('\n');
      li = MAX_LINES - 1;
    }
    setText(next);
    const toks = tokenize(next)[li];
    const last = toks?.[toks.length - 1];
    if (last) select(last, next);
  };

  const copy = (t: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(t).then(
        () => setNote('Copied.'),
        () => setNote('Select and copy the text.'),
      );
    } else setNote('Select and copy the text.');
  };

  const addToChain = (t: string) => setChain((c) => [...c, t]);

  const chainFourBars = async () => {
    if (!run) return;
    const r = await engine.playground({
      text: run.text,
      target: run.target,
      line: run.text.split('\n')[run.line] ?? '',
      ...prefs,
      action: 'slants',
      count: 4,
      seed: run.seed + 97,
    });
    setChain((c) => [...c, ...r.lines.map((l) => l.text)]);
    setNote(`Added ${r.lines.length} bars to the chain — each lands on a different rhyme.`);
  };

  const sendChainToPad = () => {
    if (!chain.length) return;
    const cur = load<string>('scratchpad', '');
    save('scratchpad', (cur && !cur.endsWith('\n') ? `${cur}\n` : cur) + chain.join('\n') + '\n');
    setNote(`Sent ${chain.length} lines to the Pad.`);
  };

  // Colour tokens by the internal-rhyme cluster they belong to (for the text the result was run on).
  const clusterColor = useMemo(() => {
    const map = new Map<string, string>();
    if (!result || !run || run.text !== text) return map;
    result.internals.clusters.forEach((c) => {
      for (const m of c.members) {
        const s = result.internals.syllables[m];
        const key = `${s.charStart}-${s.charEnd}`;
        if (!map.has(key)) map.set(key, CLUSTER_COLORS[c.id % CLUSTER_COLORS.length]);
      }
    });
    return map;
  }, [result, run, text]);

  const action = ACTIONS.find((a) => a.id === prefs.action)!;
  const targets = result?.targets ?? [];
  const shownTargets = showAll ? targets : targets.slice(0, 24);
  const status = !engineStatus.ready
    ? 'Loading the dictionary…'
    : note
      ? note
      : result && run
        ? `Exploring “${result.target}” · ${result.lineSyllables}-syllable line · ${targets.length} sound targets · ${result.lines.length} lines`
        : 'Type a line, then tap any word.';

  return (
    <div className="main-inner">
      <div className="view-head">
        <h2>Write</h2>
        <p>Type your line, tap any word, and explore its sound-space: real rhyme targets from the engine, plus generated lines built on them to spark the next bar. You write the bar.</p>
      </div>

      <div className="write-grid">
        {/* ── controls ── */}
        <section className="panel write-controls">
          <label className="lbl" htmlFor="write-input">
            Your line <span className="faint">{lineCount}/{MAX_LINES}</span>
          </label>
          <textarea
            id="write-input"
            ref={taRef}
            className="raw"
            rows={4}
            value={text}
            placeholder="I got money on my mind"
            onChange={(e) => setText(e.target.value.split('\n').slice(0, MAX_LINES).join('\n'))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                find();
              }
            }}
          />

          <label className="lbl">Action</label>
          <div className="seg">
            {ACTIONS.map((a) => (
              <button key={a.id} className={`btn tiny ${prefs.action === a.id ? 'on' : ''}`} onClick={() => setPref('action', a.id)}>
                {a.label}
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{action.hint}</div>

          <div className="row between">
            <label className="lbl" htmlFor="write-syll">Syllable difficulty</label>
            <b className="dial">{prefs.syllables === 0 ? 'Auto' : `${prefs.syllables}-syl`}</b>
          </div>
          <input id="write-syll" type="range" className="plain" min={0} max={12} value={prefs.syllables} onChange={(e) => setPref('syllables', Number(e.target.value))} />

          <div className="row between">
            <label className="lbl" htmlFor="write-density">Rhyme density</label>
            <b className="dial">{DENSITY[prefs.density]}</b>
          </div>
          <input id="write-density" type="range" className="plain" min={1} max={5} value={prefs.density} onChange={(e) => setPref('density', Number(e.target.value))} />

          <div className="row between">
            <label className="lbl">Lines</label>
            <div className="chip-toggle">
              {[2, 4, 6].map((n) => (
                <button key={n} className={prefs.count === n ? 'on' : ''} onClick={() => setPref('count', n)}>{n}</button>
              ))}
            </div>
          </div>

          <div className="actions-2">
            <button className="btn primary" onClick={find} disabled={!engineStatus.ready}>Find rhymes</button>
            <button className="btn" onClick={reset}>Reset</button>
          </div>
        </section>

        {/* ── results ── */}
        <section className="write-results">
          <div className="panel">
            <div className="row between">
              <p className="panel-title" style={{ margin: 0 }}>Explore the sounds</p>
              {busy && <Spinner />}
            </div>
            <div className="hint" style={{ marginTop: 4 }}>{status}</div>

            {tokens.some((l) => l.length) ? (
              <div className="token-lines">
                {tokens.map((line, li) =>
                  line.length ? (
                    <div key={li} className="token-line">
                      {line.map((tok) => {
                        const active = !!run && run.text === text && run.line === tok.line && run.index === tok.index;
                        const color = prefs.action === 'internals' ? clusterColor.get(`${tok.start}-${tok.end}`) : undefined;
                        return (
                          <button
                            key={tok.index}
                            className={`tok ${active ? 'active' : ''}`}
                            style={color ? { color, boxShadow: `inset 0 -2px 0 ${color}` } : undefined}
                            onClick={() => select(tok)}
                          >
                            {tok.text}
                          </button>
                        );
                      })}
                    </div>
                  ) : null,
                )}
              </div>
            ) : (
              <div className="hint" style={{ margin: '12px 0' }}>Your words appear here as tappable tokens.</div>
            )}

            <div className="chip-toggle wrap">
              {MODES.map((m) => (
                <button key={m.id} title={m.hint} className={prefs.mode === m.id ? 'on' : ''} onClick={() => setPref('mode', m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {!result && engineStatus.ready && (
            <EmptyState icon="✍️">Write a line, tap a word, and the sound-space opens up.</EmptyState>
          )}

          {result && (
            <>
              {prefs.action === 'internals' && (
                <div className="panel">
                  <p className="panel-title">Already rhyming in your lines</p>
                  {result.internals.clusters.length === 0 ? (
                    <div className="hint">No internal rhymes yet — drop one of the sound targets below inside the line.</div>
                  ) : (
                    result.internals.clusters.map((c) => (
                      <div key={c.id} className="row wrap" style={{ marginBottom: 6 }}>
                        <span className="band-dot" style={{ background: CLUSTER_COLORS[c.id % CLUSTER_COLORS.length] }} />
                        <span className="mono faint" style={{ minWidth: 30 }}>{c.vowel}</span>
                        <span style={{ color: CLUSTER_COLORS[c.id % CLUSTER_COLORS.length], fontWeight: 600 }}>
                          {[...new Set(c.members.map((m) => result.internals.syllables[m].text))].join(' · ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="panel">
                <TierHeader label={prefs.syllables ? `Sound targets · ${prefs.syllables}-syllable` : 'Sound targets'} count={targets.length} />
                <div className="hint" style={{ marginBottom: 8 }}>Tap to swap into your line · ☆ to pin</div>
                {targets.length === 0 ? (
                  <div className="hint">
                    Nothing at this setting{prefs.syllables ? ` — no ${prefs.syllables}-syllable rhymes for “${result.target}”. Try Auto or another length.` : '. Try another mode.'}
                  </div>
                ) : (
                  <>
                    <div className="result-grid">
                      {shownTargets.map((r) => (
                        <WordChip key={r.word} word={r.word} band={r.tier} source={r.source} from={result.target} onClick={(w) => swapIn(w)} title={`${r.tier} · ${r.pron.count} syl · score ${r.score.toFixed(2)}`} />
                      ))}
                    </div>
                    {targets.length > 24 && (
                      <button className="btn tiny ghost" style={{ marginTop: 8 }} onClick={() => setShowAll((s) => !s)}>
                        {showAll ? 'Show fewer' : `Show all ${targets.length}`}
                      </button>
                    )}
                  </>
                )}

                {result.phrases.length > 0 && (
                  <>
                    <TierHeader label={`Phrase targets for “${result.phraseSource.join(' ')}”`} count={result.phrases.length} />
                    <div className="result-grid">
                      {result.phrases.map((p) => (
                        <WordChip key={p.phrase} word={p.phrase} band={p.bucket === 'exact' ? 'perfect' : p.bucket === 'strong' ? 'multi' : 'slant'} from={result.target} onClick={(w) => swapIn(w, result.phraseSource.length)} title={`${p.bucket} · match ${p.score.toFixed(2)}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="panel">
                <TierHeader label="Generated lines" count={result.lines.length} />
                <div className="hint">Idea-starters built on the real targets above — the rhymes are underlined.</div>
                {result.lines.length === 0 ? (
                  <div className="hint" style={{ marginTop: 8 }}>No lines at this setting — widen the mode or set difficulty to Auto.</div>
                ) : (
                  result.lines.map((l) => (
                    <div key={l.text} className="gen-line">
                      <div className="gen-text"><Highlighted text={l.text} rhymes={l.rhymes} /></div>
                      <div className="gen-meta">
                        {l.syllables} syl{l.syllables === result.lineSyllables ? ' · on cadence' : ''} · {KIND_LABEL[l.kind]} · {l.rhymes.join(' · ')}
                      </div>
                      <div className="gen-actions">
                        <button className="btn tiny" onClick={() => useLine(l.text)}>Use</button>
                        <button className="btn tiny" onClick={() => copy(l.text)}>Copy</button>
                        <button className="btn tiny" onClick={() => addToChain(l.text)}>Chain</button>
                      </div>
                    </div>
                  ))
                )}
                <div className="row wrap" style={{ marginTop: 12 }}>
                  <button className="btn tiny" onClick={() => run && setRun({ ...run, seed: run.seed + 1 })}>More ideas</button>
                  <button className="btn tiny" onClick={chainFourBars}>Chain 4 bars</button>
                </div>
              </div>
            </>
          )}

          {chain.length > 0 && (
            <div className="panel">
              <div className="row between wrap">
                <p className="panel-title" style={{ margin: 0, whiteSpace: 'nowrap' }}>Rhyme chain · {chain.length}</p>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn tiny" onClick={() => copy(chain.join('\n'))}>Copy all</button>
                  <button className="btn tiny" onClick={sendChainToPad}>Send to Pad</button>
                  <button className="btn tiny ghost" onClick={() => setChain([])}>Clear</button>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                {chain.map((c, i) => (
                  <div key={`${i}-${c}`} className="chain-line">
                    <b>{i + 1}</b>
                    <span>{c}</span>
                    <button className="pin x" title="Remove" onClick={() => setChain((cs) => cs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
