/**
 * Playground composition — the SlantSmith surface fused onto the engine.
 *
 * Given a writer's line and a tapped word, one call returns two things side by
 * side:
 *   • sound targets — real rhymes from the engine, shaped by mode and by the
 *     syllable-difficulty dial (N = only N-syllable rhymes);
 *   • generated lines — template-built bars that land on those same real
 *     targets, fitted to the cadence (syllable count) of the writer's own line.
 *
 * The generated lines are idea-starters, not finished bars: every rhyme in them
 * is a genuine engine result, only the connective filler is templated.
 */
import type { Lexicon } from './lexicon.js';
import { buildMultis, type PhraseCandidate } from './phrase.js';
import { findInternalRhymes, type InternalRhymeResult } from './internal.js';
import { search, type RhymeResult } from './search.js';

export type PlayAction = 'slants' | 'internals' | 'dense';
export type PlayMode = 'best' | 'clean' | 'slant' | 'weird';

export interface PlaygroundOptions {
  /** the full input — up to four lines */
  text: string;
  /** the tapped word */
  target: string;
  /** the line the target sits in (cadence reference); defaults to the last line */
  line?: string;
  action?: PlayAction;
  mode?: PlayMode;
  /** difficulty: 0 = any length, N = only N-syllable rhyme targets */
  syllables?: number;
  /** 1 (light) .. 5 (packed): how many rhymes each generated line carries */
  density?: number;
  /** how many generated lines to return */
  count?: number;
  /** re-roll: same seed, same ideas; bump it for more */
  seed?: number;
}

export interface GeneratedLine {
  text: string;
  syllables: number;
  /** the real rhyme targets this line uses, end rhyme first */
  rhymes: string[];
  score: number; // 0..1
  /** echo = the writer's own line re-landed on a new rhyme */
  kind: 'echo' | 'end' | 'internal' | 'dense';
}

export interface PlaygroundResult {
  target: string;
  targetSyllables: number;
  lineSyllables: number;
  targets: RhymeResult[];
  phrases: PhraseCandidate[];
  /** the words in the writer's line the phrase targets replace */
  phraseSource: string[];
  internals: InternalRhymeResult;
  lines: GeneratedLine[];
}

const WORD_RE = /[A-Za-z']+/g;
/** entries safe to show and to drop into a line (no dotted/hyphenated CMU oddities) */
const USABLE = /^[a-z][a-z']*$/;

/** Phonetic syllable count of arbitrary text (CMU -> slang -> G2P per word). */
export function countSyllables(lex: Lexicon, text: string): number {
  let n = 0;
  for (const w of text.match(WORD_RE) ?? []) {
    if (!/[a-z]/i.test(w)) continue;
    const p = lex.resolve(w);
    n += p ? Math.max(1, p.count) : 1;
  }
  return n;
}

/* ── word classes (coarse, dictionary-free) ────────────────────────────── */

/** Closed-class words: fine as rhyme chips, never used to build a line. */
const FUNCTION = new Set(
  (
    'a an the and or but if as of in on at by for with from to up down out off over under into onto upon ' +
    'about above below behind beyond inside outside within without around across along among away aside ' +
    'again alone before after until unless although though through whether while where when what which who ' +
    'whom whose why how that this these those there here then than also just only even ever never always ' +
    'often maybe yes no not very too so such some any each every all both either neither none nothing ' +
    'something anything everything i me my you your he him his she her it its we us our they them their ' +
    'is am are was were be been being have has had do does did will would shall should can could may might must'
  ).split(' '),
);
const DETERMINERS = new Set(['the', 'my', 'your', 'a', 'an', 'his', 'her', 'our', 'their', 'this', 'that', 'no', 'every']);
/** -ed participles (designed, signed) and -ly adverbs (quickly) don't sit after "the"/"my". */
const PARTICIPLE = /^.{3,}(?:[^aeiou]ed|ied)$/;
const ADVERB = /^.{2,}[^aeiou]ly$/;

/** Can this word stand in a noun slot ("the ___", "my ___")? */
function nounish(w: string): boolean {
  return !FUNCTION.has(w) && !PARTICIPLE.test(w) && !ADVERB.test(w);
}

/* ── mode shaping ─────────────────────────────────────────────────────── */

const MODE_DISTANCE: Record<PlayMode, number> = { best: 0.5, clean: 0.3, slant: 0.6, weird: 0.75 };

function shapeByMode(mode: PlayMode, rs: RhymeResult[]): RhymeResult[] {
  let out: RhymeResult[];
  switch (mode) {
    case 'clean':
      out = rs.filter((r) => r.tier === 'perfect' || r.tier === 'multi');
      break;
    case 'slant':
      out = rs.filter((r) => r.tier === 'slant' || r.tier === 'multi');
      break;
    case 'weird':
      // loose, unexpected, but still real words — most familiar of the odd ones first
      out = rs
        .filter((r) => (r.tier === 'assonance' || r.tier === 'slant') && r.score < 0.85)
        .sort((a, b) => b.commonness - a.commonness || b.score - a.score);
      break;
    default:
      out = rs.slice();
  }
  // Prefer words a writer would actually use; fall back if that empties the set.
  const common = out.filter((r) => r.commonness > 0);
  return common.length >= 6 ? common : out;
}

/* ── generation ───────────────────────────────────────────────────────── */

const BANK = {
  S: ['I', 'we', 'they', 'you', 'my whole team', 'the real ones', 'all my people'],
  V: ['move', 'build', 'flip', 'turn', 'chase', 'keep', 'hold', 'run', 'spend', 'burn', 'carry', 'prove', 'break', 'make', 'count', 'stack', 'ride', 'write', 'light'],
  N: ['pressure', 'vision', 'moment', 'future', 'city', 'rhythm', 'pages', 'paper', 'weight', 'crown', 'fire', 'pain', 'flow', 'grind', 'dream', 'spotlight', 'story', 'engine', 'signal', 'echo', 'night', 'game'],
  A: ['cold', 'heavy', 'quiet', 'golden', 'loud', 'patient', 'reckless', 'brand new', 'late-night', 'high'],
};

/**
 * Frames keyed by rhyme load. {R} is the end rhyme; {R1..R3} ride inside;
 * {P} is a phrase target. A `:n` suffix marks a noun slot (after the/my/a),
 * which only accepts nounish words; unmarked rhyme slots sit after a comma or
 * "call it"/"that's", where any word class reads naturally.
 */
const FRAMES: Record<number, string[]> = {
  1: [
    '{S} {V} the {N} for the {R:n}',
    '{A} {N}, call it {R}',
    "{S} {V} my {N}, that's {R}",
    'every {N} I {V}, {R}',
    '{S} {V} it all, {R}',
    'on my {N}, on my {R:n}',
    'keep the {N} {A}, {R}',
    '{S} {V} the {N} like the {R:n}',
  ],
  2: [
    '{R1:n} in the {N}, {S} {V}, {R}',
    '{S} {V} the {R1:n}, {S2} {V2} the {R:n}',
    'from the {R1:n} to the {R:n}',
    '{A} {R1:n}, {A2} {R:n}',
    '{N} on my {R1:n}, {N2} on my {R:n}',
    'call it {R1}, call it {R}',
    '{S} {V} it {R1}, {S2} {V2} it {R}',
    "that's {R1}, that's {R}",
  ],
  3: [
    '{R1}, {R2}, {S} {V} the {R:n}',
    '{R1:n} with the {R2:n}, {N} on the {R:n}',
    '{R1}, {R2}, call it {R}',
    "{R1}, {R2}, that's {R}",
    '{S} {V} the {R1:n}, {R2:n} in the {R:n}',
  ],
  4: [
    '{P}, {R1:n} to the {R2:n}, {R}',
    '{R1}, {R2}, {R3}, call it {R}',
    '{R1:n} in the {R2:n}, {P}, {R}',
  ],
};

const RHYMES_PER_LINE: Record<PlayAction, number[]> = {
  slants: [1, 1, 2, 2, 3],
  internals: [2, 2, 2, 3, 3],
  dense: [2, 3, 3, 4, 4],
};

interface Slot {
  key: string; // R, R1, R2, R3
  noun: boolean;
}

const slotsOf = (frame: string): Slot[] =>
  [...frame.matchAll(/\{(R\d?)(:n)?\}/g)].map((m) => ({ key: m[1], noun: !!m[2] }));

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Capitalize the line and fix a lowercase standalone "i". */
const tidy = (s: string) => {
  const t = s.replace(/\bi\b/g, 'I');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

/** Index of the last occurrence of `target` among the line's words, or -1. */
function lastIndexOfWord(words: string[], target: string): number {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].toLowerCase() === target) return i;
  return -1;
}

/** Replace the last occurrence of `target` in `line` with `word` (keeps the rest verbatim). */
function replaceLast(line: string, target: string, word: string): string | null {
  const matches = [...line.matchAll(WORD_RE)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m[0].toLowerCase() === target && m.index != null) {
      return line.slice(0, m.index) + word + line.slice(m.index + m[0].length);
    }
  }
  return null;
}

function scoreLine(
  lex: Lexicon,
  text: string,
  used: RhymeResult[],
  rhymes: string[],
  kind: GeneratedLine['kind'],
  lineSyllables: number,
  rng: () => number,
): GeneratedLine {
  const syllables = countSyllables(lex, text);
  // cadence: how close the bar sits to the writer's own line length
  const cadence = 1 - Math.min(1, Math.abs(syllables - lineSyllables) / Math.max(4, lineSyllables));
  const rhymeScore = used.reduce((s, r) => s + r.score, 0) / used.length;
  const common = used.reduce((s, r) => s + r.commonness, 0) / used.length;
  const score = Math.min(1, 0.45 * rhymeScore + 0.35 * cadence + 0.2 * common + rng() * 0.05);
  return { text, syllables, rhymes, score, kind };
}

interface ComposeArgs {
  target: string;
  action: PlayAction;
  density: number;
  count: number;
  seed: number;
  refLine: string;
  lineSyllables: number;
  targets: RhymeResult[];
  phrases: PhraseCandidate[];
}

function composeLines(lex: Lexicon, a: ComposeArgs): GeneratedLine[] {
  // Build from familiar content words; the full target list stays available as chips.
  const content = a.targets.filter((r) => !FUNCTION.has(r.word));
  let pool = content.filter((r) => r.commonness >= 0.35);
  if (pool.length < 4) pool = content.filter((r) => r.commonness > 0);
  if (pool.length < 2) pool = content;
  pool = pool.slice(0, 24);
  if (!pool.length) return [];

  // "More ideas" rotates which targets lead, so re-rolls surface new endings.
  const rot = ((a.seed - 1) * Math.max(2, a.count)) % pool.length;
  pool = pool.slice(rot).concat(pool.slice(0, rot));

  const rng = mulberry32(hash(`${a.target}|${a.action}|${a.density}`) ^ Math.imul(a.seed, 2654435761));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const pickOther = <T>(arr: T[], not: T): T => {
    let x = pick(arr);
    for (let g = 0; x === not && g < 8; g++) x = pick(arr);
    return x;
  };
  const shuffle = <T>(arr: T[]): T[] => {
    const c = arr.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  };

  // Frames for this rhyme load that the pool (and phrase list) can actually fill.
  const want = RHYMES_PER_LINE[a.action][a.density - 1];
  let frames: string[] = [];
  for (let k = want; k >= 1 && !frames.length; k--) {
    frames = FRAMES[k].filter((f) => slotsOf(f).length <= pool.length && (a.phrases.length > 0 || !f.includes('{P}')));
  }
  const kind: GeneratedLine['kind'] = a.action === 'slants' ? 'end' : a.action === 'internals' ? 'internal' : 'dense';

  type Cand = GeneratedLine & { frame: string };
  const cands: Cand[] = [];
  const tries = a.count * 40;
  for (let t = 0; t < tries && frames.length; t++) {
    const frame = pick(frames);
    const slots = slotsOf(frame);
    const endSlot = slots.find((s) => s.key === 'R');
    if (!endSlot) continue;

    // End rhyme: walk the (rotated) pool so successive tries land on new endings.
    let end: RhymeResult | undefined;
    for (let j = 0; j < pool.length && !end; j++) {
      const c = pool[(t + j) % pool.length];
      if (!endSlot.noun || nounish(c.word)) end = c;
    }
    if (!end) continue;

    // Inner rhymes: distinct, and class-appropriate for their slot.
    const fill: Record<string, RhymeResult> = { R: end };
    const used = new Set([end.word]);
    const inner = shuffle(pool.slice(0, 16));
    let ok = true;
    for (const s of slots) {
      if (s.key === 'R') continue;
      const c = inner.find((x) => !used.has(x.word) && (!s.noun || nounish(x.word)));
      if (!c) { ok = false; break; }
      fill[s.key] = c;
      used.add(c.word);
    }
    if (!ok) continue;

    let phrase = '';
    if (frame.includes('{P}')) {
      const usable = a.phrases.filter((p) => !used.has(p.words[p.words.length - 1]));
      if (!usable.length) continue;
      phrase = pick(usable).phrase;
    }

    const values: Record<string, string> = {
      S: pick(BANK.S),
      V: pick(BANK.V),
      N: pick(BANK.N),
      A: pick(BANK.A),
      P: phrase,
    };
    values.S2 = pickOther(BANK.S, values.S);
    values.V2 = pickOther(BANK.V, values.V);
    values.N2 = pickOther(BANK.N, values.N);
    values.A2 = pickOther(BANK.A, values.A);
    for (const [k, r] of Object.entries(fill)) values[k] = r.word;

    const text = tidy(frame.replace(/\{(\w+)(?::n)?\}/g, (_m: string, key: string) => values[key] ?? ''));
    const inside = slots.filter((s) => s.key !== 'R').map((s) => fill[s.key]);
    const rhymes = [end.word, ...inside.map((r) => r.word), ...(phrase ? [phrase] : [])];
    cands.push({ ...scoreLine(lex, text, [end, ...inside], rhymes, kind, a.lineSyllables, rng), frame });
  }

  // Echoes: the writer's own line, re-landed on a new rhyme — keeps their cadence
  // exactly. Only for real lines (3+ words), and respecting the replaced slot:
  // "on my mind" wants a noun ("my kind"), not "my designed".
  const refWords = a.refLine.match(WORD_RE) ?? [];
  if (a.action === 'slants' && refWords.length >= 3) {
    const at = lastIndexOfWord(refWords, a.target);
    const needNoun = at > 0 && DETERMINERS.has(refWords[at - 1].toLowerCase());
    for (const r of pool.filter((x) => !needNoun || nounish(x.word)).slice(0, 10)) {
      const text = replaceLast(a.refLine, a.target, r.word);
      if (text && text.toLowerCase() !== a.refLine.toLowerCase()) {
        cands.push({ ...scoreLine(lex, text, [r], [r.word], 'echo', a.lineSyllables, rng), frame: 'echo' });
      }
    }
  }

  // Best first, but varied: pass 0 wants a new end rhyme, a new frame (so
  // results don't all read "call it X, call it Y") and no rhyme already spent
  // on an earlier line (so the top target doesn't appear in every bar); pass 1
  // relaxes the rhyme reuse, pass 2 the frame, pass 3 fills any gap — each
  // non-final pass still wants a new end rhyme (a rhyme chain, not four bars
  // on one word).
  cands.sort((x, y) => y.score - x.score || x.text.localeCompare(y.text));
  const out: GeneratedLine[] = [];
  const seenText = new Set<string>();
  const seenEnd = new Set<string>();
  const seenFrame = new Set<string>();
  const seenRhyme = new Set<string>();
  // same frame + same rhyme set = the same bar reordered ("call it A, call it B" / "call it B, call it A")
  const seenShape = new Set<string>();
  const shapeOf = (c: Cand) => `${c.frame}|${[...c.rhymes].sort().join(',')}`;
  const echoCap = Math.ceil(a.count / 2);
  let echoes = 0;
  for (const pass of [0, 1, 2, 3]) {
    for (const c of cands) {
      if (out.length >= a.count) break;
      const key = c.text.toLowerCase();
      if (seenText.has(key) || seenShape.has(shapeOf(c))) continue;
      if (c.kind === 'echo' && echoes >= echoCap) continue;
      if (pass < 3 && seenEnd.has(c.rhymes[0])) continue;
      if (pass < 2 && seenFrame.has(c.frame)) continue;
      if (pass === 0 && c.rhymes.some((r) => seenRhyme.has(r))) continue;
      const { frame, ...line } = c;
      out.push(line);
      seenText.add(key);
      seenShape.add(shapeOf(c));
      seenEnd.add(c.rhymes[0]);
      seenFrame.add(frame);
      for (const r of c.rhymes) seenRhyme.add(r);
      if (c.kind === 'echo') echoes++;
    }
  }
  return out;
}

/* ── entry point ──────────────────────────────────────────────────────── */

export function playground(lex: Lexicon, opts: PlaygroundOptions): PlaygroundResult {
  const target = (opts.target ?? '').toLowerCase().trim();
  const action: PlayAction = opts.action ?? 'slants';
  const mode: PlayMode = opts.mode ?? 'best';
  const density = Math.min(5, Math.max(1, Math.round(opts.density ?? 3)));
  const count = Math.max(1, Math.min(12, Math.round(opts.count ?? 4)));
  const seed = Math.max(1, Math.floor(opts.seed ?? 1));
  const text = opts.text ?? '';
  const refLine = opts.line ?? text.split('\n').filter((l) => l.trim()).pop() ?? '';
  const lineSyllables = countSyllables(lex, refLine) || 8;
  const internals = findInternalRhymes(lex, text, 0.8);

  const empty: PlaygroundResult = {
    target,
    targetSyllables: 0,
    lineSyllables,
    targets: [],
    phrases: [],
    phraseSource: [],
    internals,
    lines: [],
  };
  if (!target || !/[a-z]/.test(target)) return empty;
  const tp = lex.resolve(target);
  if (!tp) return empty;

  const raw = search(lex, target, {
    maxDistance: MODE_DISTANCE[mode],
    limit: 400,
    syllables: opts.syllables && opts.syllables > 0 ? opts.syllables : undefined,
  });
  const targets = shapeByMode(mode, raw.filter((r) => USABLE.test(r.word))).slice(0, 60);

  // Phrase targets for Densify: match the two words ending at the target.
  const refWords = refLine.match(WORD_RE) ?? [];
  const srcIdx = lastIndexOfWord(refWords, target);
  const phraseSource = srcIdx > 0 ? [refWords[srcIdx - 1].toLowerCase(), target] : [target];
  let phrases: PhraseCandidate[] = [];
  if (action === 'dense' && phraseSource.length === 2) {
    const m = buildMultis(lex, phraseSource.join(' '), { perWord: 20, maxResults: 80 });
    phrases = [...m.buckets.exact, ...m.buckets.strong, ...m.buckets.loose]
      .filter((c) => {
        const last = c.words[c.words.length - 1];
        if (last === target) return false; // only the throwaway word changed
        if (!c.words.every((w) => USABLE.test(w) && lex.commonness(w) > 0.2)) return false;
        const lead = c.words.slice(0, -1);
        // a function-word lead ("my") stays put — "buy find"/"i kind" are noise;
        // a content-word lead may vary but not into another function word
        const leadOk = lead.every((w, i) =>
          FUNCTION.has(phraseSource[i]) ? w === phraseSource[i] : w === phraseSource[i] || !FUNCTION.has(w),
        );
        const tail = lead[lead.length - 1];
        return leadOk && (!DETERMINERS.has(tail) || nounish(last)); // "my kind", not "my signed"
      })
      .slice(0, 16);
  }

  const lines = composeLines(lex, {
    target,
    action,
    density,
    count,
    seed,
    refLine,
    lineSyllables,
    targets,
    phrases,
  });

  return { target, targetSyllables: tp.count, lineSyllables, targets, phrases, phraseSource, internals, lines };
}
