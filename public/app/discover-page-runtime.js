(() => {
  let observer=null;
  let refreshBusy=false;

  const REFRESH_COPY={
    en:{refresh:'Refresh NovelPia',running:'Refresh started',busy:'NovelPia refresh is already running',failed:'Could not start NovelPia refresh'},
    ru:{refresh:'Обновить NovelPia',running:'Обновление NovelPia запущено',busy:'Обновление NovelPia уже идёт',failed:'Не удалось запустить обновление NovelPia'},
    es:{refresh:'Actualizar NovelPia',running:'Actualización de NovelPia iniciada',busy:'NovelPia ya se está actualizando',failed:'No se pudo iniciar la actualización de NovelPia'},
    fil:{refresh:'I-refresh ang NovelPia',running:'Nagsimula ang NovelPia refresh',busy:'Tumatakbo na ang NovelPia refresh',failed:'Hindi masimulan ang NovelPia refresh'},
    hi:{refresh:'NovelPia रीफ़्रेश करें',running:'NovelPia रीफ़्रेश शुरू हुआ',busy:'NovelPia रीफ़्रेश पहले से चल रहा है',failed:'NovelPia रीफ़्रेश शुरू नहीं हो सका'},
    pt:{refresh:'Atualizar NovelPia',running:'Atualização do NovelPia iniciada',busy:'O NovelPia já está sendo atualizado',failed:'Não foi possível iniciar a atualização do NovelPia'},
    id:{refresh:'Segarkan NovelPia',running:'Penyegaran NovelPia dimulai',busy:'Penyegaran NovelPia sedang berjalan',failed:'Tidak dapat memulai penyegaran NovelPia'},
    vi:{refresh:'Làm mới NovelPia',running:'Đã bắt đầu làm mới NovelPia',busy:'NovelPia đang được làm mới',failed:'Không thể bắt đầu làm mới NovelPia'},
    fr:{refresh:'Actualiser NovelPia',running:'Actualisation de NovelPia lancée',busy:'NovelPia est déjà en cours d’actualisation',failed:'Impossible de lancer l’actualisation de NovelPia'},
    de:{refresh:'NovelPia aktualisieren',running:'NovelPia-Aktualisierung gestartet',busy:'NovelPia wird bereits aktualisiert',failed:'NovelPia-Aktualisierung konnte nicht gestartet werden'},
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
      queueMicrotask(patchAdminRefresh);
    });
    observer.observe(host,{childList:true});
  }

  const nav=window.DTL_APP?.bottomNav;
  if(nav){
    const navObserver=new MutationObserver(()=>queueMicrotask(patchNavIcon));
    navObserver.observe(nav,{childList:true});
  }

  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();});});
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{attach();patchNavIcon();patchAdminRefresh();}));
  document.addEventListener('dtl:viewrender',()=>queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();}));
  document.addEventListener('dtl:localechange',()=>queueMicrotask(patchAdminRefresh));
  queueMicrotask(()=>{patchNavIcon();patchAdminRefresh();});
})();
