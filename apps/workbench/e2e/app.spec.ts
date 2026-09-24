import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/** Load the app and wait for the dictionary worker to be ready. */
async function open(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByText(/words · on-device/)).toBeVisible({ timeout: 30_000 });
}

async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name }).click();
}

test.describe('Write (SlantSmith surface)', () => {
  test('tap a word → sound targets + generated lines; Use appends the next line', async ({ page }) => {
    await open(page);
    await page.getByLabel('Your line').fill('I got money on my mind');
    await page.getByRole('button', { name: 'mind', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Exploring “mind”' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^find, perfect rhyme$/ })).toBeVisible();
    const lines = page.locator('.gen-line');
    await expect(lines).toHaveCount(4);

    await lines.nth(1).getByRole('button', { name: 'Use' }).click();
    await expect(page.getByLabel('Your line')).toHaveValue(/^I got money on my mind\n.+/);
  });

  test('Chain 4 bars, then Send to Pad', async ({ page }) => {
    await open(page);
    await page.getByLabel('Your line').fill('I got money on my mind');
    await page.getByRole('button', { name: 'mind', exact: true }).click();
    await page.getByRole('button', { name: 'Chain 4 bars' }).click();
    await expect(page.locator('.chain-line')).toHaveCount(4);
    const first = (await page.locator('.chain-line span').first().textContent())!.trim();
    await page.getByRole('button', { name: 'Send to Pad' }).click();
    await tab(page, 'Pad');
    await expect(page.getByLabel('Scratchpad')).toHaveValue(new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('syllable difficulty returns only N-syllable targets', async ({ page }) => {
    await open(page);
    await page.getByLabel('Your line').fill('elevation');
    await page.getByLabel('Syllable difficulty').fill('4');
    await page.getByRole('button', { name: 'elevation', exact: true }).click();
    await expect(page.getByText(/Sound targets · 4-syllable/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^information, perfect rhyme$/ })).toBeVisible();
  });
});

test.describe('Search', () => {
  test('tiers, distance slider, homophones, definitions', async ({ page }) => {
    await open(page);
    await tab(page, 'Search');
    const box = page.getByLabel('Word to search');
    await box.fill('cat');
    await expect(page.getByRole('button', { name: /^bat, perfect rhyme$/ })).toBeVisible();

    const status = page.getByRole('status').filter({ hasText: 'results' });
    const count = async () => Number((await status.textContent())!.match(/(\d+) results/)![1]);
    const wide = await count();
    await page.getByLabel(/Rhyme distance/).fill('0.1');
    await expect(status).toContainText('Exact rhymes only');
    expect(await count()).toBeLessThan(wide);

    await box.fill('money');
    await expect(page.getByLabel('Definition of money')).toContainText('medium of exchange');

    await box.fill('sole');
    await page.getByRole('button', { name: 'Homophones' }).click();
    await expect(page.getByRole('button', { name: 'Homophones' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('soul', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Data safety', () => {
  test('a keyboard-pinned word persists across reload', async ({ page }) => {
    await open(page);
    await tab(page, 'Search');
    await page.getByLabel('Word to search').fill('cat');
    const pin = page.getByRole('button', { name: 'Pin bat to palette' });
    await pin.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Unpin bat' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByText(/words · on-device/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Remove bat from palette' })).toBeVisible();
  });

  test('backup → restore replaces data, and the restore can be undone', async ({ page }, info) => {
    await open(page);
    await tab(page, 'Search');
    await page.getByLabel('Word to search').fill('cat');
    await page.getByRole('button', { name: 'Pin bat to palette' }).click();

    // back up with "bat" pinned
    await page.getByRole('button', { name: 'Data & about' }).click();
    const dialog = page.getByRole('dialog', { name: 'Your data' });
    await expect(dialog).toContainText('1 pinned');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download backup' }).click()]);
    const backupPath = info.outputPath('backup.json');
    await download.saveAs(backupPath);
    expect(JSON.parse(readFileSync(backupPath, 'utf8')).data.pins[0].word).toBe('bat');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // change state: pin a second word
    await page.getByRole('button', { name: 'Pin hat to palette' }).click();
    await expect(page.getByRole('button', { name: 'Remove hat from palette' })).toBeVisible();

    // restore the backup (confirm dialog accepted) → only "bat" again
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Data & about' }).click();
    await page.locator('input[type=file]').setInputFiles(backupPath);
    await expect(page.getByText(/words · on-device/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Remove bat from palette' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove hat from palette' })).toHaveCount(0);

    // undo the restore → "hat" is back
    await page.getByRole('button', { name: 'Data & about' }).click();
    await page.getByRole('button', { name: 'Undo that restore' }).click();
    await expect(page.getByText(/words · on-device/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Remove hat from palette' })).toBeVisible();
  });

  test('a malformed backup is rejected and nothing is written', async ({ page }, info) => {
    await open(page);
    const bad = info.outputPath('bad.json');
    writeFileSync(bad, JSON.stringify({ app: 'rhyme-workbench', version: 1, data: { pins: [{ nope: 1 }] } }));
    await page.getByRole('button', { name: 'Data & about' }).click();
    await page.locator('input[type=file]').setInputFiles(bad);
    await expect(page.getByRole('alert')).toContainText('malformed');
  });

  test('crash screen gets the work out', async ({ page }) => {
    await page.goto('/#crash-test');
    await expect(page.getByRole('heading', { name: 'Your work is safe' })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^rhyme-workbench-rescue-.*\.json$/);
  });
});

test.describe('Accessibility', () => {
  test('every control has an accessible name; dialog traps focus and Escape returns it', async ({ page }) => {
    await open(page);
    for (const t of ['Write', 'Search', 'Multi', 'Internal', 'Scheme', 'Pad']) {
      await tab(page, t);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, input, textarea, select, [role=button]')]
          .filter((el) => el.offsetParent !== null && (el as HTMLInputElement).type !== 'file')
          .filter((el) => {
            const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent ?? '').trim();
            const id = el.id && document.querySelector(`label[for="${el.id}"]`);
            return !label && !id;
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unnamed, `unnamed controls on ${t}`).toEqual([]);
    }

    const opener = page.getByRole('button', { name: 'Data & about' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Your data' });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe('Phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('no horizontal scroll; bottom tab bar visible', async ({ page }) => {
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const bar = await page.getByRole('navigation', { name: 'Tools' }).boundingBox();
    expect(bar!.y + bar!.height).toBeGreaterThanOrEqual(800);
  });
});

test.describe('Offline (service worker, real Chrome)', () => {
  test('after one online visit, the app boots and searches with no network', async ({ page, context }) => {
    await open(page);
    // wait until the worker has installed, taken control, and precached the dictionary
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      }
      return reg.active?.state;
    });
    await expect
      .poll(() => page.evaluate(async () => (await caches.keys()).length && !!(await caches.match('/data/lexicon.txt'))))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/words · on-device/)).toBeVisible({ timeout: 30_000 });
    await tab(page, 'Search');
    await page.getByLabel('Word to search').fill('money');
    await expect(page.getByRole('button', { name: /^honey, perfect rhyme$/ })).toBeVisible();
    await expect(page.getByLabel('Definition of money')).toBeVisible(); // definitions precached too
    await context.setOffline(false);
  });
});
