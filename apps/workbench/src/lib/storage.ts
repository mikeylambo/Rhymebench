/**
 * Local-first persistence — same pattern as Barsmith's storage.js: everything
 * lives in localStorage under a namespaced key, nothing leaves the device.
 *
 * This module is the single audit point for what is persisted (SCHEMA below),
 * and owns data portability: backup, validated restore, and the rescue snapshot
 * that makes a restore undoable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const NS = 'rhyme-workbench';
const key = (k: string) => `${NS}:${k}`;

/* ── shape validators ─────────────────────────────────────────────────── */

type Validator = (v: unknown) => boolean;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr: Validator = (v) => typeof v === 'string';
const isStrArr: Validator = (v) => Array.isArray(v) && v.every(isStr);
const arrayOf = (item: Validator): Validator => (v) => Array.isArray(v) && v.every(item);

/**
 * Every persisted key and the shape it must have. A value that fails its check is
 * treated as absent on load (so one corrupt record can't crash a screen), and a
 * backup containing one is rejected whole on restore.
 */
export const SCHEMA: Record<string, Validator> = {
  pins: arrayOf((p) => isObj(p) && isStr(p.word)),
  families: arrayOf((f) => isObj(f) && isStr(f.name) && isStrArr(f.words)),
  schemes: arrayOf(
    (s) => isObj(s) && isStr(s.name) && arrayOf((c) => isObj(c) && isStr(c.letter) && isStrArr(c.words))(s.columns),
  ),
  scratchpad: isStr,
  'write-text': isStr,
  'write-prefs': isObj,
  chain: isStrArr,
};
const RESCUE = 'rescue';

/* ── read / write ─────────────────────────────────────────────────────── */

// Set just before a restore/reset reloads the page. Without it, every mounted
// usePersistentState flushes its *old* in-memory value on beforeunload — writing
// straight over the data that was just restored.
let suspended = false;
export function suspendPersistence(): void {
  suspended = true;
}

export function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(k));
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    const valid = SCHEMA[k];
    return valid && !valid(v) ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

export function save<T>(k: string, value: T): boolean {
  if (suspended) return false;
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
    return true;
  } catch {
    return false; // quota / private mode — the app still works in-session
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
  // persist on unload too, belt and braces (a no-op once persistence is suspended)
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const flush = () => save(k, stateRef.current);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [k]);
  return [state, setState];
}

/* ── backup / restore / rescue ────────────────────────────────────────── */

const BACKUP_APP = 'rhyme-workbench';
const BACKUP_VERSION = 1;

/** Everything the app has stored, as a backup file body. Reads storage directly — no React state. */
export function exportAllData(): string {
  const data: Record<string, unknown> = {};
  for (const k of Object.keys(SCHEMA)) {
    try {
      const raw = localStorage.getItem(key(k));
      if (raw != null) data[k] = JSON.parse(raw);
    } catch {
      /* skip an unreadable key rather than lose the whole backup */
    }
  }
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}

export interface DataSummary {
  pins: number;
  families: number;
  schemes: number;
  chain: number;
  padLines: number;
}

export function summarize(data: Record<string, unknown>): DataSummary {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const pad = typeof data.scratchpad === 'string' ? data.scratchpad.split('\n').filter((l) => l.trim()).length : 0;
  return { pins: len(data.pins), families: len(data.families), schemes: len(data.schemes), chain: len(data.chain), padLines: pad };
}

export function currentSummary(): DataSummary {
  return summarize(JSON.parse(exportAllData()).data);
}

export type RestoreResult = { ok: true; summary: DataSummary } | { ok: false; error: string };

/** Validate a backup without writing anything. */
export function parseBackup(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isObj(parsed) || parsed.app !== BACKUP_APP || !isObj(parsed.data)) {
    return { ok: false, error: 'That is not a Rhyme Workbench backup.' };
  }
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    return { ok: false, error: `This backup was made by a newer version (format v${parsed.version}) and can't be safely restored here.` };
  }
  for (const [k, v] of Object.entries(parsed.data)) {
    const valid = SCHEMA[k];
    if (!valid) continue; // unknown keys from a future version are ignored, not fatal
    if (!valid(v)) return { ok: false, error: `The backup's “${k}” data is malformed, so nothing was restored.` };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Restore a backup. All-or-nothing: the whole file is validated before any key is
 * written, and the current data is snapshotted first so the restore can be undone —
 * the dangerous restore is not a corrupt file, it is a valid but OLD one.
 */
export function importAllData(text: string, { snapshot = true } = {}): RestoreResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  if (snapshot && !snapshotForRescue()) {
    return { ok: false, error: 'Storage is full, so the current data could not be safeguarded first. Nothing was restored.' };
  }
  try {
    for (const k of Object.keys(SCHEMA)) {
      if (k in parsed.data) localStorage.setItem(key(k), JSON.stringify(parsed.data[k]));
      else localStorage.removeItem(key(k)); // a restore replaces, it doesn't merge
    }
  } catch {
    return { ok: false, error: 'Storage refused the restore (it may be full).' };
  }
  return { ok: true, summary: summarize(parsed.data) };
}

export interface Rescue {
  savedAt: string;
  summary: DataSummary;
  backup: string;
}

/** Snapshot everything as it stands. Returns false if storage refused it. */
export function snapshotForRescue(): boolean {
  try {
    const backup = exportAllData();
    const rescue: Rescue = { savedAt: new Date().toISOString(), summary: currentSummary(), backup };
    localStorage.setItem(key(RESCUE), JSON.stringify(rescue));
    return true;
  } catch {
    return false;
  }
}

export function loadRescue(): Rescue | null {
  try {
    const raw = localStorage.getItem(key(RESCUE));
    const v = raw ? JSON.parse(raw) : null;
    return isObj(v) && isStr(v.backup) && isStr(v.savedAt) ? (v as unknown as Rescue) : null;
  } catch {
    return null;
  }
}

export function clearRescue(): void {
  try {
    localStorage.removeItem(key(RESCUE));
  } catch {
    /* nothing to do */
  }
}

/** Put back the data a restore replaced. */
export function undoRestore(): RestoreResult {
  const r = loadRescue();
  if (!r) return { ok: false, error: 'There is no restore to undo.' };
  const res = importAllData(r.backup, { snapshot: false });
  if (res.ok) clearRescue();
  return res;
}

/** Erase only this app's keys (the crash screen's last resort). */
export function clearAppData(): void {
  try {
    for (const k of [...Object.keys(SCHEMA), RESCUE]) localStorage.removeItem(key(k));
  } catch {
    /* storage unreadable — nothing more we can do */
  }
}

/* ── files ────────────────────────────────────────────────────────────── */

/** Trigger a download of in-memory text (Barsmith's downloadBlob, incl. the Safari revoke delay). */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a); // Firefox needs it in the document
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // mobile Safari needs a moment
}

export const dateStamp = (d = new Date()) => d.toISOString().slice(0, 10);

/* ── misc ─────────────────────────────────────────────────────────────── */

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

/** Stable one-shot callback wrapper. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
