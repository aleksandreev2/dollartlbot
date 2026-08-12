(() => {
  let observer=null;
  let refreshBusy=false;
  let apiWrapped=false;
  let lastFeed=null;
  let lastHealth=null;
  const rawByCatalog=new Map();

  const REFRESH_COPY={
    en:{refresh:'Refresh sources',running:'Discovery refresh started',busy:'Source refresh is already running',failed:'Could not start source refresh',verifiedRaw:'Verified RAW'},
    ru:{refresh:'Обновить источники',running:'Обновление источников запущено',busy:'Обновление источников уже идёт',failed:'Не удалось запустить обновление источников',verifiedRaw:'Проверенный RAW'},
    es:{refresh:'Actualizar fuentes',running:'Actualización de fuentes iniciada',busy:'Las fuentes ya se están actualizando',failed:'No se pudo iniciar la actualización',verifiedRaw:'RAW verificado'},
    fil:{refresh:'I-refresh ang sources',running:'Nagsimula ang source refresh',busy:'Tumatakbo na ang source refresh',failed:'Hindi masimulan ang source refresh',verifiedRaw:'Verified RAW'},
    hi:{refresh:'स्रोत रीफ़्रेश करें',running:'स्रोत रीफ़्रेश शुरू हुआ',busy:'स्रोत रीफ़्रेश पहले से चल रहा है',failed:'स्रोत रीफ़्रेश शुरू नहीं हो सका',verifiedRaw:'सत्यापित RAW'},
    pt:{refresh:'Atualizar fontes',running:'Atualização das fontes iniciada',busy:'As fontes já estão sendo atualizadas',failed:'Não foi possível iniciar a atualização',verifiedRaw:'RAW verificado'},
    id:{refresh:'Segarkan sumber',running:'Penyegaran sumber dimulai',busy:'Penyegaran sumber sedang berjalan',failed:'Tidak dapat memulai penyegaran sumber',verifiedRaw:'RAW terverifikasi'},
    vi:{refresh:'Làm mới nguồn',running:'Đã bắt đầu làm mới nguồn',busy:'Nguồn đang được làm mới',failed:'Không thể bắt đầu làm mới nguồn',verifiedRaw:'RAW đã xác minh'},
    fr:{refresh:'Actualiser les sources',running:'Actualisation des sources lancée',busy:'Les sources sont déjà en cours d’actualisation',failed:'Impossible de lancer l’actualisation',verifiedRaw:'RAW vérifié'},
    de:{refresh:'Quellen aktualisieren',running:'Quellenaktualisierung gestartet',busy:'Quellen werden bereits aktualisiert',failed:'Quellenaktualisierung konnte nicht gestartet werden',verifiedRaw:'Verifiziertes RAW'},
  };

  const SOURCE_COPY={
    en:{freshNever:'Fresh from NovelPia has not been synced yet.',freshNeverSub:'The local Discover feed still works. An admin can run Refresh sources.',freshFailed:'NovelPia refresh failed.',freshFailedSub:'Dollar TL is showing local discovery data while the external source is unavailable.',freshMismatch:'Fresh catalog data is inconsistent.',freshMismatchSub:'NovelPia rows exist in the catalog but did not reach this feed. Refresh sources to repair it.',freshNoUnlinked:'No unlinked Fresh NovelPia titles right now.',freshNoUnlinkedSub:'NovelPia was checked successfully; current fresh titles are already linked or there is nothing new to show.',refreshReady:'Fresh NovelPia updated',refreshStillEmpty:'Source refresh finished; Fresh NovelPia is still empty',refreshWaiting:'Source refresh is still running'},
    ru:{freshNever:'Свежее с NovelPia ещё не синхронизировано.',freshNeverSub:'Локальный Discover работает. Администратор может запустить «Обновить источники».',freshFailed:'Не удалось обновить NovelPia.',freshFailedSub:'Dollar TL продолжает показывать локальные данные, пока внешний источник недоступен.',freshMismatch:'Данные свежего каталога не совпадают с лентой.',freshMismatchSub:'Свежие строки NovelPia есть в каталоге, но не попали в эту ленту. Запустите «Обновить источники».',freshNoUnlinked:'Сейчас нет новых несвязанных тайтлов NovelPia.',freshNoUnlinkedSub:'NovelPia успешно проверена; свежие тайтлы уже связаны с заявками или новых пока нет.',refreshReady:'Свежее с NovelPia обновлено',refreshStillEmpty:'Источники обновлены, но Fresh NovelPia всё ещё пуст',refreshWaiting:'Обновление источников всё ещё выполняется'},
  };

  function copy(key){
    const locale=window.DTL_APP?.state?.locale||'en';
    return SOURCE_COPY[locale]?.[key]||SOURCE_COPY.en[key]||REFRESH_COPY[locale]?.[key]||REFRESH_COPY.en[key]||key;
  }

  function patchNavIcon(){
    const holder=window.DTL_APP?.bottomNav?.querySelector('.nav-item[data-nav="discover"] .nav-icon');
    if(!holder)return;
    if(holder.dataset.discoverIcon==='compass'&&holder.querySelector('svg,[data-lucide="compass"]'))return;
    holder.dataset.discoverIcon='compass';
    holder.innerHTML='<i data-lucide="compass" aria-hidden="true"></i>';
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function rememberRawRows(payload){
    const groups=[payload?.fresh_novelpia,payload?.items];
    for(const group of groups){
      if(!Array.isArray(group))continue;
      for(const row of group){
        const id=Number(row?.catalog_id);
        if(!Number.isSafeInteger(id)||id<=0||row?.kind!=='catalog')continue;
        if(row.raw_verification_status==='verified'&&row.raw_available&&row.raw_page_url){
          rawByCatalog.set(id,{url:String(row.raw_page_url),verifiedAt:row.raw_verified_at||null});
        }else if(row.raw_verification_status&&row.raw_verification_status!=='verified'){
          rawByCatalog.delete(id);
        }
      }
    }
  }

  function patchVerifiedRawLinks(){
    if(window.DTL_APP?.state?.view!=='discover')return;
    document.querySelectorAll('[data-catalog]').forEach(card=>{
      const id=Number(card.getAttribute('data-catalog'));
      const raw=rawByCatalog.get(id);
      const existing=card.querySelector('.discover-verified-raw');
      if(!raw){existing?.remove();return;}
      const host=card.querySelector('.discover-row-meta,.discover-feature-meta');
      if(!host)return;
      let link=existing;
      if(!link){
        link=document.createElement('a');
        link.className='discover-badge raw discover-verified-raw';
        link.target='_blank';
        link.rel='noopener';
        link.style.textDecoration='none';
        host.appendChild(link);
      }
      link.href=raw.url;
      link.setAttribute('aria-label',copy('verifiedRaw'));
      link.innerHTML=`<i data-lucide="archive-check" aria-hidden="true"></i><span>${copy('verifiedRaw')}</span>`;
    });
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function wrapDiscoveryApi(){
    const app=window.DTL_APP;
    if(apiWrapped||!app?.api)return;
    const original=app.api.bind(app);
    try{
      app.api=async(...args)=>{
        const result=await original(...args);
        const path=String(args[0]||'').split('?')[0];
        if(path==='/api/app/discovery/feed'||path==='/api/app/discovery/opportunities'){
          rememberRawRows(result);
          if(path==='/api/app/discovery/feed')lastFeed=result;
          queueMicrotask(()=>{patchVerifiedRawLinks();patchFreshEmptyState();});
        }
        if(path==='/api/app/discovery/catalog/health')lastHealth=result;
        return result;
      };
      apiWrapped=true;
    }catch{}
  }

  function patchFreshEmptyState(){
    if(window.DTL_APP?.state?.view!=='discover'||!lastFeed)return;
    const freshTab=document.querySelector('[data-discover-mode="fresh_novelpia"].is-active');
    if(!freshTab)return;
    const list=document.querySelector('#discoverContent .discover-list');
    if(!list||list.querySelector('[data-catalog]'))return;
    const empty=list.querySelector('.discover-state');
    if(!empty)return;
    const info=lastFeed.novelpia_ingest||{};
    let title='freshNoUnlinked';
    let sub='freshNoUnlinkedSub';
    if(!info.available||info.reason==='never_refreshed'){title='freshNever';sub='freshNeverSub';}
    else if(info.reason==='provider_error'){title='freshFailed';sub='freshFailedSub';}
    else if(info.reason==='feed_catalog_mismatch'){title='freshMismatch';sub='freshMismatchSub';}
    empty.classList.add('discover-source-empty');
    const strong=empty.querySelector('strong');
    const detail=empty.querySelector('span');
    if(strong)strong.textContent=copy(title);
    if(detail)detail.textContent=copy(sub);
  }

  function refreshAttemptFinished(state,requestedAt){
    if(!state?.last_attempt_at)return false;
    const attempt=Date.parse(state.last_attempt_at);
    const requested=Date.parse(requestedAt||'');
    if(!Number.isFinite(attempt)||!Number.isFinite(requested)||attempt+1500<requested)return false;
    const success=state.last_success_at?Date.parse(state.last_success_at):0;
    return (Number.isFinite(success)&&success>=attempt)||Boolean(state.last_error);
  }

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function waitForRefreshCompletion(requestedAt){
    const app=window.DTL_APP;
    for(let attempt=0;attempt<20;attempt++){
      await sleep(attempt===0?500:1000);
      try{
        const health=await app.api('/api/app/discovery/catalog/health');
        lastHealth=health;
        if(refreshAttemptFinished(health?.state,requestedAt))return health;
      }catch{}
    }
    return lastHealth;
  }

  function requestDiscoverReload(feed){
    const event=new CustomEvent('dtl:discover-refresh-ready',{cancelable:true,detail:{fresh_count:Array.isArray(feed?.fresh_novelpia)?feed.fresh_novelpia.length:0}});
    document.dispatchEvent(event);
    if(!event.defaultPrevented)setTimeout(()=>window.location.reload(),80);
  }

  function patchAdminRefresh(){
    const app=window.DTL_APP;
    if(app?.state?.view!=='discover'||!app.state.bootstrap?.user?.is_admin)return;
    const heading=document.querySelector('.discover-heading');
    if(!heading)return;
    let button=heading.querySelector('.discover-manual-refresh');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='discover-action secondary discover-manual-refresh';
      button.addEventListener('click',runManualRefresh);
      const requestButton=heading.querySelector('#discoverRequest');
      if(requestButton)heading.insertBefore(button,requestButton);
      else heading.appendChild(button);
    }
    button.disabled=refreshBusy;
    button.innerHTML=`<i data-lucide="${refreshBusy?'loader-circle':'refresh-cw'}" aria-hidden="true"></i><span>${copy('refresh')}</span>`;
    button.setAttribute('aria-label',copy('refresh'));
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  async function runManualRefresh(){
    const app=window.DTL_APP;
    if(refreshBusy||!app?.api)return;
    refreshBusy=true;
    patchAdminRefresh();
    try{
      const result=await app.api('/api/app/discovery/catalog/refresh',{method:'POST'});
      app.toast?.(result?.busy?copy('busy'):copy('running'),result?.busy?'info':'success');
      const requestedAt=result?.requested_at||result?.last_attempt_at||new Date().toISOString();
      const health=await waitForRefreshCompletion(requestedAt);
      if(!refreshAttemptFinished(health?.state,requestedAt)){
        app.toast?.(copy('refreshWaiting'),'info');
        return;
      }
      const refreshedFeed=await app.api('/api/app/discovery/feed');
      lastFeed=refreshedFeed;
      patchFreshEmptyState();
      const freshCount=Array.isArray(refreshedFeed?.fresh_novelpia)?refreshedFeed.fresh_novelpia.length:0;
      if(freshCount>0){
        app.toast?.(copy('refreshReady'),'success');
        requestDiscoverReload(refreshedFeed);
      }else{
        app.toast?.(copy('refreshStillEmpty'),health?.state?.last_error?'error':'info');
      }
    }catch(error){
      app.toast?.(error?.message||copy('failed'),'error');
    }finally{
      refreshBusy=false;
      setTimeout(()=>queueMicrotask(()=>{patchAdminRefresh();patchFreshEmptyState();}),500);
    }
  }

  function attach(){
    observer?.disconnect();
    observer=null;
    const app=window.DTL_APP;
    if(app?.state?.view!=='discover')return;
    const host=document.getElementById('discoverContent');
    if(!host)return;
    observer=new MutationObserver(()=>{
      if(window.DTL_APP?.state?.view!=='discover')return;
      document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'discover',source:'discover-content'}}));
      queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});
    });
    observer.observe(host,{childList:true});
  }

  const nav=window.DTL_APP?.bottomNav;
  if(nav){
    const navObserver=new MutationObserver(()=>queueMicrotask(patchNavIcon));
    navObserver.observe(nav,{childList:true});
  }

  wrapDiscoveryApi();
  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});});
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{wrapDiscoveryApi();attach();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));
  document.addEventListener('dtl:viewrender',()=>queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));
  document.addEventListener('dtl:localechange',()=>queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();}));
  queueMicrotask(()=>{wrapDiscoveryApi();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();patchFreshEmptyState();});
})();
