/**
 * Query surfaces built on the scoring core: rhyme search (with the distance
 * slider and homophone preset), and segment-locked / substitution search for
 * the sound-manipulation tools.
 */
import { base, isVowel, vowelSimilarity, type Phoneme } from './arpabet.js';
import type { Lexicon } from './lexicon.js';
import { rimeKey, type Pron } from './pronunciation.js';
import {
  band,
  compareRimes,
  phonemeSimilarity,
  scoreCandidate,
  type CandidateScore,
  type Tier,
} from './scoring.js';

export interface RhymeResult {
  word: string;
  pron: Pron;
  score: number;
  distance: number;
  tier: Tier;
  band: 'perfect' | 'strong' | 'loose' | 'experimental';
  exactRime: boolean;
  depth: number;
  commonness: number;
  source: Pron['source'];
}

/**
 * Ranking comparator: quality band first (so perfect rhymes always precede
 * slant ones), then commonness within the band (so `bat`/`chat` beat obscure
 * surnames), then alphabetical. Score is quantised into 0.05 bands to define
 * "same quality".
 */
function byQualityThenCommon(a: RhymeResult, b: RhymeResult): number {
  const qa = Math.round(a.score * 20);
  const qb = Math.round(b.score * 20);
  if (qa !== qb) return qb - qa;
  if (a.commonness !== b.commonness) return b.commonness - a.commonness;
  return a.word.localeCompare(b.word);
}

export interface SearchOptions {
  /** slider position: 0 = exact only, 1 = anything loosely related */
  maxDistance?: number;
  limit?: number;
  /** include candidates that share the query's spelling stem */
  includeSelf?: boolean;
  /** restrict to a specific syllable count */
  syllables?: number;
}

/** Anchor vowels within similarity threshold — the slant candidate pool. */
function neighbourAnchors(anchor: string, threshold: number): string[] {
  const all = ['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'];
  return all.filter((v) => vowelSimilarity(anchor, v) >= threshold);
}

function anchorOf(pron: Pron): string {
  let anchor = '';
  let last = '';
  pron.phones.forEach((p) => {
    if (isVowel(p)) {
      last = base(p);
      if (p.endsWith('1')) anchor = base(p);
    }
  });
  return anchor || last;
}

/**
 * Core rhyme search. The Distance slider simply raises `maxDistance`, which
 * widens the candidate pool (looser anchor vowels) and relaxes the score
 * cutoff, re-ranking in real time.
 */
export function search(lex: Lexicon, query: string, opts: SearchOptions = {}): RhymeResult[] {
  const target = lex.resolve(query);
  if (!target) return [];
  const maxDistance = opts.maxDistance ?? 0.5;
  const limit = opts.limit ?? 200;
  const minScore = 1 - maxDistance;

  const anchor = anchorOf(target);
  // Wider pool as the slider loosens.
  const threshold = maxDistance < 0.25 ? 0.95 : maxDistance < 0.5 ? 0.75 : 0.55;
  const anchors = neighbourAnchors(anchor, threshold);
  const pool = new Set<string>();
  for (const a of anchors) for (const w of lex.wordsByAnchor(a)) pool.add(w);
  // always include exact-rime words
  for (const w of lex.wordsByRime(rimeKey(target.rime))) pool.add(w);

  const qword = query.toLowerCase().trim();
  const tNuc = target.rime.length ? base(target.rime[0]) : '';
  // A rhyme needs its stressed vowels reasonably close; reject far-vowel
  // candidates before the expensive alignment. Loosens as the slider widens.
  const nucFloor = maxDistance < 0.3 ? 0.7 : maxDistance < 0.55 ? 0.55 : 0.4;
  const results: RhymeResult[] = [];
  for (const w of pool) {
    if (w === qword && !opts.includeSelf) continue;
    const cand = lex.resolve(w);
    if (!cand) continue;
    if (opts.syllables && cand.count !== opts.syllables) continue;
    if (tNuc && cand.rime.length && vowelSimilarity(tNuc, base(cand.rime[0])) < nucFloor) continue;
    const cs = scoreCandidate(target, cand);
    if (cs.score < minScore) continue;
    results.push(toResult(lex, w, cand, cs));
  }
  results.sort(byQualityThenCommon);
  return results.slice(0, limit);
}

function toResult(lex: Lexicon, word: string, pron: Pron, cs: CandidateScore): RhymeResult {
  return {
    word,
    pron,
    score: cs.score,
    distance: cs.distance,
    tier: cs.tier,
    band: band(cs.score),
    exactRime: cs.exactRime,
    depth: cs.depth,
    commonness: lex.commonness(word),
    source: pron.source,
  };
}

/** Whole-word phonetic similarity (not just the rime) — for homophones. */
function wholeWordSimilarity(a: Pron, b: Pron): number {
  return compareRimes(a.phones, b.phones).score;
}

export interface HomophoneResult extends RhymeResult {
  identical: boolean; // true homophone vs near-homophone
}

/**
 * Homophone / near-homophone mode: effectively a preset of the distance
 * slider pinned near zero, but comparing the WHOLE word's sound (not just the
 * rime) and filtered to different spellings.
 */
export function findHomophones(lex: Lexicon, query: string, limit = 60): HomophoneResult[] {
  const target = lex.resolve(query);
  if (!target) return [];
  const qword = query.toLowerCase().trim();
  const anchor = anchorOf(target);
  const pool = new Set<string>(lex.wordsByAnchor(anchor));
  for (const w of lex.wordsByRime(rimeKey(target.rime))) pool.add(w);

  const out: HomophoneResult[] = [];
  for (const w of pool) {
    if (w === qword) continue;
    const cand = lex.resolve(w);
    if (!cand) continue;
    const sim = wholeWordSimilarity(target, cand);
    if (sim < 0.86) continue; // near-homophone floor
    const cs = scoreCandidate(target, cand);
    out.push({ ...toResult(lex, w, cand, cs), score: sim, identical: sim >= 0.999 });
  }
  out.sort((a, b) => Math.round(b.score * 40) - Math.round(a.score * 40) || b.commonness - a.commonness || a.word.localeCompare(b.word));
  return out.slice(0, limit);
}

/* --------------------------------------------------------------------- *
 * Segment locking (the "sound microscope") and substitution.
 * --------------------------------------------------------------------- */

/** Needleman–Wunsch alignment returning the path as index pairs. */
function alignPath(a: Phoneme[], b: Phoneme[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const GAP = -0.6;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const bp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + GAP; bp[i][0] = 1; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j - 1] + GAP; bp[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = dp[i - 1][j - 1] + (phonemeSimilarity(a[i - 1], b[j - 1]) * 2 - 1);
      const del = dp[i - 1][j] + GAP;
      const ins = dp[i][j - 1] + GAP;
      const best = Math.max(match, del, ins);
      dp[i][j] = best;
      bp[i][j] = best === match ? 0 : best === del ? 1 : 2;
    }
  }
  const path: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = i === 0 ? 2 : j === 0 ? 1 : bp[i][j];
    if (dir === 0) { path.push([i - 1, j - 1]); i--; j--; }
    else if (dir === 1) { path.push([i - 1, -1]); i--; }
    else { path.push([-1, j - 1]); j--; }
  }
  path.reverse();
  return path;
}

/**
 * Does `cand` preserve every locked phoneme of `target`? A locked target
 * phoneme must align to an identical (stress-insensitive) candidate phoneme —
 * not a gap and not a substitution.
 */
function preservesLocked(target: Pron, cand: Pron, locked: boolean[]): boolean {
  const path = alignPath(target.phones, cand.phones);
  for (const [ti, ci] of path) {
    if (ti < 0) continue;
    if (!locked[ti]) continue;
    if (ci < 0) return false; // locked phone deleted
    if (base(target.phones[ti]) !== base(cand.phones[ci])) return false;
  }
  return true;
}

export interface LockedSearchResult extends RhymeResult {}

/**
 * Find words that preserve exactly the locked phonemes of the target while
 * varying everything else. `locked` is a mask over target.phones.
 * Powers Sound Locking at any granularity (single block, rime, or vowel spine).
 */
export function findByLockedSegments(
  lex: Lexicon,
  query: string,
  locked: boolean[],
  opts: SearchOptions = {},
): LockedSearchResult[] {
  const target = lex.resolve(query);
  if (!target) return [];
  const limit = opts.limit ?? 200;
  const qword = query.toLowerCase().trim();

  // Fast path: if the whole rime is locked, start from the exact-rime index.
  const rimeFullyLocked = target.phones.every((_, i) => i < target.rimeStart || locked[i])
    && locked.slice(target.rimeStart).every(Boolean)
    && locked.slice(target.rimeStart).length > 0;

  let pool: Set<string>;
  if (rimeFullyLocked) {
    pool = new Set(lex.wordsByRime(rimeKey(target.rime)));
  } else {
    pool = new Set<string>();
    const anchor = anchorOf(target);
    const anchors = neighbourAnchors(anchor, 0.7);
    for (const a of anchors) for (const w of lex.wordsByAnchor(a)) pool.add(w);
  }

  const out: LockedSearchResult[] = [];
  for (const w of pool) {
    if (w === qword && !opts.includeSelf) continue;
    const cand = lex.resolve(w);
    if (!cand) continue;
    if (opts.syllables && cand.count !== opts.syllables) continue;
    if (!preservesLocked(target, cand, locked)) continue;
    const cs = scoreCandidate(target, cand);
    out.push(toResult(lex, w, cand, cs));
  }
  out.sort(byQualityThenCommon);
  return out.slice(0, limit);
}

/**
 * Sound Substitution: hold every phoneme fixed EXCEPT the ones at
 * `substituteIdx`, and return true minimal pairs — words of the same length
 * that match the target exactly at every non-substituted position and differ
 * at (at least one of) the substituted positions. This is the "change one
 * sound, watch where it leads" tool, so no insertions/deletions are allowed —
 * only a clean swap. Scans the dictionary directly (a click action, not a
 * per-keystroke query), which is cheap because the comparison exits early.
 */
export function findBySubstitution(
  lex: Lexicon,
  query: string,
  substituteIdx: number[],
  opts: SearchOptions = {},
): LockedSearchResult[] {
  const target = lex.resolve(query);
  if (!target) return [];
  const limit = opts.limit ?? 200;
  const qword = query.toLowerCase().trim();
  const sub = new Set(substituteIdx);
  const n = target.phones.length;
  const tbase = target.phones.map(base);

  const out: LockedSearchResult[] = [];
  for (const [w, cand] of lex.entries()) {
    if (w === qword) continue;
    if (cand.phones.length !== n) continue;
    let ok = true;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const same = base(cand.phones[i]) === tbase[i];
      if (sub.has(i)) {
        if (!same) changed = true;
      } else if (!same) {
        ok = false;
        break;
      }
    }
    if (!ok || !changed) continue;
    out.push(toResult(lex, w, cand, scoreCandidate(target, cand)));
  }
  out.sort(byQualityThenCommon);
  return out.slice(0, limit);
}
