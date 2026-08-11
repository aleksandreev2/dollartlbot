import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=[
  'public/app/app.css',
  'public/app/ui-polish.css',
  'public/app/card-upgrade.css',
  'public/app/feature-upgrades.css',
  'public/app/desktop.css',
  'public/app/desktop-v2.css',
  'public/app/telegram-desktop.css',
  'public/app/novel-detail.css',
  'public/app/title-release-history.css',
].map(read).join('\n');
const sources={
  presenter:read('public/app/novel-presenter.js'),
  core:read('public/app/app-core.js'),
  i18n:read('public/app/view-i18n.js'),
  home:read('public/app/view-home.js'),
  queue:read('public/app/view-queue.js'),
  history:read('public/app/title-release-history.js'),
};
const LOCALES=['en','es','fil','hi','pt','id','vi','fr','de','ru'];
const TITLE='The Grand Duke of the Northern Territory Who Became the Academy’s Unreasonably Overqualified Translation Manager';

async function boot(page,{width,height,compact=false}){
  await page.setViewportSize({width,height});
  await page.route('https://detail.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/app/flags/')){
      return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#ddd"/></svg>'});
    }
    return route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html><head><style>${css}\n*{transition:none!important}</style></head><body><div id="app" class="app-shell" aria-busy="true"><header class="topbar"><button class="brand" data-nav="home">Dollar TL</button></header><div id="previewBanner" hidden></div><main id="viewRoot" class="view-root"></main><nav id="bottomNav" class="bottom-nav"></nav><div id="toastRegion"></div><div id="sheetRoot"></div></div><input id="novelFilePicker" type="file" hidden></body></html>`});
  });
  await page.goto('https://detail.test/');
  await page.evaluate(({compact})=>{
    if(compact)document.documentElement.classList.add('dtl-telegram-desktop','dtl-compact-desktop');
    window.Telegram={WebApp:{ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{selectionChanged(){}}}};
    window.lucide={createIcons(){}};
    const labels={en:'English',ko:'한국어',ja:'日本語',zh:'中文',es:'Español',fil:'Filipino',hi:'हिन्दी',pt:'Português',id:'Bahasa Indonesia',vi:'Tiếng Việt',fr:'Français',de:'Deutsch',ru:'Русский'};
    const detect=value=>{const v=String(value||'').toLowerCase();if(v.includes('korean')||v.includes('한국'))return'ko';if(v.includes('japanese')||v.includes('日本'))return'ja';if(v.includes('chinese')||v.includes('中文'))return'zh';if(v.includes('english'))return'en';return'';};
    window.DTL_I18N={
      copy(key){const map={reader:'Reader',progress:'Translation progress',justNow:'just now'};return map[key]||key;},
      table(){return{};},detectLanguage:detect,languageLabel:code=>labels[code]||code,tagLabel:value=>String(value||''),
      locale(){return window.DTL_APP?.state?.locale||'en';},
    };
    window.DTL_RUNTIME={detectLanguage:detect,locale(){return window.DTL_APP?.state?.locale||'en';},schedule(){}};
  },{compact});
  await page.addScriptTag({content:sources.presenter});
  for(const key of ['core','i18n','home','queue','history'])await page.addScriptTag({content:sources[key]});
  await page.evaluate(async title=>{
    await window.DTL_APP.init();
    const app=window.DTL_APP;
    app.state.detailNovel={
      id:1,title,original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://example.com/original',
      queue_status:'in_progress',queue_position:null,current_chapter:151,progress_percent:42,requester_username:'reader_requester',
      genres_tags:'Fantasy, Academy, Regression, Action, Kingdom Building, Adventure',
      started_at:'2026-08-05T12:00:00Z',progress_updated_at:'2026-08-11T15:00:00Z',updated_at:'2026-08-11T15:00:00Z',
    };
    window.DTL_TITLE_RELEASE_HISTORY.cache.set(1,{status:'ready',releases:[
      {id:20,submission_id:1,title:'Chapters 78–85 · Grand Duke',chapter_start:78,chapter_end:85,published_at:'2026-08-10T10:00:00Z',telegram_url:'https://t.me/dollartl/20'},
      {id:19,submission_id:1,title:'Chapters 70–77 · Grand Duke',chapter_start:70,chapter_end:77,published_at:'2026-08-08T10:00:00Z',telegram_url:'https://t.me/dollartl/19'},
    ]});
  },TITLE);
}

async function render(page,locale){
  await page.evaluate(locale=>{const app=window.DTL_APP;app.applyLocale(locale);app.navigate('detail',false);},locale);
  await expect(page.locator('[data-live-detail]')).toBeVisible();
  await expect(page.locator('.live-detail-eyebrow.is-live')).toBeVisible();
  await expect(page.locator('.live-detail-progress-track')).toHaveAttribute('aria-valuenow','42');
  await expect(page.locator('.live-progress-stat strong').nth(0)).toHaveText('151');
  await expect(page.locator('.live-progress-stat strong').nth(1)).toHaveText('209');
  await expect(page.locator('.live-progress-stat strong').nth(2)).toHaveText('42%');
  await expect(page.locator('.live-detail-language-flag')).toHaveCount(2);
  await expect(page.locator('.live-detail-language-flag').nth(0)).toHaveAttribute('src','/app/flags/kr.svg');
  await expect(page.locator('.live-detail-language-flag').nth(1)).toHaveAttribute('src','/app/flags/gb.svg');
  await expect(page.locator('.live-detail-language')).not.toContainText('🇰🇷');
  await expect(page.locator('.live-tag')).toHaveCount(6);
  await expect(page.locator('.live-activity-item')).toHaveCount(2);
  await expect(page.locator('.live-detail-title')).toContainText('Grand Duke');
  await expect(page.locator('.live-detail-requester a')).toHaveText('@reader_requester');
  await expect(page.locator('.live-detail-requester a')).toHaveAttribute('href','https://t.me/reader_requester');
  await expect(page.locator('.title-release-history')).toBeVisible();
  await expect(page.locator('.title-release-row.current strong')).toContainText('86');
  await expect(page.locator('.title-release-row.current strong')).toContainText('151');
  await expect(page.locator('.title-release-row.published')).toHaveCount(2);
  await expect(page.locator('.title-release-row.published').first().locator('strong')).toContainText('78');
  await expect(page.locator('.title-release-row.published').first().locator('strong')).toContainText('85');
  await expect(page.locator('.title-release-open').first()).toHaveAttribute('href','https://t.me/dollartl/20');
  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    hero:document.querySelector('.detail-hero')?.getBoundingClientRect(),
    history:document.querySelector('.title-release-history')?.getBoundingClientRect(),
    railHeight:document.querySelector('.live-progress-rail')?.getBoundingClientRect().height,
    flagSizes:[...document.querySelectorAll('.live-detail-language-flag')].map(node=>node.getBoundingClientRect().width),
    ctaHeights:[...document.querySelectorAll('.live-detail-actions > *')].map(node=>node.getBoundingClientRect().height),
    motion:{
      hero:getComputedStyle(document.querySelector('.detail-hero')).animationName,
      rail:getComputedStyle(document.querySelector('.live-progress-rail-fill')).animationName,
      marker:getComputedStyle(document.querySelector('.live-progress-marker')).animationName,
      history:getComputedStyle(document.querySelector('.title-release-history')).animationName,
    },
    width:document.documentElement.clientWidth,
  }));
  expect(layout.overflow,`${locale}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(layout.hero.left,`${locale}: hero left edge`).toBeGreaterThanOrEqual(-1);
  expect(layout.hero.right,`${locale}: hero right edge`).toBeLessThanOrEqual(layout.width+1);
  expect(layout.history.left,`${locale}: history left edge`).toBeGreaterThanOrEqual(-1);
  expect(layout.history.right,`${locale}: history right edge`).toBeLessThanOrEqual(layout.width+1);
  expect(layout.railHeight,`${locale}: progress rail visual height`).toBeGreaterThanOrEqual(26);
  expect(Math.min(...layout.flagSizes),`${locale}: language flag visible size`).toBeGreaterThanOrEqual(16);
  expect(layout.motion.hero,`${locale}: hero entrance motion`).not.toBe('none');
  expect(layout.motion.rail,`${locale}: progress fill motion`).not.toBe('none');
  expect(layout.motion.marker,`${locale}: marker settle motion`).not.toBe('none');
  expect(layout.motion.history,`${locale}: release history motion`).not.toBe('none');
  if(layout.ctaHeights.length===2)expect(Math.abs(layout.ctaHeights[0]-layout.ctaHeights[1]),`${locale}: CTA height alignment`).toBeLessThanOrEqual(1);
}

for(const viewport of [
  {name:'mobile',width:360,height:780},
  {name:'telegram-desktop',width:760,height:720,compact:true},
  {name:'desktop',width:1200,height:850},
]){
  test(`live translation detail is stable across locales on ${viewport.name}`,async({page})=>{
    test.setTimeout(45_000);
    await boot(page,viewport);
    for(const locale of LOCALES)await render(page,locale);
  });
}

test('empty release state stays compact',async({page})=>{
  await boot(page,{width:360,height:780});
  await page.evaluate(()=>window.DTL_TITLE_RELEASE_HISTORY.cache.set(1,{status:'ready',releases:[]}));
  await page.evaluate(()=>{window.DTL_APP.applyLocale('en');window.DTL_APP.navigate('detail',false);});
  await expect(page.locator('.title-release-state.empty')).toBeVisible();
  const height=await page.locator('.title-release-history').evaluate(node=>node.getBoundingClientRect().height);
  expect(height).toBeLessThan(190);
});

test('detail motion respects reduced-motion preference',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await boot(page,{width:760,height:720,compact:true});
  await page.evaluate(()=>{window.DTL_APP.applyLocale('en');window.DTL_APP.navigate('detail',false);});
  await expect(page.locator('[data-live-detail]')).toBeVisible();
  const motion=await page.evaluate(()=>[
    '.detail-hero','.live-detail-progress-fill','.live-progress-rail-fill','.live-progress-marker','.title-release-history','.title-release-row'
  ].map(selector=>getComputedStyle(document.querySelector(selector)).animationName));
  expect(motion.every(name=>name==='none')).toBe(true);
});
