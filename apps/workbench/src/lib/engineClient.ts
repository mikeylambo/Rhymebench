/**
 * Main-thread proxy to the engine worker. Mirrors the RhymeEngine API as async
 * methods; each call is correlated by id. Pure helpers (syllabify) are imported
 * directly from the engine — they need code, not the dictionary, so they run on
 * the main thread without loading the 3.5MB payload (which lives only in the
 * worker).
 */
import type {
  HomophoneResult,
  InternalRhymeResult,
  LockedSearchResult,
  MultiResult,
  Pron,
  RhymeResult,
  SearchOptions,
} from '@rhyme/engine';

interface FindRhymesResult {
  word: string;
  found: boolean;
  phonemes: string[] | null;
  syllables: number;
  perfect: RhymeResult[];
  multi: RhymeResult[];
  slant: RhymeResult[];
  assonance: RhymeResult[];
  homophones: HomophoneResult[];
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

export class EngineClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private onProgress?: (p: number, msg: string) => void;
  private readyResolve?: (wordCount: number) => void;
  private readyReject?: (e: unknown) => void;
  readonly ready: Promise<number>;

  constructor() {
    this.worker = new Worker(new URL('../engine.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise<number>((res, rej) => {
      this.readyResolve = res;
      this.readyReject = rej;
    });
    this.worker.onmessage = (e: MessageEvent) => this.handle(e.data);
  }

  private handle(m: {
    type: string;
    id?: number;
    result?: unknown;
    error?: string;
    progress?: number;
    message?: string;
    wordCount?: number;
  }) {
    switch (m.type) {
      case 'progress':
        this.onProgress?.(m.progress ?? 0, m.message ?? '');
        break;
      case 'ready':
        this.readyResolve?.(m.wordCount ?? 0);
        break;
      case 'result': {
        const p = this.pending.get(m.id!);
        if (p) { this.pending.delete(m.id!); p.resolve(m.result); }
        break;
      }
      case 'error': {
        if (m.id === -1) { this.readyReject?.(m.error); break; }
        const p = this.pending.get(m.id!);
        if (p) { this.pending.delete(m.id!); p.reject(new Error(m.error)); }
        break;
      }
    }
  }

  load(base: string, onProgress?: (p: number, msg: string) => void): Promise<number> {
    this.onProgress = onProgress;
    this.worker.postMessage({ type: 'load', base });
    return this.ready;
  }

  private call<T>(method: string, args: unknown[]): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ type: 'call', id, method, args });
    });
  }

  search(query: string, opts?: SearchOptions) { return this.call<RhymeResult[]>('search', [query, opts]); }
  findHomophones(query: string, limit?: number) { return this.call<HomophoneResult[]>('findHomophones', [query, limit]); }
  findByLockedSegments(query: string, locked: boolean[], opts?: SearchOptions) { return this.call<LockedSearchResult[]>('findByLockedSegments', [query, locked, opts]); }
  findBySubstitution(query: string, idx: number[], opts?: SearchOptions) { return this.call<LockedSearchResult[]>('findBySubstitution', [query, idx, opts]); }
  buildMultis(phrase: string, opts?: Record<string, unknown>) { return this.call<MultiResult>('buildMultis', [phrase, opts]); }
  findInternalRhymes(line: string, threshold?: number) { return this.call<InternalRhymeResult>('findInternalRhymes', [line, threshold]); }
  resolve(word: string) { return this.call<Pron | null>('resolve', [word]); }
  findRhymes(query: string) { return this.call<FindRhymesResult>('findRhymes', [query]); }
  getUsefulRhymes(word: string, limit?: number) { return this.call<string[]>('getUsefulRhymes', [word, limit]); }
  commonness(word: string) { return this.call<number>('commonness', [word]); }
}
