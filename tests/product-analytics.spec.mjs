import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const runtimeSource=fs.readFileSync(new URL('../public/app/product-analytics.js',import.meta.url),'utf8');
const adminSource=fs.readFileSync(new URL('../public/app/admin-product-analytics.js',import.meta.url),'utf8');
const cssSource=fs.readFileSync(new URL('../public/app/product-analytics.css',import.meta.url),'utf8');

async function bootRuntime(page){
  await page.route('https://dtl.test/**',handler=>handler.fulfill({status:200,contentType:'text/html',body:'<main id="app"><div id="viewRoot"></div></main>'}));
  await page.goto('https://dtl.test/');
  await page.evaluate(()=>{
    const responseHandlers=[];
    const patchers=[];
    const sent=[];
    window.__analyticsTest={responseHandlers,patchers,sent};
    window.Telegram={WebApp:{initData:'SECRET_INIT'}};
    window.DTL_APP={state:{preview:false,view:'discover',wizardStep:1,detailNovel:null}};
    window.DTL_RUNTIME={
      registerResponseHandler(fn){responseHandlers.push(fn);return()=>{};},
      registerPatcher(fn){patchers.push(fn);return()=>{};},
    };
    window.fetch=async(input,init={})=>{
      if(String(input).includes('/api/app/analytics/events')){
        sent.push({input:String(input),headers:init.headers,body:String(init.body||'')});
        return new Response(JSON.stringify({ok:true,accepted:12}),{status:200,headers:{'content-type':'application/json'}});
      }
      return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
    };
  });
  await page.addScriptTag({content:runtimeSource});
}

async function dispatchResponse(page,path,payload,init={}){
  await page.evaluate(async({path,payload,init})=>{
    const response=new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    for(const handler of window.__analyticsTest.responseHandlers){
      await handler(response.clone(),{pathname:path,input:`https://dtl.test${path}`,init});
    }
  },{path,payload,init});
}

test('Discover telemetry records only the settled search and keeps initData out of event bodies',async({page})=>{
  await bootRuntime(page);
  await dispatchResponse(page,'/api/app/discovery/search',{query:'aca',local:[],external:[],provider_status:'ok'});
  await page.waitForTimeout(120);
  await dispatchResponse(page,'/api/app/discovery/search',{query:'academy',local:[{id:1}],external:[{external_id:'2'}],provider_status:'ok'});
  await page.waitForTimeout(720);
  await page.evaluate(()=>window.DTL_PRODUCT_ANALYTICS.flush());
  await expect.poll(()=>page.evaluate(()=>window.__analyticsTest.sent.length)).toBe(1);

  const batch=await page.evaluate(()=>JSON.parse(window.__analyticsTest.sent[0].body));
  const searches=batch.events.filter(event=>event.event_name==='discover_search');
  const zero=batch.events.filter(event=>event.event_name==='discover_zero_result');
  expect(searches).toHaveLength(1);
  expect(searches[0].query).toBe('academy');
  expect(searches[0].metadata.result_count).toBe(2);
  expect(zero).toHaveLength(0);
  expect(JSON.stringify(batch)).not.toContain('SECRET_INIT');
});

test('Intent, submit and Suggest drop-off telemetry preserve separate outcomes',async({page})=>{
  await bootRuntime(page);
  await page.locator('#viewRoot').evaluate(node=>{node.innerHTML='<section class="suggest-wizard-page"></section>';});
  await page.evaluate(()=>{
    window.DTL_APP.state.view='suggest';
    window.DTL_APP.state.wizardStep=1;
    for(const patch of window.__analyticsTest.patchers)patch();
    window.DTL_APP.state.wizardStep=3;
    for(const patch of window.__analyticsTest.patchers)patch();
  });
  await dispatchResponse(page,'/api/app/discovery/interest',{ok:true},{method:'POST',body:JSON.stringify({submission_id:31,interested:true})});
  await dispatchResponse(page,'/api/app/following/submission',{ok:true,following:true},{method:'POST',body:JSON.stringify({submission_id:31,following:true})});
  await page.evaluate(()=>{
    window.DTL_APP.state.view='home';
    document.dispatchEvent(new CustomEvent('dtl:viewchange',{detail:{view:'home'}}));
  });
  await page.evaluate(()=>window.DTL_PRODUCT_ANALYTICS.flush());
  await expect.poll(()=>page.evaluate(()=>window.__analyticsTest.sent.length)).toBeGreaterThan(0);
  let events=await page.evaluate(()=>window.__analyticsTest.sent.flatMap(row=>JSON.parse(row.body).events));
  expect(events.some(event=>event.event_name==='interest_add'&&event.submission_id===31)).toBeTruthy();
  expect(events.some(event=>event.event_name==='follow_add'&&event.submission_id===31)).toBeTruthy();
  expect(events.some(event=>event.event_name==='suggest_started')).toBeTruthy();
  expect(events.some(event=>event.event_name==='suggest_step'&&event.event_value==='content')).toBeTruthy();
  expect(events.some(event=>event.event_name==='suggest_abandoned'&&event.event_value==='content')).toBeTruthy();

  await page.evaluate(()=>{
    window.__analyticsTest.sent.length=0;
    window.DTL_APP.state.view='suggest';
    window.DTL_APP.state.wizardStep=4;
    document.querySelector('#viewRoot').innerHTML='<section class="suggest-wizard-page"></section>';
    for(const patch of window.__analyticsTest.patchers)patch();
  });
  await dispatchResponse(page,'/api/app/submit',{submission_id:77,ok:true},{method:'POST',body:'FORMDATA'});
  await page.evaluate(()=>{
    window.DTL_APP.state.view='home';
    document.dispatchEvent(new CustomEvent('dtl:viewchange',{detail:{view:'home'}}));
    return window.DTL_PRODUCT_ANALYTICS.flush();
  });
  await expect.poll(()=>page.evaluate(()=>window.__analyticsTest.sent.length)).toBeGreaterThan(0);
  events=await page.evaluate(()=>window.__analyticsTest.sent.flatMap(row=>JSON.parse(row.body).events));
  expect(events.some(event=>event.event_name==='request_submitted'&&event.submission_id===77)).toBeTruthy();
  expect(events.some(event=>event.event_name==='suggest_abandoned')).toBeFalsy();
});

test('Admin Analytics renders product funnel and zero-result demand without mobile overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('https://dtl.test/**',handler=>handler.fulfill({status:200,contentType:'text/html',body:'<main class="admin-content"><section class="admin-analytics"></section></main>'}));
  await page.goto('https://dtl.test/');
  await page.addStyleTag({content:cssSource});
  await page.evaluate(()=>{
    const handlers=[];const patchers=[];
    window.__adminAnalyticsTest={handlers,patchers};
    window.lucide={createIcons(){}};
    window.DTL_RUNTIME={registerResponseHandler(fn){handlers.push(fn);return()=>{};},registerPatcher(fn){patchers.push(fn);return()=>{};},locale(){return'en';}};
    window.DTL_ADMIN={activeRoute:()=> 'tools:analytics'};
  });
  await page.addScriptTag({content:adminSource});
  const payload={days:30,product:{
    tracking_since:'2026-08-12T10:00:00.000Z',events_total:87,searches:40,zero_results:12,zero_result_rate:30,
    raw_opens:8,duplicates_intercepted:3,shares:6,release_opens:9,boosty_clicks:4,
    funnel:{search_users:25,open_users:18,intent_users:11,request_users:6,requests:7,demand_adds:8,follow_adds:5},
    suggest:{started_users:12,submitted_users:6,abandoned_users:4,completion_rate:50,steps:[{step:'upload',users:12},{step:'details',users:10},{step:'content',users:8},{step:'review',users:7}]},
    zero_result_queries:[{query_text:'academy necromancer',count:5,users:4,last_seen:'2026-08-12T11:00:00.000Z'},{query_text:'빙의 악녀',count:3,users:2,last_seen:'2026-08-12T10:30:00.000Z'}],
  }};
  await page.evaluate(async payload=>{
    const response=new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
    for(const handler of window.__adminAnalyticsTest.handlers)await handler(response.clone(),{pathname:'/api/app/admin/analytics'});
    document.dispatchEvent(new CustomEvent('dtl:adminrender',{detail:{section:'analytics'}}));
    for(const patch of window.__adminAnalyticsTest.patchers)patch();
  },payload);

  const panel=page.locator('[data-product-analytics]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Main funnel');
  await expect(panel).toContainText('Suggest drop-off');
  await expect(panel).toContainText('academy necromancer');
  await expect(panel).toContainText('빙의 악녀');
  await expect(panel).toContainText('30%');
  const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport+1);
});
