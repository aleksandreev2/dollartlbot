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
].map(read).join('\n');
const sources={
  core:read('public/app/app-core.js'),
  i18n:read('public/app/view-i18n.js'),
  home:read('public/app/view-home.js'),
  queue:read('public/app/view-queue.js'),
};
const LOCALES=['en','es','fil','hi','pt','id','vi','fr','de','ru'];
const TITLE='The Grand Duke of the Northern Territory Who Became the Academy’s Unreasonably Overqualified Translation Manager';

async function boot(page,{width,height,compact=false}){
  await page.setViewportSize({width,height});
  await page.route('https://detail.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:`<!doctype html><html><head><style>${css}\n*{transition:none!important}</style></head><body><div id="app" class="app-shell" aria-busy="true"><header class="topbar"><button class="brand" data-nav="home">Dollar TL</button></header><div id="previewBanner" hidden></div><main id="viewRoot" class="view-root"></main><nav id="bottomNav" class="bottom-nav"></nav><div id="toastRegion"></div><div id="sheetRoot"></div></div><input id="novelFilePicker" type="file" hidden></body></html>`}));
  await page.goto('https://detail.test/');
  await page.evaluate(({compact})=>{
    if(compact)document.documentElement.classList.add('dtl-telegram-desktop','dtl-compact-desktop');
    window.Telegram={WebApp:{ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},HapticFeedback:{selectionChanged(){}}}};
    window.lucide={createIcons(){}};
    const labels={en:'English',ko:'한국어',ja:'日本語',zh:'中文',es:'Español',fil:'Filipino',hi:'हिन्दी',pt:'Português',id:'Bahasa Indonesia',vi:'Tiếng Việt',fr:'Français',de:'Deutsch',ru:'Русский'};
    const detect=value=>{const v=String(value||'').toLowerCase();if(v.includes('korean'))return'ko';if(v.includes('japanese'))return'ja';if(v.includes('chinese'))return'zh';return'';};
    window.DTL_I18N={
      copy(key){const map={reader:'Reader',progress:'Translation progress',justNow:'just now'};return map[key]||key;},
      table(){return{};},detectLanguage:detect,languageLabel:code=>labels[code]||code,tagLabel:value=>String(value||''),
    };
    window.DTL_RUNTIME={detectLanguage:detect,locale(){return window.DTL_APP?.state?.locale||'en';},schedule(){}};
  },{compact});
  for(const key of ['core','i18n','home','queue'])await page.addScriptTag({content:sources[key]});
  await page.evaluate(async title=>{
    await window.DTL_APP.init();
    const app=window.DTL_APP;
    app.state.detailNovel={
      id:1,title,original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://example.com/original',
      queue_status:'in_progress',queue_position:null,current_chapter:151,progress_percent:42,
      genres_tags:'Fantasy, Academy, Regression, Action, Kingdom Building, Adventure',
      started_at:'2026-08-05T12:00:00Z',progress_updated_at:'2026-08-11T15:00:00Z',updated_at:'2026-08-11T15:00:00Z',
    };
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
  await expect(page.locator('.live-tag')).toHaveCount(6);
  await expect(page.locator('.live-activity-item')).toHaveCount(2);
  await expect(page.locator('.live-detail-title')).toContainText('Grand Duke');
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,hero:document.querySelector('.detail-hero')?.getBoundingClientRect(),width:document.documentElement.clientWidth}));
  expect(layout.overflow,`${locale}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(layout.hero.left,`${locale}: hero left edge`).toBeGreaterThanOrEqual(-1);
  expect(layout.hero.right,`${locale}: hero right edge`).toBeLessThanOrEqual(layout.width+1);
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
