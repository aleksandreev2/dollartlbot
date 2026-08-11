import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtime=fs.readFileSync(new URL('../public/app/public-title-deeplink.js',import.meta.url),'utf8');

async function boot(page,startParam=''){
  await page.setContent('<!doctype html><html><body><main id="viewRoot"></main></body></html>');
  await page.evaluate((start)=>{
    window.Telegram={WebApp:{initDataUnsafe:{start_param:start}}};
    window.__opened=[];
    window.DTL_APP={state:{bootstrap:null},openNovel(id){window.__opened.push(id);}};
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
