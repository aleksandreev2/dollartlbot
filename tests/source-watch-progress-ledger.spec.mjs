import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const sourceUi = fs.readFileSync(new URL('../public/app/admin-source-watch.js', import.meta.url), 'utf8');
const sourceCss = fs.readFileSync(new URL('../public/app/admin-source-watch.css', import.meta.url), 'utf8');

async function boot(page, route = 'section:queue') {
  await page.route('https://dtl.test/**', handler => handler.fulfill({ status:200, contentType:'text/html', body:'<main class="admin-content"></main><div id="toastRegion"></div>' }));
  await page.goto('https://dtl.test/');
  await page.addStyleTag({ content:sourceCss });
  await page.evaluate(initialRoute => {
    const patchers = [];
    const responseHandlers = [];
    const state = {
      route:initialRoute,
      attention:true,
      refreshOne:0,
      refreshAll:0,
      acknowledged:0,
    };
    window.__sourceWatchTest = state;
    window.lucide = { createIcons() {} };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { patchers.push(fn); return () => {}; },
      registerResponseHandler(fn) { responseHandlers.push(fn); return () => {}; },
      schedule() { for (const fn of patchers) { try { fn(); } catch {} } },
    };
    const payload = () => ({
      generated_at:'2026-08-12T06:00:00.000Z',
      summary:{ watched:2,due:0,errors:0,attention:state.attention?1:0,last_success_at:'2026-08-12T05:55:00.000Z' },
      watches:[
        {
          submission_id:31,external_id:'401201',last_success_at:'2026-08-12T05:55:00.000Z',last_error:null,
          last_remote_chapter_count:93,last_remote_publication_status:'ongoing',title:'Working Novel',chapter_count:86,
          queue_status:'in_progress',attention_count:state.attention?1:0,attention_field:state.attention?'chapter_count':null,
          attention_old_value:state.attention?'86':null,attention_new_value:state.attention?'93':null,
        },
        {
          submission_id:32,external_id:'401202',last_success_at:'2026-08-12T05:54:00.000Z',last_error:null,
          last_remote_chapter_count:42,last_remote_publication_status:'completed',title:'Next Novel',chapter_count:42,
          queue_status:'queued',attention_count:0,
        },
      ],
      attention:state.attention ? [{ id:9,submission_id:31,title:'Working Novel',field_name:'chapter_count',old_value:'86',new_value:'93',created_at:'2026-08-12T05:55:00.000Z' }] : [],
      ingest:{ provider:'novelpia_source_watch',last_success_at:'2026-08-12T05:55:00.000Z' },
    });
    window.DTL_ADMIN = {
      activeRoute:() => state.route,
      api:async (path, options={}) => {
        const method=String(options.method||'GET').toUpperCase();
        if(path==='/api/app/admin/source-watch/status') return payload();
        if(path==='/api/app/admin/source-watch/acknowledge'&&method==='POST') {
          state.acknowledged+=1;state.attention=false;return {ok:true,...payload()};
        }
        if(path==='/api/app/admin/source-watch/refresh'&&method==='POST') {
          const body=JSON.parse(options.body||'{}');
          if(body.submission_id) state.refreshOne+=1; else state.refreshAll+=1;
          return {ok:true,result:{checked:body.submission_id?1:2}};
        }
        return {};
      },
      open:id=>{state.route=id;},
      icons() {},
      toast(text,error=false) { state.toast={text,error}; },
    };
  }, route);
  await page.addScriptTag({ content:sourceUi });
}

async function renderQueue(page) {
  await page.locator('.admin-content').evaluate(node => {
    node.innerHTML = `
      <section class="admin-queue-workspace">
        <article class="admin-panel admin-queue-working-card" data-qw-working="31"><div class="admin-queue-working-top"><div>Working Novel</div></div></article>
        <article class="admin-queue-workspace-row" data-qw-row="32"><button class="admin-queue-workspace-title"><strong>Next Novel</strong><small>Korean · 42 chapters</small></button><div class="admin-queue-workspace-row-actions"></div></article>
      </section>`;
  });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dtl:adminrender',{detail:{section:'queue'}})));
}

async function renderHealth(page) {
  await page.locator('.admin-content').evaluate(node => {
    node.innerHTML = `<section class="ops-health"><div class="ops-health-grid"></div><section class="admin-panel ops-health-issues"><div>Existing issues</div></section></section>`;
  });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('dtl:adminrender',{detail:{section:'health'}})));
}

test('Queue shows unresolved NovelPia source changes and Reviewed clears the warning', async ({ page }) => {
  await boot(page, 'section:queue');
  await renderQueue(page);

  const working = page.locator('[data-qw-working="31"] [data-source-watch-inline]');
  await expect(working).toBeVisible();
  await expect(working).toContainText('Число глав: 86 → 93');
  await expect(working).toContainText('NovelPia #401201');

  const queued = page.locator('[data-qw-row="32"] [data-source-watch-row]');
  await expect(queued).toContainText('42 глав');

  await working.locator('[data-source-watch-ack="31"]').click();
  await expect.poll(() => page.evaluate(() => window.__sourceWatchTest.acknowledged)).toBe(1);
  await expect(page.locator('[data-qw-working="31"] [data-source-watch-inline]')).not.toContainText('86 → 93');
  await expect(page.locator('[data-qw-working="31"] [data-source-watch-inline]')).toContainText('Источник: 93 глав');

  await page.locator('[data-qw-working="31"] [data-source-watch-refresh="31"]').click();
  await expect.poll(() => page.evaluate(() => window.__sourceWatchTest.refreshOne)).toBe(1);
});

test('Health exposes source watch counts, unresolved changes and stays mobile-safe', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 });
  await boot(page, 'health:1');
  await renderHealth(page);

  const card = page.locator('[data-source-watch-health]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Под наблюдением');
  await expect(card).toContainText('Нужно разобрать');
  await expect(page.locator('[data-source-watch-attention]')).toContainText('Working Novel');
  await expect(page.locator('[data-source-watch-attention]')).toContainText('86 → 93');

  await card.locator('[data-source-watch-refresh-all]').click();
  await expect.poll(() => page.evaluate(() => window.__sourceWatchTest.refreshAll)).toBe(1);

  const overflow = await page.evaluate(() => ({ width:document.documentElement.scrollWidth, viewport:window.innerWidth }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
});
