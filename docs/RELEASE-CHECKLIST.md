# Release checklist

Run before tagging a release. The automated parts catch regressions; the manual parts
are what automation can't see on a real device.

## Automated

```bash
npm test            # engine: 25 tests against the shipped dictionary
npm run test:e2e    # app: builds, then 11 end-to-end tests in real Chrome
```

After deploying, run the app suite against the live site too:

```bash
cd apps/workbench && E2E_BASE_URL=https://<deployed-origin> npx playwright test
```

## Version

- [ ] Bump `version` in `package.json`, `apps/workbench/package.json`,
      `packages/rhyme-engine/package.json`, and `ENGINE_VERSION` in
      `packages/rhyme-engine/src/index.ts`.
- [ ] Add a section to `RELEASE_NOTES.md`.
- [ ] If the data sources changed, regenerate and commit the payloads:
      `node scripts/build-lexicon.mjs`, `node scripts/build-definitions.mjs --wordnet <dict>`.
- [ ] If the mark or colours changed: `node scripts/make-brand-assets.mjs`.

## On a phone (iOS Safari and Android Chrome)

- [ ] Open the live site, wait for "words · on-device", then add it to the home screen.
      The icon is the four coloured bars on black (on Android, not clipped by the mask).
- [ ] Airplane mode, launch from the home screen: the app boots; Search "money" returns
      rhymes and a definition; Write → tap a word → targets and lines appear.
- [ ] Write a line, tap words, Use a generated line, Chain 4 bars, Send to Pad — the Pad
      has the lines.
- [ ] Pin a word, close the app fully, reopen: still pinned.
- [ ] Data & about → Download backup produces a file (on iOS this goes via the share sheet).
- [ ] Bottom tab bar sits above the home indicator; nothing scrolls sideways.
- [ ] Share the link in a messaging app: the preview shows the share card.
- [ ] With VoiceOver / TalkBack: chips read as "word, perfect rhyme"; pin buttons read
      "Pin word to palette".
