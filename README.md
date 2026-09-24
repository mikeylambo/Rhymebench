# Rhyme Workbench

A standalone tool for exploring the **sound-space** around a word or phrase in
depth. Where Barsmith trains the writer under pressure, this exists for
unhurried exploration. No AI or network: the rhymes come from the phonetic
engine, and the optional generated lines are template-built idea-starters on
those real rhymes — the writer still writes the bar. Local-first, offline,
stores nothing off-device.

## Write — the default screen

The line-first surface from **SlantSmith**, fused onto the engine. Type up to
four lines, tap any word, and get both halves at once:

- **Sound targets** — real rhymes for the tapped word, shaped by mode
  (Best / Clean / Slant / Weird) and the **syllable-difficulty** dial (Auto, or
  only N-syllable rhymes). Tap one to swap it into your line.
- **Generated lines** — bars that land on those same real targets, fitted to
  your line's syllable count, one different end rhyme per line. The rhymes are
  real; only the connective filler is templated, so treat them as sparks.

Actions: **Find Slants**, **Find Internals** (colours the words in your lines
by rhyme cluster), **Densify** (phrase-level targets + lines packed with rhyme,
via the density dial). **Use** turns a generated line into your next line and
explores its last word; **Chain** / **Chain 4 bars** builds a rhyme chain you
can copy or send to the Pad. The deeper tools sit one tab over.

Sibling to Barsmith, built on a shared, versioned phonetic engine
(`@rhyme/engine`). Barsmith consumes a restrained slice of that engine
(`getUsefulRhymes`); this app consumes the full API.

```
Rhyme Workbench/
├── packages/rhyme-engine/   # the shared phonetic engine — framework-free, own version
└── apps/workbench/          # Vite + React 19 + TS app that consumes it
```

## Running it

Requires Node ≥ 20.19 (Vite 8). From the repo root:

```bash
npm install
npm run dev        # starts the workbench at http://localhost:5187
```

Build for production:

```bash
npm run build      # builds the engine, then the app
```

Test the engine:

```bash
npm run test       # builds the engine, then node --test over packages/rhyme-engine
```

## Data strategy

The engine resolves every word through a three-stage fallback chain, all
bundled client-side — no server calls, no API dependency:

1. **CMU Pronouncing Dictionary** (public domain, ARPAbet, ~135k words) —
   `apps/workbench/public/data/cmudict.dict`, the primary lookup.
2. **Slang + curated supplement** — `packages/rhyme-engine/src/slang.ts`:
   a hand-curated map of modern slang / rap vocabulary and contractions,
   **seeded directly from Barsmith's own `pronunciation-extra.json`** (its
   curated CMU-gap loanwords and coinages) plus a slang block. Grows over time
   as gaps surface, same pattern as Barsmith's word-bank JSON assets.
3. **Rule-based G2P fallback** — `packages/rhyme-engine/src/g2p.ts`, a
   grapheme-to-phoneme heuristic for anything still out-of-vocabulary
   (names, invented words, new slang).

A compact word-frequency asset (`public/data/freq.txt`, top ~60k words from the
Norvig unigram counts) ranks common, usable words above obscure surnames within
each quality band — so `cat` leads with *bat / chat / flat*, not *bhatt*.

## The 12 features

All twelve of the full-release scope are built:

| # | Feature | Where |
|---|---------|-------|
| 1 | **Rhyme Search** — tiered perfect / multi / slant results | Search tab |
| 2 | **Rhyme Distance slider** — continuous Exact ↔ Loose, filters a pre-scored set in real time | Search tab |
| 3 | **Sound Locking** — full segment-level "sound microscope"; lock any phoneme, the rime, or the vowel spine | Search → Sound Tools |
| 4 | **Rhyme Palette** — pin keepers across searches; persists locally | right rail |
| 5 | **Multi Builder** — cadence/sound-shape matching for multi-word phrases, bucketed by quality | Multi tab |
| 6 | **Scheme Builder** — A/B/C rhyme families side by side, saved as a set | Scheme tab |
| 7 | **Internal Rhyme Finder** — segments a full line across word boundaries and highlights rhyme clusters, incl. non-adjacent | Internal tab |
| 8 | **Homophone / Near-Homophone Mode** — a preset of the distance axis pinned near zero, filtered to different spellings | Search → Homophones |
| 9 | **Sound Substitution** — invert the lock mask: change one sound, hold the rest | Search → Sound Tools → Substitute |
| 10 | **Scratchpad** — a Bar Pad to work found rhymes into lines; persists | Pad tab |
| 11 | **Rhyme Families** — save a whole result set as a named, reusable family | right rail |
| 12 | **Phrase Exploration** — Multi Builder's relaxed-filter mode (abundance is the feature) | Multi → Explore mode |

## Engine API

The full API this app consumes (see `packages/rhyme-engine/src/index.ts`):

`search` · `rhymeDistance` · `findHomophones` · `findByLockedSegments` ·
`findBySubstitution` · `buildMultis` · `findInternalRhymes` · `scoreCandidate` ·
`compareRimes` · `phonemeSimilarity` · `vowelSpine` · `stressPattern` ·
`phraseMatch`

The restrained API Barsmith would consume: `getUsefulRhymes(word)`, plus
`findRhymes(word)` which returns Barsmith's exact result shape
(`{ perfect, multi, slant, assonance, homophones, phonemes, syllables }`) so
Barsmith can drop the shared engine in behind its existing RhymeSearch UI
without changing it. Result tiers use Barsmith's proven vocabulary — **perfect
/ multi / slant / assonance** — and the app's tier colours match Barsmith's
(green / orange / blue / purple).

Improvements to pronunciation coverage or scoring accuracy benefit both
products at once. All similarity scoring is grounded in articulatory feature
tables (`src/arpabet.ts`) rather than letter matching, so perceptually close
sounds (IH/IY, S/Z, M/N) score as close.

## Design

Inherits Barsmith's dark "writing-gym" UI system (`src/styles/index.css`,
token-based) rather than inventing a new design language.

## Offline / PWA

The app is installable and works offline. A service worker (`public/sw.js`,
registered in production only) runtime-caches the shell, the hashed JS/CSS and
the data payloads, so from the second visit on it runs with no network — matching
the local-first, stores-nothing-off-device promise. `public/manifest.webmanifest`
+ `public/icon.svg` make it installable to a home screen.

## Performance — the engine runs in a Web Worker

The engine and the 3.5MB dictionary live in a Web Worker
(`src/engine.worker.ts`), driven from the main thread through an async proxy
(`src/lib/engineClient.ts`). The ~1s parse at startup and every query run off
the main thread, so the UI never janks; the distance slider still filters a
cached result set client-side for instant re-ranking.

## Responsive

Works from phone width up. Below 640px the left rail becomes a bottom tab bar,
the layout collapses to a single column with a 16px gutter and no horizontal
scroll, and the palette stacks beneath the content.

## Tests

`npm run test` (in `packages/rhyme-engine`) builds the engine and runs the
Node test suite (`test/*.test.mjs`) against the real dictionary. It encodes
each feature's "done when" bar — tiering, distance monotonicity, that locked
segments are genuinely preserved, substitution minimal-pairs, homophones,
multi-builder buckets, and non-adjacent internal-rhyme clusters — plus the G2P
suffix rules and articulatory scoring.

## Notes / next steps

- Barsmith adopts the engine later via a single package import — this repo
  doesn't touch Barsmith's.
- The slang supplement (`src/slang.ts`) is meant to keep growing as gaps
  surface; the G2P fallback is a heuristic (good on common suffixes and
  structure, approximate on vowel quality) — a bigger curated supplement is the
  higher-leverage improvement over chasing G2P perfection.
