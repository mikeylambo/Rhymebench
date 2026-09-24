#!/usr/bin/env node
/**
 * make-brand-assets.mjs — regenerates the committed brand images in
 * apps/workbench/public/:
 *
 *   icon-192.png            PWA / home-screen icon, opaque background
 *   icon-512.png            PWA install icon, opaque background
 *   icon-maskable-512.png   Android adaptive icon, artwork inside the safe zone
 *   og-image.png            social share card (1200x630)
 *
 * A design-asset generator, NOT part of `npm run build` — the outputs are committed.
 * Run it when the mark, wordmark or colours change:
 *
 *     node scripts/make-brand-assets.mjs
 *
 * It renders HTML in the locally installed Google Chrome through Playwright
 * (channel "chrome"), so no browser download is needed, and draws the wordmark with
 * the same self-hosted Inter the app uses — one source of truth for the typeface.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = `${root}apps/workbench/public/`;
const inter = readFileSync(`${root}apps/workbench/src/assets/fonts/inter-latin.woff2`).toString('base64');

// The mark: four rounded bars in Barsmith's tier colours (perfect / multi / slant / assonance).
const BARS = [
  { x: 120, y: 196, h: 120, c: '#4ade80' },
  { x: 196, y: 140, h: 232, c: '#fb923c' },
  { x: 272, y: 168, h: 176, c: '#60a5fa' },
  { x: 348, y: 212, h: 88, c: '#c084fc' },
];
// scale: fraction of the canvas the 512-unit artwork box spans (bars sit in its middle)
const mark = (scale) => `
  <svg viewBox="0 0 512 512" width="${scale * 100}%" height="${scale * 100}%" style="position:absolute;left:${(1 - scale) * 50}%;top:${(1 - scale) * 50}%">
    ${BARS.map((b) => `<rect x="${b.x}" y="${b.y}" width="46" height="${b.h}" rx="23" fill="${b.c}"/>`).join('')}
  </svg>`;

const page = (w, h, body) => `<!doctype html><html><head><style>
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${inter}) format('woff2'); font-weight: 100 900; }
  html, body { margin: 0; width: ${w}px; height: ${h}px; background: #050505; overflow: hidden; }
  body { position: relative; font-family: Inter, sans-serif; color: #fff; }
</style></head><body>${body}</body></html>`;

const ASSETS = [
  // Opaque square; the artwork box fills the canvas like the in-app SVG icon.
  { file: 'icon-192.png', w: 192, h: 192, html: page(192, 192, mark(1)) },
  { file: 'icon-512.png', w: 512, h: 512, html: page(512, 512, mark(1)) },
  // Maskable: launchers crop to a circle of 80% diameter — keep the bars well inside it.
  { file: 'icon-maskable-512.png', w: 512, h: 512, html: page(512, 512, mark(0.8)) },
  {
    file: 'og-image.png',
    w: 1200,
    h: 630,
    html: page(
      1200,
      630,
      `<div style="position:absolute;left:80px;top:150px;width:330px;height:330px">${mark(1)}</div>
       <div style="position:absolute;left:440px;top:0;bottom:0;right:80px;display:flex;flex-direction:column;justify-content:center;gap:22px">
         <div style="font-size:74px;font-weight:900;letter-spacing:-2px;line-height:1">Rhyme Workbench<span style="color:#fff">.</span></div>
         <div style="font-size:34px;font-weight:600;color:#d1d5db;line-height:1.25">Tap any word in your line.<br>Explore its whole sound-space.</div>
         <div style="display:flex;gap:12px;font-size:22px;font-weight:700;margin-top:6px">
           ${[['perfect', '#4ade80'], ['multis', '#fb923c'], ['slant', '#60a5fa'], ['assonance', '#c084fc']]
             .map(([t, c]) => `<span style="padding:8px 16px;border-radius:999px;background:${c}22;color:${c};border:2px solid ${c}55">${t}</span>`)
             .join('')}
         </div>
         <div style="font-size:20px;color:#8b93a1;font-weight:500">Offline · on-device · nothing leaves your phone</div>
       </div>`,
    ),
  },
];

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const a of ASSETS) {
    const p = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
    await p.setContent(a.html);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: pub + a.file, omitBackground: false });
    await p.close();
    console.log(`[make-brand-assets] ${a.file} ${a.w}x${a.h}`);
  }
} finally {
  await browser.close();
}
