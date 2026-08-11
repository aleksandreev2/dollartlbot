import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=[read('public/app/app.css'),read('public/app/ui-polish.css'),read('public/app/discover-page.css')].join('\n');
const discover=read('public/app/view-discover.js');
const runtime=read('public/app/discover-page-runtime.js');

function rows(){
  const base=[
    {id:1,title:'The Prince’s Nanny Specializes in Assassination',original_language:'Korean',chapter_count:360,publication_status:'ongoing',genres_tags:'Fantasy, Romance',request_status:'accepted',queue_status:'queued',queue_position:8,demand_count:84,recent_interest_count:18,trend_delta:9,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T10:00:00Z'},
    {id:2,title:'Academy Villain’s Second Semester',original_language:'Korean',chapter_count:210,publication_status:'ongoing',genres_tags:'Fantasy, Academy',request_status:'pending',queue_status:null,queue_position:null,demand_count:61,recent_interest_count:12,trend_delta:7,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T09:00:00Z'},
    {id:3,title:'I Found a Dragon Egg',original_language:'Korean',chapter_count:120,publication_status:'completed',genres_tags:'Adventure, Fantasy',request_status:'accepted',queue_status:'in_progress',queue_position:1,demand_count:43,recent_interest_count:10,trend_delta:4,viewer_interested:true,own_request:false,raw_available:false,discovered_at:'2026-08-10T18:00:00Z'},
    {id:4,title:'The Saint’s Secret Wedding',original_language:'Japanese',chapter_count:88,publication_status:'ongoing',genres_tags:'Romance',request_status:'accepted',queue_status:null,queue_position:null,demand_count:27,recent_interest_count:4,trend_delta:1,viewer_interested:false,own_request:true,raw_available:false,discovered_at:'2026-08-10T12:00:00Z'},
  ];
  return base.map(row=>({...row,updated_at:row.discovered_at,current_chapter:row.id===3?44:null}));
}

async function boot(page,{width=390,height=820,admin=false}={}){
  await page.setViewportSize({width,height});
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main id="viewRoot"></main><nav id="bottomNav"><button class="nav-item" data-nav="home"><span>Home</span></button><button class="nav-item" data-nav="queue"><span>Queue</span></button><button class="nav-item" data-nav="${admin?'requests':'suggest'}"><span>${admin?'Requests':'Suggest'}</span></button><button class="nav-item" data-nav="account"><span>Account</span></button></nav><div id="toastRegion"></div></body></html>`);
  await page.evaluate(({admin})=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const state={locale:'en',preview:false,view:'discover',bootstrap:{user:{is_admin:admin},queue:{active:[],upcoming:[],completed:[]}},draft:{title:'',original_language:'',chapter_count:'',publication_status:'ongoing',source_url:'',genres_tags:''}};
    const views={};
    const feedRows=[
      {id:1,title:'The Prince’s Nanny Specializes in Assassination',original_language:'Korean',chapter_count:360,publication_status:'ongoing',genres_tags:'Fantasy, Romance',request_status:'accepted',queue_status:'queued',queue_position:8,demand_count:84,recent_interest_count:18,trend_delta:9,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T10:00:00Z',updated_at:'2026-08-11T10:00:00Z'},
      {id:2,title:'Academy Villain’s Second Semester',original_language:'Korean',chapter_count:210,publication_status:'ongoing',genres_tags:'Fantasy, Academy',request_status:'pending',queue_status:null,queue_position:null,demand_count:61,recent_interest_count:12,trend_delta:7,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T09:00:00Z',updated_at:'2026-08-11T09:00:00Z'},
      {id:3,title:'I Found a Dragon Egg',original_language:'Korean',chapter_count:120,publication_status:'completed',genres_tags:'Adventure, Fantasy',request_status:'accepted',queue_status:'in_progress',queue_position:1,current_chapter:44,demand_count:43,recent_interest_count:10,trend_delta:4,viewer_interested:true,own_request:false,raw_available:false,discovered_at:'2026-08-10T18:00:00Z',updated_at:'2026-08-10T18:00:00Z'},
      {id:4,title:'The Saint’s Secret Wedding',original_language:'Japanese',chapter_count:88,publication_status:'ongoing',genres_tags:'Romance',request_status:'accepted',queue_status:null,queue_position:null,demand_count:27,recent_interest_count:4,trend_delta:1,viewer_interested:false,own_request:true,raw_available:false,discovered_at:'2026-08-10T12:00:00Z',updated_at:'2026-08-10T12:00:00Z'},
    ];
    const apiCalls=[];
    window.__views=views;window.__apiCalls=apiCalls;window.__renders=0;
    window.lucide={createIcons(){}};
    window.DTL_APP={
      state,viewRoot:document.getElementById('viewRoot'),bottomNav:document.getElementById('bottomNav'),escapeHtml,
      languageFlag:value=>String(value).startsWith('Korean')?'🇰🇷':String(value).startsWith('Japanese')?'🇯🇵':'🌐',
      cover:(title,small=false)=>`<div class="novel-cover${small?' small':''}">${escapeHtml(title.slice(0,2))}</div>`,
      relativeTime:()=> 'today',
      tg:{HapticFeedback:{selectionChanged(){}}},toast(message){window.__toast=message;},
      registerView(name,renderer){views[name]=renderer;},
      navigate(view){state.view=view;window.__navigated=view;if(views[view])views[view]();document.dispatchEvent(new CustomEvent('dtl:viewchange',{detail:{view}}));},
      openNovel(id){window.__opened=id;},
      async api(path,options={}){
        apiCalls.push({path,options});
        if(path==='/api/app/discovery/feed')return{trending:[...feedRows],most_requested:[...feedRows],raw_available:feedRows.filter(row=>row.raw_available),recently_found:[...feedRows].reverse(),catalog:[...feedRows]};
        if(path==='/api/app/discovery/opportunities')return{items:feedRows.map((row,index)=>({...row,opportunity_score:92-index*8}))};
        if(path.startsWith('/api/app/discovery/search'))return{provider_status:'ok',local:[],external:[{provider:'raw_fucknovelpia',external_id:'174592',title:'External Nanny',original_title:'황자의 보모',author:'Author',original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://novelpia.com/novel/174592',page_url:'https://raw-fucknovelpia.com/novel/demo',raw_available:true,genres_tags:'Fantasy, Romance'}]};
        if(path==='/api/app/discovery/interest'){
          const body=JSON.parse(options.body);return{submission_id:body.submission_id,demand_count:85,viewer_interested:body.interested};
        }
        throw new Error(`Unexpected API ${path}`);
      },
    };
    document.getElementById('bottomNav').addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)window.DTL_APP.navigate(button.dataset.nav);});
    document.addEventListener('dtl:viewrender',()=>window.__renders++);
  },{admin});
  await page.addScriptTag({content:discover});
  await page.addScriptTag({content:runtime});
  await page.evaluate(()=>{window.__views.discover();document.dispatchEvent(new CustomEvent('dtl:discover',{detail:{view:'discover'}}));});
  await expect(page.locator('.discover-feature')).toHaveCount(3);
}

for(const viewport of [{name:'mobile',width:360,height:780},{name:'desktop',width:1200,height:850}]){
  test(`Discover feed is usable without horizontal overflow on ${viewport.name}`,async({page})=>{
    await boot(page,viewport);
    await expect(page.locator('[data-nav="discover"]')).toContainText('Discover');
    await expect(page.locator('.discover-row')).toHaveCount(4);
    await expect(page.locator('.discover-feature').first()).toContainText('84 readers want this');

    await page.locator('[data-discover-mode="raw_available"]').click();
    await expect(page.locator('.discover-row')).toHaveCount(2);
    await expect(page.locator('.discover-row .discover-badge.raw')).toHaveCount(2);

    const renders=await page.evaluate(()=>window.__renders);
    expect(renders).toBeGreaterThan(0);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('Discover search can hand an external title directly to Suggest',async({page})=>{
  await boot(page,{width:390,height:820});
  await page.locator('#discoverQuery').fill('174592');
  await page.locator('#discoverQuery').press('Enter');
  await expect(page.locator('.discover-external-row')).toContainText('External Nanny');
  await page.locator('[data-discover-external="0"]').click();
  const result=await page.evaluate(()=>({navigated:window.__navigated,source:window.DTL_APP.state.discoverySource,draft:window.DTL_APP.state.draft}));
  expect(result.navigated).toBe('suggest');
  expect(result.source.external_id).toBe('174592');
  expect(result.draft.title).toBe('External Nanny');
  expect(result.draft.chapter_count).toBe('360');
});

test('Discover demand vote updates in place and admin gets opportunity ranking',async({page})=>{
  await boot(page,{width:390,height:840,admin:true});
  await expect(page.locator('.discover-admin')).toBeVisible();
  await expect(page.locator('.discover-score').first()).toHaveText('92');
  await expect(page.locator('[data-nav="discover"]')).toContainText('Discover');

  const vote=page.locator('[data-discover-interest="1"]').first();
  await vote.click();
  await expect(page.locator('.discover-row').filter({hasText:'The Prince’s Nanny'}).first()).toContainText('85 readers want this');
  const call=await page.evaluate(()=>window.__apiCalls.find(entry=>entry.path==='/api/app/discovery/interest'));
  expect(JSON.parse(call.options.body)).toEqual({submission_id:1,interested:true});
});
