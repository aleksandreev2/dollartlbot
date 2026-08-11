import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const adapterSource = fs.readFileSync(new URL('../public/app/admin-data-v2.js', import.meta.url), 'utf8');

async function boot(page) {
  await page.setContent(`
    <span class="admin-workflow-count"></span>
    <section class="admin-inbox-list">
      <div class="admin-inbox-list-body"></div>
    </section>
  `);
  await page.evaluate(() => {
    window.__adminDataTest = {
      middleware: null,
      patcher: null,
      filter: 'all',
      query: 'needle',
      refreshes: 0,
    };
    window.DTL_RUNTIME = {
      registerFetchMiddleware(fn) { window.__adminDataTest.middleware = fn; },
      registerPatcher(fn) { window.__adminDataTest.patcher = fn; },
    };
    window.DTL_ADMIN = {
      activeRoute() { return 'section:requests'; },
      refresh() { window.__adminDataTest.refreshes += 1; return Promise.resolve(true); },
    };
    window.DTL_ADMIN_WORKFLOW = {
      state() {
        return {
          requestFilter: window.__adminDataTest.filter,
          requestQuery: window.__adminDataTest.query,
        };
      },
    };
  });
  await page.addScriptTag({ content: adapterSource });
}

test('Requests adapter preserves the first page across routechange and appends the next cursor page', async ({ page }) => {
  await boot(page);

  await page.evaluate(async () => {
    const calls = [];
    const next = async input => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        requests: [{ id: 90 }, { id: 80 }],
        page: { total: 3, limit: 30, next_cursor: 80, has_more: true },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const response = await window.__adminDataTest.middleware('/api/app/admin/list?kind=all', {}, next);
    window.__adminDataTest.firstCalls = calls;
    window.__adminDataTest.firstBody = await response.json();
    document.dispatchEvent(new CustomEvent('dtl:adminroutechange', { detail: { id: 'section:requests' } }));
    window.__adminDataTest.patcher?.();
  });

  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN_DATA_V2.state().loaded)).toBe(2);
  expect(await page.evaluate(() => window.DTL_ADMIN_DATA_V2.state())).toMatchObject({
    nextCursor: 80,
    hasMore: true,
    total: 3,
    loaded: 2,
  });
  expect(await page.evaluate(() => window.__adminDataTest.firstBody.requests.map(row => row.id))).toEqual([90, 80]);
  expect(await page.locator('.admin-workflow-count').textContent()).toBe('2 из 3');
  await expect(page.locator('[data-admin-data-load-more]')).toHaveCount(1);

  await page.locator('[data-admin-data-load-more]').click();
  expect(await page.evaluate(() => window.__adminDataTest.refreshes)).toBe(1);

  await page.evaluate(async () => {
    const calls = [];
    const next = async input => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        requests: [{ id: 80 }, { id: 70 }],
        page: { total: 3, limit: 30, next_cursor: null, has_more: false },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const response = await window.__adminDataTest.middleware('/api/app/admin/list?kind=all', {}, next);
    window.__adminDataTest.secondCalls = calls;
    window.__adminDataTest.secondBody = await response.json();
    window.__adminDataTest.patcher?.();
  });

  const secondUrl = await page.evaluate(() => window.__adminDataTest.secondCalls[0]);
  expect(secondUrl).toContain('kind=all');
  expect(secondUrl).toContain('limit=30');
  expect(secondUrl).toContain('q=needle');
  expect(secondUrl).toContain('cursor=80');
  expect(await page.evaluate(() => window.__adminDataTest.secondBody.requests.map(row => row.id))).toEqual([90, 80, 70]);
  expect(await page.evaluate(() => window.DTL_ADMIN_DATA_V2.state())).toMatchObject({
    nextCursor: null,
    hasMore: false,
    total: 3,
    loaded: 3,
  });
  await expect(page.locator('[data-admin-data-load-more]')).toHaveCount(0);
});

test('changing filter or query starts a fresh server page without the old cursor', async ({ page }) => {
  await boot(page);

  await page.evaluate(async () => {
    const first = async () => new Response(JSON.stringify({
      requests: [{ id: 50 }],
      page: { total: 2, next_cursor: 50, has_more: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await window.__adminDataTest.middleware('/api/app/admin/list', {}, first);
    window.__adminDataTest.query = 'different';
    const calls = [];
    const second = async input => {
      calls.push(String(input));
      return new Response(JSON.stringify({
        requests: [{ id: 12 }],
        page: { total: 1, next_cursor: null, has_more: false },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const response = await window.__adminDataTest.middleware('/api/app/admin/list', {}, second);
    window.__adminDataTest.changedCalls = calls;
    window.__adminDataTest.changedBody = await response.json();
  });

  const changedUrl = await page.evaluate(() => window.__adminDataTest.changedCalls[0]);
  expect(changedUrl).toContain('q=different');
  expect(changedUrl).not.toContain('cursor=');
  expect(await page.evaluate(() => window.__adminDataTest.changedBody.requests.map(row => row.id))).toEqual([12]);
  expect(await page.evaluate(() => window.DTL_ADMIN_DATA_V2.state().loaded)).toBe(1);
});
