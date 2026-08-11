import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const source=fs.readFileSync(new URL('../public/app/publication-release-range.js',import.meta.url),'utf8');

async function boot(page){
  await page.route('https://range.test/**',route=>route.fulfill({
    status:200,
    contentType:'text/html',
    body:`<!doctype html><body><section class="publisher-editor"><div class="publisher-flow-main"><label class="admin-field"><span>Название</span><input id="pubTitle"></label></div></section></body>`,
  }));
  await page.goto('https://range.test/');
  await page.evaluate(()=>{
    window.__range={calls:[],patchers:[],middlewares:[],handlers:[],nextCalls:0};
    window.lucide={createIcons(){}};
    window.DTL_RUNTIME={
      registerPatcher(fn){window.__range.patchers.push(fn);return()=>{};},
      registerFetchMiddleware(fn){window.__range.middlewares.push(fn);return()=>{};},
      registerResponseHandler(fn){window.__range.handlers.push(fn);return()=>{};},
    };
    window.DTL_ADMIN={
      activeRoute(){return 'section:publishing';},
      icons(){},
      async api(path,options={}){
        const method=options.method||'GET';
        window.__range.calls.push({path,method,body:options.body||null});
        if(path==='/api/app/admin/publication-release-range/draft'&&method==='GET')return{draft:{chapter_start:78,chapter_end:85,updated_at:'2026-08-11T15:00:00Z'}};
        if(path==='/api/app/admin/publication-release-range/draft'&&(method==='POST'||method==='DELETE'))return{ok:true};
        if(/^\/api\/app\/admin\/publications\/\d+\/release-range$/.test(path)&&method==='POST')return{ok:true};
        if(/^\/api\/app\/admin\/publications\/\d+$/.test(path)&&method==='DELETE')return{ok:true};
        throw new Error(`Unhandled ${method} ${path}`);
      },
    };
  });
  await page.addScriptTag({content:source});
  await page.evaluate(()=>window.__range.patchers.forEach(fn=>fn()));
  await expect(page.locator('#pubChapterStart')).toHaveValue('78');
  await expect(page.locator('#pubChapterEnd')).toHaveValue('85');
}

test('restores, autosaves and attaches structured chapter range to a new publication',async({page})=>{
  await boot(page);
  await page.locator('#pubChapterStart').fill('86');
  await page.locator('#pubChapterEnd').fill('97');
  await expect(page.locator('#pubRangeStatus')).toContainText('86–97');
  await expect.poll(()=>page.evaluate(()=>window.__range.calls.some(call=>call.path==='/api/app/admin/publication-release-range/draft'&&call.method==='POST')),{timeout:2000}).toBe(true);

  const result=await page.evaluate(async()=>{
    const middleware=window.__range.middlewares[0];
    const next=async()=>{
      window.__range.nextCalls+=1;
      return new Response(JSON.stringify({publication:{publication:{id:42}}}),{status:201,headers:{'content-type':'application/json'}});
    };
    const response=await middleware('/api/app/admin/publications',{method:'POST',body:new FormData()},next,{pathname:'/api/app/admin/publications'});
    return {status:response.status,calls:window.__range.calls,nextCalls:window.__range.nextCalls};
  });
  expect(result.status).toBe(201);
  expect(result.nextCalls).toBe(1);
  const rangeCall=result.calls.find(call=>call.path==='/api/app/admin/publications/42/release-range');
  expect(rangeCall).toBeTruthy();
  expect(JSON.parse(rangeCall.body)).toEqual({chapter_start:86,chapter_end:97});
  await expect(page.locator('#pubChapterStart')).toHaveValue('86');
  await expect(page.locator('#pubChapterEnd')).toHaveValue('97');

  await page.evaluate(async()=>{
    const response=new Response(JSON.stringify({publication:{publication:{id:42}}}),{status:201,headers:{'content-type':'application/json'}});
    await window.__range.handlers[0](response,{pathname:'/api/app/admin/publications'});
  });
  await expect(page.locator('#pubChapterStart')).toHaveValue('');
  await expect(page.locator('#pubChapterEnd')).toHaveValue('');
});

test('keeps range draft when a later publication middleware fails',async({page})=>{
  await boot(page);
  await page.locator('#pubChapterStart').fill('100');
  await page.locator('#pubChapterEnd').fill('110');
  await page.evaluate(async()=>{
    const middleware=window.__range.middlewares[0];
    const next=async()=>new Response(JSON.stringify({publication:{publication:{id:50}}}),{status:201,headers:{'content-type':'application/json'}});
    await middleware('/api/app/admin/publications',{method:'POST',body:new FormData()},next,{pathname:'/api/app/admin/publications'});
    const failure=new Response(JSON.stringify({error:{message:'request link failed'}}),{status:409,headers:{'content-type':'application/json'}});
    await window.__range.handlers[0](failure,{pathname:'/api/app/admin/publications'});
  });
  await expect(page.locator('#pubChapterStart')).toHaveValue('100');
  await expect(page.locator('#pubChapterEnd')).toHaveValue('110');
});

test('blocks an incomplete range before a publication draft is created',async({page})=>{
  await boot(page);
  await page.locator('#pubChapterStart').fill('100');
  await page.locator('#pubChapterEnd').fill('');
  await expect(page.locator('#pubRangeStatus')).toContainText('обе границы');

  const result=await page.evaluate(async()=>{
    const middleware=window.__range.middlewares[0];
    const next=async()=>{window.__range.nextCalls+=1;return new Response('{}',{status:201});};
    const response=await middleware('/api/app/admin/publications',{method:'POST',body:new FormData()},next,{pathname:'/api/app/admin/publications'});
    return {status:response.status,nextCalls:window.__range.nextCalls,payload:await response.json()};
  });
  expect(result.status).toBe(400);
  expect(result.nextCalls).toBe(0);
  expect(result.payload.error.code).toBe('invalid_chapter_range');
});
