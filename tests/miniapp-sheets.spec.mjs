import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const interactionJs = fs.readFileSync(new URL('../public/app/interaction-upgrade.js', import.meta.url), 'utf8');
const styles = [
  fs.readFileSync(new URL('../public/app/app.css', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../public/app/interaction-upgrade.css', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../public/app/suggest-content-picker.css', import.meta.url), 'utf8'),
].join('\n');

async function boot(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.route('https://dtl.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<style>${styles}</style><div id="app" class="app-shell"><button id="sheetOpener" type="button">Open</button><main id="viewRoot"></main><nav id="bottomNav"></nav><div id="sheetRoot"></div></div>`,
  }));
  await page.goto('https://dtl.test/');
  await page.evaluate(() => {
    const patchers = [];
    const back = {
      visible: false,
      handler: null,
      onClick(fn) { this.handler = fn; },
      show() { this.visible = true; },
      hide() { this.visible = false; },
    };
    window.__DTL_TEST_BACK__ = back;
    window.Telegram = { WebApp: { BackButton: back, HapticFeedback: { selectionChanged() {} } } };
    window.lucide = { createIcons() {} };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { patchers.push(fn); return () => {}; },
      schedule() { for (const fn of [...patchers]) fn(); },
    };
  });
  await page.addScriptTag({ content: interactionJs });
}

async function openLongSheet(page) {
  await page.evaluate(() => {
    const root = document.getElementById('sheetRoot');
    const copy = Array.from({ length: 28 }, (_, i) => `<p>Long rules paragraph ${i + 1}: content must remain readable inside the visible Telegram viewport.</p>`).join('');
    root.innerHTML = `<div class="sheet-backdrop" id="sheetBackdrop"><div class="bottom-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="sheet-title">Rules</div><div class="sheet-copy">${copy}</div><div class="sheet-actions"><button class="secondary-button wide-button" data-close-sheet type="button">Close</button></div></div></div>`;
    const close = () => { root.innerHTML = ''; window.DTL_RUNTIME.schedule(); };
    root.querySelector('[data-close-sheet]').addEventListener('click', close);
    root.querySelector('#sheetBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) close(); });
    window.DTL_RUNTIME.schedule();
  });
}

test('long mobile sheet stays inside the Telegram viewport and scrolls internally', async ({ page }) => {
  await boot(page, 390, 720);
  await openLongSheet(page);

  const sheet = page.locator('.bottom-sheet');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.width).toBeLessThanOrEqual(391);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.y + box.height).toBeLessThanOrEqual(721);
  expect(await sheet.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dtl-sheet-open'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await expect(page.locator('[data-close-sheet]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dtl-sheet-open'))).toBe(false);
});

test('desktop sheet is bounded and presented as a compact surface', async ({ page }) => {
  await boot(page, 1200, 800);
  await openLongSheet(page);

  const sheet = page.locator('.bottom-sheet');
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(681);
  expect(box.width).toBeGreaterThan(500);
  expect(box.y).toBeGreaterThanOrEqual(18);
  expect(800 - (box.y + box.height)).toBeGreaterThanOrEqual(17);
  expect(await sheet.evaluate(el => getComputedStyle(el).borderBottomLeftRadius)).not.toBe('0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('custom content picker participates in shared Telegram Back lifecycle without an id', async ({ page }) => {
  await boot(page, 390, 720);
  await page.evaluate(() => {
    const root = document.getElementById('sheetRoot');
    root.innerHTML = `<div class="sheet-backdrop content-picker-sheet"><div class="bottom-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="content-sheet-head"><div class="sheet-title">All tags</div><button class="content-sheet-close" type="button">Close</button></div><div class="content-catalog-body">${'<div class="content-catalog-group">Tags</div>'.repeat(40)}</div></div></div>`;
    root.querySelector('.content-sheet-close').addEventListener('click', () => { root.innerHTML = ''; window.DTL_RUNTIME.schedule(); });
    window.DTL_RUNTIME.schedule();
  });

  await expect(page.locator('.content-picker-sheet')).toBeVisible();
  expect(await page.evaluate(() => window.__DTL_TEST_BACK__.visible)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dtl-sheet-open'))).toBe(true);

  await page.evaluate(() => window.__DTL_TEST_BACK__.handler?.());
  await expect(page.locator('.content-picker-sheet')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dtl-sheet-open'))).toBe(false);
  expect(await page.evaluate(() => window.__DTL_TEST_BACK__.visible)).toBe(false);
});
