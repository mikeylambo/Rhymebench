/**
 * Engine worker: hosts the RhymeEngine (and the 126k-word dictionary) off the
 * main thread, so neither the ~1s parse at startup nor any query ever janks
 * the UI. The main thread talks to it through lib/engineClient.ts.
 */
import { RhymeEngine } from '@rhyme/engine';

const engine = new RhymeEngine();

type CallMsg = { type: 'call'; id: number; method: string; args: unknown[] };
type LoadMsg = { type: 'load'; base: string };

self.onmessage = async (e: MessageEvent<CallMsg | LoadMsg>) => {
  const msg = e.data;

  if (msg.type === 'load') {
    try {
      post({ type: 'progress', progress: 0.15, message: 'Fetching pronunciation dictionary…' });
      const [dict, freq] = await Promise.all([
        fetch(`${msg.base}data/cmudict.dict`).then((r) => r.text()),
        fetch(`${msg.base}data/freq.txt`).then((r) => r.text()),
      ]);
      post({ type: 'progress', progress: 0.55, message: 'Indexing 135,000 words…' });
      engine.load(dict, freq);
      post({ type: 'ready', wordCount: engine.wordCount });
    } catch (err) {
      post({ type: 'error', id: -1, error: String(err) });
    }
    return;
  }

  if (msg.type === 'call') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (engine as any)[msg.method];
      const result = typeof fn === 'function' ? fn.apply(engine, msg.args) : undefined;
      post({ type: 'result', id: msg.id, result });
    } catch (err) {
      post({ type: 'error', id: msg.id, error: String(err) });
    }
  }
};

function post(m: unknown) {
  (self as unknown as Worker).postMessage(m);
}
