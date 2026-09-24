#!/usr/bin/env node
/**
 * build-definitions.mjs — regenerates apps/workbench/public/data/definitions.txt,
 * the offline definitions payload, from Princeton WordNet 3.0.
 *
 * A data generator, NOT part of `npm run build` — the output is committed. Run it
 * when the word set or the formatting below changes:
 *
 *     curl -LO https://wordnetcode.princeton.edu/3.0/WNdb-3.0.tar.gz
 *     tar -xzf WNdb-3.0.tar.gz dict/
 *     node scripts/build-definitions.mjs --wordnet ./dict [--top 20000]
 *
 * Word set: the `--top` most common words (data-src/freq.txt) that WordNet knows,
 * plus every word in data-src/definition-words.txt (Barsmith's defined word banks, so
 * nothing Barsmith can define is lost here). Inflections are not stored — the app
 * falls back from "designed" to "design" at lookup.
 *
 * Format matches Barsmith's src/data/definitions.txt, one word per line:
 *   <word> <pos>|<gloss>[·<pos>|<gloss>]
 * Up to two senses: the first sense of the part of speech the word is most used as
 * (WordNet's tagged-sense counts), then the first sense of its next part of speech,
 * or that POS's second sense if it has only one.
 *
 * WordNet 3.0 Copyright 2006 by Princeton University — its licence notice travels
 * with the payload in public/data/LICENSE-DATA.txt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const WN = arg('--wordnet', null);
const TOP = Number(arg('--top', 20000));
if (!WN) {
  console.error('[build-definitions] pass --wordnet <path to WordNet 3.0 dict/>');
  process.exit(1);
}

const POS = [
  ['noun', 'noun'],
  ['verb', 'verb'],
  ['adj', 'adj'],
  ['adv', 'adv'],
];
const MAX_GLOSS = 110;

// offset -> gloss, per data file
const glossOf = {};
for (const [file] of POS) {
  const map = new Map();
  for (const line of readFileSync(`${WN}/data.${file}`, 'utf8').split('\n')) {
    if (!line || line.startsWith('  ')) continue; // licence header lines start with two spaces
    const bar = line.indexOf(' | ');
    if (bar < 0) continue;
    map.set(line.slice(0, 8), line.slice(bar + 3).trim());
  }
  glossOf[file] = map;
}

/** Definition part of a gloss (examples start at `; "`), trimmed for a compact panel. */
function clean(gloss) {
  let g = gloss.split(/;\s*"/)[0].trim().replace(/\s+/g, ' ');
  if (g.length > MAX_GLOSS) g = g.slice(0, MAX_GLOSS - 1).replace(/[\s,;:]+\S*$/, '') + '…';
  return g;
}

// lemma -> [{ pos, tagged, offsets }]
const senses = new Map();
for (const [file, label] of POS) {
  for (const line of readFileSync(`${WN}/index.${file}`, 'utf8').split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const f = line.trim().split(' ');
    const lemma = f[0];
    if (!/^[a-z][a-z']*$/.test(lemma)) continue; // single plain words only (no collocations)
    const synsetCnt = Number(f[2]);
    const pCnt = Number(f[3]);
    const tagged = Number(f[5 + pCnt]);
    const offsets = f.slice(6 + pCnt, 6 + pCnt + synsetCnt);
    const list = senses.get(lemma) ?? [];
    list.push({ file, pos: label, tagged, offsets });
    senses.set(lemma, list);
  }
}

const want = new Set();
let r = 0;
for (const line of readFileSync(`${root}data-src/freq.txt`, 'utf8').split('\n')) {
  const w = line.trim();
  if (!w) continue;
  if (r++ >= TOP) break;
  want.add(w);
}
for (const w of readFileSync(`${root}data-src/definition-words.txt`, 'utf8').split('\n')) if (w.trim()) want.add(w.trim());

const lines = [];
for (const word of [...want].sort()) {
  const list = senses.get(word);
  if (!list) continue;
  const order = ['noun', 'verb', 'adj', 'adv'];
  list.sort((a, b) => b.tagged - a.tagged || order.indexOf(a.pos) - order.indexOf(b.pos));
  const picks = [];
  const [top, next] = list;
  const add = (s, i) => {
    const g = glossOf[s.file].get(s.offsets[i]);
    if (g) picks.push(`${s.pos}|${clean(g)}`);
  };
  add(top, 0);
  if (next) add(next, 0);
  else if (top.offsets.length > 1) add(top, 1);
  if (picks.length) lines.push(`${word} ${picks.join('·')}`);
}

const out = `${root}apps/workbench/public/data/definitions.txt`;
writeFileSync(out, lines.join('\n') + '\n');
console.log(`[build-definitions] ${lines.length} words defined → ${out}`);
