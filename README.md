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

Tests:

```bash
npm test           # engine: builds it, then 25 Node tests against the shipped dictionary
npm run test:e2e   # app: builds it, then 11 end-to-end tests in your installed Chrome
```

Before a release, see [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md) and
[RELEASE_NOTES.md](RELEASE_NOTES.md).

## Data strategy

Everything the engine needs is bundled with the app — no server calls, no API.
Every word resolves through a three-stage fallback chain:

1. **The pronunciation dictionary** — `apps/workbench/public/data/lexicon.txt`
   (577 KB gzipped), built from the **CMU Pronouncing Dictionary** (BSD-2-Clause)
   by `scripts/build-lexicon.mjs`: one character per phoneme, frequency rank
   inline, and filtered to real English words — 65,714 of CMU's 124,911
   headwords. The rest were surnames, brands and place names (*bhatt*, *arnatt*),
   the noise that used to crowd loose rhyme lists. Sources live in `data-src/`.
2. **Slang + curated supplement** — `packages/rhyme-engine/src/slang.ts`:
   modern slang, rap vocabulary and contractions, plus CMU-gap loanwords and
   coinages **seeded from Barsmith's `pronunciation-extra.json`**. Grows as gaps
   surface.
3. **Rule-based G2P fallback** — `packages/rhyme-engine/src/g2p.ts`, for anything
   still out of vocabulary (names, invented words, new slang).

Frequency ranks (from Peter Norvig's unigram counts) put common, usable words
first within each quality band — `cat` leads with *bat / chat / flat*.

**Definitions** — `public/data/definitions.txt`, 15,223 words from **Princeton
WordNet 3.0** (the 20,000 most common words plus everything Barsmith defines),
built by `scripts/build-definitions.mjs`. Inflections fall back to their base
(*designed* → *design*). Lazy-loaded on first lookup.

The licence notices for CMU, WordNet and the Inter font ship with the app at
`/licenses.txt`.

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

Installable, and fully offline **from the first visit**. The service worker is
generated at build time (`scripts/inject-sw-precache.mjs`, ported from
Barsmith) with this build's exact hashed bundle names, so installing it caches
the whole app — shell, bundles, font, icons, dictionary and definitions. Its
cache name includes a hash of those files, so any change replaces the cache.
Only the app itself is stored as the offline shell (not the privacy page).
PNG and maskable icons, a share card and a privacy policy are in `public/`
(regenerate the images with `scripts/make-brand-assets.mjs`).

## Your data

Everything is stored in the browser on your device. **Data & about** (top bar)
downloads a full backup and restores one — validated before anything is written,
and undoable, because the current data is snapshotted first. If the app ever
crashes, the crash screen still offers the backup download.

## Performance — the engine runs in a Web Worker

The engine, the dictionary and the definitions live in a Web Worker
(`src/engine.worker.ts`), driven from the main thread through an async proxy
(`src/lib/engineClient.ts`). The parse at startup and every query run off
the main thread, so the UI never janks; the distance slider still filters a
cached result set client-side for instant re-ranking.

## Responsive

Works from phone width up. Below 640px the left rail becomes a bottom tab bar,
the layout collapses to a single column with a 16px gutter and no horizontal
scroll, and the palette stacks beneath the content.

## Accessibility

Every control has an accessible name; result words and pins are keyboard
reachable; rhyme tiers are spoken, not just coloured; toggles, sliders and result
counts announce their state; the Data dialog traps focus and returns it on
Escape. Text meets 4.5:1 contrast, reduced motion is respected, and there is a
skip link. The e2e suite checks the names and the focus trap on every tab.

## Tests

- **Engine** (`npm test`): 25 Node tests against the shipped dictionary — each
  feature's "done when" bar (tiering, distance monotonicity, genuinely preserved
  locked segments, substitution minimal pairs, homophones, multi buckets,
  non-adjacent internal rhymes, the Write playground), G2P rules, scoring, and
  that the compact dictionary decodes exactly like the CMU source.
- **App** (`npm run test:e2e`): 11 Playwright tests against the production build
  in real Chrome — the Write loop, search, persistence, backup / restore / undo,
  malformed-backup rejection, the crash screen, accessibility, phone layout, and
  booting and searching offline through the service worker.

## Notes / next steps

- Barsmith adopts the engine later via a single package import — this repo
  doesn't touch Barsmith's.
- The slang supplement (`src/slang.ts`) is meant to keep growing as gaps
  surface; the G2P fallback is a heuristic (good on common suffixes and
  structure, approximate on vowel quality) — a bigger curated supplement is the
  higher-leverage improvement over chasing G2P perfection.
