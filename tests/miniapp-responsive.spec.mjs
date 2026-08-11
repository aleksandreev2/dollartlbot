import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = [
  'public/app/app.css',
  'public/app/ui-polish.css',
  'public/app/card-upgrade.css',
  'public/app/interaction-upgrade.css',
  'public/app/feature-upgrades.css',
  'public/app/suggest-content-picker.css',
  'public/app/language-switch.css',
  'public/app/home-v2.css',
  'public/app/desktop.css',
  'public/app/desktop-v2.css',
  'public/app/telegram-desktop.css',
].map(read).join('\n');

const sources = {
  core: read('public/app/app-core.js'),
  i18n: read('public/app/view-i18n.js'),
  interaction: read('public/app/interaction-upgrade.js'),
  home: read('public/app/view-home.js'),
  queue: read('public/app/view-queue.js'),
  suggest: read('public/app/view-suggest.js'),
  contentPicker: read('public/app/suggest-content-picker.js'),
  contentApi: read('public/app/suggest-content-api.js'),
  account: read('public/app/view-requests-account.js'),
};

const LOCALES = ['en','es','fil','hi','pt','id','vi','fr','de','ru'];
const LONG_TITLE = 'The Grand Duke of the Northern Territory Who Became the Academy’s Unreasonably Overqualified Translation Manager';

const VIEWPORTS = [
  { name:'mobile-360', width:360, height:780 },
  { name:'mobile-390', width:390, height:844 },
  { name:'mobile-430', width:430, height:900 },
  { name:'telegram-compact-desktop', width:760, height:720, compact:true },
  { name:'desktop-1200', width:1200, height:850 },
  { name:'desktop-1440', width:1440, height:900 },
];

async function boot(page, viewport) {
  await page.setViewportSize({ width:viewport.width, height:viewport.height });
  await page.route('https://dtl.test/**', route => route.fulfill({
    status:200,
    contentType:'text/html',
    body:`<!doctype html><html><head><style>${css}\n*{animation:none!important;transition:none!important}</style></head><body><div id="app" class="app-shell" aria-busy="true"><header class="topbar"><button class="brand" data-nav="home"><span class="brand-copy"><strong>Dollar TL</strong></span></button><button class="icon-button" id="notificationButton"></button></header><div id="previewBanner" hidden></div><main id="viewRoot" class="view-root" tabindex="-1"></main><nav id="bottomNav" class="bottom-nav"></nav><div id="toastRegion"></div><div id="sheetRoot"></div></div><input id="novelFilePicker" type="file" hidden></body></html>`,
  }));
  await page.goto('https://dtl.test/');
  await page.evaluate(({ compact }) => {
    if (compact) document.documentElement.classList.add('dtl-telegram-desktop','dtl-compact-desktop');
    window.Telegram = { WebApp:{ ready(){}, expand(){}, setHeaderColor(){}, setBackgroundColor(){}, HapticFeedback:{selectionChanged(){}} } };
    window.lucide = { createIcons(){} };
    const languageCode = value => {
      const v=String(value||'').toLowerCase();
      if(v.includes('korean')||v.includes('한국'))return'ko';
      if(v.includes('japanese')||v.includes('日本'))return'ja';
      if(v.includes('chinese')||v.includes('中文'))return'zh';
      if(v.includes('english'))return'en';
      if(v.includes('spanish'))return'es';
      if(v.includes('portuguese'))return'pt';
      if(v.includes('indonesian'))return'id';
      if(v.includes('vietnamese'))return'vi';
      if(v.includes('french'))return'fr';
      if(v.includes('german'))return'de';
      if(v.includes('russian'))return'ru';
      return'';
    };
    const labels = {
      en:'English',es:'Español',fil:'Filipino',hi:'हिन्दी',pt:'Português',id:'Bahasa Indonesia',vi:'Tiếng Việt',fr:'Français',de:'Deutsch',ru:'Русский',ko:'한국어',ja:'日本語',zh:'中文'
    };
    const patchers=[];
    window.DTL_I18N = {
      copy(key,...args){
        const map={reader:'Reader',thanks:'Thank you for supporting novel translations',noRequests:'No requests yet',progress:'Translation progress',edit:'Edit',guideSub:'How requests and translations work',rulesSub:'Submission rules and content restrictions',chatSub:'Continue in Telegram',boostySub:'Manage your subscription',notifications:'Notifications',justNow:'just now',addTag:'Add at least one tag',describeSex:'Describe the sexual content'};
        if(key==='regular')return`Regular plan · up to ${args[0]||250} chapters`;
        if(key==='minAgo')return`${args[0]} min ago`;
        if(key==='hourAgo')return`${args[0]} h ago`;
        if(key==='dayAgo')return`${args[0]} d ago`;
        return map[key]||key;
      },
      table(name){
        if(name==='uiFallback')return{};
        if(name==='guide')return{intro:'How Dollar TL works',steps:[]};
        if(name==='rules')return{intro:'Rules',required:[],blocked:[]};
        return{};
      },
      detectLanguage:languageCode,
      languageLabel(code){return labels[code]||code;},
      tagLabel(value){return String(value||'');},
    };
    window.DTL_RUNTIME = {
      detectLanguage:languageCode,
      registerPatcher(fn){patchers.push(fn);return()=>{};},
      schedule(){for(const fn of [...patchers]){try{fn();}catch{}}},
    };
  }, { compact:Boolean(viewport.compact) });
  for (const key of ['core','i18n','interaction','home','queue','suggest','contentPicker','contentApi','account']) await page.addScriptTag({ content:sources[key] });
  await page.evaluate(async title => {
    await window.DTL_APP.init();
    const app=window.DTL_APP;
    app.state.bootstrap.user.is_admin=false;
    app.state.bootstrap.user.first_name='Alexandria';
    app.state.bootstrap.queue.active[0].title=title;
    app.state.bootstrap.queue.upcoming.forEach((row,index)=>{row.title=`${title} — Volume ${index+2}`;});
    app.state.bootstrap.my_requests.forEach((row,index)=>{row.title=`${title} — Request ${index+1}`;});
    app.state.draft.title=title;
    app.state.draft.original_language='Indonesian';
    app.state.draft.chapter_count='1234';
    app.state.draft.genres_tags='Fantasy, Adventure, Academy, Reincarnation, Kingdom Building';
    app.state.draft.sexual_level='suggestive';
    app.state.draft.sexual_tags=['Stockings','Body Worship'];
    app.state.draft.sexual_notes='Mature themes are disclosed for moderation context.';
    app.state.draft.sexual_content='Suggestive · Stockings, Body Worship';
    app.state.draft.sensitive_content='Violence and psychologically intense scenes.';
    app.state.draft.notes='A deliberately long internal note used to verify textarea layout near the bottom of the request form.';
    app.state.draft.rules_accepted=true;
    app.renderNav();
    window.DTL_RUNTIME.schedule();
  }, LONG_TITLE);
}

async function assertViewportSafe(page, label) {
  const result = await page.evaluate(() => {
    const width=document.documentElement.clientWidth;
    const pageOverflow=document.documentElement.scrollWidth-width;
    const selectors=['.app-shell','.topbar','.page','.premium-card','.novel-card','.request-card','.settings-list','.setting-row','.section-header','.segmented','.stepper','.review-card','.review-row','.detected-list','.detected-row','.detail-hero','.button-row','.bottom-nav','.content-card','.content-section-head','.content-choice-grid'];
    const escaped=[];
    for(const selector of selectors){
      for(const el of document.querySelectorAll(selector)){
        const style=getComputedStyle(el);
        if(style.display==='none'||style.visibility==='hidden')continue;
        const r=el.getBoundingClientRect();
        if(r.width<=0||r.height<=0)continue;
        if(r.left < -1.5 || r.right > width + 1.5) escaped.push({selector,left:r.left,right:r.right,width});
      }
    }
    const clipped=[];
    const textSelectors=['.nav-item>span:last-child','.section-header h2','.setting-title','.setting-sub','.step-node>span:last-child','.segmented button','.primary-button','.secondary-button','.edit-link','.content-choice>span:not(.content-choice-icon):not(.content-choice-check):not(.content-18)'];
    for(const selector of textSelectors){
      for(const el of document.querySelectorAll(selector)){
        const style=getComputedStyle(el);
        if(style.display==='none'||style.visibility==='hidden')continue;
        if(el.scrollWidth > el.clientWidth + 2 && style.overflowX!=='auto' && style.overflowX!=='scroll') clipped.push({selector,text:(el.textContent||'').trim(),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth});
      }
    }
    return {pageOverflow,escaped,clipped};
  });
  expect(result.pageOverflow, `${label}: document horizontal overflow`).toBeLessThanOrEqual(1);
  expect(result.escaped, `${label}: containers outside viewport`).toEqual([]);
  expect(result.clipped, `${label}: clipped user-facing controls`).toEqual([]);
}

async function renderScenario(page, locale, scenario) {
  await page.evaluate(({locale,scenario})=>{
    const app=window.DTL_APP;
    app.applyLocale(locale);
    if(scenario==='home'){app.navigate('home',false);return;}
    if(scenario==='queue-active'){app.state.queueSegment='active';app.navigate('queue',false);return;}
    if(scenario==='queue-upcoming'){app.state.queueSegment='upcoming';app.navigate('queue',false);return;}
    if(scenario==='requests'){app.navigate('requests',false);return;}
    if(scenario==='account'){app.navigate('account',false);return;}
    if(scenario==='suggest-upload'){app.state.wizardStep=1;app.navigate('suggest',false);return;}
    if(scenario==='suggest-details'){app.state.wizardStep=2;app.navigate('suggest',false);return;}
    if(scenario==='suggest-content'){app.state.wizardStep=3;app.navigate('suggest',false);return;}
    if(scenario==='suggest-review'){app.state.wizardStep=4;app.navigate('suggest',false);return;}
    if(scenario==='detail'){app.state.detailNovel=app.state.bootstrap.queue.active[0];app.navigate('detail',false);}
  },{locale,scenario});
  await assertViewportSafe(page,`${locale}/${scenario}`);
}

for (const viewport of VIEWPORTS) {
  test(`responsive matrix: ${viewport.name}`, async ({page}) => {
    test.setTimeout(60_000);
    await boot(page,viewport);
    for (const locale of LOCALES) {
      for (const scenario of ['home','queue-active','queue-upcoming','requests','account','suggest-upload','suggest-details','suggest-content','suggest-review','detail']) {
        await renderScenario(page,locale,scenario);
      }
    }
  });
}

test('Suggest inputs and textareas stay usable when the visual viewport collapses', async ({page}) => {
  test.setTimeout(30_000);
  await boot(page,{name:'keyboard-mobile',width:390,height:780});

  async function collapseOn(selector, scenario) {
    await renderScenario(page,'id',scenario);
    const field=page.locator(selector);
    await field.focus();
    await page.setViewportSize({width:390,height:430});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.classList.contains('dtl-keyboard-open'))).toBe(true);
    await expect(page.locator('#bottomNav')).toHaveCSS('opacity','0');
    const box=await field.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y+box.height).toBeLessThanOrEqual(431);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
    await field.evaluate(el=>el.blur());
    await page.setViewportSize({width:390,height:780});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.classList.contains('dtl-keyboard-open'))).toBe(false);
  }

  await collapseOn('#sourceUrl','suggest-upload');
  await collapseOn('#notes','suggest-content');
});
