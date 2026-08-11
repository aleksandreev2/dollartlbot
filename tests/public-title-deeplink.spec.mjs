import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtime=fs.readFileSync(new URL('../public/app/public-title-deeplink.js',import.meta.url),'utf8');
const shell='<!doctype html><html><body><main id="viewRoot"></main></body></html>';

async function boot(page,startParam=''){
  await page.route('https://dollartl.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:shell}));
  await page.goto('https://dollartl.test/app/');
  await page.evaluate((start)=>{
    window.Telegram={WebApp:{initDataUnsafe:{start_param:start}}};
    window.__opened=[];
    window.__telegramLinks=[];
    window.lucide={createIcons(){}};
    window.DTL_APP={
      state:{bootstrap:null,locale:'en',view:'home',detailNovel:null},
      tg:{openTelegramLink(url){window.__telegramLinks.push(url);}},
      openNovel(id){window.__opened.push(id);},
    };
  },startParam);
  await page.addScriptTag({content:runtime});
}

test('Telegram startapp title deep link opens the matching title after bootstrap',async({page})=>{
  await boot(page,'title_174592');
  await page.evaluate(()=>{
    window.DTL_APP.state.bootstrap={user:{id:1}};
    document.dispatchEvent(new CustomEvent('dtl:bootstrap'));
  });
  await expect.poll(()=>page.evaluate(()=>window.__opened)).toEqual([174592]);
});

test('unrelated start parameters do not hijack Mini App navigation',async({page})=>{
  await boot(page,'ref_friend42');
  await page.evaluate(()=>{
    window.DTL_APP.state.bootstrap={user:{id:1}};
    document.dispatchEvent(new CustomEvent('dtl:bootstrap'));
  });
  await page.waitForTimeout(120);
  expect(await page.evaluate(()=>window.__opened)).toEqual([]);
});

test('title detail exposes a share progress action with the public card URL',async({page})=>{
  await boot(page,'');
  await page.evaluate(()=>{
    document.body.innerHTML='<div class="live-detail"><div class="live-detail-discovery"></div></div>';
    window.DTL_APP.state.view='detail';
    window.DTL_APP.state.detailNovel={id:7,title:'Academy Translator',queue_status:'in_progress',current_chapter:42,chapter_count:180};
    document.dispatchEvent(new CustomEvent('dtl:detail'));
  });
  await expect(page.locator('.public-title-share')).toContainText('Share progress');
  await page.locator('.public-title-share').click();
  const shared=await expect.poll(()=>page.evaluate(()=>window.__telegramLinks[0]||'')).not.toBe('');
  const target=await page.evaluate(()=>window.__telegramLinks[0]||'');
  const sharedUrl=new URL(target).searchParams.get('url');
  expect(sharedUrl).toBe('https://dollartl.test/share/title/7?kind=progress');
});
