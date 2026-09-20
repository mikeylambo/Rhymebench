/**
 * Local-first persistence — same pattern as Barsmith's storage.js: everything
 * lives in localStorage under a namespaced key, nothing leaves the device.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const NS = 'rhyme-workbench';
const key = (k: string) => `${NS}:${k}`;

export function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(k));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save<T>(k: string, value: T): void {
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    /* quota / private mode — fail silently, app still works in-session */
  }
}

/** useState that transparently persists to localStorage. */
export function usePersistentState<T>(k: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => load(k, initial));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    save(k, state);
  }, [k, state]);
  // persist on unload too, belt and braces
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const flush = () => save(k, stateRef.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [k]);
  return [state, setState];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

/** Stable one-shot callback wrapper. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
