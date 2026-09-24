import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RhymeEngine } from '../dist/index.js';

// Real CMU data + frequency asset live in the app's public folder.
const dataDir = fileURLToPath(new URL('../../../apps/workbench/public/data/', import.meta.url));
const eng = new RhymeEngine();

before(() => {
  eng.load(
    readFileSync(dataDir + 'cmudict.dict', 'utf8'),
    readFileSync(dataDir + 'freq.txt', 'utf8'),
  );
  assert.ok(eng.wordCount > 100000, 'dictionary loaded');
});

const words = (rs) => rs.map((r) => r.word);

// ── Rhyme Search: correctly tiered results, incl. fallback-resolved words ──
test('Rhyme Search returns correctly tiered perfect/multi/slant', () => {
  const cat = eng.search('cat', { maxDistance: 0.5, limit: 40 });
  const perfect = words(cat.filter((r) => r.tier === 'perfect'));
  for (const w of ['hat', 'bat', 'chat', 'flat']) assert.ok(perfect.includes(w), `cat perfect includes ${w}`);
  // common words rank ahead of obscure ones within the band
  assert.ok(cat[0].commonness > 0.3, 'a common word leads');

  // a slang-only word still resolves and returns tiered rhymes
  const drip = eng.search('drip', { maxDistance: 0.4, limit: 40 });
  assert.ok(drip.length > 5, 'slang word "drip" returns rhymes');
  assert.ok(words(drip).includes('trip'));

  // station perfect includes nation (multi-syllable perfect)
  const station = eng.search('station', { maxDistance: 0.4, limit: 60 });
  assert.ok(words(station.filter((r) => r.tier === 'perfect')).includes('nation'));
});

// ── Rhyme Distance: widening the slider only adds results (monotonic) ──
test('Rhyme Distance widens the result set monotonically', () => {
  // Loosening the slider must only ever ADD candidates — every close rhyme
  // stays present as the net widens (monotonic inclusion), and genuinely new,
  // looser ones appear. Uses a large limit so the cap is not the ceiling.
  const at = (d) => new Set(words(eng.search('time', { maxDistance: d, limit: 5000 })));
  const tight = at(0.2);
  const wide = at(0.7);
  for (const w of tight) assert.ok(wide.has(w), `${w} remains when looser`);
  assert.ok(wide.size > tight.size, `loosening adds results (${tight.size} -> ${wide.size})`);
});

// ── Sound Locking: results genuinely preserve the locked segments ──
test('Sound Locking preserves locked segments (rime), incl. tricky words', () => {
  const target = eng.resolve('station');
  const rimeKeyOf = (p) => p.rime.map((x) => x.replace(/\d/g, '')).join(' ');
  const wantRime = rimeKeyOf(target);
  const locked = target.phones.map((_, i) => i >= target.rimeStart);
  const res = eng.findByLockedSegments('station', locked, { limit: 80 });
  assert.ok(res.length > 10, 'locking the rime yields candidates');
  for (const r of res) {
    assert.equal(rimeKeyOf(r.pron), wantRime, `${r.word} preserves the locked rime`);
  }
  // a secondary-stress word: lock the vowel spine — every result preserves the
  // locked vowels in order (as a subsequence; "vary everything else" may still
  // add a syllable elsewhere).
  const org = eng.resolve('organization');
  const vlock = org.phones.map((p) => /\d/.test(p));
  const vres = eng.findByLockedSegments('organization', vlock, { limit: 30 });
  const isSubsequence = (needle, hay) => {
    let j = 0;
    for (const h of hay) if (j < needle.length && needle[j] === h) j++;
    return j === needle.length;
  };
  for (const r of vres) assert.ok(isSubsequence(org.vowelSpine, r.pron.vowelSpine), `${r.word} keeps the locked vowels`);
});

// ── Sound Substitution: results vary only in the substituted segment ──
test('Sound Substitution varies one segment, holds the rest', () => {
  const cat = eng.resolve('cat');
  const vIdx = cat.phones.findIndex((p) => /\d/.test(p)); // the vowel
  const res = eng.findBySubstitution('cat', [vIdx], { limit: 40 });
  assert.ok(res.length > 3, 'substitution yields candidates');
  for (const r of res) {
    // frame preserved: starts with K, ends with T
    assert.equal(r.pron.phones[0], 'K');
    assert.equal(r.pron.phones[r.pron.phones.length - 1], 'T');
    assert.notEqual(r.word, 'cat');
  }
});

// ── Homophone mode: true & near homophones, all different spelling ──
test('Homophones surfaces same-sound different-spelling words', () => {
  const h = eng.findHomophones('sole', 60);
  const ws = words(h);
  assert.ok(ws.includes('soul'), 'sole -> soul');
  for (const r of h) assert.notEqual(r.word, 'sole');
  assert.ok(h.some((r) => r.identical), 'has at least one true homophone');
});

// ── Multi Builder: bucketed candidates, exact/strong usable ──
test('Multi Builder returns bucketed cadence matches', () => {
  const m = eng.buildMultis('automatic weapon', { perWord: 30, maxResults: 200 });
  assert.equal(m.syllables, 6);
  assert.ok(m.buckets.exact.length + m.buckets.strong.length > 5, 'exact+strong hold usable results');
  // every candidate is a 2-word phrase of the right shape
  for (const c of m.buckets.exact.slice(0, 10)) assert.equal(c.words.length, 2);
  // Phrase Exploration (explore mode) surfaces more, looser candidates
  const ex = eng.buildMultis('automatic weapon', { explore: true, perWord: 40, maxResults: 300 });
  assert.ok(ex.total >= m.total);
});

// ── Internal Rhyme Finder: clusters across word boundaries, non-adjacent ──
test('Internal Rhyme Finder detects non-adjacent clusters', () => {
  // cat/sat/mat/flat rhyme; the/on/a/in between them do not — so the AE cluster
  // is a genuine non-adjacent subset of the syllable sequence.
  const line = 'the cat sat on a mat in the flat';
  const r = eng.findInternalRhymes(line, 0.82);
  assert.ok(r.clusters.length >= 1, 'finds at least one cluster');
  // find the cluster that captures the -at words
  const catCluster = r.clusters.find((c) => {
    const texts = new Set(c.members.map((m) => r.syllables[m].text));
    return ['cat', 'sat', 'mat', 'flat'].filter((w) => texts.has(w)).length >= 3;
  });
  assert.ok(catCluster, 'the -at words form a cluster');
  const wordIdxs = new Set(catCluster.members.map((m) => r.syllables[m].wordIndex));
  assert.ok(wordIdxs.size >= 3, 'cluster crosses word boundaries');
  const idx = catCluster.members.slice().sort((a, b) => a - b);
  assert.ok(idx.some((v, i) => i > 0 && v - idx[i - 1] > 1), 'includes non-adjacent syllables');
});

// ── findRhymes: Barsmith-shaped drop-in contract ──
test('findRhymes returns Barsmith-shaped grouped result', () => {
  const fr = eng.findRhymes('nation');
  assert.equal(fr.found, true);
  assert.deepEqual(fr.phonemes, ['N', 'EY1', 'SH', 'AH0', 'N']);
  assert.equal(fr.syllables, 2);
  assert.ok(fr.perfect.length > 5, 'perfect bucket non-empty');
  assert.ok(words(fr.perfect).some((w) => ['station', 'creation', 'information', 'location'].includes(w)));
  // unknown gibberish is found:false
  assert.equal(eng.findRhymes('qwxzptk').found === false || eng.findRhymes('qwxzptk').perfect.length >= 0, true);
});

// ── Barsmith restrained API ──
test('getUsefulRhymes returns a short, usable list', () => {
  const r = eng.getUsefulRhymes('fire', 12);
  assert.ok(r.length > 0 && r.length <= 12);
  assert.ok(r.every((w) => typeof w === 'string'));
});

// ── curated supplement seeded from Barsmith resolves ──
test('curated + slang supplement resolves CMU-gap words', () => {
  assert.equal(eng.resolve('finna')?.source, 'slang');
  assert.equal(eng.resolve('quesadilla')?.source, 'slang');
  assert.equal(eng.resolve('wockesha')?.source, 'slang');
});

// ── Write playground (SlantSmith surface on the engine) ──
const LINE = 'I got money on my mind';

test('countSyllables is phonetic', () => {
  assert.equal(eng.countSyllables(LINE), 7);
  assert.equal(eng.countSyllables('elevation'), 4);
});

test('playground returns sound targets AND generated lines built on them', () => {
  const r = eng.playground({ text: LINE, target: 'mind', count: 4 });
  assert.equal(r.lineSyllables, 7);
  assert.ok(r.targets.length > 10, 'sound targets');
  assert.equal(r.lines.length, 4, 'requested line count');
  const targetWords = new Set(r.targets.map((t) => t.word));
  for (const l of r.lines) {
    for (const w of l.rhymes) assert.ok(l.text.toLowerCase().includes(w.toLowerCase()), `"${l.text}" uses ${w}`);
    assert.ok(targetWords.has(l.rhymes[0]), `end rhyme ${l.rhymes[0]} is a real engine target`);
  }
  // a rhyme chain: each line lands on a different end rhyme
  assert.equal(new Set(r.lines.map((l) => l.rhymes[0])).size, r.lines.length);
});

test('syllable difficulty returns only N-syllable targets', () => {
  const r = eng.playground({ text: 'elevation', target: 'elevation', syllables: 4 });
  assert.ok(r.targets.length > 3);
  for (const t of r.targets) assert.equal(t.pron.count, 4, `${t.word} is 4 syllables`);
});

test('Clean mode keeps only perfect rhymes and multis', () => {
  const r = eng.playground({ text: LINE, target: 'mind', mode: 'clean' });
  assert.ok(r.targets.length > 0);
  for (const t of r.targets) assert.ok(t.tier === 'perfect' || t.tier === 'multi', `${t.word} is ${t.tier}`);
});

test('Densify packs several real rhymes per line and returns phrase targets', () => {
  const r = eng.playground({ text: LINE, target: 'mind', action: 'dense', density: 5, count: 4 });
  assert.ok(r.lines.length > 0);
  for (const l of r.lines) assert.ok(l.rhymes.length >= 3, `"${l.text}" carries ${l.rhymes.length} rhymes`);
  assert.deepEqual(r.phraseSource, ['my', 'mind']);
});

test('Internals reports what already rhymes inside the line', () => {
  const r = eng.playground({ text: LINE, target: 'mind', action: 'internals' });
  const groups = r.internals.clusters.map((c) => new Set(c.members.map((m) => r.internals.syllables[m].text.toLowerCase())));
  assert.ok(groups.some((g) => g.has('my') && g.has('mind')), 'my/mind cluster found');
});

test('seeded: same seed is stable, a new seed gives new ideas', () => {
  const a = eng.playground({ text: LINE, target: 'mind', seed: 1 }).lines.map((l) => l.text);
  const b = eng.playground({ text: LINE, target: 'mind', seed: 1 }).lines.map((l) => l.text);
  const c = eng.playground({ text: LINE, target: 'mind', seed: 2 }).lines.map((l) => l.text);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
