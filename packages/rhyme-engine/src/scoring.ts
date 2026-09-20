/**
 * Scoring core. Everything that ranks or measures rhyme quality lives here
 * and is grounded in the articulatory feature tables in arpabet.ts.
 */
import {
  base,
  consSimilarity,
  isVowel,
  vowelSimilarity,
  type Phoneme,
} from './arpabet.js';
import { rimeKey, type Pron } from './pronunciation.js';

/**
 * Result tiers, matching Barsmith's proven vocabulary so the shared engine is
 * a true drop-in:
 *   perfect    identical from the last stressed vowel on   (nation / station)
 *   multi      2+ syllables of vowel AND consonant agree   (laboratory / lavatory)
 *   slant      the last vowel holds, the coda bends         (time / line)
 *   assonance  the vowel run matches, consonants are free   (hostile / offshore)
 */
export type Tier = 'perfect' | 'multi' | 'slant' | 'assonance';

/**
 * Base similarity of two individual phonemes, 0..1.
 * Cross-category (vowel vs consonant) comparisons score 0.
 */
export function phonemeSimilarity(a: Phoneme, b: Phoneme): number {
  const ba = base(a);
  const bb = base(b);
  const av = isVowel(a);
  const bv = isVowel(b);
  if (av !== bv) return 0;
  return av ? vowelSimilarity(ba, bb) : consSimilarity(ba, bb);
}

/**
 * Similarity-weighted global alignment (Needleman–Wunsch) of two phoneme
 * sequences. Returns a normalised score 0..1. Rimes are short so this is
 * cheap. Vowels are weighted more heavily than consonants because the vowel
 * spine carries most of the perceived rhyme.
 */
const GAP = -0.6;
// Reusable DP scratch buffer (rimes/words are short). Grown on demand.
const MAXLEN = 40;
let dp = new Float64Array((MAXLEN + 1) * (MAXLEN + 1));

function alignSimilarity(a: Phoneme[], b: Phoneme[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return 1;
  if (n === 0 || m === 0) return 0;

  const stride = m + 1;
  if ((n + 1) * (m + 1) > dp.length) {
    dp = new Float64Array((n + 1) * (m + 1));
  }

  let maxPossible = 0;
  for (let i = 0; i < n; i++) maxPossible += isVowel(a[i]) ? 1.4 : 1.0;
  for (let j = 0; j < m; j++) maxPossible += isVowel(b[j]) ? 1.4 : 1.0;
  maxPossible /= 2; // ideal: every phoneme matches perfectly

  dp[0] = 0;
  for (let i = 1; i <= n; i++) dp[i * stride] = i * GAP;
  for (let j = 1; j <= m; j++) dp[j] = j * GAP;

  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    const wi = isVowel(ai) ? 1.4 : 1.0;
    const row = i * stride;
    const prevRow = (i - 1) * stride;
    for (let j = 1; j <= m; j++) {
      const bj = b[j - 1];
      const w = (wi + (isVowel(bj) ? 1.4 : 1.0)) / 2;
      const match = dp[prevRow + j - 1] + phonemeSimilarity(ai, bj) * w * 2 - w;
      const del = dp[prevRow + j] + GAP;
      const ins = dp[row + j - 1] + GAP;
      let best = match;
      if (del > best) best = del;
      if (ins > best) best = ins;
      dp[row + j] = best;
    }
  }
  const raw = dp[n * stride + m];
  return Math.max(0, Math.min(1, (raw + maxPossible) / (2 * maxPossible)));
}

export interface RimeComparison {
  score: number; // 0..1
  exact: boolean; // identical rime (stress-insensitive)
}

/** Compare two rimes (phoneme lists starting at the stressed vowel). */
export function compareRimes(rimeA: Phoneme[], rimeB: Phoneme[]): RimeComparison {
  const exact = rimeKey(rimeA) === rimeKey(rimeB);
  const score = exact ? 1 : alignSimilarity(rimeA, rimeB);
  return { score, exact };
}

/**
 * How many trailing syllables agree on BOTH vowel and coda (Barsmith's multi
 * definition). Counting vowels alone would call `money`/`tully` a two-syllable
 * multi on the strength of the shared AH…IY skeleton, even though N and L have
 * nothing in common — so a real multi needs the consonants to line up too.
 */
function trailingSyllableDepth(a: Pron, b: Pron): number {
  let depth = 0;
  let i = a.vowelSpine.length - 1;
  let j = b.vowelSpine.length - 1;
  while (i >= 0 && j >= 0) {
    if (a.vowelSpine[i] === b.vowelSpine[j] && a.codas[i] === b.codas[j]) {
      depth++;
      i--;
      j--;
    } else break;
  }
  return depth;
}

export interface CandidateScore {
  score: number; // 0..1 overall rhyme quality
  distance: number; // 1 - score, the "rhyme distance" the slider uses
  tier: Tier;
  exactRime: boolean;
  depth: number; // multisyllabic depth (trailing matching vowels)
  stressMatch: number; // 0..1
}

/** How well two stress patterns line up at their tails, 0..1. */
function stressTailMatch(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let same = 0;
  for (let k = 1; k <= len; k++) {
    if ((a[a.length - k] > 0) === (b[b.length - k] > 0)) same++;
  }
  return same / len;
}

/**
 * Score a candidate pronunciation as a rhyme for a target pronunciation.
 * This is the single ranking function Search, the Distance slider, Multi
 * Builder and Sound tools all consume.
 */
export function scoreCandidate(target: Pron, cand: Pron): CandidateScore {
  const rc = compareRimes(target.rime, cand.rime);
  const depth = trailingSyllableDepth(target, cand);
  const stressMatch = stressTailMatch(target.stressPattern, cand.stressPattern);

  // Blend: the rime dominates; multisyllabic depth and stress refine.
  const depthBonus = Math.min(depth, target.vowelSpine.length) / Math.max(1, target.vowelSpine.length);
  let score = 0.72 * rc.score + 0.18 * depthBonus + 0.1 * stressMatch;
  if (rc.exact) score = Math.max(score, 0.9 + 0.1 * stressMatch);
  score = Math.max(0, Math.min(1, score));

  // Bucket by what kind of rhyme it is (Barsmith semantics). Perfect is
  // claimed first: an identical stressed tail is a perfect rhyme whether the
  // word is one syllable (rhyme/time) or several (station/information). Multi
  // is the deep-but-not-exact match — 2+ trailing syllables still align while
  // the coda bends. Then slant, then assonance.
  let tier: Tier;
  if (rc.exact) tier = 'perfect';
  else if (depth >= 2) tier = 'multi';
  else if (score >= 0.58) tier = 'slant';
  else tier = 'assonance';

  return { score, distance: 1 - score, tier, exactRime: rc.exact, depth, stressMatch };
}

/**
 * Continuous rhyme distance between two words' pronunciations, 0 (identical
 * rime) .. 1 (unrelated). This is the axis the Distance slider navigates.
 */
export function rhymeDistance(target: Pron, cand: Pron): number {
  return scoreCandidate(target, cand).distance;
}

/** Band a score into the slider's four labelled zones. */
export function band(score: number): 'perfect' | 'strong' | 'loose' | 'experimental' {
  if (score >= 0.85) return 'perfect';
  if (score >= 0.68) return 'strong';
  if (score >= 0.5) return 'loose';
  return 'experimental';
}
