import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function write(path,value){fs.writeFileSync(path,value);}
function replace(path,before,after,label){
  const source=read(path);
  if(!source.includes(before))throw new Error(`${label}: target not found in ${path}`);
  write(path,source.replace(before,after));
}

// 1) Never mix image asset IDs into NovelPia novel identities.
replace(
  'src/novelpia-discovery.ts',
  `        const ids = extractNovelIds(html, source.maxIds);\n        ids.forEach((externalId, index) => {`,
  `        const ids = extractNovelIds(html, source.maxIds);\n        if (!ids.length) throw new Error('novelpia_source_no_explicit_ids');\n        ids.forEach((externalId, index) => {`,
  'explicit source identity guard',
);

replace(
  'src/novelpia-discovery.ts',
  `export async function getNovelpiaIngestState(env: Env) {\n  return env.DB.prepare(\`\n    SELECT provider, last_attempt_at, last_success_at, last_error, last_item_count, updated_at\n    FROM discovery_ingest_state WHERE provider = ?\n  \`).bind(INGEST_PROVIDER).first<{\n    provider: string;\n    last_attempt_at: string | null;\n    last_success_at: string | null;\n    last_error: string | null;\n    last_item_count: number;\n    updated_at: string;\n  }>();\n}`,
  `export async function getNovelpiaIngestState(env: Env) {\n  const [state, stats] = await Promise.all([\n    env.DB.prepare(\`\n      SELECT provider, last_attempt_at, last_success_at, last_error, last_item_count, updated_at\n      FROM discovery_ingest_state WHERE provider = ?\n    \`).bind(INGEST_PROVIDER).first<{\n      provider: string;\n      last_attempt_at: string | null;\n      last_success_at: string | null;\n      last_error: string | null;\n      last_item_count: number;\n      updated_at: string;\n    }>(),\n    env.DB.prepare(\`\n      SELECT\n        (SELECT COUNT(*) FROM discovery_catalog WHERE provider='novelpia') AS catalog_count,\n        (SELECT COUNT(DISTINCT s.catalog_id)\n          FROM discovery_catalog_signals s\n          JOIN discovery_catalog c ON c.id=s.catalog_id\n          WHERE c.provider='novelpia' AND s.last_seen_at >= datetime('now','-16 days')) AS active_signal_count,\n        (SELECT COUNT(DISTINCT s2.catalog_id)\n          FROM discovery_catalog_signals s2\n          JOIN discovery_catalog c2 ON c2.id=s2.catalog_id\n          WHERE c2.provider='novelpia' AND c2.linked_submission_id IS NULL\n            AND s2.last_seen_at >= datetime('now','-16 days')) AS fresh_unlinked_count\n    \`).first<{ catalog_count: number; active_signal_count: number; fresh_unlinked_count: number }>(),\n  ]);\n  if (!state) return null;\n  return {\n    ...state,\n    catalog_count: Number(stats?.catalog_count ?? 0),\n    active_signal_count: Number(stats?.active_signal_count ?? 0),\n    fresh_unlinked_count: Number(stats?.fresh_unlinked_count ?? 0),\n  };\n}`,
  'NovelPia ingest health counters',
);

replace(
  'src/novelpia-discovery.ts',
  `function extractNovelIds(html: string, limit: number): string[] {\n  const positions = new Map<string, number>();\n  const patterns = [\n    /(?:https?:\\/\\/(?:www\\.)?novelpia\\.com)?\\/novel\\/(\\d{2,9})/gi,\n    /(?:novel_no|novelNo)[\"']?\\s*[:=]\\s*[\"']?(\\d{2,9})/gi,\n    /_(\\d{2,9})_(?:ori|thumb|cover)\\b/gi,\n  ];\n  for (const pattern of patterns) {\n    let match: RegExpExecArray | null;\n    while ((match = pattern.exec(html))) {\n      const id = match[1];\n      const prior = positions.get(id);\n      if (prior == null || match.index < prior) positions.set(id, match.index);\n      if (positions.size >= limit * 4) break;\n    }\n  }\n  return [...positions.entries()]\n    .sort((a, b) => a[1] - b[1])\n    .map(([id]) => id)\n    .slice(0, limit);\n}`,
  `function extractNovelIds(html: string, limit: number): string[] {\n  // Only identities explicitly attached to NovelPia novel navigation are trustworthy.\n  // Asset filenames such as _523808_ori.jpg are image IDs and can accidentally resolve\n  // to completely unrelated old novels, so failing closed is safer than ingesting them.\n  const positions = new Map<string, number>();\n  const explicitPatterns = [\n    /(?:https?:\\/\\/(?:www\\.)?novelpia\\.com)?\\/novel\\/(\\d{2,9})/gi,\n    /(?:novel_no|novelNo)[\"']?\\s*[:=]\\s*[\"']?(\\d{2,9})/gi,\n  ];\n  for (const pattern of explicitPatterns) {\n    let match: RegExpExecArray | null;\n    while ((match = pattern.exec(html))) {\n      const id = match[1];\n      const prior = positions.get(id);\n      if (prior == null || match.index < prior) positions.set(id, match.index);\n      if (positions.size >= limit * 4) break;\n    }\n  }\n  return [...positions.entries()]\n    .sort((a, b) => a[1] - b[1])\n    .map(([id]) => id)\n    .slice(0, limit);\n}`,
  'strong-only NovelPia candidate extractor',
);

// 2) Feed carries enough state to distinguish a provider failure from a legitimately empty Fresh list.
replace(
  'src/discovery-feed.ts',
  `        novelpia_ingest: ingestPresentation(ingestState),\n        raw_ingest: ingestPresentation(rawIngestState),`,
  `        novelpia_ingest: ingestPresentation(ingestState, freshWithRaw.length, 'novelpia'),\n        raw_ingest: ingestPresentation(rawIngestState),`,
  'opportunity ingest presentation',
);
replace(
  'src/discovery-feed.ts',
  `      novelpia_ingest: ingestPresentation(ingestState),\n      raw_ingest: ingestPresentation(rawIngestState),`,
  `      novelpia_ingest: ingestPresentation(ingestState, freshWithRaw.length, 'novelpia'),\n      raw_ingest: ingestPresentation(rawIngestState),`,
  'feed ingest presentation',
);
replace(
  'src/discovery-feed.ts',
  `function ingestPresentation(state: {\n  last_success_at: string | null;\n  last_error: string | null;\n  last_item_count: number;\n} | null) {\n  if (!state) return { available: false, last_success_at: null, item_count: 0, degraded: false };\n  return {\n    available: true,\n    last_success_at: state.last_success_at,\n    item_count: Number(state.last_item_count ?? 0),\n    degraded: Boolean(state.last_error),\n  };\n}`,
  `function ingestPresentation(state: {\n  last_success_at: string | null;\n  last_error: string | null;\n  last_item_count: number;\n  catalog_count?: number;\n  active_signal_count?: number;\n  fresh_unlinked_count?: number;\n} | null, visibleCount?: number, provider: 'novelpia' | 'generic' = 'generic') {\n  if (!state) return {\n    available: false,\n    last_success_at: null,\n    item_count: 0,\n    visible_count: visibleCount ?? null,\n    degraded: provider === 'novelpia',\n    reason: provider === 'novelpia' ? 'never_refreshed' : null,\n  };\n  const visible = visibleCount == null ? null : Number(visibleCount);\n  const unlinked = Number(state.fresh_unlinked_count ?? 0);\n  const mismatch = provider === 'novelpia' && visible === 0 && unlinked > 0;\n  const noUnlinked = provider === 'novelpia'\n    && visible === 0\n    && unlinked === 0\n    && Number(state.last_item_count ?? 0) > 0;\n  const reason = state.last_error\n    ? 'provider_error'\n    : mismatch\n      ? 'feed_catalog_mismatch'\n      : noUnlinked\n        ? 'no_unlinked_fresh'\n        : null;\n  return {\n    available: true,\n    last_success_at: state.last_success_at,\n    item_count: Number(state.last_item_count ?? 0),\n    visible_count: visible,\n    catalog_count: Number(state.catalog_count ?? 0),\n    active_signal_count: Number(state.active_signal_count ?? 0),\n    fresh_unlinked_count: unlinked,\n    degraded: Boolean(state.last_error) || mismatch,\n    reason,\n  };\n}`,
  'diagnostic ingest presentation',
);

// 3) Admin refresh waits for NovelPia, rechecks the feed, and the empty state explains the source condition.
replace(
  'public/app/discover-page-runtime.js',
  `  let apiWrapped=false;\n  const rawByCatalog=new Map();`,
  `  let apiWrapped=false;\n  let lastFeed=null;\n  let lastHealth=null;\n  const rawByCatalog=new Map();`,
  'runtime source state',
);
replace(
  'public/app/discover-page-runtime.js',
  `  function copy(key){\n    const locale=window.DTL_APP?.state?.locale||'en';\n    return REFRESH_COPY[locale]?.[key]||REFRESH_COPY.en[key]||key;\n  }`,
  `  const SOURCE_COPY={\n    en:{freshNever:'Fresh from NovelPia has not been synced yet.',freshNeverSub:'The local Discover feed still works. An admin can run Refresh sources.',freshFailed:'NovelPia refresh failed.',freshFailedSub:'Dollar TL is showing local discovery data while the external source is unavailable.',freshMismatch:'Fresh catalog data is inconsistent.',freshMismatchSub:'NovelPia rows exist in the catalog but did not reach this feed. Refresh sources to repair it.',freshNoUnlinked:'No unlinked Fresh NovelPia titles right now.',freshNoUnlinkedSub:'NovelPia was checked successfully; current fresh titles are already linked or there is nothing new to show.',refreshReady:'Fresh NovelPia updated',refreshStillEmpty:'Source refresh finished; Fresh NovelPia is still empty',refreshWaiting:'Source refresh is still running'},\n    ru:{freshNever:'Свежее с NovelPia ещё не синхронизировано.',freshNeverSub:'Локальный Discover работает. Администратор может запустить «Обновить источники».',freshFailed:'Не удалось обновить NovelPia.',freshFailedSub:'Dollar TL продолжает показывать локальные данные, пока внешний источник недоступен.',freshMismatch:'Данные свежего каталога не совпадают с лентой.',freshMismatchSub:'Свежие строки NovelPia есть в каталоге, но не попали в эту ленту. Запустите «Обновить источники».',freshNoUnlinked:'Сейчас нет новых несвязанных тайтлов NovelPia.',freshNoUnlinkedSub:'NovelPia успешно проверена; свежие тайтлы уже связаны с заявками или новых пока нет.',refreshReady:'Свежее с NovelPia обновлено',refreshStillEmpty:'Источники обновлены, но Fresh NovelPia всё ещё пуст',refreshWaiting:'Обновление источников всё ещё выполняется'},\n  };\n\n  function copy(key){\n    const locale=window.DTL_APP?.state?.locale||'en';\n    return SOURCE_COPY[locale]?.[key]||SOURCE_COPY.en[key]||REFRESH_COPY[locale]?.[key]||REFRESH_COPY.en[key]||key;\n  }`,
  'runtime source copy',
);
replace(
  'public/app/discover-page-runtime.js',
  `        if(path==='/api/app/discovery/feed'||path==='/api/app/discovery/opportunities'){\n          rememberRawRows(result);\n          queueMicrotask(patchVerifiedRawLinks);\n        }`,
  `        if(path==='/api/app/discovery/feed'||path==='/api/app/discovery/opportunities'){\n          rememberRawRows(result);\n          if(path==='/api/app/discovery/feed')lastFeed=result;\n          queueMicrotask(()=>{patchVerifiedRawLinks();patchFreshEmptyState();});\n        }\n        if(path==='/api/app/discovery/catalog/health')lastHealth=result;`,
  'runtime API source memory',
);
replace(
  'public/app/discover-page-runtime.js',
  `  function patchAdminRefresh(){`,
  `  function patchFreshEmptyState(){\n    if(window.DTL_APP?.state?.view!=='discover'||!lastFeed)return;\n    const freshTab=document.querySelector('[data-discover-mode="fresh_novelpia"].is-active');\n    if(!freshTab)return;\n    const list=document.querySelector('#discoverContent .discover-list');\n    if(!list||list.querySelector('[data-catalog]'))return;\n    const empty=list.querySelector('.discover-state');\n    if(!empty)return;\n    const info=lastFeed.novelpia_ingest||{};\n    let title='freshNoUnlinked';\n    let sub='freshNoUnlinkedSub';\n    if(!info.available||info.reason==='never_refreshed'){title='freshNever';sub='freshNeverSub';}\n    else if(info.reason==='provider_error'){title='freshFailed';sub='freshFailedSub';}\n    else if(info.reason==='feed_catalog_mismatch'){title='freshMismatch';sub='freshMismatchSub';}\n    empty.classList.add('discover-source-empty');\n    const strong=empty.querySelector('strong');\n    const detail=empty.querySelector('span');\n    if(strong)strong.textContent=copy(title);\n    if(detail)detail.textContent=copy(sub);\n  }\n\n  function refreshAttemptFinished(state,requestedAt){\n    if(!state?.last_attempt_at)return false;\n    const attempt=Date.parse(state.last_attempt_at);\n    const requested=Date.parse(requestedAt||'');\n    if(!Number.isFinite(attempt)||!Number.isFinite(requested)||attempt+1500<requested)return false;\n    const success=state.last_success_at?Date.parse(state.last_success_at):0;\n    return (Number.isFinite(success)&&success>=attempt)||Boolean(state.last_error);\n  }\n\n  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));\n\n  async function waitForRefreshCompletion(requestedAt){\n    const app=window.DTL_APP;\n    for(let attempt=0;attempt<20;attempt++){\n      await sleep(attempt===0?500:1000);\n      try{\n        const health=await app.api('/api/app/discovery/catalog/health');\n        lastHealth=health;\n        if(refreshAttemptFinished(health?.state,requestedAt))return health;\n      }catch{}\n    }\n    return lastHealth;\n  }\n\n  function requestDiscoverReload(feed){\n    const event=new CustomEvent('dtl:discover-refresh-ready',{cancelable:true,detail:{fresh_count:Array.isArray(feed?.fresh_novelpia)?feed.fresh_novelpia.length:0}});\n    document.dispatchEvent(event);\n    if(!event.defaultPrevented)setTimeout(()=>window.location.reload(),80);\n  }\n\n  function patchAdminRefresh(){`,
  'source-aware empty state and refresh polling',
);
replace(
  'public/app/discover-page-runtime.js',
  `  async function runManualRefresh(){\n    const app=window.DTL_APP;\n    if(refreshBusy||!app?.api)return;\n    refreshBusy=true;\n    patchAdminRefresh();\n    try{\n      const result=await app.api('/api/app/discovery/catalog/refresh',{method:'POST'});\n      app.toast?.(result?.busy?copy('busy'):copy('running'),result?.busy?'info':'success');\n    }catch(error){\n      app.toast?.(error?.message||copy('failed'),'error');\n    }finally{\n      refreshBusy=false;\n      setTimeout(()=>queueMicrotask(patchAdminRefresh),500);\n    }\n  }`,
  `  async function runManualRefresh(){\n    const app=window.DTL_APP;\n    if(refreshBusy||!app?.api)return;\n    refreshBusy=true;\n    patchAdminRefresh();\n    try{\n      const result=await app.api('/api/app/discovery/catalog/refresh',{method:'POST'});\n      app.toast?.(result?.busy?copy('busy'):copy('running'),result?.busy?'info':'success');\n      const requestedAt=result?.requested_at||result?.last_attempt_at||new Date().toISOString();\n      const health=await waitForRefreshCompletion(requestedAt);\n      if(!refreshAttemptFinished(health?.state,requestedAt)){\n        app.toast?.(copy('refreshWaiting'),'info');\n        return;\n      }\n      const refreshedFeed=await app.api('/api/app/discovery/feed');\n      lastFeed=refreshedFeed;\n      patchFreshEmptyState();\n      const freshCount=Array.isArray(refreshedFeed?.fresh_novelpia)?refreshedFeed.fresh_novelpia.length:0;\n      if(freshCount>0){\n        app.toast?.(copy('refreshReady'),'success');\n        requestDiscoverReload(refreshedFeed);\n      }else{\n        app.toast?.(copy('refreshStillEmpty'),health?.state?.last_error?'error':'info');\n      }\n    }catch(error){\n      app.toast?.(error?.message||copy('failed'),'error');\n    }finally{\n      refreshBusy=false;\n      setTimeout(()=>queueMicrotask(()=>{patchAdminRefresh();patchFreshEmptyState();}),500);\n    }\n  }`,
  'manual source refresh lifecycle',
);
replace(
  'public/app/discover-page-runtime.js',
  `      queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();});`,
  `      queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});`,
  'mutation source patch',
);
replace(
  'public/app/discover-page-runtime.js',
  `  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();});});\n  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{wrapDiscoveryApi();attach();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();}));\n  document.addEventListener('dtl:viewrender',()=>queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();}));\n  document.addEventListener('dtl:localechange',()=>queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();}));\n  queueMicrotask(()=>{wrapDiscoveryApi();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();});`,
  `  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});});\n  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{wrapDiscoveryApi();attach();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));\n  document.addEventListener('dtl:viewrender',()=>queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));\n  document.addEventListener('dtl:localechange',()=>queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));\n  queueMicrotask(()=>{wrapDiscoveryApi();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});`,
  'source patch lifecycle',
);

// 4) Cache bust runtime only; the base Discover view itself is unchanged.
replace(
  'public/app/index.html',
  `/app/discover-page-runtime.js?v=20260811-discover3`,
  `/app/discover-page-runtime.js?v=20260812-discover4`,
  'Discover runtime cache bust',
);

// 5) Lock the regression in the existing discovery audit.
replace(
  'scripts/audit-discovery-foundation.mjs',
  `  'runNovelpiaDiscoveryIngestion',\n  'discovery_catalog_interests',`,
  `  'runNovelpiaDiscoveryIngestion',\n  'novelpia_source_no_explicit_ids',\n  'fresh_unlinked_count',\n  'active_signal_count',\n  'discovery_catalog_interests',`,
  'NovelPia health audit tokens',
);
replace(
  'scripts/audit-discovery-foundation.mjs',
  `])requireText(novelpia,token,'safe NovelPia ingestion pipeline');\n\nfor(const token of [`,
  `])requireText(novelpia,token,'safe NovelPia ingestion pipeline');\nconst extractorBlock=novelpia.slice(novelpia.indexOf('function extractNovelIds'),novelpia.indexOf('function minSignalRank'));\nif(/ori\\|thumb\\|cover|_\\(\\\\d/.test(extractorBlock)){\n  throw new Error('Discovery audit failed: NovelPia candidate extraction must never use cover/image asset IDs');\n}\nfor(const token of ['explicitPatterns','/novel\\\\/(\\\\d{2,9})','novel_no|novelNo'])requireText(extractorBlock,token,'explicit NovelPia identity extraction');\n\nfor(const token of [`,
  'extractor fail-closed audit',
);
replace(
  'scripts/audit-discovery-foundation.mjs',
  `requireText(feed,'loadRawCatalogSourceMap','verified RAW source overlay');`,
  `requireText(feed,'loadRawCatalogSourceMap','verified RAW source overlay');\nrequireText(feed,"'feed_catalog_mismatch'",'Fresh catalog/feed mismatch diagnostics');\nrequireText(feed,"'no_unlinked_fresh'",'legitimate empty Fresh diagnostics');\nrequireText(feed,"'never_refreshed'",'never-refreshed Fresh diagnostics');`,
  'feed diagnostics audit',
);
replace(
  'scripts/audit-discovery-foundation.mjs',
  `  'archive-check',\n])requireText(discoverRuntime,token,'verified RAW Discover runtime');`,
  `  'archive-check',\n  'patchFreshEmptyState',\n  'waitForRefreshCompletion',\n  "'/api/app/discovery/catalog/health'",\n  "'dtl:discover-refresh-ready'",\n])requireText(discoverRuntime,token,'verified RAW Discover runtime');`,
  'runtime diagnostics audit',
);
replace(
  'scripts/audit-discovery-foundation.mjs',
  `requireText(html,'/app/discover-page-runtime.js?v=20260811-discover3','RAW Discover runtime cache bust');`,
  `requireText(html,'/app/discover-page-runtime.js?v=20260812-discover4','Discover source recovery runtime cache bust');`,
  'runtime cache audit',
);

// 6) Browser regressions: source-specific empty state + refresh/poll/reload handoff.
fs.appendFileSync('tests/discover-page.spec.mjs', String.raw`

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
`);

// Temporary live probes and this one-shot branch mutator must not enter the PR.
for(const path of [
  'scripts/probe-novelpia-live.mjs',
  '.github/workflows/novelpia-live-probe.yml',
  'scripts/apply-discover-fix.mjs',
  '.github/workflows/apply-discover-fix.yml',
]){
  try{fs.unlinkSync(path);}catch(error){if(error?.code!=='ENOENT')throw error;}
}

console.log('Discover Fresh production fix applied.');
