#!/usr/bin/env node
/**
 * build-lexicon.mjs — regenerates apps/workbench/public/data/lexicon.txt, the
 * compact pronunciation payload the app downloads.
 *
 * This is a data generator, NOT part of `npm run build`: the output is committed,
 * so a normal build or deploy never needs the sources. Run it when the CMU source,
 * the frequency list, or the filter below changes:
 *
 *     node scripts/build-lexicon.mjs [--words /usr/share/dict/words]
 *
 * Inputs (data-src/, committed):
 *   cmudict.dict  CMU Pronouncing Dictionary (BSD-2-Clause, see public/data/LICENSE-DATA.txt)
 *   freq.txt      top-60k English words, most common first (Norvig unigram counts)
 * Plus a plain word list to tell real words from names — /usr/share/dict/words
 * (Webster's Second, public domain, shipped with macOS and most Unixes), where
 * proper nouns are capitalised.
 *
 * Why filter: two thirds of CMU's 126k headwords are surnames, brands and place
 * names ("bhatt", "arnatt"), which is exactly the noise that floods the loose end of
 * a rhyme list. A headword is kept if it is a common word (in freq.txt), a dictionary
 * word (lowercase in the word list), or an inflection of one ("abdicated", "cats").
 *
 * Output format, one word per line after a header:
 *   #rhymebench-lexicon 1 ranks=<N>
 *   <word> <pron>[|<variant>...] [<rank base-36>]
 * where each pron is one character per phoneme (ALPHABET below, index-aligned with
 * PHONEMES), a vowel followed by its stress digit, and rank is the word's position in
 * freq.txt (0 = most common), omitted when unranked.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const argWords = process.argv.indexOf('--words');
const WORDS_PATH = argWords > 0 ? process.argv[argWords + 1] : '/usr/share/dict/words';

// Must match packages/rhyme-engine/src/lexicon.ts exactly, index for index.
export const PHONEMES = [
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'EH', 'ER', 'EY', 'F',
  'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P', 'R', 'S',
  'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH',
];
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM';
const CH = Object.fromEntries(PHONEMES.map((p, i) => [p, ALPHABET[i]]));

function encode(phoneStr) {
  let out = '';
  for (const p of phoneStr.trim().split(/\s+/)) {
    const digit = /\d$/.test(p) ? p.slice(-1) : '';
    const base = digit ? p.slice(0, -1) : p;
    const c = CH[base];
    if (!c) throw new Error(`unknown phoneme ${p} in "${phoneStr}"`);
    out += c + digit;
  }
  return out;
}

let words;
try {
  words = new Set(readFileSync(WORDS_PATH, 'utf8').split('\n').filter((w) => /^[a-z]+$/.test(w)));
} catch {
  console.error(`[build-lexicon] cannot read a word list at ${WORDS_PATH} — pass --words <path>`);
  process.exit(1);
}

// Frequency ranks, deduped in file order (same rule the engine used to apply at runtime).
const rank = new Map();
for (const line of readFileSync(`${root}data-src/freq.txt`, 'utf8').split('\n')) {
  const w = line.trim();
  if (w && !rank.has(w)) rank.set(w, rank.size);
}

/** Candidate base forms, so inflections of dictionary words survive the filter. */
function bases(w) {
  const out = [];
  const rules = [
    ['ies', 'y'], ['es', ''], ['s', ''], ["'s", ''], ['ied', 'y'], ['ed', ''], ['ed', 'e'],
    ['ing', ''], ['ing', 'e'], ['ly', ''], ['er', ''], ['er', 'e'], ['est', ''], ['est', 'e'],
    ['ers', ''], ['ings', ''],
  ];
  for (const [suf, rep] of rules) if (w.endsWith(suf) && w.length > suf.length + 2) out.push(w.slice(0, -suf.length) + rep);
  const dbl = w.match(/^(.*?)([bdgklmnprt])\2(ed|ing|er|est)$/); // running -> run
  if (dbl) out.push(dbl[1] + dbl[2]);
  return out;
}
const keep = (w) => rank.has(w) || words.has(w) || bases(w).some((b) => words.has(b));

// Collect pronunciations per headword, variants in dictionary order.
const prons = new Map();
for (const line of readFileSync(`${root}data-src/cmudict.dict`, 'utf8').split('\n')) {
  if (!line || line.startsWith(';;;')) continue;
  const hash = line.indexOf('#');
  const body = (hash >= 0 ? line.slice(0, hash) : line).trim();
  const sp = body.indexOf(' ');
  if (sp < 0) continue;
  const word = body.slice(0, sp).replace(/\(\d+\)$/, '');
  if (!/^[a-z][a-z']*$/.test(word)) continue; // drop "a.", "at-bat" and other dotted/hyphenated entries
  const enc = encode(body.slice(sp + 1));
  const list = prons.get(word);
  if (list) { if (!list.includes(enc)) list.push(enc); } else prons.set(word, [enc]);
}

const lines = [`#rhymebench-lexicon 1 ranks=${rank.size}`];
let kept = 0;
for (const [word, list] of prons) {
  if (!keep(word)) continue;
  const r = rank.get(word);
  lines.push(`${word} ${list.join('|')}${r == null ? '' : ` ${r.toString(36)}`}`);
  kept++;
}
const out = `${root}apps/workbench/public/data/lexicon.txt`;
writeFileSync(out, lines.join('\n') + '\n');
console.log(`[build-lexicon] ${kept} of ${prons.size} headwords kept → ${out}`);
