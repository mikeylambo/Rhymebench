/**
 * @rhyme/engine — the shared phonetic engine.
 *
 * One engine, consumed at two depths:
 *   • Barsmith consumes the restrained API: getUsefulRhymes(word).
 *   • Rhyme Workbench consumes the full API below.
 *
 * Improvements to pronunciation coverage or scoring benefit both products at
 * once; nothing here imports a UI framework.
 */
export const ENGINE_VERSION = '0.1.0';

export * from './arpabet.js';
export * from './pronunciation.js';
export * from './scoring.js';
export * from './search.js';
export * from './phrase.js';
export * from './internal.js';
export * from './compose.js';
export { Lexicon } from './lexicon.js';
export { SLANG, CURATED, SUPPLEMENT } from './slang.js';
export { g2p } from './g2p.js';

import { Lexicon } from './lexicon.js';
import type { Pron } from './pronunciation.js';
import {
  compareRimes as _compareRimes,
  phonemeSimilarity as _phonemeSimilarity,
  rhymeDistance as _rhymeDistance,
  scoreCandidate as _scoreCandidate,
  type CandidateScore,
  type RimeComparison,
} from './scoring.js';
import {
  findByLockedSegments,
  findBySubstitution,
  findHomophones,
  search,
  type HomophoneResult,
  type LockedSearchResult,
  type RhymeResult,
  type SearchOptions,
} from './search.js';
import { buildMultis, phraseMatch as _phraseMatch, type MultiResult } from './phrase.js';
import { findInternalRhymes, type InternalRhymeResult } from './internal.js';
import {
  countSyllables as _countSyllables,
  playground as _playground,
  type PlaygroundOptions,
  type PlaygroundResult,
} from './compose.js';

/**
 * Stateful convenience wrapper that binds a loaded {@link Lexicon} to the
 * engine's query functions. Construct once, `load()` the CMU dict text, reuse.
 */
export class RhymeEngine {
  readonly lex = new Lexicon();

  /**
   * Load the raw cmudict.dict text (fetched by the host app), and optionally a
   * frequency asset (one word per line, most-common first) used to rank
   * common/usable words above obscure ones.
   */
  load(dictText: string, freqText?: string): void {
    this.lex.loadFromDict(dictText);
    if (freqText) this.lex.loadFrequencies(freqText);
  }

  /** Load frequencies separately (e.g. streamed after the dictionary). */
  loadFrequencies(freqText: string): void {
    this.lex.loadFrequencies(freqText);
  }

  /** Commonness of a word 0..1 (1 = very common). */
  commonness(word: string): number {
    return this.lex.commonness(word);
  }

  get ready(): boolean {
    return this.lex.loaded;
  }

  get wordCount(): number {
    return this.lex.size;
  }

  /** Resolve a word to its best pronunciation (CMU → slang → G2P). */
  resolve(word: string): Pron | null {
    return this.lex.resolve(word);
  }

  /* ---- full API (this tool) ---- */

  search(query: string, opts?: SearchOptions): RhymeResult[] {
    return search(this.lex, query, opts);
  }

  /**
   * Barsmith-shaped result: everything the engine knows about how a word
   * rhymes, grouped into perfect / multi / slant / assonance plus homophones.
   * This is the drop-in shape Barsmith's own findRhymes() returns, so it can
   * adopt the shared engine without changing its RhymeSearch UI.
   */
  findRhymes(query: string): {
    word: string;
    found: boolean;
    phonemes: string[] | null;
    syllables: number;
    perfect: RhymeResult[];
    multi: RhymeResult[];
    slant: RhymeResult[];
    assonance: RhymeResult[];
    homophones: HomophoneResult[];
  } {
    const word = query.trim().toLowerCase();
    const pron = this.lex.resolve(word);
    const empty = { word, found: false, phonemes: null, syllables: 0, perfect: [], multi: [], slant: [], assonance: [], homophones: [] };
    if (!pron) return empty;
    const results = search(this.lex, word, { maxDistance: 0.6, limit: 400 });
    const group = (t: RhymeResult['tier']) => results.filter((r) => r.tier === t);
    return {
      word,
      found: true,
      phonemes: pron.phones,
      syllables: pron.count,
      perfect: group('perfect'),
      multi: group('multi'),
      slant: group('slant'),
      assonance: group('assonance'),
      homophones: findHomophones(this.lex, word, 12),
    };
  }

  findHomophones(query: string, limit?: number): HomophoneResult[] {
    return findHomophones(this.lex, query, limit);
  }

  findByLockedSegments(query: string, locked: boolean[], opts?: SearchOptions): LockedSearchResult[] {
    return findByLockedSegments(this.lex, query, locked, opts);
  }

  findBySubstitution(query: string, substituteIdx: number[], opts?: SearchOptions): LockedSearchResult[] {
    return findBySubstitution(this.lex, query, substituteIdx, opts);
  }

  buildMultis(phrase: string, opts?: Parameters<typeof buildMultis>[2]): MultiResult {
    return buildMultis(this.lex, phrase, opts);
  }

  findInternalRhymes(line: string, threshold?: number): InternalRhymeResult {
    return findInternalRhymes(this.lex, line, threshold);
  }

  /** The Write playground: sound targets + generated lines for a tapped word. */
  playground(opts: PlaygroundOptions): PlaygroundResult {
    return _playground(this.lex, opts);
  }

  /** Phonetic syllable count of any text. */
  countSyllables(text: string): number {
    return _countSyllables(this.lex, text);
  }

  scoreCandidate(target: string, candidate: string): CandidateScore | null {
    const a = this.lex.resolve(target);
    const b = this.lex.resolve(candidate);
    return a && b ? _scoreCandidate(a, b) : null;
  }

  compareRimes(a: string, b: string): RimeComparison | null {
    const pa = this.lex.resolve(a);
    const pb = this.lex.resolve(b);
    return pa && pb ? _compareRimes(pa.rime, pb.rime) : null;
  }

  phonemeSimilarity = _phonemeSimilarity;

  rhymeDistance(a: string, b: string): number | null {
    const pa = this.lex.resolve(a);
    const pb = this.lex.resolve(b);
    return pa && pb ? _rhymeDistance(pa, pb) : null;
  }

  vowelSpine(word: string): string[] | null {
    return this.lex.resolve(word)?.vowelSpine ?? null;
  }

  stressPattern(word: string): number[] | null {
    return this.lex.resolve(word)?.stressPattern ?? null;
  }

  phraseMatch(a: string, b: string): number {
    return _phraseMatch(this.lex, a, b);
  }

  /* ---- restrained API (Barsmith) ---- */

  /**
   * The single call Barsmith consumes: a short, high-quality list of the most
   * useful rhymes for a word — perfect and strong only, deduped, capped.
   */
  getUsefulRhymes(word: string, limit = 24): string[] {
    return this.search(word, { maxDistance: 0.32, limit: limit * 2 })
      .filter((r) => r.tier === 'perfect' || r.tier === 'multi' || r.band === 'strong')
      .slice(0, limit)
      .map((r) => r.word);
  }
}
