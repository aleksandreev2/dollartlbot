import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=[read('public/app/app.css'),read('public/app/ui-polish.css'),read('public/app/discovery-ui.css')].join('\n');
const discovery=read('public/app/discovery-ui.js');

async function boot(page,{width=390,height=780}={}){
  await page.setViewportSize({width,height});
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><main id="root"></main></body></html>`);
  await page.evaluate(()=>{
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    const state={locale:'en',preview:false,view:'suggest',detailNovel:null,draft:{title:'',original_language:'',chapter_count:'',publication_status:'ongoing',source_url:'',genres_tags:''}};
    const calls=[];
    window.__calls=calls;
    window.lucide={createIcons(){}};
    window.DTL_APP={
      state,escapeHtml,tg:{HapticFeedback:{selectionChanged(){}}},toast(){},openNovel(id){window.__opened=id;},
      async api(path,options={}){
        calls.push({path,options});
        if(path.startsWith('/api/app/discovery/search'))return{
          query:'academy',provider_status:'ok',
          local:[{kind:'local',id:7,title:'Academy Translator',request_status:'accepted',queue_status:'queued',demand_count:12,viewer_interested:false,own_request:false,raw_available:true}],
          external:[{provider:'raw_fucknovelpia',external_id:'174592',title:'The Prince Nanny',original_title:'황자의 보모',author:'Author',original_language:'Korean',chapter_count:360,publication_status:'ongoing',source_url:'https://novelpia.com/novel/174592',page_url:'https://raw-fucknovelpia.com/novel/raw-demo',raw_available:true,genres_tags:'Fantasy, Academy'}],
        };
        if(path==='/api/app/discovery/interest')return{submission_id:7,demand_count:13,viewer_interested:true,own_request:false,sources:[]};
        if(path.startsWith('/api/app/discovery/submission/'))return{submission_id:7,demand_count:13,viewer_interested:true,own_request:false,sources:[{provider:'raw_fucknovelpia',page_url:'https://raw-fucknovelpia.com/novel/raw-demo',raw_available:true}]};
        if(path==='/api/app/discovery/source')return{ok:true};
        throw new Error(`Unexpected API ${path}`);
      },
    };
  });
  await page.addScriptTag({content:discovery});
}

for(const viewport of [{name:'mobile',width:360,height:780},{name:'desktop',width:1200,height:850}]){
  test(`finder searches, shows demand and imports metadata on ${viewport.name}`,async({page})=>{
    await boot(page,viewport);
    await page.evaluate(()=>{
      const root=document.getElementById('root');
      const render=()=>{root.innerHTML=window.DTL_DISCOVERY.renderFinder();window.DTL_DISCOVERY.bindFinder();};
      document.addEventListener('dtl:discoveryselected',render);
      render();
    });
    await page.locator('#discoveryQuery').fill('academy');
    await page.locator('#discoverySearch').click();
    await expect(page.locator('.discovery-result')).toHaveCount(2);
    await expect(page.locator('.discovery-result').first()).toContainText('12 readers want this');
    await expect(page.locator('.discovery-chip.raw')).toHaveCount(2);

    await page.locator('[data-discovery-interest="7"]').click();
    await expect(page.locator('.discovery-result').first()).toContainText('13 readers want this');
    await expect(page.locator('[data-discovery-interest="7"]')).toContainText('Wanted');

    await page.locator('[data-discovery-use="0"]').click();
    await expect(page.locator('.discovery-selected')).toContainText('The Prince Nanny');
    const imported=await page.evaluate(()=>({draft:window.DTL_APP.state.draft,source:window.DTL_APP.state.discoverySource,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
    expect(imported.draft.title).toBe('The Prince Nanny');
    expect(imported.draft.original_language).toBe('Korean');
    expect(imported.draft.chapter_count).toBe('360');
    expect(imported.draft.source_url).toBe('https://novelpia.com/novel/174592');
    expect(imported.draft.genres_tags).toBe('Fantasy, Academy');
    expect(imported.source.external_id).toBe('174592');
    expect(imported.overflow).toBeLessThanOrEqual(1);
  });
}

test('detail demand and RAW source are visible and source persistence uses the canonical API',async({page})=>{
  await boot(page,{width:390,height:780});
  await page.evaluate(()=>{
    window.DTL_APP.state.view='detail';
    window.DTL_APP.state.detailNovel={id:7};
    document.getElementById('root').innerHTML='<section class="live-detail"><div class="live-detail-requester">Requested by @reader</div></section>';
  });
  await page.evaluate(()=>window.DTL_DISCOVERY.mountDetail());
  await expect(page.locator('.live-detail-demand')).toContainText('13 readers want this');
  await expect(page.locator('.live-detail-raw-source')).toContainText('RAW available');
  await expect(page.locator('.live-detail-interest')).toContainText('Wanted');

  await page.evaluate(()=>{window.DTL_APP.state.discoverySource={provider:'raw_fucknovelpia',external_id:'174592',title:'The Prince Nanny',original_title:'황자의 보모',author:'Author',page_url:'https://raw-fucknovelpia.com/novel/raw-demo',source_url:'https://novelpia.com/novel/174592',raw_available:true};});
  const ok=await page.evaluate(()=>window.DTL_DISCOVERY.persistSelectedSource(99));
  expect(ok).toBe(true);
  const sourceCall=await page.evaluate(()=>window.__calls.find(call=>call.path==='/api/app/discovery/source'));
  expect(sourceCall).toBeTruthy();
  expect(JSON.parse(sourceCall.options.body).submission_id).toBe(99);
  expect(JSON.parse(sourceCall.options.body).external_id).toBe('174592');
});
