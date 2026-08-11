(() => {
  const app=window.DTL_APP;
  if(!app?.api)return;
  const {state,escapeHtml}=app;
  let apiWrapped=false;
  let loadPromise=null;
  let loadedAt=0;
  let followedKeys=new Set();
  let followedSubmissions=new Map();
  let followedCatalogs=new Map();
  let observer=null;

  const COPY={
    en:{following:'Following',followingSub:'Titles you follow and their translation updates',follow:'Follow updates',followingNow:'Following',unfollow:'Unfollow',empty:'You are not following any titles yet.',emptySub:'Follow a title in Discover to get translation status and progress updates.',open:'Open title',source:'Open source',loading:'Loading followed titles…',failed:'Could not load followed titles.',saved:'Following updates enabled',removed:'Following updates disabled'},
    ru:{following:'Подписки',followingSub:'Тайтлы, за которыми вы следите, и обновления перевода',follow:'Следить за обновлениями',followingNow:'Вы подписаны',unfollow:'Отписаться',empty:'У вас пока нет подписок на тайтлы.',emptySub:'Подпишитесь на тайтл в Discover, чтобы получать изменения статуса и прогресса.',open:'Открыть тайтл',source:'Открыть источник',loading:'Загружаем подписки…',failed:'Не удалось загрузить подписки.',saved:'Уведомления по тайтлу включены',removed:'Уведомления по тайтлу выключены'},
    es:{following:'Seguidos',followingSub:'Títulos que sigues y sus novedades de traducción',follow:'Seguir novedades',followingNow:'Siguiendo',unfollow:'Dejar de seguir',empty:'Aún no sigues ningún título.',emptySub:'Sigue un título en Discover para recibir cambios de estado y progreso.',open:'Abrir título',source:'Abrir fuente',loading:'Cargando títulos seguidos…',failed:'No se pudieron cargar los títulos seguidos.',saved:'Seguimiento activado',removed:'Seguimiento desactivado'},
    fil:{following:'Sinusundan',followingSub:'Mga title na sinusundan mo at translation updates',follow:'Sundan ang updates',followingNow:'Sinusundan',unfollow:'Huwag sundan',empty:'Wala ka pang sinusundang title.',emptySub:'Sundan ang title sa Discover para sa status at progress updates.',open:'Buksan ang title',source:'Buksan ang source',loading:'Nilo-load ang sinusundang titles…',failed:'Hindi ma-load ang sinusundang titles.',saved:'Naka-on ang title updates',removed:'Naka-off ang title updates'},
    hi:{following:'फ़ॉलो किए गए',followingSub:'आपके फ़ॉलो किए शीर्षक और उनके अनुवाद अपडेट',follow:'अपडेट फ़ॉलो करें',followingNow:'फ़ॉलो कर रहे हैं',unfollow:'अनफ़ॉलो',empty:'आप अभी किसी शीर्षक को फ़ॉलो नहीं कर रहे हैं।',emptySub:'स्थिति और प्रगति अपडेट पाने के लिए Discover में किसी शीर्षक को फ़ॉलो करें।',open:'शीर्षक खोलें',source:'स्रोत खोलें',loading:'फ़ॉलो किए शीर्षक लोड हो रहे हैं…',failed:'फ़ॉलो किए शीर्षक लोड नहीं हो सके।',saved:'शीर्षक अपडेट चालू हैं',removed:'शीर्षक अपडेट बंद हैं'},
    pt:{following:'Seguindo',followingSub:'Títulos seguidos e suas atualizações de tradução',follow:'Seguir atualizações',followingNow:'Seguindo',unfollow:'Deixar de seguir',empty:'Você ainda não segue nenhum título.',emptySub:'Siga um título no Discover para receber status e progresso.',open:'Abrir título',source:'Abrir fonte',loading:'Carregando títulos seguidos…',failed:'Não foi possível carregar os títulos seguidos.',saved:'Atualizações ativadas',removed:'Atualizações desativadas'},
    id:{following:'Diikuti',followingSub:'Judul yang kamu ikuti dan pembaruan terjemahannya',follow:'Ikuti pembaruan',followingNow:'Mengikuti',unfollow:'Berhenti mengikuti',empty:'Kamu belum mengikuti judul apa pun.',emptySub:'Ikuti judul di Discover untuk menerima status dan progres.',open:'Buka judul',source:'Buka sumber',loading:'Memuat judul yang diikuti…',failed:'Tidak dapat memuat judul yang diikuti.',saved:'Pembaruan judul diaktifkan',removed:'Pembaruan judul dinonaktifkan'},
    vi:{following:'Đang theo dõi',followingSub:'Tác phẩm bạn theo dõi và cập nhật bản dịch',follow:'Theo dõi cập nhật',followingNow:'Đang theo dõi',unfollow:'Bỏ theo dõi',empty:'Bạn chưa theo dõi tác phẩm nào.',emptySub:'Theo dõi tác phẩm trong Discover để nhận trạng thái và tiến độ.',open:'Mở tác phẩm',source:'Mở nguồn',loading:'Đang tải tác phẩm theo dõi…',failed:'Không thể tải danh sách theo dõi.',saved:'Đã bật cập nhật tác phẩm',removed:'Đã tắt cập nhật tác phẩm'},
    fr:{following:'Suivis',followingSub:'Titres suivis et mises à jour de traduction',follow:'Suivre les mises à jour',followingNow:'Suivi',unfollow:'Ne plus suivre',empty:'Vous ne suivez encore aucun titre.',emptySub:'Suivez un titre dans Discover pour recevoir le statut et la progression.',open:'Ouvrir le titre',source:'Ouvrir la source',loading:'Chargement des titres suivis…',failed:'Impossible de charger les titres suivis.',saved:'Suivi activé',removed:'Suivi désactivé'},
    de:{following:'Gefolgt',followingSub:'Gefolgte Titel und Übersetzungsupdates',follow:'Updates folgen',followingNow:'Gefolgt',unfollow:'Nicht mehr folgen',empty:'Du folgst noch keinen Titeln.',emptySub:'Folge einem Titel in Discover, um Status- und Fortschrittsupdates zu erhalten.',open:'Titel öffnen',source:'Quelle öffnen',loading:'Gefolgte Titel werden geladen…',failed:'Gefolgte Titel konnten nicht geladen werden.',saved:'Titel-Updates aktiviert',removed:'Titel-Updates deaktiviert'},
  };
  const tx=key=>COPY[state.locale]?.[key]||COPY.en[key]||key;
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons=()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}};

  function submissionIdentity(){
    const auto=state.discoveryAuto;
    const source=state.discoverySource;
    const candidate=auto||source||{};
    const provider=String(candidate.provider|| (source?'raw_fucknovelpia':'')).trim();
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
        const requestId=stableRequestId();
        options.body.set('request_id',requestId);
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

  async function loadFollowing(force=false){
    if(state.preview){followedKeys=new Set();followedSubmissions=new Map();followedCatalogs=new Map();return{count:0,items:[],followed_keys:[]};}
    if(!force&&loadPromise&&Date.now()-loadedAt<30000)return loadPromise;
    loadPromise=app.api('/api/app/following').then(payload=>{
      loadedAt=Date.now();
      followedKeys=new Set(Array.isArray(payload.followed_keys)?payload.followed_keys:[]);
      followedSubmissions=new Map();followedCatalogs=new Map();
      for(const item of payload.items||[]){
        if(item.kind==='submission'&&Number(item.submission_id)>0)followedSubmissions.set(Number(item.submission_id),item.follow_key);
        if(item.kind==='catalog'&&Number(item.catalog_id)>0)followedCatalogs.set(Number(item.catalog_id),item.follow_key);
      }
      return payload;
    }).finally(()=>{setTimeout(()=>{loadPromise=null;},0);});
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
    if(following){followedKeys.add(key);(kind==='submission'?followedSubmissions:followedCatalogs).set(id,key);}
    else{followedKeys.delete(key);followedSubmissions.delete(id);followedCatalogs.delete(id);}
    loadedAt=Date.now();
  }

  function followButton({kind,id,following,compact=false}){
    const button=document.createElement('button');
    button.type='button';
    button.className=`title-follow-button${following?' is-following':''}${compact?' compact':''}`;
    button.dataset.titleFollowKind=kind;
    button.dataset.titleFollowId=String(id);
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

  async function mountDiscover(){
    if(state.view!=='discover')return;
    await loadFollowing().catch(()=>null);
    document.querySelectorAll('[data-discover-interest]').forEach(interest=>{
      const id=Number(interest.getAttribute('data-discover-interest'));
      if(!id||interest.parentElement?.querySelector(`[data-title-follow-kind="submission"][data-title-follow-id="${id}"]`))return;
      interest.insertAdjacentElement('afterend',followButton({kind:'submission',id,following:followedSubmissions.has(id),compact:true}));
    });
    document.querySelectorAll('[data-catalog-interest]').forEach(interest=>{
      const id=Number(interest.getAttribute('data-catalog-interest'));
      if(!id||interest.parentElement?.querySelector(`[data-title-follow-kind="catalog"][data-title-follow-id="${id}"]`))return;
      interest.insertAdjacentElement('afterend',followButton({kind:'catalog',id,following:followedCatalogs.has(id),compact:true}));
    });
    refreshIcons();
  }

  async function mountDetail(){
    if(state.view!=='detail')return;
    const id=Number(state.detailNovel?.id);
    const host=document.querySelector('.live-detail-actions');
    if(!id||!host)return;
    await loadFollowing().catch(()=>null);
    const old=host.querySelector('.title-follow-detail');old?.remove();
    const button=followButton({kind:'submission',id,following:followedSubmissions.has(id)});
    button.classList.add('secondary-button','title-follow-detail');
    const queueAction=host.querySelector('[data-live-detail-queue],#detailQueue');
    if(queueAction)host.insertBefore(button,queueAction);else host.appendChild(button);
    refreshIcons();
  }

  function mountAccount(){
    if(state.view!=='account')return;
    const list=document.querySelector('.account-preferences-group .settings-list');
    if(!list||list.querySelector('#followingSetting'))return;
    const row=document.createElement('button');
    row.className='setting-row';row.id='followingSetting';row.type='button';
    row.innerHTML=`<span class="round-icon">${icon('library-big')}</span><span><span class="setting-title">${escapeHtml(tx('following'))}</span><span class="setting-sub">${escapeHtml(tx('followingSub'))}</span></span><span class="chevron">›</span>`;
    row.addEventListener('click',openFollowing);
    const notifications=list.querySelector('#notificationsSetting');
    if(notifications?.nextSibling)list.insertBefore(row,notifications.nextSibling);else list.appendChild(row);
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
    try{const payload=await loadFollowing(true);renderFollowingList(payload,close);}catch{const host=root.querySelector('.title-follow-list');if(host)host.innerHTML=`<div class="title-follow-empty"><strong>${escapeHtml(tx('failed'))}</strong></div>`;}
  }

  function renderFollowingList(payload,close){
    const host=app.sheetRoot?.querySelector('.title-follow-list');if(!host)return;
    const items=Array.isArray(payload?.items)?payload.items:[];
    if(!items.length){host.innerHTML=`<div class="title-follow-empty">${icon('bell-off')}<strong>${escapeHtml(tx('empty'))}</strong><p>${escapeHtml(tx('emptySub'))}</p></div>`;refreshIcons();return;}
    host.innerHTML=items.map((item,index)=>{
      const status=item.kind==='submission'?statusText(item):item.author||item.original_title||'NovelPia';
      return `<article class="title-follow-item" data-follow-index="${index}"><div class="title-follow-item-main"><div class="title-follow-item-title">${escapeHtml(item.title||item.original_title||'Untitled')}</div><div class="title-follow-item-meta">${escapeHtml(status)}</div>${Number(item.progress_percent)>=0&&item.progress_percent!==null?`<div class="title-follow-progress"><span style="width:${Math.max(0,Math.min(100,Number(item.progress_percent)))}%"></span></div>`:''}</div><div class="title-follow-item-actions"><button class="secondary-button compact" type="button" data-follow-open="${index}">${escapeHtml(item.kind==='submission'?tx('open'):tx('source'))}</button><button class="title-follow-unfollow" type="button" data-follow-remove="${index}" aria-label="${escapeHtml(tx('unfollow'))}">${icon('bell-off')}</button></div></article>`;
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
        const fresh=await loadFollowing(true);renderFollowingList(fresh,close);
      }catch(error){app.toast?.(error?.message||tx('failed'),'error');button.disabled=false;}
    }));
    refreshIcons();
  }

  function statusText(item){
    if(item.queue_status==='in_progress')return `${Number(item.current_chapter||0)} / ${Number(item.chapter_count||0)}`;
    if(item.queue_status==='queued')return item.queue_position?`Queue #${item.queue_position}`:'In queue';
    if(item.queue_status==='completed')return 'Completed';
    return item.request_status==='pending'?'Under review':'Dollar TL';
  }

  function mountAll(){
    queueMicrotask(()=>{mountAccount();void mountDiscover();void mountDetail();});
  }
  function observe(){
    observer?.disconnect();observer=new MutationObserver(()=>mountAll());
    observer.observe(app.viewRoot,{childList:true,subtree:true});
  }

  wrapApi();observe();mountAll();
  document.addEventListener('dtl:viewchange',mountAll);
  document.addEventListener('dtl:viewrender',mountAll);
  document.addEventListener('dtl:localechange',()=>{loadedAt=0;mountAll();});
  window.DTL_FOLLOWING=Object.freeze({load:loadFollowing,open:openFollowing,setSubmissionFollow,setCatalogFollow});
})();
