import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = read('public/app/i18n-core.js');
const localePicker = read('public/app/locale-picker-compat.js');
const css = [
  'public/app/app.css',
  'public/app/ui-polish.css',
  'public/app/card-upgrade.css',
  'public/app/interaction-upgrade.css',
  'public/app/feature-upgrades.css',
  'public/app/account-page.css',
  'public/app/language-switch.css',
  'public/app/home-v2.css',
  'public/app/desktop.css',
  'public/app/desktop-v2.css',
  'public/app/telegram-desktop.css',
  'public/app/rtl.css',
].map(read).join('\n');

const shell = `<!doctype html>
<html lang="en" dir="ltr">
<head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*{animation:none!important;transition:none!important}</style></head>
<body>
  <div id="app" class="app-shell">
    <header class="topbar">
      <button class="brand"><span class="brand-copy"><strong>Dollar TL</strong></span></button>
      <button class="icon-button notification-button" aria-label="Notifications">◉</button>
    </header>
    <main class="view-root">
      <section class="page">
        <div class="premium-card">
          <h1>آپ کی ترجمہ درخواستیں</h1>
          <p>اپنی درخواستوں کی حالت دیکھیں اور نئی پیش رفت کو فالو کریں۔</p>
        </div>
        <div class="settings-list">
          <label class="setting-row"><span class="setting-copy"><strong class="setting-title">زبان</strong><span class="setting-sub">اردو</span></span><input value="اردو متن"></label>
        </div>
        <article class="novel-card"><div class="novel-card-copy"><strong>شمالی علاقے کا گرینڈ ڈیوک</strong><p>ترجمہ جاری ہے · پوزیشن #2</p></div></article>
        <div class="button-row"><button class="primary-button">درخواست بھیجیں</button><button class="secondary-button">منسوخ کریں</button></div>
        <span data-lucide="chevron-right">→</span>
      </section>
      <section class="admin-v2" aria-label="Admin fixture">
        <div class="admin-card"><label>Internal admin field <input value="LTR admin value"></label></div>
      </section>
    </main>
    <nav class="bottom-nav"><button class="nav-item"><span>ہوم</span></button><button class="nav-item"><span>قطار</span></button><button class="nav-item"><span>اکاؤنٹ</span></button></nav>
  </div>
</body>
</html>`;

async function boot(page, width=390, height=844) {
  await page.setViewportSize({ width, height });
  await page.setContent(shell);
  await page.addScriptTag({ content:runtime });
  await page.evaluate(() => window.DTL_RUNTIME.apply('ur', 'playwright-urdu-rtl'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function layoutState(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const bodyStyle = getComputedStyle(document.body);
    const pageStyle = getComputedStyle(document.querySelector('.page'));
    const topbarStyle = getComputedStyle(document.querySelector('.topbar'));
    const brandStyle = getComputedStyle(document.querySelector('.brand'));
    const navStyle = getComputedStyle(document.querySelector('.bottom-nav'));
    const inputStyle = getComputedStyle(document.querySelector('.setting-row input'));
    const adminStyle = getComputedStyle(document.querySelector('.admin-v2'));
    const adminInputStyle = getComputedStyle(document.querySelector('.admin-v2 input'));
    const width = html.clientWidth;
    const brandRect = document.querySelector('.brand').getBoundingClientRect();
    const notificationRect = document.querySelector('.notification-button').getBoundingClientRect();
    const escaped = [...document.querySelectorAll('.app-shell,.topbar,.page,.premium-card,.settings-list,.setting-row,.novel-card,.button-row,.bottom-nav,.admin-v2')]
      .filter(el => {
        const style=getComputedStyle(el);
        const rect=el.getBoundingClientRect();
        return style.display!=='none' && rect.width>0 && rect.height>0 && (rect.left < -1.5 || rect.right > width + 1.5);
      })
      .map(el => ({ cls:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right }));
    return {
      lang:html.lang,
      dir:html.dir,
      locale:html.dataset.locale,
      bodyDirection:bodyStyle.direction,
      pageDirection:pageStyle.direction,
      topbarDirection:topbarStyle.direction,
      brandDirection:brandStyle.direction,
      navDirection:navStyle.direction,
      inputAlign:inputStyle.textAlign,
      adminDirection:adminStyle.direction,
      adminInputAlign:adminInputStyle.textAlign,
      brandLeft:brandRect.left,
      notificationLeft:notificationRect.left,
      overflow:html.scrollWidth-width,
      escaped,
    };
  });
}

test('Urdu content is RTL at 390px while structural chrome and admin stay LTR', async ({ page }) => {
  await boot(page);
  const state = await layoutState(page);

  expect(state.lang).toBe('ur');
  expect(state.dir).toBe('rtl');
  expect(state.locale).toBe('ur');
  expect(state.bodyDirection).toBe('ltr');
  expect(state.pageDirection).toBe('rtl');
  expect(state.topbarDirection).toBe('ltr');
  expect(state.brandDirection).toBe('ltr');
  expect(state.navDirection).toBe('ltr');
  expect(state.inputAlign).toBe('right');
  expect(state.adminDirection).toBe('ltr');
  expect(state.adminInputAlign).toBe('left');
  expect(state.overflow, '390px Urdu page has horizontal overflow').toBeLessThanOrEqual(1);
  expect(state.escaped, 'RTL containers escape the 390px viewport').toEqual([]);
});

test('Urdu desktop keeps Dollar TL chrome in its normal physical positions', async ({ page }) => {
  await boot(page, 1440, 900);
  const state = await layoutState(page);
  expect(state.pageDirection).toBe('rtl');
  expect(state.topbarDirection).toBe('ltr');
  expect(state.navDirection).toBe('ltr');
  expect(state.brandLeft).toBeLessThan(state.notificationLeft);
  expect(state.overflow, '1440px Urdu desktop has horizontal overflow').toBeLessThanOrEqual(1);
  expect(state.escaped, 'Urdu desktop containers escape the viewport').toEqual([]);
});

test('switching away from Urdu restores LTR document direction', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.DTL_RUNTIME.apply('en', 'playwright-ltr-restore'));
  await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('ltr');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
});

test('Urdu is exposed in the language picker with a real Pakistan flag asset', async ({ page }) => {
  expect(fs.existsSync(new URL('../public/app/flags/pk.svg', import.meta.url))).toBe(true);
  expect(read('public/app/flags/pk.svg')).toContain('#01411c');

  await page.setContent('<div id="app"><div id="sheetRoot"></div></div>');
  await page.addScriptTag({ content:runtime });
  await page.evaluate(() => {
    window.DTL_APP = {
      LANGUAGE_NAMES: {
        en:'English', es:'Español', fil:'Filipino', hi:'हिन्दी', pt:'Português',
        id:'Bahasa Indonesia', vi:'Tiếng Việt', fr:'Français', de:'Deutsch', ru:'Русский',
      },
    };
  });
  await page.addScriptTag({ content:localePicker });

  expect(await page.evaluate(() => window.DTL_APP.LANGUAGE_NAMES.ur)).toBe('اردو');

  const flagSrc = await page.locator('#sheetRoot').evaluate(root => {
    root.innerHTML = '<button class="language-picker-option" data-lang="ur"><span class="language-picker-name">اردو</span></button>';
    document.dispatchEvent(new CustomEvent('dtl:sheetopen', { detail:{ root } }));
    return root.querySelector('[data-lang="ur"] > .language-picker-circle-flag')?.getAttribute('src') || null;
  });
  expect(flagSrc).toBe('/app/flags/pk.svg');
});
