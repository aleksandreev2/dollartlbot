import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source = fs.readFileSync(new URL('../public/app/admin-broadcasts.js', import.meta.url), 'utf8');

const template = {
  key: 'unused_quota',
  label: 'Неиспользованная квота',
  description: 'Напоминание о свободной квоте.',
  audience: 'unused_quota',
  action_url: '/app/?view=suggest',
  localizations: {
    en: { title: 'Quota still available', body: 'You still have a translation request available.', action_label: 'Suggest a novel' },
    ru: { title: 'Квота ещё доступна', body: 'У вас ещё есть заявка на перевод.', action_label: 'Предложить новеллу' },
  },
};

async function boot(page) {
  await page.route('https://dtl.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<div id="toastRegion"></div><section class="admin-v2"><header class="admin-work-head"><h1></h1><p></p></header><main class="admin-content"></main></section>',
  }));
  await page.goto('https://dtl.test/');
  await page.evaluate(templateValue => {
    window.__broadcastTest = {
      route: null,
      patcher: null,
      calls: [],
      confirms: [],
      template: templateValue,
    };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { window.__broadcastTest.patcher = fn; },
    };
    window.DTL_ADMIN = {
      registerRoute(id, config) {
        if (id === 'section:broadcasts') window.__broadcastTest.route = config;
      },
      activeRoute() { return 'section:broadcasts'; },
      setHead(title, subtitle) {
        document.querySelector('.admin-work-head h1').textContent = title;
        document.querySelector('.admin-work-head p').textContent = subtitle;
      },
      content(html) { document.querySelector('.admin-content').innerHTML = html; },
      toast(text, error = false) { window.__broadcastTest.toast = { text, error }; },
      icons() {},
      open() { return Promise.resolve(true); },
      async api(path, options = {}) {
        window.__broadcastTest.calls.push({ path, method: options.method || 'GET', body: options.body || null });
        if (path === '/api/app/admin/broadcasts' && (!options.method || options.method === 'GET')) {
          return {
            templates: [window.__broadcastTest.template],
            audiences: [
              { id: 'all', label: 'Все пользователи' },
              { id: 'unused_quota', label: 'Не использовали квоту' },
            ],
            locales: [
              { code: 'en', label: '🇬🇧 English' },
              { code: 'ru', label: '🇷🇺 Русский' },
            ],
            broadcasts: [],
          };
        }
        if (path === '/api/app/admin/broadcasts/estimate') {
          const parsed = JSON.parse(options.body || '{}');
          return { audience: parsed.audience, total: 12, locales: { en: 7, ru: 5 }, month_key: '2026-08' };
        }
        if (path === '/api/app/admin/broadcasts/test') return { ok: true };
        if (path === '/api/app/admin/broadcasts' && options.method === 'POST') return { ok: true, broadcast_id: 42, status: 'queued' };
        if (/\/api\/app\/admin\/broadcasts\/\d+\/retry$/.test(path)) return { ok: true };
        throw new Error(`Unhandled API ${options.method || 'GET'} ${path}`);
      },
    };
    window.DTL_ADMIN_STABILITY = {
      confirm(config) { window.__broadcastTest.confirms.push(config); return Promise.resolve(true); },
    };
  }, template);
  await page.addScriptTag({ content: source });
  await page.evaluate(() => window.__broadcastTest.route.mount());
}

test('template route localizes copy and estimates the real quota audience', async ({ page }) => {
  await boot(page);

  await expect(page.locator('.broadcast-template-card.active')).toContainText('Неиспользованная квота');
  await expect(page.locator('#broadcastAudience')).toHaveValue('unused_quota');
  await expect.poll(() => page.evaluate(() => window.__broadcastTest.calls.some(call => call.path === '/api/app/admin/broadcasts/estimate'))).toBe(true);

  const estimateCall = await page.evaluate(() => window.__broadcastTest.calls.find(call => call.path === '/api/app/admin/broadcasts/estimate'));
  expect(JSON.parse(estimateCall.body)).toEqual({ audience: 'unused_quota' });
  await expect(page.locator('#broadcastEstimate')).toContainText('12 получателей');

  await page.locator('[data-broadcast-locale="ru"]').click();
  await expect(page.locator('#broadcastTitle')).toHaveValue('Квота ещё доступна');
  await expect(page.locator('#broadcastBody')).toHaveValue('У вас ещё есть заявка на перевод.');
  await expect(page.locator('.broadcast-tg-preview')).toContainText('Квота ещё доступна');
});

test('custom campaign uses English fallback, copies localization and sends localized payload', async ({ page }) => {
  await boot(page);
  await page.locator('[data-broadcast-template="custom"]').click();
  await expect(page.locator('#broadcastAudience')).toHaveValue('all');

  await page.locator('#broadcastTitle').fill('Custom English title');
  await page.locator('#broadcastBody').fill('Custom English body');
  await page.locator('#broadcastActionLabel').fill('Open request form');

  await page.locator('[data-broadcast-locale="ru"]').click();
  await expect(page.locator('#broadcastTitle')).toHaveValue('');
  await expect(page.locator('.broadcast-tg-preview')).toContainText('Custom English title');
  await expect(page.locator('.broadcast-tg-preview')).toContainText('Custom English body');

  await page.locator('[data-copy-english]').click();
  await expect(page.locator('#broadcastTitle')).toHaveValue('Custom English title');
  await page.locator('#broadcastTitle').fill('Русский заголовок');
  await page.locator('#broadcastBody').fill('Русский текст');
  await page.locator('#broadcastActionLabel').fill('Открыть заявку');

  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN_BROADCASTS.state().estimate?.total || 0)).toBe(12);
  await page.locator('#broadcastTest').click();
  await expect.poll(() => page.evaluate(() => window.__broadcastTest.calls.filter(call => call.path === '/api/app/admin/broadcasts/test').length)).toBe(1);

  const testBody = await page.evaluate(() => {
    const call = window.__broadcastTest.calls.find(item => item.path === '/api/app/admin/broadcasts/test');
    return JSON.parse(call.body);
  });
  expect(testBody.locale).toBe('ru');
  expect(testBody.localizations.en.title).toBe('Custom English title');
  expect(testBody.localizations.ru.title).toBe('Русский заголовок');

  await page.locator('#broadcastSend').click();
  await expect.poll(() => page.evaluate(() => window.__broadcastTest.calls.filter(call => call.path === '/api/app/admin/broadcasts' && call.method === 'POST').length)).toBe(1);
  expect(await page.evaluate(() => window.__broadcastTest.confirms.length)).toBe(1);

  const createBody = await page.evaluate(() => {
    const call = window.__broadcastTest.calls.find(item => item.path === '/api/app/admin/broadcasts' && item.method === 'POST');
    return JSON.parse(call.body);
  });
  expect(createBody.template_key).toBeNull();
  expect(createBody.audience).toBe('all');
  expect(createBody.localizations.en.body).toBe('Custom English body');
  expect(createBody.localizations.ru.action_label).toBe('Открыть заявку');
});
