import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source=fs.readFileSync(new URL('../public/app/admin-statistics.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/app/admin-statistics.css',import.meta.url),'utf8');

const payload={
  days:30,
  since:'2026-07-19T00:00:00.000Z',
  summary:{users_total:150,users_new:20,active_users:62,submissions:35,pending_now:4,translating_now:3,completed:18,publications:10,referrals_qualified:6,unique_readers:44,thank_you_clicks:70,deliveries:91,donate_clicks:8},
  previous:{users_new:15,active_users:50,submissions:28,completed:14,publications:8,unique_readers:30,thank_you_clicks:55,deliveries:65,donate_clicks:4},
  daily:[
    {day:'2026-08-15',new_users:4,requests:7,completed:3,publications:2,thank_you:12,deliveries:18,donations:2},
    {day:'2026-08-16',new_users:7,requests:9,completed:5,publications:3,thank_you:18,deliveries:26,donations:3},
  ],
  languages:[{language:'Корейский',count:20},{language:'Японский',count:9},{language:'Китайский',count:6}],
  referrals:{started:12,pending:2,qualified:8,cancelled:2},
  publishing:{total:11,published:10,failed:1,comments_complete:9,needs_attention:1,files_sent:14,files_failed:0},
  top_users:[{telegram_id:1,username:'reader_one',first_name:'Иван',requests:6},{telegram_id:2,username:null,first_name:'Анна',requests:4}],
  requests:{states:{pending:4,rejected:2,queued:8,in_progress:3,completed:18,accepted_chapters:920,queued_chapters:330,active_chapters:145},timing:{wait_hours:17.5,work_hours:42,total_hours:66}},
  readers:{download_opens:75,thank_you_clicks:70,unique_clickers:50,deliveries:91,unique_readers:44,repeat_deliveries:9,delivery_failures:1,access_denied:2,rate_limited:0,donate_clicks:8},
  top_releases:[{id:9,title:'Похищенные Драконы',published_at:'2026-08-16T12:00:00.000Z',thank_you_clicks:31,clickers:25,deliveries:38,readers:24,donate_clicks:4}],
  product:{tracking_since:'2026-08-12T10:00:00.000Z',searches:80,zero_results:9,zero_result_rate:11.3,zero_result_queries:[{query_text:'академия драконов',count:5,users:4,last_seen:'2026-08-16T12:00:00.000Z'}],funnel:{search_users:52,open_users:41,intent_users:23,request_users:15}},
};

async function boot(page){
  await page.setViewportSize({width:390,height:844});
  await page.route('https://dtl.test/**',handler=>handler.fulfill({status:200,contentType:'text/html',body:`<div class="admin-v2"><aside><nav class="admin-side-nav"><button data-admin-section="overview"><span>Обзор</span></button><button data-admin-tools="analytics"><span>Аналитика</span></button><button data-admin-section="security"><span>Безопасность</span></button></nav></aside><div class="admin-workspace"><header class="admin-work-head"><h1></h1><p></p></header><div class="admin-mobile-nav"><button data-admin-section="overview"><span>Обзор</span></button><button data-admin-tools="analytics"><span>Аналитика</span></button></div><main class="admin-content"></main></div></div>`}));
  await page.goto('https://dtl.test/');
  await page.addStyleTag({content:css});
  await page.evaluate(payload=>{
    const routes=new Map();const calls=[];const chartOptions=[];
    window.__statisticsTest={routes,calls,chartOptions};
    window.lucide={createIcons(){}};
    window.echarts={init(){return{setOption(option){chartOptions.push(option);},dispose(){},resize(){}};}};
    window.DTL_RUNTIME={registerPatcher(fn){fn();return()=>{};}};
    let active='section:statistics';
    window.DTL_ADMIN={
      registerRoute(id,config){routes.set(id,config);return()=>{};},
      activeRoute(){return active;},
      api:async path=>{calls.push(path);return structuredClone(payload);},
      content(html){document.querySelector('.admin-content').innerHTML=html;},
      setHead(title,subtitle){document.querySelector('.admin-work-head h1').textContent=title;document.querySelector('.admin-work-head p').textContent=subtitle;},
      open:async id=>{active=id;return routes.get(id)?.mount?.();},
    };
  },payload);
  await page.addScriptTag({content:source});
  await page.evaluate(()=>window.__statisticsTest.routes.get('section:statistics').mount());
}

test('Статистика является отдельной русской вкладкой и не оставляет старую Аналитику',async({page})=>{
  await boot(page);
  await expect(page.locator('[data-admin-section="statistics"]').first()).toContainText('Статистика');
  await expect(page.locator('[data-admin-tools="analytics"]')).toHaveCount(0);
  await expect(page.locator('.admin-work-head h1')).toHaveText('Статистика');
  await expect(page.locator('.statistics-page')).toContainText('Активные пользователи');
  await expect(page.locator('.statistics-page')).toContainText('Чтение и выдача файлов');
  await expect(page.locator('.statistics-page')).toContainText('Самые читаемые релизы');
  await expect(page.locator('.statistics-page')).toContainText('Похищенные Драконы');
  await expect(page.locator('.statistics-page')).not.toContainText('Telemetry');
  await expect(page.locator('.statistics-page')).not.toContainText('Zero-result');
  await expect(page.locator('.statistics-page')).not.toContainText('Funnel');
  const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport+1);
});

test('Период переключается без перезагрузки страницы, а графики получают русские подписи',async({page})=>{
  await boot(page);
  await page.locator('[data-stat-days="7"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__statisticsTest.calls.some(path=>String(path).includes('days=7')))).toBeTruthy();
  await expect(page.locator('[data-stat-days="7"]')).toHaveClass(/active/);
  const names=await page.evaluate(()=>window.__statisticsTest.chartOptions.flatMap(option=>(option.series||[]).map(series=>series.name).filter(Boolean)));
  expect(names).toContain('Новые пользователи');
  expect(names).toContain('Заявки');
  expect(names).toContain('Выдано файлов');
  expect(names).toContain('«Спасибо»');
});
