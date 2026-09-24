/**
 * Engine worker: hosts the RhymeEngine (and the pronunciation dictionary) off the
 * main thread, so neither the parse at startup nor any query ever janks the UI.
 * The main thread talks to it through lib/engineClient.ts.
 *
 * Definitions live here too, loaded lazily on the first lookup — nothing on the
 * first screen needs them, so they never delay startup.
 */
import { RhymeEngine } from '@rhyme/engine';

const engine = new RhymeEngine();
let base = '/';

type CallMsg = { type: 'call'; id: number; method: string; args: unknown[] };
type LoadMsg = { type: 'load'; base: string };

self.onmessage = async (e: MessageEvent<CallMsg | LoadMsg>) => {
  const msg = e.data;

  if (msg.type === 'load') {
    base = msg.base;
    try {
      post({ type: 'progress', progress: 0.15, message: 'Fetching pronunciation dictionary…' });
      const res = await fetch(`${base}data/lexicon.txt`);
      if (!res.ok) throw new Error(`dictionary ${res.status}`);
      const text = await res.text();
      post({ type: 'progress', progress: 0.55, message: 'Indexing the sound-space…' });
      engine.load(text);
      post({ type: 'ready', wordCount: engine.wordCount });
    } catch (err) {
      post({ type: 'error', id: -1, error: String(err) });
    }
    return;
  }

  if (msg.type === 'call') {
    try {
      let result: unknown;
      if (msg.method === 'define') result = await define(String(msg.args[0] ?? ''));
      else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (engine as any)[msg.method];
        result = typeof fn === 'function' ? fn.apply(engine, msg.args) : undefined;
      }
      post({ type: 'result', id: msg.id, result });
    } catch (err) {
      post({ type: 'error', id: msg.id, error: String(err) });
    }
  }
};

/* ── definitions (WordNet, via public/data/definitions.txt) ── */

let defs: Map<string, string> | null = null;
let defsLoading: Promise<Map<string, string>> | null = null;

function loadDefinitions(): Promise<Map<string, string>> {
  if (defs) return Promise.resolve(defs);
  if (!defsLoading) {
    defsLoading = fetch(`${base}data/definitions.txt`)
      .then((r) => {
        if (!r.ok) throw new Error(`definitions ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const map = new Map<string, string>();
        for (const line of text.split('\n')) {
          const sp = line.indexOf(' ');
          if (sp > 0) map.set(line.slice(0, sp), line.slice(sp + 1));
        }
        defs = map;
        return map;
      })
      .catch((err) => {
        defsLoading = null; // allow a retry once back online
        throw err;
      });
  }
  return defsLoading;
}

/** Base forms to try when a word itself isn't defined: designed -> design, cities -> city. */
function candidates(w: string): string[] {
  const out = [w];
  const rules: Array<[string, string]> = [
    ["'s", ''], ['ies', 'y'], ['ied', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'],
    ['ing', ''], ['ing', 'e'], ['er', ''], ['er', 'e'], ['est', ''], ['est', 'e'], ['ly', ''], ['in', 'ing'],
  ];
  for (const [suf, rep] of rules) if (w.endsWith(suf) && w.length > suf.length + 2) out.push(w.slice(0, -suf.length) + rep);
  const dbl = w.match(/^(.*?)([bdgklmnprt])\2(ed|ing|er|est)$/); // running -> run
  if (dbl) out.push(dbl[1] + dbl[2]);
  return out;
}

export interface Definition {
  /** the word the senses belong to — the base form when the looked-up word is an inflection */
  word: string;
  senses: Array<{ pos: string; text: string }>;
}

async function define(raw: string): Promise<Definition | null> {
  const word = raw.trim().toLowerCase();
  if (!word) return null;
  const map = await loadDefinitions();
  for (const w of candidates(word)) {
    const row = map.get(w);
    if (!row) continue;
    return {
      word: w,
      senses: row.split('·').map((s) => {
        const bar = s.indexOf('|');
        return bar < 0 ? { pos: '', text: s } : { pos: s.slice(0, bar), text: s.slice(bar + 1) };
      }),
    };
  }
  return null;
}

function post(m: unknown) {
  (self as unknown as Worker).postMessage(m);
}
