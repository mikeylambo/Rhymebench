/**
 * Multi Builder: match the cadence and sound-shape of a multi-word phrase by
 * combining single-dictionary words — no separate phrase corpus. Abundance is
 * the feature, so candidates are bucketed by quality rather than filtered hard.
 * Phrase Exploration is the same generator with the loose/experimental buckets
 * surfaced instead of hidden.
 */
import type { Lexicon } from './lexicon.js';
import type { Pron } from './pronunciation.js';
import { scoreCandidate } from './scoring.js';
import { search } from './search.js';

export interface PhraseCandidate {
  phrase: string;
  words: string[];
  score: number;
  bucket: 'exact' | 'strong' | 'loose' | 'experimental';
}

export interface MultiResult {
  source: string;
  sourceProns: Pron[];
  syllables: number;
  buckets: {
    exact: PhraseCandidate[];
    strong: PhraseCandidate[];
    loose: PhraseCandidate[];
    experimental: PhraseCandidate[];
  };
  total: number;
}

interface Options {
  perWord?: number; // max candidates gathered per position
  maxResults?: number; // cap on generated phrases
  explore?: boolean; // relax filtering (Phrase Exploration mode)
}

function stressKey(p: Pron): string {
  return p.stressPattern.map((s) => (s > 0 ? '1' : '0')).join('');
}

/**
 * Generate phrase candidates matching the input's per-word cadence: for each
 * source word we gather words that rhyme with it AND share its syllable count
 * and stressed/unstressed shape, then take a bounded cross-product.
 */
export function buildMultis(lex: Lexicon, phrase: string, opts: Options = {}): MultiResult {
  const words = phrase.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const perWord = opts.perWord ?? 36;
  const maxResults = opts.maxResults ?? 400;
  const explore = opts.explore ?? false;
  const maxDistance = explore ? 0.6 : 0.42;

  const sourceProns = words.map((w) => lex.resolve(w)).filter(Boolean) as Pron[];
  const totalSyll = sourceProns.reduce((n, p) => n + p.count, 0);

  // Per-position candidate lists (each includes the option to keep the original word).
  const perPosition: Array<Array<{ word: string; score: number; pron: Pron }>> = [];
  for (let i = 0; i < words.length; i++) {
    const src = lex.resolve(words[i]);
    if (!src) { perPosition.push([{ word: words[i], score: 1, pron: src as unknown as Pron }]); continue; }
    const srcStress = stressKey(src);
    const hits = search(lex, words[i], { maxDistance, limit: 400, syllables: src.count })
      .filter((r) => stressKey(r.pron) === srcStress)
      .slice(0, perWord)
      .map((r) => ({ word: r.word, score: r.score, pron: r.pron }));
    // keep original word as an anchor option so partial swaps are possible
    hits.unshift({ word: words[i], score: 1, pron: src });
    perPosition.push(hits);
  }

  // Bounded cross-product.
  const combos: Array<{ words: string[]; score: number }> = [];
  const cap = maxResults * 3;
  const build = (idx: number, acc: string[], scoreAcc: number, weight: number) => {
    if (combos.length >= cap) return;
    if (idx === perPosition.length) {
      // skip the identity (all original words)
      if (acc.some((w, k) => w !== words[k])) {
        combos.push({ words: acc.slice(), score: scoreAcc / weight });
      }
      return;
    }
    // last word weighted double (phrase-final rhyme matters most)
    const w = idx === perPosition.length - 1 ? 2 : 1;
    for (const c of perPosition[idx]) {
      build(idx + 1, [...acc, c.word], scoreAcc + c.score * w, weight + w);
      if (combos.length >= cap) return;
    }
  };
  build(0, [], 0, 0);

  // Dedup by phrase text, keep best score.
  const seen = new Map<string, { words: string[]; score: number }>();
  for (const c of combos) {
    const key = c.words.join(' ');
    const prev = seen.get(key);
    if (!prev || c.score > prev.score) seen.set(key, c);
  }

  const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, maxResults);

  const buckets: MultiResult['buckets'] = { exact: [], strong: [], loose: [], experimental: [] };
  for (const c of ranked) {
    const bucket =
      c.score >= 0.9 ? 'exact' : c.score >= 0.74 ? 'strong' : c.score >= 0.55 ? 'loose' : 'experimental';
    buckets[bucket].push({ phrase: c.words.join(' '), words: c.words, score: c.score, bucket });
  }

  return {
    source: phrase,
    sourceProns,
    syllables: totalSyll,
    buckets,
    total: ranked.length,
  };
}

/** Cadence/assonance similarity of two arbitrary phrases (for scoring pins). */
export function phraseMatch(lex: Lexicon, a: string, b: string): number {
  const pa = a.toLowerCase().trim().split(/\s+/).map((w) => lex.resolve(w)).filter(Boolean) as Pron[];
  const pb = b.toLowerCase().trim().split(/\s+/).map((w) => lex.resolve(w)).filter(Boolean) as Pron[];
  if (!pa.length || !pb.length) return 0;
  // compare last words (rhyme) blended with total syllable-count agreement
  const last = scoreCandidate(pa[pa.length - 1], pb[pb.length - 1]).score;
  const sa = pa.reduce((n, p) => n + p.count, 0);
  const sb = pb.reduce((n, p) => n + p.count, 0);
  const cadence = 1 - Math.min(1, Math.abs(sa - sb) / Math.max(sa, sb));
  return 0.7 * last + 0.3 * cadence;
}
