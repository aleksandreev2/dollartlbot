import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source=fs.readFileSync(new URL('../public/app/admin-publishing-center.js',import.meta.url),'utf8');

const templates=[
  {template_key:'builtin:chapter_release',kind:'builtin',name:'Релиз новых глав',internal_title:'',body_html:'New chapters are now available.',add_footer:1,add_donate:1,add_bot_comment:1,notify_users:1},
  {template_key:'custom:7',kind:'custom',name:'Team template',internal_title:'Team title',body_html:'Saved team copy.',add_footer:1,add_donate:0,add_bot_comment:0,notify_users:0},
];

function createMarkup(route){
  const nav=`<nav class="admin-side-nav"><button data-admin-section="publishing"><span>Публикации</span></button><button data-admin-tools="publications"><span>Управление постами</span></button><button data-admin-section="broadcasts"><span>Рассылки</span></button></nav>`;
  const head='<header class="admin-work-head"><h1></h1><p></p></header>';
  if(route==='section:publishing')return `<section class="admin-v2">${nav}<div class="admin-workspace">${head}<main class="admin-content"><div class="publisher-layout"><section class="publisher-editor admin-panel"><div class="admin-panel-head"><div><h2>Новая публикация</h2></div></div><label><input id="pubTitle"></label><label><textarea id="pubBody"></textarea></label><input id="pubFooter" type="checkbox" checked><input id="pubDonate" type="checkbox" checked><input id="pubBotComment" type="checkbox" checked><input id="pubNotify" type="checkbox"><select id="pubSubmissionId"><option value=""></option><option value="12">#12</option></select><input id="pubImage" type="file"><input id="pubFiles" type="file" multiple><button id="pubPublish">Publish</button></section><aside class="publisher-preview"><div class="tg-preview"><div class="tg-preview-body"></div><div class="tg-preview-footer"></div><div class="tg-preview-buttons"><span></span><span></span></div></div></aside></div></main></div></section>`;
  return `<section class="admin-v2">${nav}<div class="admin-workspace">${head}<main class="admin-content"><section class="admin-publications-v3"><article class="admin-publication-card"><div class="admin-publication-main"><div class="admin-publication-actions"><button data-check-pub="9">Check</button></div></div></article></section></main></div></section>`;
}

async function boot(page,route='section:publishing'){
  await page.route('https://dtl.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:`<div id="toastRegion"></div>${createMarkup(route)}`}));
  await page.goto('https://dtl.test/');
  await page.evaluate(({route,templates})=>{
    window.__pc={route,templates,calls:[],opens:[],patcher:null,middleware:null,closing:false};
    window.Telegram={WebApp:{enableClosingConfirmation(){window.__pc.closing=true;},disableClosingConfirmation(){window.__pc.closing=false;}}};
    window.DTL_RUNTIME={
      registerPatcher(fn){window.__pc.patcher=fn;},
      registerFetchMiddleware(fn){window.__pc.middleware=fn;},
      schedule(){queueMicrotask(()=>window.__pc.patcher?.());},
    };
    window.DTL_ADMIN={
      activeRoute(){return window.__pc.route;},
      icons(){},toast(text,error=false){window.__pc.toast={text,error};},
      async open(id){window.__pc.opens.push(id);window.__pc.route=id;return true;},
      async api(path,options={}){
        const method=options.method||'GET';window.__pc.calls.push({path,method,body:options.body||null});
        if(path==='/api/app/admin/publishing-center'&&method==='GET')return{draft:{admin_user_id:1,internal_title:'Restored draft',body_html:'Restored body',add_footer:1,add_donate:0,add_bot_comment:1,notify_users:1,submission_id:12,source_publication_id:null,updated_at:'2026-08-11T10:00:00.000Z'},templates:window.__pc.templates,limits:{}};
        if(path==='/api/app/admin/publishing-center/draft'&&method==='POST'){const body=JSON.parse(options.body||'{}');return{ok:true,draft:{...body,updated_at:'2026-08-11T10:01:00.000Z'}};}
        if(path==='/api/app/admin/publishing-center/draft'&&method==='DELETE')return{ok:true};
        if(path==='/api/app/admin/publishing-center/preflight'){const body=JSON.parse(options.body||'{}'),ready=Boolean(body.internal_title&&body.body_html);return{ready,checks:[{id:'content',label:'Контент',status:ready?'ok':'error',message:ready?'Готово':'Заполните поля'}]};}
        if(path.startsWith('/api/app/admin/publishing-center/from-publication/'))return{ok:true,draft:{}};
        if(path==='/api/app/admin/publishing-center/templates'&&method==='POST')return{ok:true,id:8};
        if(/^\/api\/app\/admin\/publishing-center\/templates\/\d+$/.test(path)&&method==='DELETE')return{ok:true};
        throw new Error(`Unhandled ${method} ${path}`);
      },
    };
    window.DTL_ADMIN_STABILITY={confirm(){return Promise.resolve(true);}};
  },{route,templates});
  await page.addScriptTag({content:source});
  await page.evaluate(()=>window.__pc.patcher());
}

test('unifies navigation, restores server draft, autosaves and preflights before publish',async({page})=>{
  await boot(page);
  await expect(page.locator('.publishing-center-tabs button')).toHaveCount(3);
  await expect(page.locator('[data-pc-route="section:publishing"]')).toHaveClass(/active/);
  await expect(page.locator('[data-admin-tools="publications"]')).toHaveAttribute('data-publishing-center-hidden','1');
  await expect(page.locator('[data-admin-section="broadcasts"]')).toHaveAttribute('data-publishing-center-hidden','1');
  await expect(page.locator('[data-admin-section="publishing"] span')).toHaveText('Publishing');

  await expect(page.locator('#pubTitle')).toHaveValue('Restored draft');
  await expect(page.locator('#pubBody')).toHaveValue('Restored body');
  await expect(page.locator('#pubDonate')).not.toBeChecked();
  await expect(page.locator('#pubNotify')).toBeChecked();
  await expect(page.locator('#pubSubmissionId')).toHaveValue('12');
  await expect.poll(()=>page.locator('#pcPreflightState').textContent()).toContain('Готово');
  await expect(page.locator('#pubPublish')).toBeEnabled();

  await page.locator('#pubBody').fill('Edited autosaved body');
  await expect(page.locator('#pubPublish')).toBeDisabled();
  await page.locator('#pubBody').blur();
  await expect.poll(()=>page.evaluate(()=>window.__pc.calls.filter(c=>c.path==='/api/app/admin/publishing-center/draft'&&c.method==='POST').length),{timeout:2500}).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('#pcPreflightState').textContent()).toContain('Готово');
  await expect(page.locator('#pubPublish')).toBeEnabled();

  await page.locator('#pcTemplate').selectOption('builtin:chapter_release');
  await page.locator('#pcApplyTemplate').click();
  await expect(page.locator('#pubBody')).toHaveValue('New chapters are now available.');
  await expect(page.locator('#pubNotify')).toBeChecked();
});

test('published post can be copied into the unified create tab',async({page})=>{
  await boot(page,'tools:publications');
  await expect(page.locator('[data-pc-route="tools:publications"]')).toHaveClass(/active/);
  await expect(page.locator('[data-pc-clone="9"]')).toContainText('Использовать как шаблон');
  await page.locator('[data-pc-clone="9"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__pc.calls.some(c=>c.path==='/api/app/admin/publishing-center/from-publication/9'&&c.method==='POST'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__pc.opens.includes('section:publishing'))).toBe(true);
});
