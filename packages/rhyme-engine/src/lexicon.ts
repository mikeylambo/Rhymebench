/**
 * The lexicon: owns the pronunciation dictionary in memory (the compact payload
 * built from CMU by scripts/build-lexicon.mjs, or a raw cmudict.dict), the
 * fallback chain (dictionary -> slang supplement -> rule-based G2P), a frequency
 * ranking used to surface common/usable words first, and the reverse indexes
 * that make rhyme search fast.
 *
 * Every CMU headword is analysed ONCE at load and stored, so queries are pure
 * scoring with no re-parsing.
 */
import { analyze, parsePhones, rimeKey, type Pron } from './pronunciation.js';
import { base, isVowel, stress } from './arpabet.js';
import { g2p } from './g2p.js';
import { SUPPLEMENT } from './slang.js';

/**
 * Compact payload encoding (scripts/build-lexicon.mjs): one character per
 * phoneme, index-aligned with PHONEMES, a vowel followed by its stress digit.
 * Must match the build script exactly, index for index.
 */
const PHONEMES = [
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'EH', 'ER', 'EY', 'F',
  'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P', 'R', 'S',
  'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH',
];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM';
const PHONEME_OF = new Map([...ALPHABET].map((c, i) => [c, PHONEMES[i]]));
export const COMPACT_HEADER = '#rhymebench-lexicon';

/** "Ac0Lq1Dc0w" -> "P AH0 Z IH1 SH AH0 N" */
function decodePron(enc: string): string {
  const out: string[] = [];
  for (let i = 0; i < enc.length; i++) {
    const ph = PHONEME_OF.get(enc[i]);
    if (!ph) throw new Error(`lexicon: bad phoneme code "${enc[i]}"`);
    const next = enc[i + 1];
    if (next >= '0' && next <= '2') { out.push(ph + next); i++; } else out.push(ph);
  }
  return out.join(' ');
}

/** Key: the base vowel of a word's last stressed vowel (its rhyme anchor). */
function anchorVowel(phones: string[]): string {
  let anchor = '';
  let lastVowel = '';
  for (const p of phones) {
    if (!isVowel(p)) continue;
    lastVowel = base(p);
    if (stress(p) === 1) anchor = base(p);
  }
  return anchor || lastVowel;
}

export class Lexicon {
  /** word -> analysed primary pronunciation */
  private prons = new Map<string, Pron>();
  /** word -> all raw pronunciation strings (variants), for pronsOf() */
  private variants = new Map<string, string[]>();
  /** exact rime key -> words (perfect-rhyme lookup) */
  private byRime = new Map<string, Set<string>>();
  /** anchor vowel -> words (slant candidate pool) */
  private byAnchor = new Map<string, Set<string>>();
  /** word -> frequency rank (0 = most common); absent = rare/unranked */
  private rank = new Map<string, number>();
  private rankSize = 1;
  /** resolved pronunciations for OOV words (slang/g2p) */
  private oovCache = new Map<string, Pron | null>();

  size = 0;
  loaded = false;

  loadFromDict(text: string): void {
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line || line.startsWith(';;;')) continue;
      const hash = line.indexOf('#');
      const body = hash >= 0 ? line.slice(0, hash) : line;
      const sp = body.indexOf(' ');
      if (sp < 0) continue;
      let word = body.slice(0, sp).trim();
      const phoneStr = body.slice(sp + 1).trim();
      if (!word || !phoneStr) continue;
      const variant = word.match(/^(.*)\((\d+)\)$/);
      const isVariant = !!variant;
      if (variant) word = variant[1];

      const v = this.variants.get(word);
      if (v) v.push(phoneStr);
      else this.variants.set(word, [phoneStr]);

      // index only the primary (first) pronunciation
      if (isVariant || this.prons.has(word)) continue;
      this.indexPrimary(word, phoneStr);
    }
    this.size = this.prons.size;
    this.loaded = true;
  }

  /**
   * Load the compact payload built by scripts/build-lexicon.mjs — pronunciations,
   * variants and frequency ranks in one file (see that script for the format).
   */
  loadCompact(text: string): void {
    const lines = text.split('\n');
    const header = lines[0] ?? '';
    if (!header.startsWith(COMPACT_HEADER)) throw new Error('lexicon: not a compact payload');
    const ranks = Number(/ranks=(\d+)/.exec(header)?.[1] ?? 0);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const [word, encs, r] = line.split(' ');
      if (!word || !encs) continue;
      const phoneStrs = encs.split('|').map(decodePron);
      this.variants.set(word, phoneStrs);
      if (!this.prons.has(word)) this.indexPrimary(word, phoneStrs[0]);
      if (r) this.rank.set(word, parseInt(r, 36));
    }
    this.rankSize = Math.max(1, ranks || this.rank.size);
    this.size = this.prons.size;
    this.loaded = true;
  }

  /** Analyse a headword's primary pronunciation once and add it to the indexes. */
  private indexPrimary(word: string, phoneStr: string): void {
    const phones = parsePhones(phoneStr);
    const pron = analyze(phones, 'cmu');
    this.prons.set(word, pron);

    const rk = rimeKey(pron.rime);
    let set = this.byRime.get(rk);
    if (!set) this.byRime.set(rk, (set = new Set()));
    set.add(word);

    const anchor = anchorVowel(phones);
    let aset = this.byAnchor.get(anchor);
    if (!aset) this.byAnchor.set(anchor, (aset = new Set()));
    aset.add(word);
  }

  /** Load the compact frequency asset (one word per line, line = rank). */
  loadFrequencies(text: string): void {
    const lines = text.split('\n');
    let r = 0;
    for (const line of lines) {
      const w = line.trim();
      if (!w) continue;
      if (!this.rank.has(w)) this.rank.set(w, r++);
    }
    this.rankSize = Math.max(1, r);
  }

  /**
   * Commonness of a word, 0..1 (1 = extremely common). Log-scaled from rank so
   * the difference between rank 5 and 50 matters more than 5000 vs 5050.
   */
  commonness(word: string): number {
    const r = this.rank.get(word);
    if (r == null) return 0;
    return 1 - Math.log(1 + r) / Math.log(1 + this.rankSize);
  }

  has(word: string): boolean {
    return this.prons.has(word.toLowerCase());
  }

  pronsOf(word: string): Pron[] {
    const arr = this.variants.get(word.toLowerCase());
    if (!arr) return [];
    return arr.map((s) => analyze(parsePhones(s), 'cmu'));
  }

  /** CMU -> slang -> G2P fallback chain. */
  resolve(word: string): Pron | null {
    const w = word.toLowerCase().trim();
    const cmu = this.prons.get(w);
    if (cmu) return cmu;
    if (this.oovCache.has(w)) return this.oovCache.get(w)!;
    let pron: Pron | null = null;
    if (SUPPLEMENT[w]) pron = analyze(parsePhones(SUPPLEMENT[w]), 'slang');
    else {
      const phones = g2p(w);
      if (phones.length) pron = analyze(phones, 'g2p');
    }
    this.oovCache.set(w, pron);
    return pron;
  }

  wordsByRime(key: string): Set<string> {
    return this.byRime.get(key) ?? new Set();
  }

  wordsByAnchor(anchor: string): Set<string> {
    return this.byAnchor.get(anchor) ?? new Set();
  }

  get anchors(): string[] {
    return [...this.byAnchor.keys()];
  }

  *entries(): Generator<[string, Pron]> {
    yield* this.prons.entries();
  }
}
