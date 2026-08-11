import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const requestsView=read('public/app/view-requests-account.js');
const selfService=read('public/app/request-self-service-ui-v2.js');
const deeplink=read('public/app/notification-deeplink.js');
const css=[
  read('public/app/app.css'),
  read('public/app/ui-polish.css'),
  read('public/app/account-page.css'),
  read('public/app/interaction-upgrade.css'),
  read('public/app/request-self-service-ui.css'),
].join('\n');

const baseRequest={
  id:42,user_id:10,title:'Academy Survival',original_language:'Korean',chapter_count:120,publication_status:'ongoing',
  source_url:'https://novelpia.com/novel/401201',raw_file_name:'academy.txt',raw_file_mime:'text/plain',genres_tags:'Academy, Survival',
  sexual_content:'None',sensitive_content:'Violence',notes:'Original note',status:'pending',state:'needs_info',review_state:'needs_info',
  review_requested_at:'2026-08-12T00:00:00.000Z',review_resolved_at:null,withdrawn_at:null,created_at:'2026-08-11T20:00:00.000Z',updated_at:'2026-08-12T00:00:00.000Z',
};

const userHtml=`<!doctype html><html><head><style>${css}</style></head><body><main id="viewRoot"></main><div id="sheetRoot"></div><div id="toastRegion"></div></body></html>`;

async function bootUser(page,{request=baseRequest,loadDeeplink=false}={}){
  await page.setViewportSize({width:390,height:820});
  await page.route('https://dollartl.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:userHtml}));
  await page.goto('https://dollartl.test/app/');
  await page.evaluate(request=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const views={};const calls=[];const toasts=[];const patchers=[];
    const manage={
      request:{...request},
      conversation:[{id:1,submission_id:42,author_role:'admin',author_user_id:999,kind:'needs_info',text:'Please upload the original Korean RAW.',created_at:'2026-08-12T00:00:00.000Z'}],
      permissions:{edit:true,replace_raw:true,message:true,withdraw:true},
    };
    const state={locale:'en',preview:false,view:'requests',requestFilter:'active',bootstrap:{my_requests:[{...request}],account:{plan:'regular',used:1,limit:1,remaining:0,regular_max_chapters:250,boosty_url:''}}};
    const viewRoot=document.getElementById('viewRoot'),sheetRoot=document.getElementById('sheetRoot');
    window.__calls=calls;window.__toasts=toasts;window.__manage=manage;window.__views=views;window.__patchers=patchers;
    window.lucide={createIcons(){}};
    const components={
      statusPill:s=>`<span class="status-pill">${escapeHtml(s)}</span>`,emptyCard:()=>'<div class="empty-card">Empty</div>',bindNovelLinks(){},
      accountCard:()=>'',
      showSheet(content){sheetRoot.innerHTML=`<div class="sheet-backdrop"><div class="bottom-sheet">${content}</div></div>`;document.documentElement.classList.add('dtl-sheet-open');document.dispatchEvent(new CustomEvent('dtl:sheetopen',{detail:{root:sheetRoot}}));},
      closeSheet(){sheetRoot.innerHTML='';document.documentElement.classList.remove('dtl-sheet-open');document.dispatchEvent(new CustomEvent('dtl:sheetclose'));},
    };
    const app={
      state,viewRoot,sheetRoot,components,escapeHtml,LANGUAGE_NAMES:{en:'English'},
      tr:key=>({myRequests:'My Requests',requestsSubtitle:'Track your requests',all:'All',active:'Active',completed:'Completed',rejected:'Rejected',pending:'Pending',inQueue:'In queue',inProgress:'In progress',position:'Position',originalLanguage:'Original language',chapterCount:'Chapters',publicationStatus:'Publication status',ongoing:'Ongoing',completed:'Completed',novelTitle:'Novel title',genresTags:'Genres & Tags',sexualContent:'Sexual content',sensitiveContent:'Sensitive content',additionalNotes:'Notes'}[key]||key),
      copy:key=>key,i18nTable:()=>({}),languageFlag:()=>'',languageName:value=>value,formatDate:()=> 'Aug 11',cover:()=>'<span class="cover"></span>',
      registerView(name,renderer){views[name]=renderer;},
      render(){views[state.view]?.();document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:state.view}}));if(state.view==='requests')document.dispatchEvent(new CustomEvent('dtl:requests'));},
      navigate(view){state.view=view;this.render();},
      toast:(message,type)=>toasts.push({message,type}),tg:{showConfirm(_text,cb){cb(true);}},
      async api(path,options={}){
        let body=null;
        if(typeof options.body==='string'){try{body=JSON.parse(options.body);}catch{body=options.body;}}
        else if(options.body instanceof FormData){const file=options.body.get('file');body={file_name:file?.name||'',file_size:file?.size||0};}
        calls.push({path,method:options.method||'GET',body});
        if(path==='/api/app/requests/42/manage')return structuredClone(window.__manage);
        if(path==='/api/app/requests/42/edit'){
          const next={...window.__manage,request:{...window.__manage.request,...body,review_state:'user_replied',state:'user_replied',updated_at:'2026-08-12T00:10:00.000Z'},conversation:[...window.__manage.conversation,{id:2,submission_id:42,author_role:'system',kind:'edit',text:'Request details were updated.',created_at:'2026-08-12T00:10:00.000Z'}]};window.__manage=next;return structuredClone(next);
        }
        if(path==='/api/app/requests/42/raw'){
          const next={...window.__manage,request:{...window.__manage.request,raw_file_name:body.file_name,review_state:'user_replied',state:'user_replied',updated_at:'2026-08-12T00:11:00.000Z'}};window.__manage=next;return structuredClone(next);
        }
        if(path==='/api/app/requests/42/message'){
          const next={...window.__manage,request:{...window.__manage.request,review_state:'user_replied',state:'user_replied',updated_at:'2026-08-12T00:12:00.000Z'},conversation:[...window.__manage.conversation,{id:3,submission_id:42,author_role:'user',kind:'user_reply',text:body.text,created_at:'2026-08-12T00:12:00.000Z'}]};window.__manage=next;return structuredClone(next);
        }
        if(path==='/api/app/requests/42/withdraw'){
          const next={...window.__manage,request:{...window.__manage.request,status:'rejected',state:'withdrawn',withdrawn_at:'2026-08-12T00:13:00.000Z',slot_returned:1,review_state:'ready',updated_at:'2026-08-12T00:13:00.000Z'},permissions:{edit:false,replace_raw:false,message:false,withdraw:false}};window.__manage=next;return structuredClone(next);
        }
        throw new Error(`Unexpected API ${path}`);
      },
    };
    window.DTL_APP=app;
    window.DTL_RUNTIME={registerPatcher(fn){patchers.push(fn);}};
  },request);
  await page.addScriptTag({content:requestsView});
  if(loadDeeplink)await page.addScriptTag({content:deeplink});
  await page.addScriptTag({content:selfService});
  await page.evaluate(()=>window.DTL_APP.render());
}

async function bootAdmin(page,{reviewState='needs_info'}={}){
  await page.setViewportSize({width:900,height:800});
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main id="viewRoot"></main><div id="sheetRoot"></div><section id="adminInboxDetail"><header class="admin-inbox-detail-head"></header><div data-request-quick-editor></div><div data-workflow-advanced="42"></div><div class="admin-inbox-primary-actions"><button type="button" data-workflow-action="accept">Accept</button></div></section></body></html>`);
  await page.evaluate(reviewState=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const calls=[];const patchers=[];window.__calls=calls;window.__patchers=patchers;window.lucide={createIcons(){}};
    const make=state=>({request:{id:42,title:'Academy Survival',status:'pending',review_state:state,withdrawn_at:null},conversation:state==='needs_info'?[{author_role:'admin',text:'Need original RAW'}]:state==='user_replied'?[{author_role:'admin',text:'Need original RAW'},{author_role:'user',text:'Uploaded.'}]:[],permissions:{edit:true,replace_raw:true,message:true,withdraw:true}});
    window.DTL_APP={state:{locale:'en',view:'admin',bootstrap:{my_requests:[]}},viewRoot:document.getElementById('viewRoot'),sheetRoot:document.getElementById('sheetRoot'),escapeHtml,api:async()=>{throw new Error('unexpected user API');},components:{}};
    window.DTL_ADMIN={activeRoute:()=> 'section:requests',toast:()=>{},async api(path,options={}){let body=null;if(typeof options.body==='string')body=JSON.parse(options.body);calls.push({path,method:options.method||'GET',body});if(path==='/api/app/admin/requests/42/review')return make(reviewState);if(path==='/api/app/admin/requests/42/resolve-info')return make('ready');if(path==='/api/app/admin/requests/42/needs-info')return make('needs_info');throw new Error(`Unexpected admin API ${path}`);}};
    window.DTL_RUNTIME={registerPatcher(fn){patchers.push(fn);}};
  },reviewState);
  await page.addScriptTag({content:selfService});
}

test('Needs Info remains in Active and self-service mounting is idempotent',async({page})=>{
  await bootUser(page);
  await expect(page.locator('.request-card[data-novel="42"]')).toBeVisible();
  await expect(page.locator('[data-self-review-for="42"]')).toContainText('Action needed');
  await expect(page.locator('[data-manage-request="42"]')).toBeVisible();
  for(let i=0;i<8;i++)await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'requests'}}));window.__patchers.forEach(fn=>fn());});
  await page.waitForTimeout(50);
  expect(await page.locator('[data-self-review-for="42"]').count()).toBe(1);
  expect(await page.locator('[data-manage-request="42"]').count()).toBe(1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Manage request shows the admin question and an edit becomes user_replied without a new submission',async({page})=>{
  await bootUser(page);
  await page.locator('[data-manage-request="42"]').click();
  await expect(page.locator('[data-request-manage="42"]')).toContainText('Please upload the original Korean RAW.');
  await page.locator('[data-self-edit]').click();
  await page.locator('[data-self-edit-form] input[name="title"]').fill('Academy Survival Revised');
  await page.locator('[data-self-edit-form] input[name="chapter_count"]').fill('130');
  await page.locator('[data-self-edit-form]').evaluate(form=>form.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>window.__calls.some(call=>call.path==='/api/app/requests/42/edit'))).toBe(true);
  const result=await page.evaluate(()=>({
    edit:window.__calls.find(call=>call.path==='/api/app/requests/42/edit'),
    submitCalls:window.__calls.filter(call=>call.path==='/api/app/submit').length,
    state:window.DTL_APP.state.bootstrap.my_requests[0].state,
  }));
  expect(result.edit.body.title).toBe('Academy Survival Revised');
  expect(result.edit.body.chapter_count).toBe(130);
  expect(result.submitCalls).toBe(0);
  expect(result.state).toBe('user_replied');
  await expect(page.locator('[data-request-manage="42"]')).toContainText('waiting for the team');
});

test('replacement RAW is sent as one file mutation and updates the existing request',async({page})=>{
  await bootUser(page);
  await page.locator('[data-manage-request="42"]').click();
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('[data-self-raw]').click();
  const chooser=await chooserPromise;
  await chooser.setFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('chapter 1')});
  await expect.poll(()=>page.evaluate(()=>window.__calls.some(call=>call.path==='/api/app/requests/42/raw'))).toBe(true);
  const result=await page.evaluate(()=>({call:window.__calls.find(call=>call.path==='/api/app/requests/42/raw'),submit:window.__calls.some(call=>call.path==='/api/app/submit')}));
  expect(result.call.body).toEqual({file_name:'replacement.txt',file_size:9});
  expect(result.submit).toBe(false);
  await expect(page.locator('[data-request-manage="42"]')).toContainText('replacement.txt');
});

test('withdraw closes management, returns the slot and removes the request from Active without creating a replacement',async({page})=>{
  await bootUser(page);
  await page.locator('[data-manage-request="42"]').click();
  await page.locator('[data-self-withdraw]').click();
  await expect.poll(()=>page.evaluate(()=>window.__calls.some(call=>call.path==='/api/app/requests/42/withdraw'))).toBe(true);
  expect(await page.locator('[data-request-manage="42"]').count()).toBe(0);
  await expect(page.locator('.request-card[data-novel="42"]')).toHaveCount(0);
  const result=await page.evaluate(()=>({state:window.DTL_APP.state.bootstrap.my_requests[0].state,slotReturned:window.DTL_APP.state.bootstrap.my_requests[0].slot_returned,submit:window.__calls.some(call=>call.path==='/api/app/submit')}));
  expect(result.state).toBe('withdrawn');
  expect(result.slotReturned).toBe(1);
  expect(result.submit).toBe(false);
  await page.evaluate(()=>{window.DTL_APP.state.requestFilter='all';window.DTL_APP.render();});
  await expect(page.locator('[data-self-review-for="42"]')).toContainText('quota returned');
  expect(await page.locator('[data-manage-request="42"]').count()).toBe(0);
});

test('admin Needs Info locks Accept until the reply is explicitly reviewed',async({page})=>{
  await bootAdmin(page,{reviewState:'user_replied'});
  await expect(page.locator('[data-admin-request-review="42"]')).toContainText('Requester replied');
  await expect(page.locator('[data-workflow-action="accept"]')).toBeDisabled();
  await page.locator('[data-admin-resolve-info]').click();
  await expect.poll(()=>page.evaluate(()=>window.__calls.some(call=>call.path==='/api/app/admin/requests/42/resolve-info'))).toBe(true);
  await expect(page.locator('[data-admin-request-review="42"]')).toContainText('Ready for decision');
  await expect(page.locator('[data-workflow-action="accept"]')).toBeEnabled();
});

test('request notification deep-link opens Manage request instead of ordinary title detail',async({page})=>{
  await bootUser(page,{loadDeeplink:true});
  await page.evaluate(()=>window.DTL_NOTIFICATION_LINK.open(`${location.origin}/app/?view=requests&request=42`));
  await expect(page.locator('[data-request-manage="42"]')).toBeVisible();
  expect((await page.evaluate(()=>window.__calls.map(call=>call.path))).filter(path=>path==='/api/app/requests/42/manage')).toHaveLength(1);
});
