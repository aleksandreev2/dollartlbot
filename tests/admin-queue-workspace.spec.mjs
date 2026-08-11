import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read = name => fs.readFileSync(new URL(`../public/app/${name}`, import.meta.url), 'utf8');
const sources = {
  runtime: read('admin-runtime.js'),
  console: read('admin-console.js'),
  workflow: read('admin-workflow.js'),
  queue: read('admin-queue-workspace.js'),
  navigation: read('admin-navigation.js'),
  home: read('admin-home-v2.js'),
};

async function boot(page) {
  await page.route('https://dtl.test/**', route => route.fulfill({ status:200, contentType:'text/html', body:'<main id="viewRoot"></main><div id="toastRegion"></div>' }));
  await page.goto('https://dtl.test/');
  await page.evaluate(() => {
    const patchers = [];
    const server = {
      progress: 3,
      progressUpdatedAt: '2026-08-11T10:00:00.000Z',
      working: true,
      queued: true,
    };
    window.__queueServer = server;
    window.Telegram = { WebApp:{ initData:'queue-test' } };
    window.lucide = { createIcons() {} };
    window.DTL_RUNTIME = {
      registerPatcher(fn) { patchers.push(fn); return () => {}; },
      registerFetchMiddleware() { return () => {}; },
      schedule() { for (const fn of [...patchers]) { try { fn(); } catch {} } },
    };
    const request17 = () => ({
      id:17,user_id:101,language:'en',title:'First Novel',original_language:'Korean',chapter_count:20,
      publication_status:'ongoing',source_url:'https://example.com/17',raw_file_id:'raw17',raw_file_name:'17.txt',raw_file_mime:'text/plain',
      genres_tags:'Fantasy',sexual_content:'None',sensitive_content:'None',notes:'',plan:'regular',status:'pending',slot_returned:0,
      queue_status:null,queue_position:null,queued_at:null,started_at:null,completed_at:null,current_chapter:null,progress_updated_at:null,
      created_at:'2026-08-11T09:00:00.000Z',updated_at:'2026-08-11T09:00:00.000Z',username:'reader17',first_name:'Reader',
    });
    const working = () => ({
      id:31,user_id:301,language:'en',title:'Working Novel',original_language:'Korean',chapter_count:12,
      publication_status:'ongoing',source_url:'https://example.com/31',genres_tags:'Action',sexual_content:'None',sensitive_content:'None',notes:'',plan:'regular',
      status:'accepted',slot_returned:0,queue_status:'in_progress',queue_position:null,current_chapter:server.progress,
      progress_updated_at:server.progressUpdatedAt,created_at:'2026-08-10T09:00:00.000Z',updated_at:server.progressUpdatedAt,username:'worker',first_name:'Worker',
    });
    const queued = () => ({
      id:32,user_id:302,language:'en',title:'Next Novel',original_language:'Japanese',chapter_count:40,
      publication_status:'ongoing',source_url:'https://example.com/32',genres_tags:'Fantasy',sexual_content:'None',sensitive_content:'None',notes:'',plan:'subscriber',
      status:'accepted',slot_returned:0,queue_status:'queued',queue_position:1,current_chapter:null,progress_updated_at:null,
      created_at:'2026-08-10T10:00:00.000Z',updated_at:'2026-08-10T10:00:00.000Z',username:'next',first_name:'Next',
    });

    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const path = url.pathname;
      const method = String(options.method || 'GET').toUpperCase();
      let data = {};
      if (path === '/api/app/admin/list') {
        const kind = url.searchParams.get('kind');
        if (kind === 'pending') data = { counts:{pending:1,queued:1,in_progress:server.working?1:0,completed:server.working?0:1}, requests:[request17()] };
        else if (kind === 'active') data = { requests:server.working ? [working()] : [] };
        else if (kind === 'queue') data = { requests:[...(server.working?[working()]:[]), ...(server.queued?[queued()]:[])] };
        else data = { requests:[request17()] };
      } else if (path === '/api/app/admin/publishing') data = { settings:{}, publications:[] };
      else if (path === '/api/app/admin/events') data = { summary:{total:0,unread:0,unread_problems:0,failed_alerts:0}, events:[], next_before:null };
      else if (path === '/api/app/admin/health') data = { status:'healthy' };
      else if (path === '/api/app/admin/requests/17') data = { request:request17(), admin_meta:{notes:''}, publications:[], audit:[] };
      else if (path === '/api/app/admin/action' && method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        if (body.action === 'progress') {
          server.progress = Number(body.current_chapter);
          server.progressUpdatedAt = '2026-08-11T13:30:00.000Z';
        } else if (body.action === 'complete') {
          server.working = false;
        } else if (body.action === 'start') {
          server.working = true; server.queued = false;
        } else if (body.action === 'backqueue') {
          server.working = false; server.queued = true;
        }
        data = { ok:true, novel:{ title:'Working Novel', current_chapter:server.progress, progress_updated_at:server.progressUpdatedAt }, counts:{} };
      } else if (/\/api\/app\/admin\/requests\/\d+\/queue-position$/.test(path)) data = { ok:true };
      return new Response(JSON.stringify(data), { status:200, headers:{'content-type':'application/json'} });
    };
  });

  for (const key of ['runtime','console','workflow','queue','navigation','home']) await page.addScriptTag({ content:sources[key] });
  await page.evaluate(() => { window.DTL_ADMIN_REQUEST_OPS = { open(id) { window.__editedRequest = id; } }; });
}

test('Home exposes direct request editing', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.DTL_ADMIN.open('section:overview'));
  const edit = page.locator('[data-home-edit-request="17"]');
  await expect(edit).toBeVisible();
  await edit.click();
  await expect.poll(() => page.evaluate(() => window.__editedRequest || 0)).toBe(17);
});

test('Queue saves progress in place and offers publication after completion', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.DTL_ADMIN.open('section:queue'));
  await expect(page.getByRole('heading', { name:'Сейчас переводим' })).toBeVisible();
  await expect(page.locator('[data-qw-working="31"]')).toBeVisible();
  await expect(page.locator('[data-qw-row="32"]')).toBeVisible();

  const input = page.locator('[data-qw-progress-input="31"]');
  await input.fill('8');
  await page.locator('[data-qw-action="progress"][data-id="31"]').click();
  await expect(page.locator('[data-qw-progress-percent]')).toHaveText('67%');
  await expect(page.locator('[data-qw-progress-status]')).toContainText('Сохранено');
  await expect(page.locator('[data-qw-working="31"]')).toBeVisible();

  await page.locator('[data-qw-action="complete"][data-id="31"]').click();
  await expect(page.locator('.admin-queue-completed-banner')).toContainText('Working Novel');
  await expect(page.locator('[data-qw-publish="31"]')).toBeVisible();
});
