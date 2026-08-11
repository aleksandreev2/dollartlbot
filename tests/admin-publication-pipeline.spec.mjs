import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source=fs.readFileSync(new URL('../public/app/admin-publication-pipeline.js',import.meta.url),'utf8');

async function boot(page){
  await page.route('https://dtl.test/**',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<section class="admin-v2"><main class="admin-content"><section class="admin-publications-v3"><article class="admin-publication-card"><div class="admin-publication-main"><div class="admin-publication-meta"></div><div class="admin-publication-actions"><button data-check-pub="9">Check</button></div></div></article></section></main></section>',
  }));
  await page.goto('https://dtl.test/');
  await page.evaluate(()=>{
    window.__pipeline={patcher:null,calls:[],opens:[]};
    window.DTL_RUNTIME={registerPatcher(fn){window.__pipeline.patcher=fn;},schedule(){queueMicrotask(()=>window.__pipeline.patcher?.());}};
    window.DTL_ADMIN={
      activeRoute(){return'tools:publications';},icons(){},toast(text,error=false){window.__pipeline.toast={text,error};},
      async open(id){window.__pipeline.opens.push(id);return true;},
      async api(path){window.__pipeline.calls.push(path);if(path==='/api/app/admin/publishing-center/pipeline')return{pipelines:[{id:9,status:'published',channel_message_id:321,discussion_message_id:654,comments_check_status:'complete',notify_users:1,file_count:2,release_broadcast_id:77,release_broadcast_status:'completed',release_sent_count:120,release_failed_count:3}]};throw new Error(`Unhandled ${path}`);},
    };
  });
  await page.addScriptTag({content:source});
  await page.evaluate(()=>window.__pipeline.patcher());
}

test('shows post, comments/files and release delivery in one publication card',async({page})=>{
  await boot(page);
  await expect(page.locator('.publication-pipeline-step')).toHaveCount(3);
  await expect(page.locator('.publication-pipeline')).toContainText('Telegram post');
  await expect(page.locator('.publication-pipeline')).toContainText('message #321');
  await expect(page.locator('.publication-pipeline')).toContainText('2 файл(ов) доставлено');
  await expect(page.locator('.publication-pipeline')).toContainText('#77 · 120 sent · 3 failed');
  await expect(page.locator('[data-open-broadcasts]')).toBeVisible();
  await page.locator('[data-open-broadcasts]').click();
  await expect.poll(()=>page.evaluate(()=>window.__pipeline.opens.includes('section:broadcasts'))).toBe(true);
});
