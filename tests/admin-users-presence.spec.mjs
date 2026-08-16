import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtimeSource = fs.readFileSync(new URL('../public/app/admin-runtime.js', import.meta.url), 'utf8');
const securityExtensionSource = fs.readFileSync(new URL('../public/app/admin-regional-access.js', import.meta.url), 'utf8');

async function boot(page) {
  await page.setContent('<div id="toastRegion"></div><div class="admin-v2"><div class="admin-work-head"><h1>Admin</h1><p></p></div><nav class="admin-side-nav"><button data-admin-section="overview">Overview</button><button data-admin-section="security">Security</button></nav><nav class="admin-mobile-nav"><button data-admin-section="overview">Overview</button><button data-admin-section="security">Security</button></nav><main class="admin-content"></main></div>');
  await page.evaluate(() => {
    window.Telegram = { WebApp: { initData: 'test' } };
    window.DTL_RUNTIME = { registerPatcher() {}, schedule() {} };
  });
  await page.addScriptTag({ content: runtimeSource });
  await page.evaluate(() => {
    window.DTL_ADMIN.registerRoute('section:overview', { mount(ctx) { ctx.content('<div>overview</div>'); } });
    window.DTL_ADMIN.registerRoute('section:security', { mount(ctx) { ctx.content('<div>security</div>'); } });
    window.DTL_ADMIN.registerRoute('tools:users', { mount(ctx) { ctx.setHead('Пользователи', 'users'); ctx.content('<div id="usersRouteMounted">users</div>'); } });
  });
  await page.addScriptTag({ content: securityExtensionSource });
  await page.waitForTimeout(20);
}

test('Users navigation is restored and opens the canonical Users route', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.admin-side-nav [data-admin-tools="users"]')).toHaveCount(1);
  await expect(page.locator('.admin-mobile-nav [data-admin-tools="users"]')).toHaveCount(1);
  await expect(page.locator('.admin-side-nav [data-admin-tools="users"] span')).toHaveText('Пользователи');

  await page.locator('.admin-side-nav [data-admin-tools="users"]').click();
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('tools:users');
  await expect(page.locator('#usersRouteMounted')).toHaveCount(1);
  await expect(page.locator('.admin-work-head h1')).toHaveText('Пользователи');
});

test('Users stays pinned immediately before Security after repeated renders', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('dtl:adminrender', { detail: { section: 'overview' } }));
    document.dispatchEvent(new CustomEvent('dtl:adminrender', { detail: { section: 'overview' } }));
  });
  await page.waitForTimeout(20);
  expect(await page.locator('.admin-side-nav [data-admin-tools="users"]').count()).toBe(1);
  const order = await page.locator('.admin-side-nav button').evaluateAll(buttons => buttons.map(button => button.dataset.adminTools || button.dataset.adminSection));
  expect(order.indexOf('users')).toBe(order.indexOf('security') - 1);
});
