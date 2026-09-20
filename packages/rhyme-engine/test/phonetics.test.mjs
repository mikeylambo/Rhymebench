import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  parsePhones,
  syllabify,
  g2p,
  phonemeSimilarity,
  compareRimes,
  vowelSimilarity,
} from '../dist/index.js';

test('phonemeSimilarity respects articulatory closeness', () => {
  assert.equal(phonemeSimilarity('P', 'P'), 1);
  // cross-category is unrelated
  assert.equal(phonemeSimilarity('P', 'AE1'), 0);
  // voicing pair (P/B) closer than different manner (P/S)
  assert.ok(phonemeSimilarity('P', 'B') > phonemeSimilarity('P', 'S'));
  // nasals close; unrelated consonants far
  assert.ok(phonemeSimilarity('M', 'N') > 0.5);
  assert.ok(phonemeSimilarity('M', 'K') < phonemeSimilarity('M', 'N'));
  // near vowels close
  assert.ok(vowelSimilarity('IH', 'IY') > 0.6);
  assert.ok(vowelSimilarity('IY', 'AA') < vowelSimilarity('IH', 'IY'));
});

test('syllabify counts syllables by vowel nuclei', () => {
  assert.equal(syllabify(parsePhones('P AH0 Z IH1 SH AH0 N')).length, 3); // po-si-tion
  assert.equal(syllabify(parsePhones('K AE1 T')).length, 1); // cat
  assert.equal(syllabify(parsePhones('B AE1 N AH0 N AH0')).length, 3); // banana-ish
});

test('analyze extracts rime, vowel spine and stress', () => {
  const p = analyze(parsePhones('S T EY1 SH AH0 N'), 'cmu'); // station
  assert.deepEqual(p.vowelSpine, ['EY', 'AH']);
  assert.deepEqual(p.stressPattern, [1, 0]);
  assert.equal(p.count, 2);
  // rime is from the stressed vowel onward
  assert.deepEqual(p.rime, ['EY1', 'SH', 'AH0', 'N']);
});

test('compareRimes: identical rime is exact and scores 1', () => {
  const a = analyze(parsePhones('N EY1 SH AH0 N'), 'cmu'); // nation
  const b = analyze(parsePhones('S T EY1 SH AH0 N'), 'cmu'); // station
  const rc = compareRimes(a.rime, b.rime);
  assert.equal(rc.exact, true);
  assert.equal(rc.score, 1);
});

test('G2P handles common suffixes with voicing assimilation', () => {
  const j = (w) => g2p(w).join(' ');
  assert.equal(j('walked').endsWith('K T'), true); // -ed after voiceless -> T
  assert.equal(j('wanted').endsWith('T IH0 D'), true); // -ed after t -> IH0 D
  assert.equal(j('loved').endsWith('V D'), true); // -ed after voiced -> D
  assert.equal(j('dogs').endsWith('G Z'), true); // plural after voiced -> Z
  assert.equal(j('cats').endsWith('T S'), true); // plural after voiceless -> S
  assert.equal(j('buzzes').endsWith('Z IH0 Z'), true); // sibilant + es -> IH0 Z
  assert.equal(j('blorping').endsWith('IH0 NG'), true); // -ing
  assert.equal(j('quickly').endsWith('L IY0'), true); // -ly
});

test('G2P treats word-initial y as a consonant', () => {
  const y = g2p('yeeted');
  assert.equal(y[0], 'Y'); // not a vowel
  assert.equal(y.join(' ').endsWith('T IH0 D'), true);
});

test('G2P produces a stressed vowel for any alphabetic word', () => {
  for (const w of ['skibidi', 'blorp', 'zzyzx', 'gronk']) {
    const p = g2p(w);
    assert.ok(p.length > 0, `${w} produced phonemes`);
    assert.ok(p.some((ph) => /\d/.test(ph)), `${w} has a stressed vowel`);
  }
});
