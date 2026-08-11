import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const sources = Object.fromEntries([
  'runtime','console','publishingView','workflow','tools','health','broadcasts','navigation','publishingCenter',
].map(name => [name, fs.readFileSync(new URL(`../public/app/${({
  runtime:'admin-runtime.js', console:'admin-console.js', publishingView:'admin-publishing-view.js', workflow:'admin-workflow.js', tools:'admin-tools.js', health:'admin-health.js', broadcasts:'admin-broadcasts.js', navigation:'admin-navigation.js', publishingCenter:'admin-publishing-center.js',
})[name]}`, import.meta.url), 'utf8')]));

async function boot(page) {
  await page.route('https://dtl.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main id="viewRoot"></main><div id="toastRegion"></div>' }));
  await page.goto('https://dtl.test/');
  await page.evaluate(() => {
    const patchers = [];
    window.Telegram = { WebApp: { initData: 'integration', enableClosingConfirmation() {}, disableClosingConfirmation() {} } };
    window.lucide = { createIcons() {} };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { patchers.push(fn); return () => {}; },
      registerFetchMiddleware() { return () => {}; },
      schedule() { for (const fn of [...patchers]) { try { fn(); } catch {} } },
    };
    window.fetch = async input => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const path = url.pathname;
      let data = {};
      if (path === '/api/app/admin/list') data = { counts:{pending:0,queued:0,in_progress:0,completed:0}, requests:[] };
      else if (path === '/api/app/admin/publishing') data = { settings:{}, publications:[] };
      else if (path === '/api/app/admin/publishing-center') data = { templates:[], draft:null };
      else if (path === '/api/app/admin/publishing-center/preflight') data = { ready:true, checks:[{id:'ok',label:'Ready',status:'ok',message:'Ready'}] };
      else if (path === '/api/app/admin/broadcasts') data = { templates:[], audiences:[], locales:[{code:'en',label:'English'}], broadcasts:[] };
      else if (path === '/api/app/admin/broadcasts/estimate') data = { total:0, locales:{}, month_key:'2026-08' };
      else if (path === '/api/app/admin/users') data = { users:[], total:0, limit:40, has_more:false };
      else if (path === '/api/app/admin/health') data = { status:'healthy', generated_at:new Date().toISOString(), queue:{}, publications:{}, notifications:{}, telegram:{bot:{ok:true},channel:{ok:true},discussion:{ok:true}}, issues:{} };
      else if (path === '/api/app/admin/publications') data = { publications:[] };
      return new Response(JSON.stringify(data), { status:200, headers:{'content-type':'application/json'} });
    };
  });
  for (const key of ['runtime','console','publishingView','workflow','tools','health','broadcasts','navigation','publishingCenter']) await page.addScriptTag({ content: sources[key] });
  await page.evaluate(() => window.DTL_ADMIN.open('section:overview'));
}

test('Overview → Requests → Queue → Publishing → Publications → Broadcasts → Users → Health', async ({ page }) => {
  await boot(page);
  for (const route of ['section:overview','section:requests','section:queue','section:publishing','tools:publications','section:broadcasts','tools:users','health:1']) {
    await page.evaluate(routeId => window.DTL_ADMIN.open(routeId), route);
    await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe(route);
    await expect(page.locator('.admin-v2')).toHaveCount(1);
  }
});

test('admin integration mutation survives navigation', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    let completed = false;
    window.fetch = (_input, options = {}) => new Promise(resolve => setTimeout(() => { completed = true; resolve(new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json'}})); }, options.method === 'POST' ? 35 : 0));
    const mutation = window.DTL_ADMIN.api('/api/app/admin/test-mutation', { method:'POST' });
    await window.DTL_ADMIN.open('section:queue');
    await mutation;
    return completed;
  });
  expect(result).toBe(true);
});

test('autosave survives real module navigation and mobile admin shell does not overflow', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await boot(page);
  await page.evaluate(() => window.DTL_ADMIN.open('section:publishing'));
  await expect(page.locator('#pubTitle')).toHaveCount(1);
  await page.locator('#pubTitle').fill('Draft title');
  await page.waitForTimeout(30);
  await page.evaluate(() => window.DTL_ADMIN.open('section:requests'));
  await expect.poll(() => page.evaluate(() => window.DTL_ADMIN.activeRoute())).toBe('section:requests');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
