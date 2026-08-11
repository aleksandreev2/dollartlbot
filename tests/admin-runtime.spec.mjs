import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtimeSource = fs.readFileSync(new URL('../public/app/admin-runtime.js', import.meta.url), 'utf8');

const harness = String.raw`
  window.__adminTest = {
    legacyClicks: Object.create(null),
    abortReads: 0,
    mounts: Object.create(null),
    unmounts: Object.create(null),
  };
  window.Telegram = { WebApp: { initData: 'signed-browser-test' } };
  window.DTL_RUNTIME = {
    registerPatcher() {},
    schedule() {},
  };
  window.DTL_ADMIN_STABILITY = {
    abortReads() { window.__adminTest.abortReads += 1; },
  };
  window.DTL_ADMIN_CONSOLE = {
    open() {
      const host = document.getElementById('fixture');
      if (!host.querySelector('.admin-v2')) {
        host.innerHTML = `
          <div id="toastRegion"></div>
          <div class="admin-v2">
            <div class="admin-work-head"><h1></h1><p></p></div>
            <nav class="admin-side-nav">
              <button type="button" data-admin-section="overview">Overview</button>
              <button type="button" data-admin-section="requests">Requests</button>
              <button type="button" data-admin-section="queue">Queue</button>
              <button type="button" data-admin-tools="users">Users</button>
              <button type="button" data-admin-tools="analytics">Analytics</button>
              <button type="button" data-admin-health>Health</button>
            </nav>
            <main class="admin-content"></main>
          </div>`;
        host.querySelectorAll('[data-admin-section],[data-admin-tools],[data-admin-health]').forEach(button => {
          button.addEventListener('click', () => {
            const token = button.dataset.adminSection
              ? `section:${button.dataset.adminSection}`
              : button.dataset.adminTools
                ? `tools:${button.dataset.adminTools}`
                : 'health:legacy';
            window.__adminTest.legacyClicks[token] = (window.__adminTest.legacyClicks[token] || 0) + 1;
            const area = host.querySelector('.admin-content');
            if (area) area.textContent = `legacy:${token}`;
          });
        });
      }
      return Promise.resolve();
    },
  };
`;

async function boot(page) {
  await page.setContent('<div id="fixture"></div><button id="leaveAdmin" data-nav="home">Leave admin</button>');
  await page.addScriptTag({ content: harness });
  await page.addScriptTag({ content: runtimeSource });
  await page.evaluate(() => window.DTL_ADMIN.open('section:overview'));
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:overview');
}

test('legacy navigation is replayed exactly once through the canonical router', async ({ page }) => {
  await boot(page);

  await page.locator('[data-admin-section="requests"]').click();

  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:requests');
  expect(await page.evaluate(() => window.__adminTest.legacyClicks['section:requests'] || 0)).toBe(1);
  expect(await page.locator('.admin-content').textContent()).toBe('legacy:section:requests');
});

test('registered routes mount and unmount without invoking their legacy click handler', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.DTL_ADMIN.registerRoute('health:1', {
      mount(ctx) {
        window.__adminTest.mounts.health = (window.__adminTest.mounts.health || 0) + 1;
        ctx.setHead('Health route', 'Mounted by DTL_ADMIN');
        ctx.content('<div id="healthMounted">healthy</div>');
      },
      unmount() {
        window.__adminTest.unmounts.health = (window.__adminTest.unmounts.health || 0) + 1;
      },
    });
  });

  await page.locator('[data-admin-health]').click();
  await expect(page.locator('#healthMounted')).toHaveText('healthy');
  expect(await page.evaluate(() => window.__adminTest.mounts.health)).toBe(1);
  expect(await page.evaluate(() => window.__adminTest.legacyClicks['health:legacy'] || 0)).toBe(0);

  await page.locator('[data-admin-section="queue"]').click();
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:queue');
  expect(await page.evaluate(() => window.__adminTest.unmounts.health)).toBe(1);
});

test('leaving a route aborts its stale GET request', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__adminTest.getAborted = 0;
    window.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        window.__adminTest.getAborted += 1;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
    window.DTL_ADMIN.registerRoute('health:1', {
      mount(ctx) {
        void ctx.api('/api/app/admin/slow').catch(error => {
          if (error?.name !== 'AbortError') window.__adminTest.getUnexpectedError = String(error);
        });
      },
    });
  });

  await page.locator('[data-admin-health]').click();
  await page.locator('[data-admin-section="requests"]').click();

  await expect.poll(() => page.evaluate(() => window.__adminTest.getAborted)).toBe(1);
  expect(await page.evaluate(() => window.__adminTest.getUnexpectedError || '')).toBe('');
});

test('route changes never attach the route AbortSignal to POST mutations', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__adminTest.postHadSignal = null;
    window.__adminTest.postAborted = 0;
    window.__adminTest.postCompleted = 0;
    window.fetch = (_url, options = {}) => {
      window.__adminTest.postHadSignal = Boolean(options.signal);
      options.signal?.addEventListener('abort', () => { window.__adminTest.postAborted += 1; }, { once: true });
      return new Promise(resolve => setTimeout(() => {
        window.__adminTest.postCompleted += 1;
        resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }, 50));
    };
    window.DTL_ADMIN.registerRoute('health:1', {
      mount(ctx) {
        void ctx.api('/api/app/admin/mutate', { method: 'POST' });
      },
    });
  });

  await page.locator('[data-admin-health]').click();
  await page.locator('[data-admin-section="requests"]').click();
  await page.waitForTimeout(80);

  expect(await page.evaluate(() => window.__adminTest.postHadSignal)).toBe(false);
  expect(await page.evaluate(() => window.__adminTest.postAborted)).toBe(0);
  expect(await page.evaluate(() => window.__adminTest.postCompleted)).toBe(1);
});

test('rapid route changes leave only the newest registered route active', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.DTL_ADMIN.registerRoute('tools:users', {
      async mount(ctx) {
        await new Promise(resolve => setTimeout(resolve, 60));
        if (ctx.isCurrent()) ctx.content('<div id="usersMounted">users</div>');
      },
    });
    window.DTL_ADMIN.registerRoute('tools:analytics', {
      mount(ctx) {
        ctx.content('<div id="analyticsMounted">analytics</div>');
      },
    });
  });

  await page.locator('[data-admin-tools="users"]').click();
  await page.locator('[data-admin-tools="analytics"]').click();

  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('tools:analytics');
  await expect(page.locator('#analyticsMounted')).toHaveText('analytics');
  await expect(page.locator('#usersMounted')).toHaveCount(0);
});

test('leaving Admin aborts route reads and clears route ownership', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__adminTest.leaveAborted = 0;
    window.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        window.__adminTest.leaveAborted += 1;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
    window.DTL_ADMIN.registerRoute('health:1', {
      mount(ctx) { void ctx.api('/api/app/admin/slow-leave').catch(() => {}); },
    });
  });

  await page.locator('[data-admin-health]').click();
  await page.locator('#leaveAdmin').click();

  await expect.poll(() => page.evaluate(() => window.__adminTest.leaveAborted)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe(null);
  expect(await page.evaluate(() => document.body.dataset.dtlAdminRoute || '')).toBe('');
});
