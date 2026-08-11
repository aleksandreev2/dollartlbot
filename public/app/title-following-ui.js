(() => {
  const app=window.DTL_APP;
  if(!app?.api)return;
  const {state,escapeHtml}=app;
  let apiWrapped=false;
  let loadPromise=null;
  let cachePayload=null;
  let loadedAt=0;
  let followedSubmissions=new Map();
  let followedCatalogs=new Map();
  let observer=null;
  let mountQueued=false;

  const COPY={
    en:{following:'Following',followingSub:'Titles you follow and their translation updates',follow:'Follow updates',followingNow:'Following',unfollow:'Unfollow',empty:'You are not following any titles yet.',emptySub:'Follow a title in Discover to get translation status and progress updates.',open:'Open title',source:'Open source',loading:'Loading followed titles…',failed:'Could not load followed titles.',saved:'Following updates enabled',removed:'Following updates disabled',queue:'Queue',queued:'In queue',completed:'Completed',review:'Under review'},
    ru:{following:'Подписки',followingSub:'Тайтлы, за которыми вы следите, и обновления перевода',follow:'Следить за обновлениями',followingNow:'Вы подписаны',unfollow:'Отписаться',empty:'У вас пока нет подписок на тайтлы.',emptySub:'Подпишитесь на тайтл в Discover, чтобы получать изменения статуса и прогресса.',open:'Открыть тайтл',source:'Открыть источник',loading:'Загружаем подписки…',failed:'Не удалось загрузить подписки.',saved:'Уведомления по тайтлу включены',removed:'Уведомления по тайтлу выключены',queue:'Очередь',queued:'В очереди',completed:'Завершено',review:'На проверке'},
    es:{following:'Seguidos',followingSub:'Títulos que sigues y sus novedades de traducción',follow:'Seguir novedades',followingNow:'Siguiendo',unfollow:'Dejar de seguir',empty:'Aún no sigues ningún título.',emptySub:'Sigue un título en Discover para recibir cambios de estado y progreso.',open:'Abrir título',source:'Abrir fuente',loading:'Cargando títulos seguidos…',failed:'No se pudieron cargar los títulos seguidos.',saved:'Seguimiento activado',removed:'Seguimiento desactivado',queue:'Cola',queued:'En cola',completed:'Completado',review:'En revisión'},
    fil:{following:'Sinusundan',followingSub:'Mga title na sinusundan mo at translation updates',follow:'Sundan ang updates',followingNow:'Sinusundan',unfollow:'Huwag sundan',empty:'Wala ka pang sinusundang title.',emptySub:'Sundan ang title sa Discover para sa status at progress updates.',open:'Buksan ang title',source:'Buksan ang source',loading:'Nilo-load ang sinusundang titles…',failed:'Hindi ma-load ang sinusundang titles.',saved:'Naka-on ang title updates',removed:'Naka-off ang title updates',queue:'Pila',queued:'Nasa pila',completed:'Kumpleto',review:'Sinusuri'},
    hi:{following:'फ़ॉलो किए गए',followingSub:'आपके फ़ॉलो किए शीर्षक और उनके अनुवाद अपडेट',follow:'अपडेट फ़ॉलो करें',followingNow:'फ़ॉलो कर रहे हैं',unfollow:'अनफ़ॉलो',empty:'आप अभी किसी शीर्षक को फ़ॉलो नहीं कर रहे हैं।',emptySub:'स्थिति और प्रगति अपडेट पाने के लिए Discover में किसी शीर्षक को फ़ॉलो करें।',open:'शीर्षक खोलें',source:'स्रोत खोलें',loading:'फ़ॉलो किए शीर्षक लोड हो रहे हैं…',failed:'फ़ॉलो किए शीर्षक लोड नहीं हो सके।',saved:'शीर्षक अपडेट चालू हैं',removed:'शीर्षक अपडेट बंद हैं',queue:'कतार',queued:'कतार में',completed:'पूर्ण',review:'समीक्षा में'},
    pt:{following:'Seguindo',followingSub:'Títulos seguidos e suas atualizações de tradução',follow:'Seguir atualizações',followingNow:'Seguindo',unfollow:'Deixar de seguir',empty:'Você ainda não segue nenhum título.',emptySub:'Siga um título no Discover para receber status e progresso.',open:'Abrir título',source:'Abrir fonte',loading:'Carregando títulos seguidos…',failed:'Não foi possível carregar os títulos seguidos.',saved:'Atualizações ativadas',removed:'Atualizações desativadas',queue:'Fila',queued:'Na fila',completed:'Concluído',review:'Em análise'},
    id:{following:'Diikuti',followingSub:'Judul yang kamu ikuti dan pembaruan terjemahannya',follow:'Ikuti pembaruan',followingNow:'Mengikuti',unfollow:'Berhenti mengikuti',empty:'Kamu belum mengikuti judul apa pun.',emptySub:'Ikuti judul di Discover untuk menerima status dan progres.',open:'Buka judul',source:'Buka sumber',loading:'Memuat judul yang diikuti…',failed:'Tidak dapat memuat judul yang diikuti.',saved:'Pembaruan judul diaktifkan',removed:'Pembaruan judul dinonaktifkan',queue:'Antrean',queued:'Dalam antrean',completed:'Selesai',review:'Ditinjau'},
    vi:{following:'Đang theo dõi',followingSub:'Tác phẩm bạn theo dõi và cập nhật bản dịch',follow:'Theo dõi cập nhật',followingNow:'Đang theo dõi',unfollow:'Bỏ theo dõi',empty:'Bạn chưa theo dõi tác phẩm nào.',emptySub:'Theo dõi tác phẩm trong Discover để nhận trạng thái và tiến độ.',open:'Mở tác phẩm',source:'Mở nguồn',loading:'Đang tải tác phẩm theo dõi…',failed:'Không thể tải danh sách theo dõi.',saved:'Đã bật cập nhật tác phẩm',removed:'Đã tắt cập nhật tác phẩm',queue:'Hàng đợi',queued:'Trong hàng đợi',completed:'Hoàn tất',review:'Đang duyệt'},
    fr:{following:'Suivis',followingSub:'Titres suivis et mises à jour de traduction',follow:'Suivre les mises à jour',followingNow:'Suivi',unfollow:'Ne plus suivre',empty:'Vous ne suivez encore aucun titre.',emptySub:'Suivez un titre dans Discover pour recevoir le statut et la progression.',open:'Ouvrir le titre',source:'Ouvrir la source',loading:'Chargement des titres suivis…',failed:'Impossible de charger les titres suivis.',saved:'Suivi activé',removed:'Suivi désactivé',queue:'File',queued:'Dans la file',completed:'Terminé',review:'En révision'},
    de:{following:'Gefolgt',followingSub:'Gefolgte Titel und Übersetzungsupdates',follow:'Updates folgen',followingNow:'Gefolgt',unfollow:'Nicht mehr folgen',empty:'Du folgst noch keinen Titeln.',emptySub:'Folge einem Titel in Discover, um Status- und Fortschrittsupdates zu erhalten.',open:'Titel öffnen',source:'Quelle öffnen',loading:'Gefolgte Titel werden geladen…',failed:'Gefolgte Titel konnten nicht geladen werden.',saved:'Titel-Updates aktiviert',removed:'Titel-Updates deaktiviert',queue:'Warteschlange',queued:'In der Warteschlange',completed:'Abgeschlossen',review:'In Prüfung'},
  };
  const tx=key=>COPY[state.locale]?.[key]||COPY.en[key]||key;
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons=()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}};

  function submissionIdentity(){
    const auto=state.discoveryAuto;
    const source=state.discoverySource;
    const candidate=auto||source||{};
    const provider=String(candidate.provider||(source?'raw_fucknovelpia':'')).trim();
    const externalId=String(candidate.external_id||'').trim();
    return {provider,externalId,sourceUrl:String(state.draft?.source_url||candidate.source_url||'').trim()};
  }

  function stableRequestId(){
    if(state.identitySubmitRequestId)return state.identitySubmitRequestId;
    const random=globalThis.crypto?.randomUUID?.().replace(/-/g,'')||`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    state.identitySubmitRequestId=`web_${random}`.slice(0,72);
    return state.identitySubmitRequestId;
  }

  function wrapApi(){
    if(apiWrapped||!app.api)return;
    const original=app.api.bind(app);
    app.api=async(path,options={})=>{
      if(path==='/api/app/submit'&&options?.body instanceof FormData){
        const identity=submissionIdentity();
        options.body.set('request_id',stableRequestId());
        if(identity.provider)options.body.set('identity_provider',identity.provider);
        if(identity.externalId)options.body.set('identity_external_id',identity.externalId);
        if(identity.externalId||identity.sourceUrl){
          await original('/api/app/submission/preflight',{
            method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({provider:identity.provider,external_id:identity.externalId,source_url:identity.sourceUrl}),
          });
        }
        const result=await original(path,options);
        state.identitySubmitRequestId=null;
        return result;
      }
      return original(path,options);
    };
    apiWrapped=true;
  }

  function applyFollowingPayload(payload){
    cachePayload=payload||{count:0,items:[],followed_keys:[]};
    loadedAt=Date.now();
    followedSubmissions=new Map();
    followedCatalogs=new Map();
    for(const item of cachePayload.items||[]){
      if(item.kind==='submission'&&Number(item.submission_id)>0)followedSubmissions.set(Number(item.submission_id),item.follow_key);
      if(item.kind==='catalog'&&Number(item.catalog_id)>0)followedCatalogs.set(Number(item.catalog_id),item.follow_key);
    }
    return cachePayload;
  }

  async function loadFollowing(force=false){
    if(state.preview)return applyFollowingPayload({count:0,items:[],followed_keys:[]});
    if(!force&&cachePayload&&Date.now()-loadedAt<30000)return cachePayload;
    if(loadPromise)return loadPromise;
    loadPromise=app.api('/api/app/following').then(applyFollowingPayload).finally(()=>{loadPromise=null;});
    return loadPromise;
  }

  async function setSubmissionFollow(id,following){
    const result=state.preview?{following,follow_key:`submission:${id}`}:
      await app.api('/api/app/following/submission',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({submission_id:id,following})});
    updateFollowCaches('submission',id,result.follow_key,following);
    app.toast?.(following?tx('saved'):tx('removed'),'success');
    mountAll();
    return result;
  }

  async function setCatalogFollow(id,following){
    const result=state.preview?{following,follow_key:`novelpia:preview-${id}`}:
      await app.api('/api/app/following/catalog',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({catalog_id:id,following})});
    updateFollowCaches(result.linked_submission_id?'submission':'catalog',Number(result.linked_submission_id||id),result.follow_key,following);
    app.toast?.(following?tx('saved'):tx('removed'),'success');
    mountAll();
    return result;
  }

  function updateFollowCaches(kind,id,key,following){
    const target=kind==='submission'?followedSubmissions:followedCatalogs;
    if(following)target.set(id,key);else target.delete(id);
    if(cachePayload){
      const keys=new Set(cachePayload.followed_keys||[]);
      if(following)keys.add(key);else keys.delete(key);
      cachePayload={...cachePayload,followed_keys:[...keys]};
    }
    loadedAt=Date.now();
  }

  function followButton({kind,id,following,compact=false}){
    const button=document.createElement('button');
    button.type='button';
    button.className=`title-follow-button${following?' is-following':''}${compact?' compact':''}`;
    button.dataset.titleFollowKind=kind;
    button.dataset.titleFollowId=String(id);
    button.dataset.followStamp=`${kind}:${id}:${following?1:0}:${state.locale}:${compact?1:0}`;
    button.setAttribute('aria-pressed',following?'true':'false');
    button.innerHTML=`${icon(following?'bell-ring':'bell')}<span>${escapeHtml(following?tx('followingNow'):tx('follow'))}</span>`;
    button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();
      if(button.disabled)return;
      button.disabled=true;
      try{kind==='submission'?await setSubmissionFollow(id,!following):await setCatalogFollow(id,!following);}
      catch(error){app.toast?.(error?.message||tx('failed'),'error');button.disabled=false;}
    });
    return button;
  }

  function ensureFollowButton(anchor,{kind,id,following,compact=false,detail=false}){
    const parent=anchor.parentElement;
    if(!parent)return;
    const selector=`[data-title-follow-kind="${kind}"][data-title-follow-id="${id}"]`;
    const existing=parent.querySelector(selector);
    const expected=`${kind}:${id}:${following?1:0}:${state.locale}:${compact?1:0}`;
    if(existing?.dataset.followStamp===expected)return;
    const button=followButton({kind,id,following,compact});
    if(detail)button.classList.add('secondary-button','title-follow-detail');
    if(existing)existing.replaceWith(button);else anchor.insertAdjacentElement('afterend',button);
    refreshIcons();
  }

  async function mountDiscover(){
    if(state.view!=='discover')return;
    await loadFollowing().catch(()=>null);
    if(state.view!=='discover')return;
    document.querySelectorAll('[data-discover-interest]').forEach(anchor=>{
      const id=Number(anchor.getAttribute('data-discover-interest'));
      if(id)ensureFollowButton(anchor,{kind:'submission',id,following:followedSubmissions.has(id),compact:true});
    });
    document.querySelectorAll('[data-catalog-interest]').forEach(anchor=>{
      const id=Number(anchor.getAttribute('data-catalog-interest'));
      if(id)ensureFollowButton(anchor,{kind:'catalog',id,following:followedCatalogs.has(id),compact:true});
    });
  }

  async function mountDetail(){
    if(state.view!=='detail')return;
    const id=Number(state.detailNovel?.id);
    const host=document.querySelector('.live-detail-actions');
    if(!id||!host)return;
    await loadFollowing().catch(()=>null);
    if(state.view!=='detail'||Number(state.detailNovel?.id)!==id||!host.isConnected)return;
    const following=followedSubmissions.has(id);
    const stamp=`submission:${id}:${following?1:0}:${state.locale}:0`;
    const existing=host.querySelector('.title-follow-detail');
    if(existing?.dataset.followStamp===stamp)return;
    const button=followButton({kind:'submission',id,following});
    button.classList.add('secondary-button','title-follow-detail');
    const queueAction=host.querySelector('[data-live-detail-queue],#detailQueue');
    if(existing)existing.replaceWith(button);
    else if(queueAction)host.insertBefore(button,queueAction);
    else host.appendChild(button);
    refreshIcons();
  }

  function mountAccount(){
    if(state.view!=='account')return;
    const list=document.querySelector('.account-preferences-group .settings-list');
    if(!list)return;
    const stamp=String(state.locale||'en');
    const existing=list.querySelector('#followingSetting');
    if(existing?.dataset.followStamp===stamp)return;
    const row=document.createElement('button');
    row.className='setting-row';row.id='followingSetting';row.type='button';row.dataset.followStamp=stamp;
    row.innerHTML=`<span class="round-icon">${icon('library-big')}</span><span><span class="setting-title">${escapeHtml(tx('following'))}</span><span class="setting-sub">${escapeHtml(tx('followingSub'))}</span></span><span class="chevron">›</span>`;
    row.addEventListener('click',openFollowing);
    if(existing)existing.replaceWith(row);
    else{
      const notifications=list.querySelector('#notificationsSetting');
      if(notifications?.nextSibling)list.insertBefore(row,notifications.nextSibling);else list.appendChild(row);
    }
    refreshIcons();
  }

  async function openFollowing(){
    const root=app.sheetRoot;
    if(!root)return;
    root.innerHTML=`<div class="sheet-backdrop title-follow-sheet-backdrop" id="followingSheetBackdrop"><div class="bottom-sheet title-follow-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="sheet-title">${escapeHtml(tx('following'))}</div><div class="title-follow-list"><div class="title-follow-loading">${escapeHtml(tx('loading'))}</div></div><div class="sheet-actions"><button class="secondary-button wide-button" type="button" data-follow-close>${escapeHtml(app.tr?.('close')||'Close')}</button></div></div></div>`;
    const close=()=>{root.innerHTML='';document.dispatchEvent(new CustomEvent('dtl:sheetclose'));};
    root.querySelector('[data-follow-close]')?.addEventListener('click',close);
    root.querySelector('#followingSheetBackdrop')?.addEventListener('click',event=>{if(event.target.id==='followingSheetBackdrop')close();});
    document.dispatchEvent(new CustomEvent('dtl:sheetopen',{detail:{root}}));
    try{renderFollowingList(await loadFollowing(true),close);}
    catch{const host=root.querySelector('.title-follow-list');if(host)host.innerHTML=`<div class="title-follow-empty"><strong>${escapeHtml(tx('failed'))}</strong></div>`;}
  }

  function renderFollowingList(payload,close){
    const host=app.sheetRoot?.querySelector('.title-follow-list');if(!host)return;
    const items=Array.isArray(payload?.items)?payload.items:[];
    if(!items.length){host.innerHTML=`<div class="title-follow-empty">${icon('bell-off')}<strong>${escapeHtml(tx('empty'))}</strong><p>${escapeHtml(tx('emptySub'))}</p></div>`;refreshIcons();return;}
    host.innerHTML=items.map((item,index)=>{
      const status=item.kind==='submission'?statusText(item):item.author||item.original_title||'NovelPia';
      const progress=item.progress_percent===null||item.progress_percent===undefined?null:Math.max(0,Math.min(100,Number(item.progress_percent)||0));
      return `<article class="title-follow-item" data-follow-index="${index}"><div class="title-follow-item-main"><div class="title-follow-item-title">${escapeHtml(item.title||item.original_title||'Untitled')}</div><div class="title-follow-item-meta">${escapeHtml(status)}</div>${progress===null?'':`<div class="title-follow-progress"><span style="width:${progress}%"></span></div>`}</div><div class="title-follow-item-actions"><button class="secondary-button compact" type="button" data-follow-open="${index}">${escapeHtml(item.kind==='submission'?tx('open'):tx('source'))}</button><button class="title-follow-unfollow" type="button" data-follow-remove="${index}" aria-label="${escapeHtml(tx('unfollow'))}">${icon('bell-off')}</button></div></article>`;
    }).join('');
    host.querySelectorAll('[data-follow-open]').forEach(button=>button.addEventListener('click',()=>{
      const item=items[Number(button.dataset.followOpen)];if(!item)return;
      if(item.kind==='submission'){close();app.openNovel?.(Number(item.submission_id));return;}
      if(item.source_url){try{app.tg?.openLink?.(item.source_url);}catch{window.open(item.source_url,'_blank','noopener');}}
    }));
    host.querySelectorAll('[data-follow-remove]').forEach(button=>button.addEventListener('click',async()=>{
      const item=items[Number(button.dataset.followRemove)];if(!item)return;button.disabled=true;
      try{
        if(item.kind==='submission')await setSubmissionFollow(Number(item.submission_id),false);else await setCatalogFollow(Number(item.catalog_id),false);
        renderFollowingList(await loadFollowing(true),close);
      }catch(error){app.toast?.(error?.message||tx('failed'),'error');button.disabled=false;}
    }));
    refreshIcons();
  }

  function statusText(item){
    if(item.queue_status==='in_progress')return `${Number(item.current_chapter||0)} / ${Number(item.chapter_count||0)}`;
    if(item.queue_status==='queued')return item.queue_position?`${tx('queue')} #${item.queue_position}`:tx('queued');
    if(item.queue_status==='completed')return tx('completed');
    return item.request_status==='pending'?tx('review'):'Dollar TL';
  }

  function mountAll(){
    if(mountQueued)return;
    mountQueued=true;
    queueMicrotask(()=>{
      mountQueued=false;
      mountAccount();
      void mountDiscover();
      void mountDetail();
    });
  }

  function observe(){
    observer?.disconnect();
    observer=new MutationObserver(()=>mountAll());
    observer.observe(app.viewRoot,{childList:true,subtree:true});
  }

  wrapApi();observe();mountAll();
  document.addEventListener('dtl:viewchange',mountAll);
  document.addEventListener('dtl:viewrender',mountAll);
  document.addEventListener('dtl:localechange',()=>{loadedAt=0;cachePayload=null;mountAll();});
  window.DTL_FOLLOWING=Object.freeze({load:loadFollowing,open:openFollowing,setSubmissionFollow,setCatalogFollow});
})();
