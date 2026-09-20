/**
 * App-wide store: the shared phonetic engine plus the persisted workspace
 * (palette pins, saved rhyme families, schemes). Exposed through one context
 * so every tool reads the same engine instance and the same local data.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RhymeEngine } from '@rhyme/engine';
import { load, save, uid } from './storage.js';
import type { Family, Pin, Scheme } from './types.js';

interface EngineStatus {
  ready: boolean;
  progress: number; // 0..1
  message: string;
  wordCount: number;
  error?: string;
}

interface Store {
  engine: RhymeEngine;
  status: EngineStatus;

  // palette
  pins: Pin[];
  isPinned: (word: string) => boolean;
  togglePin: (word: string, band: Pin['band'], from: string) => void;
  removePin: (id: string) => void;
  clearPins: () => void;

  // families
  families: Family[];
  saveFamily: (name: string, words: string[], seed: string) => void;
  removeFamily: (id: string) => void;

  // schemes
  schemes: Scheme[];
  setSchemes: (s: Scheme[]) => void;
}

const Ctx = createContext<Store | null>(null);

// One engine instance for the whole session.
const engine = new RhymeEngine();
let loadStarted = false;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EngineStatus>({
    ready: false,
    progress: 0,
    message: 'Warming up the sound-space…',
    wordCount: 0,
  });

  const [pins, setPins] = useState<Pin[]>(() => load<Pin[]>('pins', []));
  const [families, setFamilies] = useState<Family[]>(() => load<Family[]>('families', []));
  const [schemes, setSchemesState] = useState<Scheme[]>(() => load<Scheme[]>('schemes', []));

  useEffect(() => save('pins', pins), [pins]);
  useEffect(() => save('families', families), [families]);
  useEffect(() => save('schemes', schemes), [schemes]);

  useEffect(() => {
    if (loadStarted) {
      if (engine.ready) setStatus({ ready: true, progress: 1, message: 'Ready', wordCount: engine.wordCount });
      return;
    }
    loadStarted = true;
    (async () => {
      try {
        setStatus((s) => ({ ...s, message: 'Fetching pronunciation dictionary…', progress: 0.15 }));
        const [dict, freq] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/cmudict.dict`).then((r) => r.text()),
          fetch(`${import.meta.env.BASE_URL}data/freq.txt`).then((r) => r.text()),
        ]);
        setStatus((s) => ({ ...s, message: 'Indexing 135,000 words…', progress: 0.55 }));
        // yield a frame so the message paints before the synchronous parse
        await new Promise((res) => setTimeout(res, 30));
        engine.load(dict, freq);
        setStatus({ ready: true, progress: 1, message: 'Ready', wordCount: engine.wordCount });
      } catch (e) {
        setStatus((s) => ({ ...s, error: String(e), message: 'Failed to load dictionary' }));
      }
    })();
  }, []);

  const value = useMemo<Store>(() => {
    const pinnedSet = new Set(pins.map((p) => p.word));
    return {
      engine,
      status,
      pins,
      isPinned: (w) => pinnedSet.has(w),
      togglePin: (word, band, from) =>
        setPins((prev) =>
          prev.some((p) => p.word === word)
            ? prev.filter((p) => p.word !== word)
            : [{ id: uid(), word, band, from, at: Date.now() }, ...prev],
        ),
      removePin: (id) => setPins((prev) => prev.filter((p) => p.id !== id)),
      clearPins: () => setPins([]),
      families,
      saveFamily: (name, words, seed) =>
        setFamilies((prev) => [{ id: uid(), name, words, seed, at: Date.now() }, ...prev]),
      removeFamily: (id) => setFamilies((prev) => prev.filter((f) => f.id !== id)),
      schemes,
      setSchemes: setSchemesState,
    };
  }, [status, pins, families, schemes]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}
