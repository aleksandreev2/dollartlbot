import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runtime=read('public/app/title-following-ui.js');
const css=[read('public/app/app.css'),read('public/app/ui-polish.css'),read('public/app/account-page.css'),read('public/app/title-following-ui.css')].join('\n');

async function boot(page,{view='discover',followingItems=[]}={}){
  await page.setViewportSize({width:390,height:820});
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main id="viewRoot"></main><div id="sheetRoot"></div><div id="toastRegion"></div></body></html>`);
  await page.evaluate(({view,followingItems})=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const state={locale:'en',preview:false,view,detailNovel:null,discoverySource:null,discoveryAuto:null,draft:{source_url:''},bootstrap:{user:{id:10,is_admin:false},account:{plan:'regular',used:0,limit:1,remaining:1,regular_max_chapters:250,boosty_url:''}}};
    const calls=[];
    window.__calls=calls;window.__duplicate=false;window.__toasts=[];window.lucide={createIcons(){}};
    window.DTL_APP={
      state,viewRoot:document.getElementById('viewRoot'),sheetRoot:document.getElementById('sheetRoot'),escapeHtml,
      tr:key=>({close:'Close'}[key]||key),toast:(message,type)=>window.__toasts.push({message,type}),
      openNovel:id=>window.__opened=id,tg:{openLink:url=>window.__external=url},
      async api(path,options={}){
        calls.push({path,options});
        if(path==='/api/app/submission/preflight'){
          if(window.__duplicate)return{ok:true,identity:'novelpia:401201',duplicate:{submission_id:88,title:'Existing Novel',request_status:'accepted',queue_status:'queued',queue_position:4,chapter_count:120,current_chapter:null,identity:'novelpia:401201',quota_used:false}};
          return{ok:true,identity:'novelpia:401201',duplicate:null};
        }
        if(path==='/api/app/submit')return{submission_id:77,used:1,limit:1,remaining:0};
        if(path==='/api/app/discovery/interest'){
          const body=JSON.parse(options.body);return{submission_id:body.submission_id,demand_count:9,viewer_interested:true,own_request:false,sources:[]};
        }
        if(path==='/api/app/following')return{count:followingItems.length,followed_keys:followingItems.map(x=>x.follow_key),items:followingItems};
        if(path==='/api/app/following/submission'){
          const body=JSON.parse(options.body);return{ok:true,following:body.following,follow_key:`submission:${body.submission_id}`,submission_id:body.submission_id};
        }
        if(path==='/api/app/following/catalog'){
          const body=JSON.parse(options.body);return{ok:true,following:body.following,follow_key:`novelpia:${400000+body.catalog_id}`,catalog_id:body.catalog_id,linked_submission_id:null};
        }
        throw new Error(`Unexpected API ${path}`);
      },
    };
  },{view,followingItems});
  await page.addScriptTag({content:runtime});
}

test('submit preflight injects canonical NovelPia identity and stable request id before the file upload API',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{
    const app=window.DTL_APP;
    app.state.discoveryAuto={catalog_id:501,provider:'novelpia',external_id:'401201',source_url:'https://novelpia.com/novel/401201'};
    app.state.draft.source_url='https://novelpia.com/novel/401201';
    const form=new FormData();form.set('file',new File(['raw'],'raw.txt',{type:'text/plain'}),'raw.txt');
    form.set('title','Fresh Novel');form.set('source_url',app.state.draft.source_url);
    const response=await app.api('/api/app/submit',{method:'POST',body:form});
    const calls=window.__calls;
    const submit=calls.find(entry=>entry.path==='/api/app/submit');
    const submitPaths=calls.map(x=>x.path).filter(path=>path==='/api/app/submission/preflight'||path==='/api/app/submit');
    return{response,submitPaths,requestId:submit.options.body.get('request_id'),provider:submit.options.body.get('identity_provider'),externalId:submit.options.body.get('identity_external_id')};
  });
  expect(result.submitPaths).toEqual(['/api/app/submission/preflight','/api/app/submit']);
  expect(result.provider).toBe('novelpia');
  expect(result.externalId).toBe('401201');
  expect(result.requestId).toMatch(/^web_[A-Za-z0-9]+/);
  expect(result.requestId.length).toBeGreaterThanOrEqual(16);
  expect(result.response.submission_id).toBe(77);
});

test('duplicate preflight converts to demand, stops upload, and keeps Follow separate',async({page})=>{
  await boot(page);
  const result=await page.evaluate(async()=>{
    const app=window.DTL_APP;window.__duplicate=true;
    app.state.discoverySource={provider:'raw_fucknovelpia',external_id:'401201',source_url:'https://novelpia.com/novel/401201'};
    app.state.draft.source_url='https://novelpia.com/novel/401201';
    const form=new FormData();form.set('file',new File(['raw'],'raw.txt'),'raw.txt');
    try{await app.api('/api/app/submit',{method:'POST',body:form});return{failed:false};}
    catch(error){
      const calls=window.__calls;
      const submitPaths=calls.map(x=>x.path).filter(path=>path==='/api/app/submission/preflight'||path==='/api/app/submit');
      const interest=calls.find(entry=>entry.path==='/api/app/discovery/interest');
      return{failed:true,code:error.code,message:error.message,submissionId:error.submission_id,quotaUsed:error.quota_used,submitPaths,interestBody:interest?JSON.parse(interest.options.body):null,followMutation:calls.some(entry=>entry.path==='/api/app/following/submission')};
    }
  });
  expect(result.failed).toBe(true);
  expect(result.code).toBe('duplicate_title');
  expect(result.message).toContain('interest');
  expect(result.message).toContain('quota was not used');
  expect(result.submissionId).toBe(88);
  expect(result.quotaUsed).toBe(false);
  expect(result.submitPaths).toEqual(['/api/app/submission/preflight']);
  expect(result.interestBody).toEqual({submission_id:88,interested:true});
  expect(result.followMutation).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.__opened||null)).toBe(88);
});

test('Discover gets a separate Follow updates action without changing demand state',async({page})=>{
  await boot(page,{view:'discover'});
  await page.evaluate(()=>{
    document.getElementById('viewRoot').innerHTML='<div class="discover-row"><div class="discover-row-actions"><button type="button" data-discover-interest="7">I want this translated</button></div></div><div class="discover-catalog-row" data-catalog="501"><div class="discover-row-actions"><button type="button" data-catalog-interest="501">I want this translated</button></div></div>';
    document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'discover'}}));
  });
  await expect(page.locator('[data-title-follow-kind="submission"][data-title-follow-id="7"]')).toBeVisible();
  await expect(page.locator('[data-title-follow-kind="catalog"][data-title-follow-id="501"]')).toBeVisible();
  await page.locator('[data-title-follow-kind="submission"][data-title-follow-id="7"]').click();
  await expect(page.locator('[data-title-follow-kind="submission"][data-title-follow-id="7"]')).toContainText('Following');
  const followCall=await page.evaluate(()=>window.__calls.find(entry=>entry.path==='/api/app/following/submission'));
  expect(JSON.parse(followCall.options.body)).toEqual({submission_id:7,following:true});
  expect(await page.evaluate(()=>window.__calls.some(entry=>entry.path==='/api/app/discovery/interest'))).toBe(false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Detail follow action is mutation-stable and does not refetch or duplicate itself',async({page})=>{
  await boot(page,{view:'detail'});
  await page.evaluate(()=>{
    const app=window.DTL_APP;
    app.state.detailNovel={id:42,title:'The Prince’s Nanny'};
    app.viewRoot.innerHTML='<section><div class="live-detail-actions"><button type="button" id="detailOriginal">Open original</button><button type="button" id="detailQueue">View queue</button></div></section>';
    document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'detail'}}));
  });
  const button=page.locator('.title-follow-detail');
  await expect(button).toBeVisible();
  await page.waitForTimeout(150);
  expect(await page.locator('.title-follow-detail').count()).toBe(1);
  expect(await page.evaluate(()=>window.__calls.filter(entry=>entry.path==='/api/app/following').length)).toBe(1);
  await button.click();
  await expect(page.locator('.title-follow-detail')).toContainText('Following');
  await page.waitForTimeout(100);
  expect(await page.locator('.title-follow-detail').count()).toBe(1);
  expect(await page.evaluate(()=>window.__calls.filter(entry=>entry.path==='/api/app/following').length)).toBe(1);
  const actionOrder=await page.locator('.live-detail-actions > *').evaluateAll(nodes=>nodes.map(node=>node.id||node.className));
  expect(actionOrder[1]).toContain('title-follow-detail');
});

test('Account exposes Following and lets a user open and unfollow a real title',async({page})=>{
  await boot(page,{view:'account',followingItems:[{kind:'submission',submission_id:42,title:'The Prince’s Nanny',original_language:'Korean',chapter_count:360,request_status:'accepted',queue_status:'in_progress',current_chapter:120,progress_percent:33,follow_key:'submission:42'}]});
  await page.evaluate(()=>{
    document.getElementById('viewRoot').innerHTML='<section class="account-page"><div class="account-preferences-group"><div class="settings-list"><button class="setting-row" id="notificationsSetting"><span>Notifications</span></button></div></div></section>';
    document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'account'}}));
  });
  await expect(page.locator('#followingSetting')).toContainText('Following');
  await page.locator('#followingSetting').click();
  await expect(page.locator('.title-follow-item')).toContainText('The Prince’s Nanny');
  await expect(page.locator('.title-follow-item')).toContainText('120 / 360');
  await page.locator('[data-follow-open="0"]').click();
  expect(await page.evaluate(()=>window.__opened)).toBe(42);

  await page.locator('#followingSetting').click();
  await page.locator('[data-follow-remove="0"]').click();
  const call=await page.evaluate(()=>window.__calls.filter(entry=>entry.path==='/api/app/following/submission').at(-1));
  expect(JSON.parse(call.options.body)).toEqual({submission_id:42,following:false});
});
