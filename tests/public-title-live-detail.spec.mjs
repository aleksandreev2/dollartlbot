import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=[read('public/app/app.css'),read('public/app/novel-detail.css')].join('\n');
const sources={
  presenter:read('public/app/novel-presenter.js'),
  core:read('public/app/app-core.js'),
  i18n:read('public/app/view-i18n.js'),
  home:read('public/app/view-home.js'),
  queue:read('public/app/view-queue.js'),
  share:read('public/app/public-title-deeplink.js'),
};

async function boot(page){
  await page.setViewportSize({width:1200,height:850});
  await page.route('https://detail.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/app/flags/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#ddd"/></svg>'});
    return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body><div id="app" class="app-shell" aria-busy="true"><header class="topbar"></header><div id="previewBanner" hidden></div><main id="viewRoot" class="view-root"></main><nav id="bottomNav" class="bottom-nav"></nav><div id="toastRegion"></div><div id="sheetRoot"></div></div><input id="novelFilePicker" type="file" hidden></body></html>`});
  });
  await page.goto('https://detail.test/app/');
  await page.evaluate(()=>{
    window.__telegramLinks=[];
    window.Telegram={WebApp:{ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},openTelegramLink(url){window.__telegramLinks.push(url);},initDataUnsafe:{},HapticFeedback:{selectionChanged(){}}}};
    window.lucide={createIcons(){}};
    const labels={en:'English',ko:'Korean'};
    const detect=value=>String(value||'').toLowerCase().includes('korean')?'ko':String(value||'').toLowerCase().includes('english')?'en':'';
    window.DTL_I18N={copy:key=>({reader:'Reader',progress:'Translation progress',justNow:'just now'}[key]||key),table:()=>({}),detectLanguage:detect,languageLabel:code=>labels[code]||code,tagLabel:value=>String(value||''),locale:()=>window.DTL_APP?.state?.locale||'en'};
    window.DTL_RUNTIME={detectLanguage:detect,locale:()=>window.DTL_APP?.state?.locale||'en',schedule(){}};
  });
  for(const key of ['presenter','core','i18n','home','queue','share'])await page.addScriptTag({content:sources[key]});
  await page.evaluate(async()=>{
    await window.DTL_APP.init();
    const app=window.DTL_APP;
    app.state.detailNovel={id:7,title:'Academy Translator',original_language:'Korean',chapter_count:180,publication_status:'ongoing',source_url:'https://example.com/original',queue_status:'in_progress',current_chapter:42,progress_percent:23,requester_username:'reader_user',genres_tags:'Fantasy, Academy',updated_at:'2026-08-11T15:00:00Z'};
    app.navigate('detail',false);
  });
}

test('real title detail renders visible share progress CTA and correct public share URL',async({page})=>{
  await boot(page);
  const share=page.locator('.live-detail-actions .public-title-share');
  await expect(share).toBeVisible();
  await expect(share).toContainText('Share progress');
  await expect(page.locator('.live-detail-actions > *')).toHaveCount(3);
  await share.click();
  await expect.poll(()=>page.evaluate(()=>window.__telegramLinks[0]||'')).not.toBe('');
  const target=await page.evaluate(()=>window.__telegramLinks[0]);
  const sharedUrl=new URL(target).searchParams.get('url');
  expect(sharedUrl).toBe('https://detail.test/share/title/7?kind=progress');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
