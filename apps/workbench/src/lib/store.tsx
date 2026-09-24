/**
 * App-wide store: the shared phonetic engine plus the persisted workspace
 * (palette pins, saved rhyme families, schemes). Exposed through one context
 * so every tool reads the same engine instance and the same local data.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { load, save, uid } from './storage.js';
import { EngineClient } from './engineClient.js';
import type { Family, Pin, Scheme } from './types.js';

interface EngineStatus {
  ready: boolean;
  progress: number; // 0..1
  message: string;
  wordCount: number;
  error?: string;
}

interface Store {
  engine: EngineClient;
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

// One engine worker for the whole session.
const engine = new EngineClient();
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

  useEffect(() => { save('pins', pins); }, [pins]);
  useEffect(() => { save('families', families); }, [families]);
  useEffect(() => { save('schemes', schemes); }, [schemes]);

  useEffect(() => {
    if (loadStarted) {
      // A second mount (StrictMode / HMR) — attach to the already-loading worker.
      engine.ready.then((wordCount) => setStatus({ ready: true, progress: 1, message: 'Ready', wordCount }));
      return;
    }
    loadStarted = true;
    engine
      .load(import.meta.env.BASE_URL, (progress, message) => setStatus((s) => ({ ...s, progress, message })))
      .then((wordCount) => setStatus({ ready: true, progress: 1, message: 'Ready', wordCount }))
      .catch((e) => setStatus((s) => ({ ...s, error: String(e), message: 'Failed to load dictionary' })));
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
