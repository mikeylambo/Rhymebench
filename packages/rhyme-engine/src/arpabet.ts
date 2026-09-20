/**
 * ARPAbet phonetic knowledge base.
 *
 * Every phoneme in the CMU dictionary is one of these symbols. Vowels may
 * carry a trailing stress digit (0 unstressed, 1 primary, 2 secondary).
 * All of the engine's similarity scoring is grounded in the articulatory
 * feature tables below rather than in ad-hoc letter matching, so that
 * "close" sounds (e.g. IH/IY, S/Z, M/N) score as genuinely close.
 */

export type Phoneme = string; // e.g. "AE1", "T", "ER0"

export const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER',
  'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
]);

export const CONSONANTS = new Set([
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N',
  'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
]);

/** Strip a trailing stress digit: "AE1" -> "AE", "T" -> "T". */
export function base(p: Phoneme): string {
  const last = p.charCodeAt(p.length - 1);
  return last >= 48 && last <= 57 ? p.slice(0, -1) : p;
}

/** Stress digit of a phoneme, or -1 if it carries none (consonants). */
export function stress(p: Phoneme): number {
  const last = p.charCodeAt(p.length - 1);
  return last >= 48 && last <= 57 ? last - 48 : -1;
}

export function isVowel(p: Phoneme): boolean {
  return VOWELS.has(base(p));
}

export function isConsonant(p: Phoneme): boolean {
  return CONSONANTS.has(base(p));
}

/* ---------------------------------------------------------------------- *
 * Vowel feature space.
 * Each vowel placed in a perceptual space: [height, backness, roundness].
 * Diphthongs are given the position of their nucleus with a glide flag.
 * Values are normalised 0..1. Distances between these points drive
 * vowel similarity.
 * ---------------------------------------------------------------------- */
interface VowelFeat {
  height: number; // 0 = low, 1 = high
  back: number; // 0 = front, 1 = back
  round: number; // 0 = unrounded, 1 = rounded
  glide: number; // 0 = monophthong, 1 = diphthong (off-glide movement)
  tense: number; // 0 = lax, 1 = tense
}

export const VOWEL_FEATURES: Record<string, VowelFeat> = {
  IY: { height: 1.0, back: 0.0, round: 0, glide: 0, tense: 1 }, // beet
  IH: { height: 0.8, back: 0.1, round: 0, glide: 0, tense: 0 }, // bit
  EY: { height: 0.7, back: 0.1, round: 0, glide: 1, tense: 1 }, // bait
  EH: { height: 0.5, back: 0.1, round: 0, glide: 0, tense: 0 }, // bet
  AE: { height: 0.25, back: 0.15, round: 0, glide: 0, tense: 0 }, // bat
  AA: { height: 0.0, back: 0.8, round: 0, glide: 0, tense: 1 }, // bot / father
  AO: { height: 0.2, back: 0.9, round: 0.7, glide: 0, tense: 1 }, // bought
  OW: { height: 0.6, back: 0.85, round: 0.8, glide: 1, tense: 1 }, // boat
  UH: { height: 0.8, back: 0.8, round: 0.6, glide: 0, tense: 0 }, // book
  UW: { height: 1.0, back: 0.9, round: 0.9, glide: 0, tense: 1 }, // boot
  AH: { height: 0.45, back: 0.5, round: 0, glide: 0, tense: 0 }, // but / schwa
  ER: { height: 0.5, back: 0.5, round: 0.2, glide: 0, tense: 0 }, // bird (rhotic)
  AW: { height: 0.1, back: 0.5, round: 0.4, glide: 1, tense: 1 }, // bout
  AY: { height: 0.1, back: 0.4, round: 0, glide: 1, tense: 1 }, // bite
  OY: { height: 0.4, back: 0.7, round: 0.6, glide: 1, tense: 1 }, // boy
};

/* ---------------------------------------------------------------------- *
 * Consonant feature space: [place, manner, voice].
 * place   0..1 front(labial) -> back(glottal)
 * manner  categorical, compared by a small manner-distance table
 * voice   0 voiceless, 1 voiced
 * ---------------------------------------------------------------------- */
type Manner = 'stop' | 'fricative' | 'affricate' | 'nasal' | 'liquid' | 'glide' | 'aspirate';

interface ConsFeat {
  place: number;
  manner: Manner;
  voice: number;
}

export const CONS_FEATURES: Record<string, ConsFeat> = {
  P: { place: 0.0, manner: 'stop', voice: 0 },
  B: { place: 0.0, manner: 'stop', voice: 1 },
  M: { place: 0.0, manner: 'nasal', voice: 1 },
  F: { place: 0.15, manner: 'fricative', voice: 0 },
  V: { place: 0.15, manner: 'fricative', voice: 1 },
  W: { place: 0.1, manner: 'glide', voice: 1 },
  TH: { place: 0.25, manner: 'fricative', voice: 0 },
  DH: { place: 0.25, manner: 'fricative', voice: 1 },
  T: { place: 0.35, manner: 'stop', voice: 0 },
  D: { place: 0.35, manner: 'stop', voice: 1 },
  N: { place: 0.35, manner: 'nasal', voice: 1 },
  S: { place: 0.4, manner: 'fricative', voice: 0 },
  Z: { place: 0.4, manner: 'fricative', voice: 1 },
  L: { place: 0.4, manner: 'liquid', voice: 1 },
  R: { place: 0.45, manner: 'liquid', voice: 1 },
  SH: { place: 0.5, manner: 'fricative', voice: 0 },
  ZH: { place: 0.5, manner: 'fricative', voice: 1 },
  CH: { place: 0.5, manner: 'affricate', voice: 0 },
  JH: { place: 0.5, manner: 'affricate', voice: 1 },
  Y: { place: 0.55, manner: 'glide', voice: 1 },
  K: { place: 0.8, manner: 'stop', voice: 0 },
  G: { place: 0.8, manner: 'stop', voice: 1 },
  NG: { place: 0.8, manner: 'nasal', voice: 1 },
  HH: { place: 1.0, manner: 'aspirate', voice: 0 },
};

// Perceptual distance between manners (0 identical .. 1 maximally different).
const MANNER_DIST: Record<Manner, Record<Manner, number>> = (() => {
  const order: Manner[] = ['stop', 'affricate', 'fricative', 'nasal', 'liquid', 'glide', 'aspirate'];
  // Hand-tuned adjacency: affricates near stops+fricatives, glides near liquids.
  const raw: Record<string, number> = {
    'stop|affricate': 0.35, 'stop|fricative': 0.5, 'stop|nasal': 0.55,
    'stop|liquid': 0.8, 'stop|glide': 0.85, 'stop|aspirate': 0.7,
    'affricate|fricative': 0.3, 'affricate|nasal': 0.6, 'affricate|liquid': 0.75,
    'affricate|glide': 0.8, 'affricate|aspirate': 0.7,
    'fricative|nasal': 0.6, 'fricative|liquid': 0.6, 'fricative|glide': 0.55,
    'fricative|aspirate': 0.4,
    'nasal|liquid': 0.45, 'nasal|glide': 0.55, 'nasal|aspirate': 0.85,
    'liquid|glide': 0.3, 'liquid|aspirate': 0.85,
    'glide|aspirate': 0.7,
  };
  const table = {} as Record<Manner, Record<Manner, number>>;
  for (const a of order) {
    table[a] = {} as Record<Manner, number>;
    for (const b of order) {
      if (a === b) table[a][b] = 0;
      else table[a][b] = raw[`${a}|${b}`] ?? raw[`${b}|${a}`] ?? 1;
    }
  }
  return table;
})();

/**
 * Similarity of two consonant *base* symbols, 0..1 (1 = identical).
 */
export function consSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const fa = CONS_FEATURES[a];
  const fb = CONS_FEATURES[b];
  if (!fa || !fb) return 0;
  const placeD = Math.abs(fa.place - fb.place); // 0..1
  const mannerD = MANNER_DIST[fa.manner][fb.manner]; // 0..1
  const voiceD = Math.abs(fa.voice - fb.voice); // 0 or 1
  // Manner dominates perception, then place, then voicing.
  const dist = 0.5 * mannerD + 0.35 * placeD + 0.15 * voiceD;
  return Math.max(0, 1 - dist);
}

/**
 * Similarity of two vowel *base* symbols, 0..1 (1 = identical).
 */
export function vowelSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const fa = VOWEL_FEATURES[a];
  const fb = VOWEL_FEATURES[b];
  if (!fa || !fb) return 0;
  const heightD = Math.abs(fa.height - fb.height);
  const backD = Math.abs(fa.back - fb.back);
  const roundD = Math.abs(fa.round - fb.round);
  const glideD = Math.abs(fa.glide - fb.glide);
  const tenseD = Math.abs(fa.tense - fb.tense);
  // Height + backness carry the vowel's identity; glide/round/tense refine.
  const dist =
    0.4 * heightD + 0.3 * backD + 0.12 * roundD + 0.1 * glideD + 0.08 * tenseD;
  return Math.max(0, 1 - dist);
}
