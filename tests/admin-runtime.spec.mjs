import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtimeSource = fs.readFileSync(new URL('../public/app/admin-runtime.js', import.meta.url), 'utf8');
const fixtureHtml = '<div id="fixture"></div><button id="leaveAdmin" data-nav="home">Leave admin</button>';

async function boot(page, { autoOpen = true } = {}) {
  await page.route('https://dtl.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: fixtureHtml }));
  await page.goto('https://dtl.test/');
  await page.evaluate(() => {
    window.__adminTest = { legacyClicks: Object.create(null), abortReads: 0, routeErrors: [] };
    window.Telegram = { WebApp: { initData: 'signed-browser-test' } };
    window.DTL_RUNTIME = { registerPatcher() {}, schedule() {} };
    window.DTL_ADMIN_STABILITY = { abortReads() { window.__adminTest.abortReads += 1; } };
    document.addEventListener('dtl:adminrouteerror', event => window.__adminTest.routeErrors.push(event.detail));
    window.DTL_ADMIN_CONSOLE = {
      open() {
        const host = document.getElementById('fixture');
        if (!host.querySelector('.admin-v2')) {
          host.innerHTML = `<div id="toastRegion"></div><div class="admin-v2"><div class="admin-work-head"><h1></h1><p></p></div><nav class="admin-side-nav"><button data-admin-section="overview">Overview</button><button data-admin-section="requests">Requests</button><button data-admin-section="queue">Queue</button><button data-admin-tools="users">Users</button><button data-admin-health>Health</button></nav><main class="admin-content"></main></div>`;
          host.querySelectorAll('[data-admin-section],[data-admin-tools],[data-admin-health]').forEach(button => button.addEventListener('click', () => {
            const token = button.dataset.adminSection ? `section:${button.dataset.adminSection}` : button.dataset.adminTools ? `tools:${button.dataset.adminTools}` : 'health:legacy';
            window.__adminTest.legacyClicks[token] = (window.__adminTest.legacyClicks[token] || 0) + 1;
          }));
        }
        return Promise.resolve();
      },
    };
  });
  await page.addScriptTag({ content: runtimeSource });
  await page.evaluate(() => {
    const canonical = id => ({
      mount(ctx) { ctx.content(`<div data-canonical="${id}">${id}</div>`); },
      refresh(ctx) { ctx.content(`<div data-canonical="${id}">${id}</div>`); },
    });
    for (const id of ['section:overview', 'section:requests', 'section:queue']) window.DTL_ADMIN.registerRoute(id, canonical(id));
  });
  if (autoOpen) {
    await page.evaluate(() => window.DTL_ADMIN.open('section:overview'));
    await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:overview');
  }
}

test('registered navigation is owned only by the canonical router', async ({ page }) => {
  await boot(page);
  await page.locator('[data-admin-section="requests"]').click();
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:requests');
  expect(await page.evaluate(() => window.__adminTest.legacyClicks['section:requests'] || 0)).toBe(0);
});

test('unknown routes fail closed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const button = document.createElement('button'); button.dataset.adminSection = 'missing'; button.textContent = 'Missing'; document.querySelector('.admin-side-nav').append(button);
  });
  await page.locator('[data-admin-section="missing"]').click();
  await expect.poll(() => page.evaluate(() => window.__adminTest.routeErrors.length)).toBe(1);
  expect(await page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:overview');
});

test('leaving a route aborts stale GET requests', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__adminTest.getAborted = 0;
    window.fetch = (_url, options = {}) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => { window.__adminTest.getAborted += 1; reject(new DOMException('Aborted', 'AbortError')); }, { once: true }));
    window.DTL_ADMIN.registerRoute('health:1', { mount(ctx) { void ctx.api('/api/app/admin/slow').catch(() => {}); } });
  });
  await page.locator('[data-admin-health]').click();
  await page.locator('[data-admin-section="requests"]').click();
  await expect.poll(() => page.evaluate(() => window.__adminTest.getAborted)).toBe(1);
});

test('POST mutations are not route-aborted', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__adminTest.postHadSignal = null; window.__adminTest.postCompleted = 0;
    window.fetch = (_url, options = {}) => { window.__adminTest.postHadSignal = Boolean(options.signal); return new Promise(resolve => setTimeout(() => { window.__adminTest.postCompleted += 1; resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })); }, 40)); };
    window.DTL_ADMIN.registerRoute('health:1', { mount(ctx) { void ctx.api('/api/app/admin/mutate', { method: 'POST' }); } });
  });
  await page.locator('[data-admin-health]').click();
  await page.locator('[data-admin-section="requests"]').click();
  await page.waitForTimeout(70);
  expect(await page.evaluate(() => window.__adminTest.postHadSignal)).toBe(false);
  expect(await page.evaluate(() => window.__adminTest.postCompleted)).toBe(1);
});

test('rapid navigation leaves only the newest route active', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.DTL_ADMIN.registerRoute('tools:users', { async mount(ctx) { await new Promise(resolve => setTimeout(resolve, 50)); if (ctx.isCurrent()) ctx.content('<div id="usersMounted">users</div>'); } });
    window.DTL_ADMIN.registerRoute('health:1', { mount(ctx) { ctx.content('<div id="healthMounted">health</div>'); } });
  });
  await page.locator('[data-admin-tools="users"]').click();
  await page.locator('[data-admin-health]').click();
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('health:1');
  await expect(page.locator('#usersMounted')).toHaveCount(0);
});

test('restore uses only canonical v2 route storage', async ({ page }) => {
  await boot(page, { autoOpen: false });
  await page.evaluate(() => { sessionStorage.setItem('dtl:admin:route:v2', 'section:requests'); sessionStorage.setItem('dtl:admin:last-section', 'section:queue'); });
  await page.evaluate(() => window.DTL_ADMIN.restore());
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:requests');
  expect(await page.evaluate(() => sessionStorage.getItem('dtl:admin:last-section'))).toBe('section:queue');
});

test('leaving Admin clears route ownership', async ({ page }) => {
  await boot(page);
  await page.locator('#leaveAdmin').click();
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe(null);
  expect(await page.evaluate(() => document.body.dataset.dtlAdminRoute || '')).toBe('');
});
