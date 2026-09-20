/**
 * Structural analysis of a pronunciation: syllables, rime, vowel spine,
 * stress pattern. These are the primitives the scoring layer consumes.
 */
import { base, isVowel, stress, type Phoneme } from './arpabet.js';

export interface Syllable {
  onset: Phoneme[]; // leading consonants
  nucleus: Phoneme; // the (single) vowel, with stress digit
  coda: Phoneme[]; // trailing consonants
  stress: number; // 0 / 1 / 2
}

export interface Pron {
  phones: Phoneme[]; // raw phoneme sequence, stress digits intact
  /** phonemes from the last primary/secondary-stressed vowel to the end */
  rime: Phoneme[];
  /** index into `phones` where the rime begins */
  rimeStart: number;
  /** base vowels in order, no stress digits: the "vowel movement" */
  vowelSpine: string[];
  /** consonants following each vowel up to the next vowel (base, space-joined),
   *  aligned with vowelSpine — a syllable's coda, for multi detection */
  codas: string[];
  /** stress digits of each vowel in order, e.g. [1,0] */
  stressPattern: number[];
  /** number of syllables */
  count: number;
  source: 'cmu' | 'slang' | 'g2p';
}

/**
 * Split a flat phoneme list into syllables using a maximal-onset heuristic:
 * every vowel is a nucleus; consonants between two vowels are split so the
 * second syllable takes a legal-ish onset (here: at most the final consonant,
 * which is good enough for rhyme structure — we do not need phonotactic
 * perfection, only stable syllable boundaries).
 */
export function syllabify(phones: Phoneme[]): Syllable[] {
  const vowelIdx: number[] = [];
  phones.forEach((p, i) => {
    if (isVowel(p)) vowelIdx.push(i);
  });
  if (vowelIdx.length === 0) {
    // No vowel (e.g. a lone consonant token) — treat whole thing as a coda-only syllable.
    return [{ onset: phones.slice(), nucleus: '', coda: [], stress: 0 }];
  }

  const syllables: Syllable[] = [];
  for (let s = 0; s < vowelIdx.length; s++) {
    const v = vowelIdx[s];
    const prevV = s === 0 ? -1 : vowelIdx[s - 1];
    const nextV = s === vowelIdx.length - 1 ? phones.length : vowelIdx[s + 1];

    // consonants sitting between prevV and this vowel
    const between = phones.slice(prevV + 1, v);
    // consonants between this vowel and the next vowel
    const trailing = phones.slice(v + 1, nextV > phones.length ? phones.length : nextV);

    let onset: Phoneme[];
    let coda: Phoneme[];

    if (s === 0) {
      onset = between; // everything before the first vowel is onset
    } else {
      // maximal onset: give the last of the between-cluster to this syllable
      onset = between.length > 0 ? [between[between.length - 1]] : [];
      // the rest attached to previous syllable as extra coda
      const extraCoda = between.slice(0, Math.max(0, between.length - 1));
      if (extraCoda.length) syllables[syllables.length - 1].coda.push(...extraCoda);
    }

    if (s === vowelIdx.length - 1) {
      coda = phones.slice(v + 1); // everything after the last vowel is coda
    } else {
      coda = []; // trailing consonants belong to the next syllable's onset
      void trailing;
    }

    syllables.push({ onset, nucleus: phones[v], coda, stress: stress(phones[v]) < 0 ? 0 : stress(phones[v]) });
  }
  return syllables;
}

/**
 * The rime for rhyme purposes: from the last STRESSED vowel (primary preferred,
 * else secondary, else the last vowel) through to the end of the word.
 */
export function findRimeStart(phones: Phoneme[]): number {
  let lastPrimary = -1;
  let lastSecondary = -1;
  let lastVowel = -1;
  for (let i = 0; i < phones.length; i++) {
    if (!isVowel(phones[i])) continue;
    lastVowel = i;
    const s = stress(phones[i]);
    if (s === 1) lastPrimary = i;
    else if (s === 2) lastSecondary = i;
  }
  const start = lastPrimary >= 0 ? lastPrimary : lastSecondary >= 0 ? lastSecondary : lastVowel;
  return start < 0 ? 0 : start;
}

export function analyze(phones: Phoneme[], source: Pron['source']): Pron {
  const rimeStart = findRimeStart(phones);
  const rime = phones.slice(rimeStart);
  const vowelSpine: string[] = [];
  const stressPattern: number[] = [];
  const codaLists: string[][] = [];
  let curCoda: string[] | null = null;
  for (const p of phones) {
    if (isVowel(p)) {
      vowelSpine.push(base(p));
      const s = stress(p);
      stressPattern.push(s < 0 ? 0 : s);
      curCoda = [];
      codaLists.push(curCoda);
    } else if (curCoda) {
      // consonant after a vowel — part of that syllable's coda (onset
      // consonants, before the first vowel, are intentionally ignored here)
      curCoda.push(base(p));
    }
  }
  return {
    phones,
    rime,
    rimeStart,
    vowelSpine,
    codas: codaLists.map((c) => c.join(' ')),
    stressPattern,
    count: vowelSpine.length,
    source,
  };
}

/** Parse a whitespace phoneme string ("P R AH0 N") into a phone array. */
export function parsePhones(s: string): Phoneme[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** A stable key for a rime, used for reverse indexing (stress-insensitive). */
export function rimeKey(rime: Phoneme[]): string {
  return rime.map(base).join(' ');
}
