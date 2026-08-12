import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source = fs.readFileSync(new URL('../public/app/admin-broadcast-automations.js', import.meta.url), 'utf8');

async function boot(page, route = 'section:broadcasts') {
  await page.setContent('<main><section class="broadcast-center"><div class="existing">Manual broadcast UI</div></section></main>');
  await page.evaluate(initialRoute => {
    window.__auto = {
      route: initialRoute,
      patcher: null,
      patches: [],
      toasts: [],
      item: {
        key: 'unused_quota_reminders',
        label: 'Неиспользованный request',
        description: 'Два разных мягких напоминания в месяц.',
        enabled: true,
        schedule: '10–16 и 24–конец месяца · 10:00 UTC',
        schedule_days: [10, 24],
        eligible_now: 42,
        last_enqueued_at: '2026-08-10T10:00:00.000Z',
        next_due_at: '2026-08-24T10:00:00.000Z',
      },
    };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { window.__auto.patcher = fn; },
    };
    window.DTL_ADMIN = {
      activeRoute() { return window.__auto.route; },
      icons() {},
      toast(text, error = false) { window.__auto.toasts.push({ text, error }); },
      async api(path, options = {}) {
        if (path === '/api/app/admin/broadcast-automations' && !options.method) {
          return { automations: [{ ...window.__auto.item }] };
        }
        if (path === '/api/app/admin/broadcast-automations/unused_quota_reminders' && options.method === 'PATCH') {
          const body = JSON.parse(options.body || '{}');
          window.__auto.patches.push(body);
          window.__auto.item = { ...window.__auto.item, enabled: Boolean(body.enabled) };
          return { ok: true, automation: { ...window.__auto.item } };
        }
        throw new Error(`Unexpected API ${options.method || 'GET'} ${path}`);
      },
    };
  }, route);
  await page.addScriptTag({ content: source });
  await page.evaluate(() => window.__auto.patcher());
}

test('Broadcasts shows lifecycle automation status and can toggle it without touching manual composer', async ({ page }) => {
  await boot(page);

  const panel = page.locator('[data-broadcast-automations]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Неиспользованный request');
  await expect(panel).toContainText('42');
  await expect(panel).toContainText('10–16 и 24–конец месяца');
  await expect(page.locator('.existing')).toHaveText('Manual broadcast UI');

  const toggle = page.locator('[data-broadcast-automation-toggle]');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(() => page.evaluate(() => window.__auto.patches.length)).toBe(1);
  expect(await page.evaluate(() => window.__auto.patches[0])).toEqual({ enabled: false });
  await expect(panel).toContainText('Выключено');
  await expect(panel).toContainText('Автоматизация остановлена');
});

test('automation controls do not mount outside Broadcasts route', async ({ page }) => {
  await boot(page, 'section:home');
  await expect(page.locator('[data-broadcast-automations]')).toHaveCount(0);
});
