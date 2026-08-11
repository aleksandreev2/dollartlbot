(() => {
  const app=window.DTL_APP;
  if(!app?.api)throw new Error('Discovery UI requires DTL app core.');
  const {state,escapeHtml}=app;
  let searchSeq=0;
  let searchTimer=0;
  let lastPayload=null;

  const COPY={
    en:{find:'Find your novel',hint:'Search by title, NovelPia ID, or paste a NovelPia / RAW link.',placeholder:'Title, Korean title, NovelPia link or ID',search:'Search',orUpload:'or upload your own file',searching:'Searching Dollar TL and external sources…',none:'No matching titles found yet.',providerDown:'External RAW search is temporarily unavailable. Dollar TL matches are still shown.',use:'Use this novel',view:'View title',want:'I want this translated',wanted:'Wanted',your:'Your request',readers:n=>`${n} reader${n===1?'':'s'} want this`,raw:'RAW available',underReview:'Under review',queued:'In queue',translating:'Translating',completed:'Completed',selected:'Novel selected',change:'Change',source:'RAW source',linked:'Source linked',sourceSaveFailed:'The request was submitted, but the external source could not be linked automatically.'},
    ru:{find:'Найти новеллу',hint:'Ищите по названию, NovelPia ID или вставьте ссылку NovelPia / RAW.',placeholder:'Название, корейское название, ссылка NovelPia или ID',search:'Найти',orUpload:'или загрузите свой файл',searching:'Ищем в Dollar TL и внешних источниках…',none:'Совпадений пока не найдено.',providerDown:'Внешний RAW-поиск временно недоступен. Совпадения Dollar TL всё равно показаны.',use:'Использовать тайтл',view:'Открыть тайтл',want:'Хочу этот перевод',wanted:'Хочу перевод',your:'Ваша заявка',readers:n=>`${n} читател${n%10===1&&n%100!==11?'ь':'ей'} хотят перевод`,raw:'RAW доступен',underReview:'На проверке',queued:'В очереди',translating:'Переводится',completed:'Завершено',selected:'Тайтл выбран',change:'Сменить',source:'RAW источник',linked:'Источник привязан',sourceSaveFailed:'Заявка отправлена, но внешний источник не удалось привязать автоматически.'},
    es:{find:'Encuentra tu novela',hint:'Busca por título, ID de NovelPia o pega un enlace de NovelPia / RAW.',placeholder:'Título, título coreano, enlace o ID',search:'Buscar',orUpload:'o sube tu propio archivo',searching:'Buscando en Dollar TL y fuentes externas…',none:'No se encontraron títulos.',providerDown:'La búsqueda RAW externa no está disponible temporalmente.',use:'Usar esta novela',view:'Ver título',want:'Quiero esta traducción',wanted:'Solicitada',your:'Tu solicitud',readers:n=>`${n} lectores quieren esta traducción`,raw:'RAW disponible',underReview:'En revisión',queued:'En cola',translating:'En traducción',completed:'Completada',selected:'Novela seleccionada',change:'Cambiar',source:'Fuente RAW',linked:'Fuente vinculada',sourceSaveFailed:'La solicitud se envió, pero no se pudo vincular la fuente externa.'},
    fil:{find:'Hanapin ang nobela',hint:'Maghanap ayon sa title, NovelPia ID, o mag-paste ng NovelPia / RAW link.',placeholder:'Title, Korean title, link o ID',search:'Search',orUpload:'o mag-upload ng sarili mong file',searching:'Naghahanap sa Dollar TL at external sources…',none:'Walang nahanap na tugma.',providerDown:'Pansamantalang unavailable ang external RAW search.',use:'Gamitin ang nobela',view:'Tingnan ang title',want:'Gusto kong maisalin ito',wanted:'Gusto ko ito',your:'Request mo',readers:n=>`${n} readers ang gustong maisalin ito`,raw:'May RAW',underReview:'Sinusuri',queued:'Nasa pila',translating:'Isinasalin',completed:'Tapos',selected:'Napili ang nobela',change:'Palitan',source:'RAW source',linked:'Naka-link ang source',sourceSaveFailed:'Naipadala ang request pero hindi na-link ang external source.'},
    hi:{find:'अपना उपन्यास खोजें',hint:'शीर्षक, NovelPia ID से खोजें या NovelPia / RAW लिंक पेस्ट करें।',placeholder:'शीर्षक, कोरियाई शीर्षक, लिंक या ID',search:'खोजें',orUpload:'या अपनी फ़ाइल अपलोड करें',searching:'Dollar TL और बाहरी स्रोतों में खोज रहे हैं…',none:'कोई मिलान नहीं मिला।',providerDown:'बाहरी RAW खोज अस्थायी रूप से उपलब्ध नहीं है।',use:'इस उपन्यास का उपयोग करें',view:'शीर्षक खोलें',want:'मैं इसका अनुवाद चाहता हूँ',wanted:'चाहते हैं',your:'आपका अनुरोध',readers:n=>`${n} पाठक इसका अनुवाद चाहते हैं`,raw:'RAW उपलब्ध',underReview:'समीक्षा में',queued:'कतार में',translating:'अनुवाद जारी',completed:'पूर्ण',selected:'उपन्यास चुना गया',change:'बदलें',source:'RAW स्रोत',linked:'स्रोत जोड़ा गया',sourceSaveFailed:'अनुरोध भेजा गया, लेकिन बाहरी स्रोत लिंक नहीं हो सका।'},
    pt:{find:'Encontre a novel',hint:'Pesquise pelo título, ID NovelPia ou cole um link NovelPia / RAW.',placeholder:'Título, título coreano, link ou ID',search:'Pesquisar',orUpload:'ou envie seu próprio arquivo',searching:'Pesquisando no Dollar TL e em fontes externas…',none:'Nenhum título encontrado.',providerDown:'A pesquisa RAW externa está temporariamente indisponível.',use:'Usar esta novel',view:'Abrir título',want:'Quero esta tradução',wanted:'Quero traduzido',your:'Seu pedido',readers:n=>`${n} leitores querem esta tradução`,raw:'RAW disponível',underReview:'Em análise',queued:'Na fila',translating:'Em tradução',completed:'Concluído',selected:'Novel selecionada',change:'Alterar',source:'Fonte RAW',linked:'Fonte vinculada',sourceSaveFailed:'O pedido foi enviado, mas a fonte externa não pôde ser vinculada.'},
    id:{find:'Temukan novel',hint:'Cari berdasarkan judul, ID NovelPia, atau tempel tautan NovelPia / RAW.',placeholder:'Judul, judul Korea, tautan atau ID',search:'Cari',orUpload:'atau unggah file sendiri',searching:'Mencari di Dollar TL dan sumber eksternal…',none:'Tidak ada judul yang cocok.',providerDown:'Pencarian RAW eksternal sementara tidak tersedia.',use:'Gunakan novel ini',view:'Buka judul',want:'Saya ingin diterjemahkan',wanted:'Diinginkan',your:'Permintaan Anda',readers:n=>`${n} pembaca menginginkan terjemahan ini`,raw:'RAW tersedia',underReview:'Ditinjau',queued:'Dalam antrean',translating:'Sedang diterjemahkan',completed:'Selesai',selected:'Novel dipilih',change:'Ganti',source:'Sumber RAW',linked:'Sumber ditautkan',sourceSaveFailed:'Permintaan terkirim, tetapi sumber eksternal gagal ditautkan.'},
    vi:{find:'Tìm tiểu thuyết',hint:'Tìm theo tên, ID NovelPia hoặc dán liên kết NovelPia / RAW.',placeholder:'Tên, tên tiếng Hàn, liên kết hoặc ID',search:'Tìm',orUpload:'hoặc tải tệp của bạn lên',searching:'Đang tìm trong Dollar TL và nguồn bên ngoài…',none:'Chưa tìm thấy tác phẩm phù hợp.',providerDown:'Tìm kiếm RAW bên ngoài tạm thời không khả dụng.',use:'Dùng tác phẩm này',view:'Mở tác phẩm',want:'Tôi muốn bản dịch này',wanted:'Đã quan tâm',your:'Yêu cầu của bạn',readers:n=>`${n} độc giả muốn bản dịch này`,raw:'Có RAW',underReview:'Đang duyệt',queued:'Trong hàng đợi',translating:'Đang dịch',completed:'Hoàn thành',selected:'Đã chọn tác phẩm',change:'Đổi',source:'Nguồn RAW',linked:'Đã liên kết nguồn',sourceSaveFailed:'Yêu cầu đã gửi nhưng không thể liên kết nguồn bên ngoài.'},
    fr:{find:'Trouver un roman',hint:'Recherchez par titre, ID NovelPia ou collez un lien NovelPia / RAW.',placeholder:'Titre, titre coréen, lien ou ID',search:'Rechercher',orUpload:'ou importez votre propre fichier',searching:'Recherche dans Dollar TL et les sources externes…',none:'Aucun titre correspondant.',providerDown:'La recherche RAW externe est temporairement indisponible.',use:'Utiliser ce roman',view:'Voir le titre',want:'Je veux cette traduction',wanted:'Demandé',your:'Votre demande',readers:n=>`${n} lecteurs veulent cette traduction`,raw:'RAW disponible',underReview:'En révision',queued:'Dans la file',translating:'En traduction',completed:'Terminé',selected:'Roman sélectionné',change:'Changer',source:'Source RAW',linked:'Source liée',sourceSaveFailed:'La demande a été envoyée, mais la source externe n’a pas pu être liée.'},
    de:{find:'Roman finden',hint:'Nach Titel oder NovelPia-ID suchen oder einen NovelPia-/RAW-Link einfügen.',placeholder:'Titel, koreanischer Titel, Link oder ID',search:'Suchen',orUpload:'oder eigene Datei hochladen',searching:'Suche in Dollar TL und externen Quellen…',none:'Keine passenden Titel gefunden.',providerDown:'Die externe RAW-Suche ist vorübergehend nicht verfügbar.',use:'Diesen Roman verwenden',view:'Titel öffnen',want:'Ich möchte diese Übersetzung',wanted:'Gewünscht',your:'Deine Anfrage',readers:n=>`${n} Leser möchten diese Übersetzung`,raw:'RAW verfügbar',underReview:'In Prüfung',queued:'In Warteschlange',translating:'Wird übersetzt',completed:'Abgeschlossen',selected:'Roman ausgewählt',change:'Ändern',source:'RAW-Quelle',linked:'Quelle verknüpft',sourceSaveFailed:'Die Anfrage wurde gesendet, aber die externe Quelle konnte nicht verknüpft werden.'},
  };
  const locale=()=>COPY[state.locale]?state.locale:'en';
  const tx=(key,...args)=>{const value=COPY[locale()]?.[key]??COPY.en[key]??key;return typeof value==='function'?value(...args):value;};
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons=()=>requestAnimationFrame(()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}});

  function renderFinder(){
    const selected=state.discoverySource;
    return `<section class="discovery-finder" data-discovery-finder>
      <div class="discovery-finder-head"><div class="discovery-finder-icon">${icon('search')}</div><div><h2>${escapeHtml(tx('find'))}</h2><p>${escapeHtml(tx('hint'))}</p></div></div>
      ${selected?selectedMarkup(selected):`<div class="discovery-search"><div class="discovery-search-input-wrap">${icon('search')}<input class="text-input" id="discoveryQuery" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(tx('placeholder'))}"></div><button class="secondary-button discovery-search-button" id="discoverySearch" type="button">${escapeHtml(tx('search'))}</button></div><div class="discovery-search-hint">NovelPia · raw-fucknovelpia.com · Dollar TL</div><div class="discovery-results" id="discoveryResults"></div>`}
    </section><div class="discovery-divider"><span>${escapeHtml(tx('orUpload'))}</span></div>`;
  }

  function selectedMarkup(source){
    return `<div class="discovery-selected"><div class="discovery-selected-top"><div><strong>${escapeHtml(source.title||tx('selected'))}</strong><small>${escapeHtml(source.original_title||source.author||tx('selected'))}</small></div><button class="discovery-selected-change" id="discoveryChange" type="button">${escapeHtml(tx('change'))}</button></div><div class="discovery-selected-source"><span class="discovery-chip raw">${icon('archive')} ${escapeHtml(tx('raw'))}</span>${source.page_url?`<a class="discovery-chip" href="${escapeHtml(source.page_url)}" target="_blank" rel="noopener">${icon('external-link')} ${escapeHtml(tx('source'))}</a>`:''}</div></div>`;
  }

  function bindFinder(){
    const change=document.getElementById('discoveryChange');
    if(change){change.addEventListener('click',()=>{state.discoverySource=null;state.discoveryAuto=null;document.dispatchEvent(new CustomEvent('dtl:discoveryselected'));});refreshIcons();return;}
    const input=document.getElementById('discoveryQuery');
    const button=document.getElementById('discoverySearch');
    if(!input||!button)return;
    const run=()=>search(String(input.value||'').trim());
    button.addEventListener('click',run);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();run();}});
    input.addEventListener('input',()=>{clearTimeout(searchTimer);const q=String(input.value||'').trim();if(q.length<2){renderResults(null);return;}searchTimer=setTimeout(()=>search(q),420);});
    refreshIcons();
  }

  async function search(query){
    if(query.length<2){renderResults(null);return;}
    const seq=++searchSeq;
    renderResults({loading:true});
    try{
      const payload=state.preview?previewSearch(query):await app.api(`/api/app/discovery/search?q=${encodeURIComponent(query)}`);
      if(seq!==searchSeq)return;
      lastPayload=payload;
      renderResults(payload);
    }catch(error){if(seq!==searchSeq)return;renderResults({error:error?.message||String(error)});}
  }

  function previewSearch(query){
    const all=[...(state.bootstrap?.queue?.active||[]),...(state.bootstrap?.queue?.upcoming||[]),...(state.bootstrap?.queue?.completed||[])];
    const q=query.toLowerCase();
    const local=all.filter(row=>String(row.title||'').toLowerCase().includes(q)).slice(0,6).map(row=>({kind:'local',...row,demand_count:1,viewer_interested:false,own_request:false,raw_available:false}));
    return {query,local,external:[],provider_status:'skipped'};
  }

  function renderResults(payload){
    const host=document.getElementById('discoveryResults');
    if(!host)return;
    if(!payload){host.innerHTML='';return;}
    if(payload.loading){host.innerHTML=`<div class="discovery-status loading">${icon('loader-circle')}<span>${escapeHtml(tx('searching'))}</span></div>`;refreshIcons();return;}
    if(payload.error){host.innerHTML=`<div class="discovery-status">${icon('triangle-alert')}<span>${escapeHtml(payload.error)}</span></div>`;refreshIcons();return;}
    const local=Array.isArray(payload.local)?payload.local:[];
    const external=Array.isArray(payload.external)?payload.external:[];
    let html='';
    for(const row of local)html+=localResult(row);
    external.forEach((row,index)=>{html+=externalResult(row,index);});
    if(!html)html=`<div class="discovery-status">${icon('book-search')}<span>${escapeHtml(tx('none'))}</span></div>`;
    if(payload.provider_status==='unavailable')html+=`<div class="discovery-status">${icon('wifi-off')}<span>${escapeHtml(tx('providerDown'))}</span></div>`;
    host.innerHTML=html;
    bindResultActions();
    refreshIcons();
  }

  function localResult(row){
    const status=localStatus(row);
    const demand=Math.max(1,Number(row.demand_count)||1);
    const interest=row.own_request?`<button class="discovery-action secondary" type="button" disabled>${escapeHtml(tx('your'))}</button>`:`<button class="discovery-action ${row.viewer_interested?'interested':'secondary'}" type="button" data-discovery-interest="${Number(row.id)}" data-next="${row.viewer_interested?'0':'1'}">${escapeHtml(row.viewer_interested?tx('wanted'):tx('want'))}</button>`;
    const canView=row.request_status==='accepted';
    return `<article class="discovery-result"><div class="discovery-result-copy"><div class="discovery-result-title">${escapeHtml(row.title)}</div><div class="discovery-result-meta"><span class="discovery-chip ${row.queue_status==='in_progress'?'live':''}">${escapeHtml(status)}</span><span>${escapeHtml(tx('readers',demand))}</span>${row.raw_available?`<span class="discovery-chip raw">${icon('archive')} ${escapeHtml(tx('raw'))}</span>`:''}</div></div><div class="discovery-result-actions">${canView?`<button class="discovery-action secondary" type="button" data-discovery-view="${Number(row.id)}">${escapeHtml(tx('view'))}</button>`:''}${interest}</div></article>`;
  }

  function externalResult(row,index){
    return `<article class="discovery-result"><div class="discovery-result-copy"><div class="discovery-result-title">${escapeHtml(row.title||row.original_title||'Novel')}</div>${row.original_title&&row.original_title!==row.title?`<div class="discovery-result-original">${escapeHtml(row.original_title)}</div>`:''}<div class="discovery-result-meta">${row.author?`<span>${escapeHtml(row.author)}</span>`:''}<span>NovelPia${row.external_id?` #${escapeHtml(row.external_id)}`:''}</span>${row.raw_available?`<span class="discovery-chip raw">${icon('archive')} ${escapeHtml(tx('raw'))}</span>`:''}</div></div><div class="discovery-result-actions"><button class="discovery-action primary" type="button" data-discovery-use="${index}">${escapeHtml(tx('use'))}</button></div></article>`;
  }

  function localStatus(row){
    if(row.request_status==='pending')return tx('underReview');
    if(row.queue_status==='in_progress')return tx('translating');
    if(row.queue_status==='completed')return tx('completed');
    return tx('queued');
  }

  function bindResultActions(){
    document.querySelectorAll('[data-discovery-view]').forEach(btn=>btn.addEventListener('click',()=>app.openNovel?.(Number(btn.dataset.discoveryView))));
    document.querySelectorAll('[data-discovery-use]').forEach(btn=>btn.addEventListener('click',()=>selectExternal(Number(btn.dataset.discoveryUse))));
    document.querySelectorAll('[data-discovery-interest]').forEach(btn=>btn.addEventListener('click',()=>toggleInterest(Number(btn.dataset.discoveryInterest),btn.dataset.next==='1')));
  }

  function selectExternal(index){
    const row=lastPayload?.external?.[index];
    if(!row)return;
    state.discoverySource={...row};
    state.discoveryAuto={title:row.title||'',source_url:row.source_url||row.page_url||''};
    if(row.title&&!state.draft.title)state.draft.title=row.title;
    if(!state.draft.original_language)state.draft.original_language=row.original_language||'Korean';
    if(row.chapter_count&&!state.draft.chapter_count)state.draft.chapter_count=String(row.chapter_count);
    if(row.publication_status)state.draft.publication_status=row.publication_status;
    if(!state.draft.source_url)state.draft.source_url=row.source_url||row.page_url||'';
    if(row.genres_tags&&!state.draft.genres_tags)state.draft.genres_tags=row.genres_tags;
    try{app.tg?.HapticFeedback?.selectionChanged?.();}catch{}
    document.dispatchEvent(new CustomEvent('dtl:discoveryselected',{detail:{source:state.discoverySource}}));
  }

  async function toggleInterest(submissionId,interested){
    if(state.preview){updateLocalInterest(submissionId,interested,{demand_count:interested?2:1});return;}
    try{
      const data=await app.api('/api/app/discovery/interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({submission_id:submissionId,interested})});
      updateLocalInterest(submissionId,Boolean(data.viewer_interested),data);
      mountDetail();
      try{app.tg?.HapticFeedback?.selectionChanged?.();}catch{}
    }catch(error){app.toast(error?.message||String(error),'error');}
  }

  function updateLocalInterest(id,interested,data){
    const row=lastPayload?.local?.find(item=>Number(item.id)===Number(id));
    if(row){row.viewer_interested=interested;row.demand_count=Number(data?.demand_count)||row.demand_count;renderResults(lastPayload);}
  }

  function reviewSourceMarkup(){
    const source=state.discoverySource;
    if(!source)return'';
    return `<div class="discovery-review-source">${icon('archive')} ${escapeHtml(tx('raw'))}${source.external_id?` · NovelPia #${escapeHtml(source.external_id)}`:''}${source.page_url?` · <a href="${escapeHtml(source.page_url)}" target="_blank" rel="noopener">${escapeHtml(tx('source'))}</a>`:''}</div>`;
  }

  async function persistSelectedSource(submissionId){
    const source=state.discoverySource;
    if(!source||state.preview)return true;
    try{
      await app.api('/api/app/discovery/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({submission_id:Number(submissionId),provider:'raw_fucknovelpia',external_id:source.external_id||null,page_url:source.page_url,source_url:source.source_url||null,raw_available:Boolean(source.raw_available),metadata:{title:source.title||'',original_title:source.original_title||'',author:source.author||''}})});
      return true;
    }catch(error){console.warn('discovery_source_link_failed',error);app.toast(tx('sourceSaveFailed'),'error');return false;}
  }

  async function mountDetail(){
    if(state.view!=='detail'||!state.detailNovel?.id)return;
    const requester=document.querySelector('.live-detail-requester');
    if(!requester)return;
    let host=document.querySelector('.live-detail-discovery');
    if(!host){host=document.createElement('div');host.className='live-detail-discovery';requester.after(host);}
    const id=Number(state.detailNovel.id);
    try{
      const data=state.preview?{submission_id:id,demand_count:1,viewer_interested:false,own_request:false,sources:[]}:await app.api(`/api/app/discovery/submission/${id}`);
      if(state.view!=='detail'||Number(state.detailNovel?.id)!==id)return;
      const raw=(data.sources||[]).find(source=>source.provider==='raw_fucknovelpia'&&source.raw_available);
      host.innerHTML=`<span class="live-detail-demand">${icon('users-round')} ${escapeHtml(tx('readers',Math.max(1,Number(data.demand_count)||1)))}</span>${raw?`<a class="live-detail-raw-source" href="${escapeHtml(raw.page_url)}" target="_blank" rel="noopener">${icon('archive')} ${escapeHtml(tx('raw'))}</a>`:''}${data.own_request?'':`<button class="live-detail-interest ${data.viewer_interested?'is-active':''}" type="button" data-detail-interest="${id}" data-next="${data.viewer_interested?'0':'1'}">${icon('heart')} ${escapeHtml(data.viewer_interested?tx('wanted'):tx('want'))}</button>`}`;
      host.querySelector('[data-detail-interest]')?.addEventListener('click',event=>toggleInterest(id,event.currentTarget.dataset.next==='1'));
      refreshIcons();
    }catch{host.remove();}
  }

  function reset(){lastPayload=null;state.discoverySource=null;state.discoveryAuto=null;clearTimeout(searchTimer);}

  document.addEventListener('dtl:viewchange',event=>{if(event.detail?.view==='detail')queueMicrotask(mountDetail);});
  document.addEventListener('dtl:localechange',()=>{if(state.view==='detail')mountDetail();});
  document.addEventListener('dtl:detail',mountDetail);

  window.DTL_DISCOVERY=Object.freeze({renderFinder,bindFinder,reviewSourceMarkup,persistSelectedSource,mountDetail,reset});
})();
