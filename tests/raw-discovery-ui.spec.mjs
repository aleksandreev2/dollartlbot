import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtime=fs.readFileSync(new URL('../public/app/discover-page-runtime.js',import.meta.url),'utf8');

async function boot(page,{admin=false,rawStatus='verified',rawAvailable=true}={}){
  await page.setContent(`<!doctype html><html><body>
    <div class="discover-heading"><button id="discoverRequest" type="button">Request</button></div>
    <div id="discoverContent">
      <article class="discover-row discover-catalog-row" data-catalog="501">
        <div class="discover-row-copy"><div class="discover-row-meta"><span>24 ch.</span></div></div>
      </article>
    </div>
    <nav id="bottomNav"></nav>
  </body></html>`);
  await page.evaluate(({admin,rawStatus,rawAvailable})=>{
    const calls=[];
    window.__calls=calls;
    window.__toast=null;
    window.lucide={createIcons(){}};
    window.DTL_APP={
      state:{view:'discover',locale:'en',bootstrap:{user:{is_admin:admin}}},
      bottomNav:document.getElementById('bottomNav'),
      toast(message,type){window.__toast={message,type};},
      async api(path,options={}){
        calls.push({path,options});
        if(path==='/api/app/discovery/feed')return{
          fresh_novelpia:[{
            kind:'catalog',catalog_id:501,title:'Fresh RAW title',raw_available:rawAvailable,
            raw_verification_status:rawStatus,
            raw_page_url:'https://raw-fucknovelpia.com/novel/401201',
            raw_verified_at:rawStatus==='verified'?'2026-08-11T20:00:00Z':null,
          }],
        };
        if(path==='/api/app/discovery/catalog/refresh')return{
          started:true,busy:false,stages:['novelpia','raw_fucknovelpia'],
        };
        throw new Error(`Unexpected API ${path}`);
      },
    };
  },{admin,rawStatus,rawAvailable});
  await page.addScriptTag({content:runtime});
}

async function loadFeedAndRender(page){
  await page.evaluate(async()=>{
    await window.DTL_APP.api('/api/app/discovery/feed');
    document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'discover'}}));
  });
}

test('verified RAW from Fresh feed becomes a compact direct link',async({page})=>{
  await boot(page);
  await loadFeedAndRender(page);
  const raw=page.locator('[data-catalog="501"] .discover-verified-raw');
  await expect(raw).toHaveCount(1);
  await expect(raw).toHaveText('Verified RAW');
  await expect(raw).toHaveAttribute('href','https://raw-fucknovelpia.com/novel/401201');
  await expect(raw).toHaveAttribute('target','_blank');
});

test('unverified or unavailable RAW never gets a verified badge',async({page})=>{
  await boot(page,{rawStatus:'error',rawAvailable:true});
  await loadFeedAndRender(page);
  await expect(page.locator('.discover-verified-raw')).toHaveCount(0);
});

test('admin refresh control now refreshes the complete discovery source chain',async({page})=>{
  await boot(page,{admin:true});
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('dtl:discover',{detail:{view:'discover'}})));
  const refresh=page.locator('.discover-manual-refresh');
  await expect(refresh).toContainText('Refresh sources');
  await refresh.click();
  await expect.poll(()=>page.evaluate(()=>window.__calls.some(call=>call.path==='/api/app/discovery/catalog/refresh'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__toast?.message)).toBe('Discovery refresh started');
});
