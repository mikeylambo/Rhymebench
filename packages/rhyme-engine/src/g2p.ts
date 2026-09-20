/**
 * Lightweight rule-based grapheme-to-phoneme fallback for words the CMU
 * dictionary and slang supplement do not cover. It is deliberately a
 * heuristic, not a neural G2P: greedy longest-match over an ordered rule
 * table, then a simple stress assignment. The goal is "close enough to
 * rhyme usefully," which is exactly the tool's tolerance since results are
 * scored by phonetic distance anyway.
 */
import type { Phoneme } from './arpabet.js';

interface Rule {
  // context: `_` marks the letters consumed; before/after are optional anchors
  pattern: RegExp; // matched at the current cursor (anchored with ^)
  out: string[]; // phonemes emitted (base vowels; stress added later)
  len: number; // graphemes consumed
}

// Ordered rules — longer / more specific first. Vowels emitted without stress.
const R = (re: string, out: string, len: number): Rule => ({
  pattern: new RegExp('^' + re),
  out: out ? out.split(' ') : [],
  len,
});

const RULES: Rule[] = [
  // --- multigraph consonants & common clusters ---
  R('tch', 'CH', 3),
  R('dge', 'JH', 3),
  R('igh', 'AY', 3),
  R('eigh', 'EY', 4),
  R('ough', 'AO', 4), // rough approximation
  R('augh', 'AE F', 4),
  R('sch', 'SH', 3),
  R('sh', 'SH', 2),
  R('ch', 'CH', 2),
  R('th', 'TH', 2),
  R('ph', 'F', 2),
  R('wh', 'W', 2),
  R('ck', 'K', 2),
  R('ng', 'NG', 2),
  R('qu', 'K W', 2),
  R('wr', 'R', 2),
  R('kn', 'N', 2),
  R('gn', 'N', 2),
  R('mb$', 'M', 2), // dumb, comb (silent b)
  R('ss', 'S', 2),
  R('ll', 'L', 2),
  R('tt', 'T', 2),
  R('pp', 'P', 2),
  R('dd', 'D', 2),
  R('ff', 'F', 2),
  R('gg', 'G', 2),
  R('mm', 'M', 2),
  R('nn', 'N', 2),
  R('rr', 'R', 2),
  R('cc', 'K', 2),
  R('bb', 'B', 2),
  // --- vowel digraphs ---
  R('ee', 'IY', 2),
  R('ea', 'IY', 2),
  R('oo', 'UW', 2),
  R('ou', 'AW', 2),
  R('ow', 'AW', 2),
  R('oi', 'OY', 2),
  R('oy', 'OY', 2),
  R('au', 'AO', 2),
  R('aw', 'AO', 2),
  R('ai', 'EY', 2),
  R('ay', 'EY', 2),
  R('ey', 'EY', 2),
  R('oa', 'OW', 2),
  R('oe', 'OW', 2),
  R('ie', 'AY', 2),
  R('ui', 'UW', 2),
  R('ar', 'AA R', 2),
  R('er', 'ER', 2),
  R('ir', 'ER', 2),
  R('ur', 'ER', 2),
  R('or', 'AO R', 2),
  R('yr', 'ER', 2),
  // --- single consonants ---
  R('b', 'B', 1),
  R('c', 'K', 1), // softened below when followed by e/i/y
  R('d', 'D', 1),
  R('f', 'F', 1),
  R('g', 'G', 1),
  R('h', 'HH', 1),
  R('j', 'JH', 1),
  R('k', 'K', 1),
  R('l', 'L', 1),
  R('m', 'M', 1),
  R('n', 'N', 1),
  R('p', 'P', 1),
  R('r', 'R', 1),
  R('s', 'S', 1),
  R('t', 'T', 1),
  R('v', 'V', 1),
  R('w', 'W', 1),
  R('x', 'K S', 1),
  R('z', 'Z', 1),
  // --- single vowels (defaults; magic-e handled specially) ---
  R('a', 'AE', 1),
  R('e', 'EH', 1),
  R('i', 'IH', 1),
  R('o', 'AA', 1),
  R('u', 'AH', 1),
  R('y', 'IH', 1),
];

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const LONG: Record<string, string> = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW', y: 'AY' };

function isVowelBase(p: string): boolean {
  return ['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'].includes(p);
}

/**
 * Convert a word (letters only) to a stressed ARPAbet phoneme list.
 * Returns [] if the input has no usable letters.
 */
export function g2p(word: string): Phoneme[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];

  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);

    // Silent trailing 'e' (magic-e): if a single 'e' ends the word and the
    // previous emitted phoneme was a consonant preceded by a vowel, drop it
    // and lengthen that earlier vowel.
    if (rest === 'e' && out.length >= 2) {
      const last = out[out.length - 1];
      const prev = out[out.length - 2];
      if (!isVowelBase(last) && isVowelBase(prev)) {
        // lengthen: AE->EY, EH->IY, IH->AY, AA->OW, AH->UW
        const map: Record<string, string> = { AE: 'EY', EH: 'IY', IH: 'AY', AA: 'OW', AH: 'UW' };
        if (map[prev]) out[out.length - 2] = map[prev];
        break;
      }
    }

    // soft c / g before e, i, y
    if (rest[0] === 'c' && 'eiy'.includes(rest[1] ?? '')) {
      out.push('S');
      i += 1;
      continue;
    }
    if (rest[0] === 'g' && 'eiy'.includes(rest[1] ?? '')) {
      out.push('JH');
      i += 1;
      continue;
    }
    // final 'e' that is silent after a consonant cluster at word end
    if (rest === 'e') {
      break;
    }
    // 'tion' / 'sion'
    if (rest.startsWith('tion')) { out.push('SH', 'AH', 'N'); i += 4; continue; }
    if (rest.startsWith('sion')) { out.push('ZH', 'AH', 'N'); i += 4; continue; }

    let matched: Rule | null = null;
    for (const rule of RULES) {
      if (rule.pattern.test(rest)) {
        // '$' anchored rules must be at end
        matched = rule;
        break;
      }
    }
    if (!matched) {
      i += 1;
      continue;
    }
    // magic-e lookahead: single vowel + single consonant + final e -> long vowel
    if (matched.len === 1 && VOWEL_LETTERS.has(rest[0])) {
      const after = rest.slice(1);
      if (/^[bcdfghjklmnpqrstvwxz]e$/.test(after)) {
        out.push(LONG[rest[0]] ?? matched.out[0]);
        i += 1;
        continue;
      }
    }
    out.push(...matched.out);
    i += matched.len;
  }

  // Collapse accidental empty output
  const phones = out.filter(Boolean);
  if (phones.length === 0) return [];

  return assignStress(phones);
}

/**
 * Assign stress digits to vowels. Heuristic: primary stress on the first
 * vowel for 1–2 syllable words; on the penultimate vowel for longer words
 * (a rough English default). Non-primary vowels get 0.
 */
function assignStress(phones: string[]): Phoneme[] {
  const vowelPositions: number[] = [];
  phones.forEach((p, idx) => {
    if (isVowelBase(p)) vowelPositions.push(idx);
  });
  if (vowelPositions.length === 0) return phones;

  let primaryVowel: number;
  if (vowelPositions.length <= 2) primaryVowel = vowelPositions[0];
  else primaryVowel = vowelPositions[vowelPositions.length - 2];

  return phones.map((p, idx) => {
    if (!isVowelBase(p)) return p;
    return p + (idx === primaryVowel ? '1' : '0');
  });
}
