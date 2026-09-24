# Rhyme Workbench 0.2.0 — release parity with Barsmith

The first version meant to be put in front of writers. 0.1.0 proved the engine; this
release is everything around it that Barsmith already had and Rhyme Workbench didn't:
it installs, it works offline from the first visit, it can't lose your work, it can be
driven from a keyboard, and every one of those claims is tested in a real browser.

## Write — SlantSmith, fused onto the engine

The default screen is now the line-first surface from SlantSmith: type up to four lines,
tap any word, and get **real sound targets** and **generated lines built on them**, side by
side. Syllable difficulty returns only N-syllable rhymes; Find Internals colours the words
of your lines by rhyme cluster; Densify adds phrase-level targets and lines packed with
rhyme. Use, Copy, Chain, Chain 4 bars, Send to Pad. The rhymes in generated lines are always
real engine results — only the connective filler is templated, so treat them as sparks.

## It works offline from the first visit

The service worker is now generated at build time (`scripts/inject-sw-precache.mjs`, ported
from Barsmith) with the exact hashed bundle names of the build, so a first visit caches
everything the app needs. The old hand-written worker only cached what you happened to load,
so offline started on the *second* visit — and it cached every page visit as the offline
shell, the same bug Barsmith fixed when a privacy page arrived. Only the app itself is the
shell now.

The cache name carries a hash of every precached file, so a new dictionary reaches installed
users even without a version bump. Precached files are cache-first: the dictionary isn't
re-downloaded in the background on every visit.

## A dictionary half the size, and without the surnames

The app used to download the raw CMU dictionary plus a separate frequency list: 1.15 MB
gzipped. It now downloads one compact file (`scripts/build-lexicon.mjs`): one character per
phoneme, frequency rank inline — **577 KB**. It's also filtered to real English words,
keeping 65,714 of CMU's 124,911 headwords. The other half were surnames, brands and place
names — *bhatt*, *arnatt*, *balyeat* — exactly the noise that crowded the loose end of rhyme
lists. A test proves the compact file decodes to exactly the CMU source for every word it keeps.

## Definitions, offline

Every word you search or tap now shows its WordNet definition: 15,223 words — the 20,000 most
common plus everything Barsmith defines — and inflections fall back to their base (*designed*
shows *design*). They load on first use and are precached for offline.

## Your work can't be lost

- **Backup and restore** (Data & about): one JSON file with everything. A restore validates the
  whole file before writing anything, shows what it will replace, and snapshots the current
  data first — so **a restore can be undone**. The dangerous restore isn't a corrupt file; it's a
  valid, *old* one.
- **A crash screen that gets the work out** instead of a black screen: download a backup, reload,
  or — only if a reload keeps crashing — reset. Try it at `#crash-test`.
- Fixed a bug that would have undone restores: every screen re-saved its in-memory state as the
  page unloaded, which would have written the old data straight back over the restored data.
- Stored data is shape-checked on load, so one corrupt record can't crash a screen.

## Accessible

Result words are real buttons now, and the pin star is reachable by keyboard (it only appeared
on mouse hover). Tiers are spoken, not just coloured. Toggles announce their state, sliders
announce their values, result counts are announced as they change, and the Data dialog traps
focus and returns it on Escape. Hint text was 4.2:1 contrast, below the 4.5:1 minimum — now 6.6:1.
Reduced motion is respected; there's a skip link.

## Installable

Proper PNG icons (including an Android maskable icon), a share card, and a privacy policy.
The self-hosted Inter font now matches Barsmith. Licence notices for CMU, WordNet and Inter
ship with the app (`/licenses.txt`) — the CMU dictionary is BSD-licensed, not public domain as
the 0.1.0 README said.

## Tests

- Engine: 25 tests against the shipped dictionary (`npm test`).
- App: 11 end-to-end tests against the production build in real Chrome (`npm run test:e2e`) —
  the Write loop, search, backup/restore/undo, malformed-backup rejection, the crash screen,
  accessible names and focus trapping, phone layout, and offline boot with no network.

---

# Rhyme Workbench 0.1.0 — the engine

The initial build: a phonetic engine (`@rhyme/engine`) over the CMU dictionary with a slang
supplement and rule-based G2P fallback, and a workbench on top of it — Rhyme Search with a
continuous distance slider, sound locking and substitution, homophones, Multi Builder, the
Internal Rhyme Finder, Scheme Builder, palette, families and scratchpad. Tiers and
`findRhymes()` match Barsmith's so Barsmith can adopt the engine as a drop-in.
