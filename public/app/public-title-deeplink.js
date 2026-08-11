(() => {
  const app=window.DTL_APP;
  if(!app?.state)throw new Error('DTL app core must load before public-title-deeplink.js');
  let handled=false;
  let attempts=0;

  function targetId(){
    const start=String(window.Telegram?.WebApp?.initDataUnsafe?.start_param||'').trim();
    const startMatch=/^title_(\d+)$/.exec(start);
    if(startMatch)return Number(startMatch[1]);
    const query=new URLSearchParams(location.search).get('title');
    return /^\d+$/.test(String(query||''))?Number(query):0;
  }

  function openTarget(){
    if(handled)return;
    const id=targetId();
    if(!id){handled=true;return;}
    if(typeof app.openNovel==='function'&&app.state.bootstrap){
      handled=true;
      try{app.openNovel(id);}catch(error){handled=false;console.warn('public_title_deeplink_failed',error);}
      return;
    }
    if(++attempts<=12)setTimeout(openTarget,80);
  }

  document.addEventListener('dtl:bootstrap',()=>queueMicrotask(openTarget));
  document.addEventListener('dtl:viewrender',()=>{if(!handled&&attempts<12)queueMicrotask(openTarget);});
  queueMicrotask(openTarget);
})();

(() => {
  const app=window.DTL_APP;
  if(!app?.state)return;
  const COPY={
    en:{progress:'Share progress',title:'Share title',progressText:'Translation progress on Dollar TL',titleText:'Help move this title up the Dollar TL queue'},
    ru:{progress:'Поделиться прогрессом',title:'Поделиться тайтлом',progressText:'Прогресс перевода в Dollar TL',titleText:'Помогите поднять этот тайтл в очереди Dollar TL'},
    es:{progress:'Compartir progreso',title:'Compartir título',progressText:'Progreso de traducción en Dollar TL',titleText:'Ayuda a subir este título en la cola de Dollar TL'},
    fil:{progress:'I-share ang progreso',title:'I-share ang title',progressText:'Translation progress sa Dollar TL',titleText:'Tulungan itong umakyat sa Dollar TL queue'},
    hi:{progress:'प्रगति साझा करें',title:'शीर्षक साझा करें',progressText:'Dollar TL पर अनुवाद प्रगति',titleText:'इस शीर्षक को Dollar TL कतार में ऊपर लाने में मदद करें'},
    pt:{progress:'Compartilhar progresso',title:'Compartilhar título',progressText:'Progresso da tradução no Dollar TL',titleText:'Ajude este título a subir na fila do Dollar TL'},
    id:{progress:'Bagikan progres',title:'Bagikan judul',progressText:'Progres terjemahan di Dollar TL',titleText:'Bantu judul ini naik di antrean Dollar TL'},
    vi:{progress:'Chia sẻ tiến độ',title:'Chia sẻ tác phẩm',progressText:'Tiến độ dịch trên Dollar TL',titleText:'Giúp tác phẩm này tăng hạng trong hàng đợi Dollar TL'},
    fr:{progress:'Partager la progression',title:'Partager le titre',progressText:'Progression de la traduction sur Dollar TL',titleText:'Aidez ce titre à monter dans la file Dollar TL'},
    de:{progress:'Fortschritt teilen',title:'Titel teilen',progressText:'Übersetzungsfortschritt bei Dollar TL',titleText:'Hilf diesem Titel, in der Dollar-TL-Warteschlange aufzusteigen'},
  };

  function copy(key){const locale=COPY[app.state.locale]?app.state.locale:'en';return COPY[locale][key]||COPY.en[key];}
  function isProgress(row){return row?.queue_status==='in_progress'||row?.queue_status==='completed'||Number(row?.current_chapter)>0;}

  function mount(){
    if(app.state.view!=='detail'||!app.state.detailNovel?.id)return;
    const detail=document.querySelector('.live-detail');
    const host=document.querySelector('.live-detail-discovery')||detail?.querySelector('.live-detail-requester')?.parentElement;
    if(!host)return;
    let button=host.querySelector('.public-title-share');
    const progress=isProgress(app.state.detailNovel);
    const label=copy(progress?'progress':'title');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='live-detail-interest public-title-share';
      host.appendChild(button);
    }
    button.innerHTML=`<i data-lucide="share-2" aria-hidden="true"></i> <span>${label}</span>`;
    button.onclick=()=>share(progress);
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  async function share(progress){
    const row=app.state.detailNovel;
    if(!row?.id)return;
    const kind=progress?'progress':'demand';
    const url=`${location.origin}/share/title/${Number(row.id)}?kind=${kind}`;
    const text=`${row.title||'Dollar TL'} — ${copy(progress?'progressText':'titleText')}`;
    try{
      if(navigator.share){await navigator.share({title:row.title||'Dollar TL',text,url});return;}
    }catch(error){if(error?.name==='AbortError')return;}
    const target=`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    try{app.tg?.openTelegramLink?.(target);}catch{window.open(target,'_blank','noopener,noreferrer');}
  }

  document.addEventListener('dtl:detail',()=>queueMicrotask(mount));
  document.addEventListener('dtl:viewrender',event=>{if(event.detail?.view==='detail')queueMicrotask(mount);});
  document.addEventListener('dtl:localechange',()=>queueMicrotask(mount));
})();
