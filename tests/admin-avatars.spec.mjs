import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source=fs.readFileSync(new URL('../public/app/admin-avatars.js',import.meta.url),'utf8');

const svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ddd"/></svg>';

test('реальные Telegram-аватары появляются во всех пользовательских поверхностях админки',async({page})=>{
  const avatarRequests=[];
  await page.route('https://dtl.test/api/app/admin/users/*/avatar',async route=>{
    avatarRequests.push({url:route.request().url(),headers:await route.request().allHeaders()});
    await route.fulfill({status:200,contentType:'image/svg+xml',body:svg});
  });
  await page.route('https://dtl.test/',route=>route.fulfill({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:`
    <div class="admin-v2"><main class="admin-content">
      <button class="admin-user-row selected" data-user-id="101"><span class="admin-user-avatar">A</span></button>
      <span class="admin-profile-avatar">A</span>

      <section class="statistics-panel"><h2>Самые активные заявители</h2><article class="statistics-ranking-row compact"><span class="statistics-rank">1</span><div class="statistics-ranking-copy"><strong>@ranked</strong></div></article></section>
      <button data-stat-title-user="102"><span class="statistics-user-avatar">B</span></button>
      <div data-stat-title-user-detail></div>

      <article data-activity-user="103"><div class="admin-activity-event-icon">!</div><div class="admin-activity-event-main"></div></article>

      <button data-workflow-request="55"><span class="admin-inbox-state pending"></span><span class="admin-inbox-copy"><span>Корейский · @requester</span></span></button>
      <div class="admin-inbox-detail-head"><div><span class="admin-card-id">ЗАЯВКА #55</span><h2>Тайтл</h2></div><span class="admin-badge">На проверке</span></div>
      <div class="request-ops-topbar"><button>Назад</button><div><span>ЗАЯВКА #55</span><h2>Тайтл</h2></div><div></div></div>

      <button data-home-request="55"><span class="admin-home-row-icon">H</span><span>Заявка</span></button>
      <article data-qw-working="55"><div class="admin-queue-working-top"><div class="admin-queue-working-title"><button>Тайтл</button></div><span class="admin-badge">В работе</span></div></article>
      <article data-qw-row="55"><span class="admin-queue-workspace-position">1</span><button class="admin-queue-workspace-title">Тайтл</button><div class="admin-queue-workspace-row-actions"></div></article>
    </main></div>`}));

  await page.goto('https://dtl.test/');
  await page.evaluate(()=>{
    window.Telegram={WebApp:{initData:'signed-admin-init-data'}};
    try{window.IntersectionObserver=undefined;}catch{}
    const handlers=[];const patchers=[];
    window.__avatarTest={handlers,patchers};
    window.DTL_RUNTIME={
      registerPatcher(fn){patchers.push(fn);fn();return()=>{};},
      registerResponseHandler(fn){handlers.push(fn);return()=>{};},
    };
    window.DTL_ADMIN={activeRoute(){return 'section:overview';}};
    window.__deliverAvatarPayload=async(path,payload)=>{
      let response=new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
      const context={pathname:new URL(`https://dtl.test${path}`).pathname};
      for(const handler of handlers)response=await handler(response,context);
      for(const patcher of patchers)patcher();
    };
  });
  await page.addScriptTag({content:source});

  await page.evaluate(async()=>{
    await window.__deliverAvatarPayload('/api/app/admin/analytics',{top_users:[{telegram_id:104,username:'ranked',first_name:'Роман'}]});
    await window.__deliverAvatarPayload('/api/app/admin/list?kind=pending',{requests:[{id:55,user_id:105,username:'requester'}]});
    await window.__deliverAvatarPayload('/api/app/admin/requests/55',{request:{id:55,user_id:105,username:'requester'}});
  });

  await page.locator('[data-stat-title-user="102"]').click();
  await page.evaluate(()=>{
    document.querySelector('[data-stat-title-user-detail]').innerHTML='<span class="statistics-user-avatar large">B</span>';
    for(const patcher of window.__avatarTest.patchers)patcher();
  });

  const avatarSelectors=[
    '[data-user-id="101"] .admin-user-avatar .admin-avatar-image',
    '.admin-profile-avatar .admin-avatar-image',
    '.statistics-ranking-user-avatar .admin-avatar-image',
    '[data-stat-title-user="102"] .statistics-user-avatar .admin-avatar-image',
    '[data-stat-title-user-detail] .statistics-user-avatar.large .admin-avatar-image',
    '[data-activity-user="103"] .admin-activity-event-icon .admin-avatar-image',
    '[data-workflow-request="55"] .admin-request-user-avatar .admin-avatar-image',
    '.admin-request-detail-avatar .admin-avatar-image',
    '.admin-request-ops-avatar .admin-avatar-image',
    '[data-home-request="55"] .admin-home-row-icon .admin-avatar-image',
    '[data-qw-working="55"] .admin-queue-user-avatar .admin-avatar-image',
    '[data-qw-row="55"] .admin-queue-row-avatar .admin-avatar-image',
  ];
  for(const selector of avatarSelectors)await expect(page.locator(selector)).toHaveAttribute('src',/^blob:/);

  await expect.poll(()=>avatarRequests.length).toBeGreaterThanOrEqual(5);
  expect(avatarRequests.every(item=>item.headers['x-telegram-init-data']==='signed-admin-init-data')).toBeTruthy();
  expect(avatarRequests.every(item=>/\/api\/app\/admin\/users\/\d+\/avatar$/.test(new URL(item.url).pathname))).toBeTruthy();
});

test('если у пользователя нет фото, остаётся безопасный fallback',async({page})=>{
  await page.route('https://dtl.test/api/app/admin/users/999/avatar',route=>route.fulfill({status:204,body:''}));
  await page.route('https://dtl.test/',route=>route.fulfill({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:'<div class="admin-v2"><main class="admin-content"><button class="admin-user-row selected" data-user-id="999"><span class="admin-user-avatar">Ф</span></button></main></div>'}));
  await page.goto('https://dtl.test/');
  await page.evaluate(()=>{
    window.Telegram={WebApp:{initData:'signed-admin-init-data'}};
    try{window.IntersectionObserver=undefined;}catch{}
    window.DTL_RUNTIME={registerPatcher(fn){fn();return()=>{};},registerResponseHandler(){return()=>{};}};
    window.DTL_ADMIN={activeRoute(){return 'tools:users';}};
  });
  await page.addScriptTag({content:source});
  await expect(page.locator('.admin-user-avatar')).toHaveText('Ф');
  await expect(page.locator('.admin-user-avatar')).toHaveAttribute('data-admin-avatar-state','fallback');
  await expect(page.locator('.admin-user-avatar .admin-avatar-image')).toHaveCount(0);
});

test('временная ошибка загрузки аватара не превращается в постоянный fallback',async({page})=>{
  let requests=0;
  await page.route('https://dtl.test/api/app/admin/users/777/avatar',async route=>{
    requests+=1;
    await route.fulfill({status:502,headers:{'x-dtl-avatar-status':'telegram_lookup_failed'},body:''});
  });
  await page.route('https://dtl.test/',route=>route.fulfill({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:'<div class="admin-v2"><main class="admin-content"><button class="admin-user-row selected" data-user-id="777"><span class="admin-user-avatar">R</span></button></main></div>'}));
  await page.goto('https://dtl.test/');
  await page.evaluate(()=>{
    window.Telegram={WebApp:{initData:'signed-admin-init-data'}};
    try{window.IntersectionObserver=undefined;}catch{}
    window.DTL_RUNTIME={registerPatcher(fn){fn();return()=>{};},registerResponseHandler(){return()=>{};}};
    window.DTL_ADMIN={activeRoute(){return 'tools:users';}};
  });
  await page.addScriptTag({content:source});
  await expect(page.locator('.admin-user-avatar')).toHaveAttribute('data-admin-avatar-state','retry');
  await expect(page.locator('.admin-user-avatar .admin-avatar-image')).toHaveCount(0);
  expect(requests).toBe(1);
});