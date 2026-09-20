/**
 * Internal Rhyme Finder — the one genuinely new engine capability.
 *
 * Instead of comparing two isolated words, it segments a full line into
 * syllables across word boundaries, then detects clusters of syllables whose
 * rimes match anywhere in the sequence (including non-adjacent ones), which is
 * what internal rhyme and complex multi flows are made of.
 */
import { base, isVowel, vowelSimilarity, type Phoneme } from './arpabet.js';
import type { Lexicon } from './lexicon.js';
import { syllabify } from './pronunciation.js';
import { compareRimes } from './scoring.js';

export interface LineSyllable {
  index: number; // position in the flat syllable sequence
  wordIndex: number; // which word in the line
  charStart: number; // offset in the original line (for highlighting)
  charEnd: number;
  text: string; // the source word (syllable-level text isn't recoverable from CMU)
  nucleus: string; // base vowel
  stress: number;
  rime: Phoneme[]; // nucleus + coda of this syllable
}

export interface RhymeCluster {
  id: number;
  members: number[]; // indices into the syllable list
  vowel: string; // representative nucleus
  strength: number; // average pairwise rime similarity
}

export interface InternalRhymeResult {
  syllables: LineSyllable[];
  clusters: RhymeCluster[];
}

/** Similarity of two syllable rimes for internal-rhyme purposes. */
function syllRimeSim(a: Phoneme[], b: Phoneme[], aVowel: string, bVowel: string): number {
  const nucleus = vowelSimilarity(aVowel, bVowel);
  if (nucleus < 0.72) return 0; // nuclei must be close to count as a rhyme
  const full = compareRimes(a, b).score;
  return 0.6 * nucleus + 0.4 * full;
}

/**
 * Analyse a line/bar. `threshold` (0..1) sets how close two syllables must
 * sound to join the same cluster.
 */
export function findInternalRhymes(
  lex: Lexicon,
  line: string,
  threshold = 0.8,
): InternalRhymeResult {
  const syllables: LineSyllable[] = [];
  const wordRe = /[A-Za-z']+/g;
  let match: RegExpExecArray | null;
  let wordIndex = 0;
  let sylIndex = 0;

  while ((match = wordRe.exec(line)) !== null) {
    const word = match[0];
    const pron = lex.resolve(word);
    if (!pron) { wordIndex++; continue; }
    const sylls = syllabify(pron.phones);
    for (const s of sylls) {
      if (!s.nucleus) continue;
      syllables.push({
        index: sylIndex++,
        wordIndex,
        charStart: match.index,
        charEnd: match.index + word.length,
        text: word,
        nucleus: base(s.nucleus),
        stress: s.stress,
        rime: [s.nucleus, ...s.coda].filter((p) => p !== ''),
      });
    }
    wordIndex++;
  }

  // Pairwise similarity + union-find clustering.
  const n = syllables.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  const pairStrength = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // don't rhyme a syllable with an adjacent one in the SAME word (trivial)
      if (syllables[i].wordIndex === syllables[j].wordIndex && Math.abs(i - j) === 1) continue;
      const sim = syllRimeSim(
        syllables[i].rime,
        syllables[j].rime,
        syllables[i].nucleus,
        syllables[j].nucleus,
      );
      if (sim >= threshold) {
        union(i, j);
        pairStrength.set(`${i}-${j}`, sim);
      }
    }
  }

  // Gather clusters of size >= 2.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }

  const clusters: RhymeCluster[] = [];
  let cid = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let sum = 0;
    let cnt = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const i = Math.min(members[a], members[b]);
        const j = Math.max(members[a], members[b]);
        const s = pairStrength.get(`${i}-${j}`);
        if (s != null) { sum += s; cnt++; }
      }
    }
    clusters.push({
      id: cid++,
      members: members.slice().sort((a, b) => a - b),
      vowel: syllables[members[0]].nucleus,
      strength: cnt ? sum / cnt : 0,
    });
  }
  clusters.sort((a, b) => b.members.length - a.members.length || b.strength - a.strength);
  // reassign ids by ranked order for stable colour assignment
  clusters.forEach((c, i) => (c.id = i));

  return { syllables, clusters };
}

/** Convenience: does the phone list contain any vowel? (used by callers) */
export function hasVowel(phones: Phoneme[]): boolean {
  return phones.some(isVowel);
}
