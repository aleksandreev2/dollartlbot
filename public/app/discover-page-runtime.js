(() => {
  let observer=null;
  let refreshBusy=false;
  let apiWrapped=false;
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

  function copy(key){
    const locale=window.DTL_APP?.state?.locale||'en';
    return REFRESH_COPY[locale]?.[key]||REFRESH_COPY.en[key]||key;
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
          queueMicrotask(patchVerifiedRawLinks);
        }
        return result;
      };
      apiWrapped=true;
    }catch{}
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
    }catch(error){
      app.toast?.(error?.message||copy('failed'),'error');
    }finally{
      refreshBusy=false;
      setTimeout(()=>queueMicrotask(patchAdminRefresh),500);
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
      queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();});
    });
    observer.observe(host,{childList:true});
  }

  const nav=window.DTL_APP?.bottomNav;
  if(nav){
    const navObserver=new MutationObserver(()=>queueMicrotask(patchNavIcon));
    navObserver.observe(nav,{childList:true});
  }

  wrapDiscoveryApi();
  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();});});
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{wrapDiscoveryApi();attach();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();}));
  document.addEventListener('dtl:viewrender',()=>queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();}));
  document.addEventListener('dtl:localechange',()=>queueMicrotask(()=>{patchAdminRefresh();patchVerifiedRawLinks();}));
  queueMicrotask(()=>{wrapDiscoveryApi();patchNavIcon();patchAdminRefresh();patchVerifiedRawLinks();});
})();
