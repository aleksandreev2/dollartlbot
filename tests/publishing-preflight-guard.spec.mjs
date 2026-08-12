import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source = fs.readFileSync(new URL('../public/app/publishing-preflight-guard.js', import.meta.url), 'utf8');

async function boot(page) {
  await page.setContent(`
    <section class="publisher-editor">
      <input id="pubTitle" value="Ready title">
      <textarea id="pubBody">Ready body</textarea>
      <input id="pubChapterStart" value="1">
      <input id="pubChapterEnd" value="10">
      <button id="pubPublish">Publish</button>
    </section>
    <section class="publishing-center-preflight"><span id="pcPreflightState" class="ready">Готово</span></section>
  `);
  await page.evaluate(() => {
    window.__guard = { route:'section:publishing', patcher:null, middleware:null, checks:0, ready:true, nextCalls:0 };
    window.DTL_RUNTIME = {
      registerPatcher(fn){ window.__guard.patcher = fn; },
      registerFetchMiddleware(fn){ window.__guard.middleware = fn; },
    };
    window.DTL_ADMIN = { activeRoute(){ return window.__guard.route; } };
    window.DTL_PUBLISHING_CENTER = {
      async runPreflight(){
        window.__guard.checks += 1;
        const node = document.getElementById('pcPreflightState');
        node.className = window.__guard.ready ? 'ready' : 'blocked';
        node.textContent = window.__guard.ready ? 'Готово' : 'Есть блокирующие проблемы';
      },
      state(){ return { lastPreflight:{ ready:window.__guard.ready } }; },
    };
    window.DTL_PUBLICATION_RELEASE_RANGE = { parsedRange(){ return { ok:true, chapter_start:1, chapter_end:10 }; } };
  });
  await page.addScriptTag({ content:source });
  await page.evaluate(() => window.__guard.patcher());
}

test('typing automatically reruns publication preflight without requiring blur or manual Check', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => window.__guard.checks);
  await page.locator('#pubBody').fill('Edited body that should be checked automatically');
  await expect.poll(() => page.evaluate(() => window.__guard.checks), { timeout:1500 }).toBeGreaterThan(before);
});

test('real Publish is blocked by a final failed preflight but Save/Test draft creation stays available', async ({ page }) => {
  await boot(page);

  const invoke = () => page.evaluate(async () => {
    const next = async () => {
      window.__guard.nextCalls += 1;
      return new Response(JSON.stringify({ ok:true }), { status:201, headers:{ 'content-type':'application/json' } });
    };
    const response = await window.__guard.middleware('/api/app/admin/publications', { method:'POST' }, next, { pathname:'/api/app/admin/publications' });
    return response.status;
  });

  // Save/Test path: no publish busy marker, so draft creation is not blocked by channel readiness.
  await page.evaluate(() => { window.__guard.ready = false; });
  let status = await invoke();
  expect(status).toBe(201);
  expect(await page.evaluate(() => window.__guard.nextCalls)).toBe(1);

  // Real publish path: final preflight must pass before draft creation can continue.
  await page.locator('#pubPublish').evaluate(button => button.classList.add('is-busy'));
  status = await invoke();
  expect(status).toBe(409);
  expect(await page.evaluate(() => window.__guard.nextCalls)).toBe(1);
  expect(await page.evaluate(() => window.__guard.checks)).toBeGreaterThan(0);

  await page.evaluate(() => { window.__guard.ready = true; });
  status = await invoke();
  expect(status).toBe(201);
  expect(await page.evaluate(() => window.__guard.nextCalls)).toBe(2);
});

test('invalid chapter range blocks final Publish before any publication row is created', async ({ page }) => {
  await boot(page);
  await page.locator('#pubPublish').evaluate(button => button.classList.add('is-busy'));
  await page.evaluate(() => {
    window.DTL_PUBLICATION_RELEASE_RANGE.parsedRange = () => ({ ok:false, message:'Последняя глава не может быть меньше первой.' });
  });
  const status = await page.evaluate(async () => {
    const next = async () => {
      window.__guard.nextCalls += 1;
      return new Response('{}', { status:201 });
    };
    const response = await window.__guard.middleware('/api/app/admin/publications', { method:'POST' }, next, { pathname:'/api/app/admin/publications' });
    return response.status;
  });
  expect(status).toBe(409);
  expect(await page.evaluate(() => window.__guard.nextCalls)).toBe(0);
});
