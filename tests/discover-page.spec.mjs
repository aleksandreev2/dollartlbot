import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=[read('public/app/app.css'),read('public/app/ui-polish.css'),read('public/app/discover-page.css')].join('\n');
const discover=read('public/app/view-discover.js');
const runtime=read('public/app/discover-page-runtime.js');

async function boot(page,{width=390,height=820,admin=false,fresh=false}={}){
  await page.setViewportSize({width,height});
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main id="viewRoot"></main><nav id="bottomNav"><button class="nav-item" data-nav="home"><span>Home</span></button><button class="nav-item" data-nav="queue"><span>Queue</span></button><button class="nav-item" data-nav="${admin?'requests':'suggest'}"><span>${admin?'Requests':'Suggest'}</span></button><button class="nav-item" data-nav="account"><span>Account</span></button></nav><div id="toastRegion"></div></body></html>`);
  await page.evaluate(({admin,fresh})=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const state={locale:'en',preview:false,view:'discover',bootstrap:{user:{is_admin:admin},queue:{active:[],upcoming:[],completed:[]}},draft:{title:'',original_language:'',chapter_count:'',publication_status:'ongoing',source_url:'',genres_tags:''},discoverySource:null,discoveryAuto:null};
    const views={};
    const feedRows=[
      {kind:'local',id:1,title:'The Prince’s Nanny Specializes in Assassination',original_language:'Korean',chapter_count:360,publication_status:'ongoing',genres_tags:'Fantasy, Romance',request_status:'accepted',queue_status:'queued',queue_position:8,demand_count:84,recent_interest_count:18,trend_delta:9,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T10:00:00Z',updated_at:'2026-08-11T10:00:00Z'},
      {kind:'local',id:2,title:'Academy Villain’s Second Semester',original_language:'Korean',chapter_count:210,publication_status:'ongoing',genres_tags:'Fantasy, Academy',request_status:'pending',queue_status:null,queue_position:null,demand_count:61,recent_interest_count:12,trend_delta:7,viewer_interested:false,own_request:false,raw_available:true,discovered_at:'2026-08-11T09:00:00Z',updated_at:'2026-08-11T09:00:00Z'},
      {kind:'local',id:3,title:'I Found a Dragon Egg',original_language:'Korean',chapter_count:120,publication_status:'completed',genres_tags:'Adventure, Fantasy',request_status:'accepted',queue_status:'in_progress',queue_position:1,current_chapter:44,demand_count:43,recent_interest_count:10,trend_delta:4,viewer_interested:true,own_request:false,raw_available:false,discovered_at:'2026-08-10T18:00:00Z',updated_at:'2026-08-10T18:00:00Z'},
      {kind:'local',id:4,title:'The Saint’s Secret Wedding',original_language:'Japanese',chapter_count:88,publication_status:'ongoing',genres_tags:'Romance',request_status:'accepted',queue_status:null,queue_position:null,demand_count:27,recent_interest_count:4,trend_delta:1,viewer_interested:false,own_request:true,raw_available:false,discovered_at:'2026-08-10T12:00:00Z',updated_at:'2026-08-10T12:00:00Z'},
    ];
    const freshRows=[
      {kind:'catalog',catalog_id:501,provider:'novelpia',external_id:'401201',title:'아카데미에서 마법사는 퇴근하고 싶다',original_title:'아카데미에서 마법사는 퇴근하고 싶다',author:'새벽작가',original_language:'Korean',chapter_count:24,publication_status:'ongoing',genres_tags:'판타지, 아카데미',source_url:'https://novelpia.com/novel/401201',page_url:'https://novelpia.com/novel/401201',cover_url:null,source_tier:'plus',views_count:18420,favorites_count:971,recommendations_count:288,raw_available:false,demand_count:7,viewer_interested:false,source_rank:4,fresh_signals:['novelpia_plus_new','novelpia_new_rank'],discovered_at:'2026-08-11T18:00:00Z',updated_at:'2026-08-11T18:10:00Z'},
      {kind:'catalog',catalog_id:502,provider:'novelpia',external_id:'401202',title:'회귀한 용사는 조용히 살고 싶다',original_title:'회귀한 용사는 조용히 살고 싶다',author:'종이달',original_language:'Korean',chapter_count:11,publication_status:'ongoing',genres_tags:'판타지, 회귀',source_url:'https://novelpia.com/novel/401202',page_url:'https://novelpia.com/novel/401202',cover_url:null,source_tier:'free',views_count:5100,favorites_count:318,recommendations_count:102,raw_available:false,demand_count:2,viewer_interested:false,source_rank:null,fresh_signals:['novelpia_free_new'],discovered_at:'2026-08-11T17:00:00Z',updated_at:'2026-08-11T17:10:00Z'},
      {kind:'catalog',catalog_id:503,provider:'novelpia',external_id:'401203',title:'악녀의 집사가 되었다',original_title:'악녀의 집사가 되었다',author:'라일락',original_language:'Korean',chapter_count:38,publication_status:'ongoing',genres_tags:'로맨스, 판타지',source_url:'https://novelpia.com/novel/401203',page_url:'https://novelpia.com/novel/401203',cover_url:null,source_tier:'plus',views_count:27900,favorites_count:1402,recommendations_count:611,raw_available:false,demand_count:5,viewer_interested:true,source_rank:9,fresh_signals:['novelpia_plus_new','novelpia_new_rank'],discovered_at:'2026-08-11T16:00:00Z',updated_at:'2026-08-11T16:10:00Z'},
    ];
    const apiCalls=[];
    window.__views=views;window.__apiCalls=apiCalls;window.__renders=0;
    window.lucide={createIcons(){}};
    window.DTL_APP={
      state,viewRoot:document.getElementById('viewRoot'),bottomNav:document.getElementById('bottomNav'),escapeHtml,
      languageFlag:value=>String(value).startsWith('Korean')?'🇰🇷':String(value).startsWith('Japanese')?'🇯🇵':'🌐',
      cover:(title,small=false)=>`<div class="novel-cover${small?' small':''}">${escapeHtml(title.slice(0,2))}</div>`,
      relativeTime:()=> '10 minutes ago',
      tg:{HapticFeedback:{selectionChanged(){}}},toast(message){window.__toast=message;},
      registerView(name,renderer){views[name]=renderer;},
      navigate(view){state.view=view;window.__navigated=view;if(views[view])views[view]();document.dispatchEvent(new CustomEvent('dtl:viewchange',{detail:{view}}));},
      openNovel(id){window.__opened=id;},
      async api(path,options={}){
        apiCalls.push({path,options});
        if(path==='/api/app/discovery/feed')return{trending:[...feedRows],most_requested:[...feedRows],raw_available:feedRows.filter(row=>row.raw_available),recently_found:[...feedRows].reverse(),fresh_novelpia:fresh?[...freshRows]:[],catalog:[...feedRows],novelpia_ingest:fresh?{available:true,last_success_at:'2026-08-11T18:10:00Z',item_count:51,degraded:false}:null};
        if(path==='/api/app/discovery/opportunities')return{items:[...(fresh?freshRows.slice(0,1):[]),...feedRows].map((row,index)=>({...row,opportunity_score:92-index*8,opportunity_signals:row.kind==='catalog'?['NovelPia new #4','18420 NovelPia views']:['Dollar TL demand']}))};
        if(path.startsWith('/api/app/discovery/search'))return{provider_status:'ok',local:[],external:[{provider:'raw_fucknovelpia',external_id:'174592',title:'External Nanny',original_title:'황자의 보모',author:'Author',original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://novelpia.com/novel/174592',page_url:'https://raw-fucknovelpia.com/novel/demo',raw_available:true,genres_tags:'Fantasy, Romance'}]};
        if(path.startsWith('/api/app/discovery/catalog/search')){
          const q=new URL(`https://x.test${path}`).searchParams.get('q')||'';
          return{items:freshRows.filter(row=>[row.title,row.author,row.external_id].some(value=>String(value).includes(q)))};
        }
        if(path==='/api/app/discovery/interest'){
          const body=JSON.parse(options.body);return{submission_id:body.submission_id,demand_count:85,viewer_interested:body.interested};
        }
        if(path==='/api/app/discovery/catalog/interest'){
          const body=JSON.parse(options.body);const row=freshRows.find(item=>item.catalog_id===body.catalog_id);return{catalog_id:body.catalog_id,demand_count:Math.max(0,(row?.demand_count||0)+(body.interested?1:-1)),viewer_interested:body.interested,linked_submission_id:null};
        }
        throw new Error(`Unexpected API ${path}`);
      },
    };
    document.getElementById('bottomNav').addEventListener('click',event=>{const button=event.target.closest('[data-nav]');if(button)window.DTL_APP.navigate(button.dataset.nav);});
    document.addEventListener('dtl:viewrender',()=>window.__renders++);
  },{admin,fresh});
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

test('Fresh from NovelPia is first-class, voteable and can hand off to Suggest without creating a local request',async({page})=>{
  await boot(page,{width:390,height:820,fresh:true});
  await expect(page.locator('.discover-fresh-hero')).toBeVisible();
  await expect(page.locator('.discover-fresh-hero')).toContainText('Fresh from NovelPia');
  await expect(page.locator('[data-discover-mode="fresh_novelpia"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.discover-catalog-row')).toHaveCount(3);
  const first=page.locator('[data-catalog="501"]').filter({has:page.locator('.discover-row-actions')});
  await expect(first).toContainText('아카데미에서 마법사는 퇴근하고 싶다');
  await expect(first).toContainText('PLUS');
  await expect(first).toContainText('New rank #4');
  await expect(first).toContainText('7 readers want this');

  await first.locator('[data-catalog-interest="501"]').click();
  await expect(page.locator('[data-catalog="501"]').filter({has:page.locator('.discover-row-actions')})).toContainText('8 readers want this');
  const interestCall=await page.evaluate(()=>window.__apiCalls.find(entry=>entry.path==='/api/app/discovery/catalog/interest'));
  expect(JSON.parse(interestCall.options.body)).toEqual({catalog_id:501,interested:true});
  expect(await page.evaluate(()=>window.__apiCalls.some(entry=>entry.path==='/api/app/submit'))).toBe(false);

  await page.locator('[data-catalog-request="501"]').click();
  const handoff=await page.evaluate(()=>({navigated:window.__navigated,source:window.DTL_APP.state.discoverySource,auto:window.DTL_APP.state.discoveryAuto,draft:window.DTL_APP.state.draft}));
  expect(handoff.navigated).toBe('suggest');
  expect(handoff.source).toBeNull();
  expect(handoff.auto.catalog_id).toBe(501);
  expect(handoff.auto.provider).toBe('novelpia');
  expect(handoff.draft.title).toContain('아카데미');
  expect(handoff.draft.source_url).toBe('https://novelpia.com/novel/401201');
});

test('universal Discover search also finds the automatic NovelPia catalog',async({page})=>{
  await boot(page,{width:390,height:820,fresh:true});
  await page.locator('#discoverQuery').fill('401202');
  await page.locator('#discoverQuery').press('Enter');
  await expect(page.locator('.discover-search-source')).toContainText(['Fresh NovelPia catalog','External sources']);
  await expect(page.locator('.discover-catalog-row')).toHaveCount(1);
  await expect(page.locator('.discover-catalog-row')).toContainText('회귀한 용사는 조용히 살고 싶다');
  const catalogCall=await page.evaluate(()=>window.__apiCalls.find(entry=>entry.path.startsWith('/api/app/discovery/catalog/search')));
  expect(catalogCall.path).toContain('q=401202');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

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


test('empty Fresh mode explains NovelPia source state instead of blaming filters',async({page})=>{
  await boot(page,{width:390,height:820});
  await page.evaluate(()=>{window.DTL_APP.state.locale='ru';document.dispatchEvent(new CustomEvent('dtl:localechange'));});
  await page.locator('[data-discover-mode="fresh_novelpia"]').click();
  const empty=page.locator('.discover-list .discover-state');
  await expect(empty).toContainText('Свежее с NovelPia ещё не синхронизировано');
  await expect(empty).not.toContainText('По этим фильтрам пока ничего нет');
});

test('admin Refresh sources waits for NovelPia and requests a fresh Discover reload',async({page})=>{
  await boot(page,{width:390,height:840,admin:true});
  await page.evaluate(()=>{
    const original=window.DTL_APP.api;
    let refreshed=false;
    document.addEventListener('dtl:discover-refresh-ready',event=>{event.preventDefault();window.__discoverRefreshReady=event.detail;});
    window.DTL_APP.api=async(path,options={})=>{
      if(path==='/api/app/discovery/catalog/refresh'){
        refreshed=true;
        return{started:true,busy:false,requested_at:'2026-08-12T08:00:00.000Z'};
      }
      if(path==='/api/app/discovery/catalog/health')return{
        provider:'novelpia',
        state:refreshed
          ?{last_attempt_at:'2026-08-12T08:00:00.000Z',last_success_at:'2026-08-12T08:00:00.000Z',last_error:null,last_item_count:30,catalog_count:10,active_signal_count:8,fresh_unlinked_count:1}
          :{last_attempt_at:'2026-08-12T07:20:00.000Z',last_success_at:'2026-08-12T07:20:00.000Z',last_error:null,last_item_count:20,catalog_count:9,active_signal_count:7,fresh_unlinked_count:0},
      };
      const result=await original(path,options);
      if(path==='/api/app/discovery/feed'&&refreshed){
        result.fresh_novelpia=[{kind:'catalog',catalog_id:777,provider:'novelpia',external_id:'446837',title:'Recovered Fresh Novel',original_title:'Recovered Fresh Novel',author:'Author',original_language:'Korean',chapter_count:11,publication_status:'ongoing',genres_tags:'Fantasy',source_url:'https://novelpia.com/novel/446837',page_url:'https://novelpia.com/novel/446837',cover_url:null,source_tier:'free',views_count:0,favorites_count:0,recommendations_count:0,raw_available:false,demand_count:0,viewer_interested:false,source_rank:null,fresh_signals:['novelpia_free_new'],discovered_at:'2026-08-12T08:00:00.000Z',updated_at:'2026-08-12T08:00:00.000Z'}];
        result.novelpia_ingest={available:true,last_success_at:'2026-08-12T08:00:00.000Z',item_count:30,visible_count:1,catalog_count:10,active_signal_count:8,fresh_unlinked_count:1,degraded:false,reason:null};
      }
      return result;
    };
  });
  const button=page.locator('.discover-manual-refresh');
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.__discoverRefreshReady?.fresh_count||0),{timeout:5000}).toBe(1);
  await expect(button).toBeEnabled();
  const calls=await page.evaluate(()=>window.__apiCalls.map(entry=>entry.path));
  expect(calls.filter(path=>path==='/api/app/discovery/feed').length).toBeGreaterThanOrEqual(2);
});
