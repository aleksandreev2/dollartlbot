(() => {
  const app=window.DTL_APP;
  const tg=window.Telegram?.WebApp;
  if(!app?.api||!app?.state)return;

  const cache=new Map();
  let readerState=null;
  let refreshEpoch=0;
  const COPY={
    en:{reader:'Dollar TL translation',rating:'Rating',rate:'Rate this title',download:'Download',thank:'Thank you & download',openBot:'Open private bot chat',quota:'Daily downloads',unlimited:'Boosty · Unlimited downloads',requires:'Download this title to leave a rating.',terms:'Personal use only',accept:'I understand, continue',loading:'Loading reader options…',failed:'Reader options are temporarily unavailable.',sent:'Continue in the private bot chat to receive the files.'},
    ru:{reader:'Перевод Dollar TL',rating:'Рейтинг',rate:'Оценить тайтл',download:'Скачать',thank:'Спасибо и скачать',openBot:'Открыть личный чат с ботом',quota:'Скачивания сегодня',unlimited:'Boosty · Скачивания без лимита',requires:'Скачайте этот тайтл, чтобы поставить оценку.',terms:'Только для личного использования',accept:'Понятно, продолжить',loading:'Загружаем возможности чтения…',failed:'Раздел чтения временно недоступен.',sent:'Продолжите в личном чате с ботом, чтобы получить файлы.'},
    es:{reader:'Traducción de Dollar TL',rating:'Valoración',rate:'Valorar este título',download:'Descargar',thank:'Gracias y descargar',openBot:'Abrir chat privado del bot',quota:'Descargas de hoy',unlimited:'Boosty · Descargas ilimitadas',requires:'Descarga este título para poder valorarlo.',terms:'Solo para uso personal',accept:'Entiendo, continuar',loading:'Cargando opciones…',failed:'Las opciones de lectura no están disponibles temporalmente.',sent:'Continúa en el chat privado del bot para recibir los archivos.'},
    fil:{reader:'Dollar TL translation',rating:'Rating',rate:'I-rate ang title',download:'I-download',thank:'Salamat at i-download',openBot:'Buksan ang private bot chat',quota:'Downloads ngayon',unlimited:'Boosty · Unlimited downloads',requires:'I-download muna ang title bago mag-rate.',terms:'Para sa personal na paggamit lamang',accept:'Nauunawaan ko, magpatuloy',loading:'Nilo-load ang reader options…',failed:'Pansamantalang hindi available ang reader options.',sent:'Magpatuloy sa private bot chat para matanggap ang files.'},
    hi:{reader:'Dollar TL अनुवाद',rating:'रेटिंग',rate:'रेट करें',download:'डाउनलोड',thank:'धन्यवाद और डाउनलोड',openBot:'निजी बॉट चैट खोलें',quota:'आज के डाउनलोड',unlimited:'Boosty · असीमित डाउनलोड',requires:'रेटिंग देने के लिए पहले यह शीर्षक डाउनलोड करें।',terms:'केवल निजी उपयोग के लिए',accept:'समझ गया, जारी रखें',loading:'रीडर विकल्प लोड हो रहे हैं…',failed:'रीडर विकल्प अभी उपलब्ध नहीं हैं।',sent:'फ़ाइलें पाने के लिए निजी बॉट चैट में जारी रखें।'},
    pt:{reader:'Tradução Dollar TL',rating:'Avaliação',rate:'Avaliar título',download:'Baixar',thank:'Obrigado e baixar',openBot:'Abrir chat privado do bot',quota:'Downloads de hoje',unlimited:'Boosty · Downloads ilimitados',requires:'Baixe este título antes de avaliá-lo.',terms:'Somente para uso pessoal',accept:'Entendi, continuar',loading:'Carregando opções…',failed:'As opções de leitura estão temporariamente indisponíveis.',sent:'Continue no chat privado do bot para receber os arquivos.'},
    id:{reader:'Terjemahan Dollar TL',rating:'Rating',rate:'Beri rating',download:'Unduh',thank:'Terima kasih & unduh',openBot:'Buka chat pribadi bot',quota:'Unduhan hari ini',unlimited:'Boosty · Unduhan tanpa batas',requires:'Unduh judul ini sebelum memberi rating.',terms:'Hanya untuk penggunaan pribadi',accept:'Saya mengerti, lanjutkan',loading:'Memuat opsi pembaca…',failed:'Opsi pembaca sementara tidak tersedia.',sent:'Lanjutkan di chat pribadi bot untuk menerima berkas.'},
    vi:{reader:'Bản dịch Dollar TL',rating:'Đánh giá',rate:'Đánh giá tác phẩm',download:'Tải xuống',thank:'Cảm ơn & tải xuống',openBot:'Mở chat riêng với bot',quota:'Lượt tải hôm nay',unlimited:'Boosty · Tải không giới hạn',requires:'Hãy tải tác phẩm này trước khi đánh giá.',terms:'Chỉ dành cho sử dụng cá nhân',accept:'Tôi hiểu, tiếp tục',loading:'Đang tải tùy chọn đọc…',failed:'Tùy chọn đọc tạm thời không khả dụng.',sent:'Tiếp tục trong chat riêng với bot để nhận tệp.'},
    fr:{reader:'Traduction Dollar TL',rating:'Note',rate:'Noter ce titre',download:'Télécharger',thank:'Merci et télécharger',openBot:'Ouvrir le chat privé du bot',quota:'Téléchargements du jour',unlimited:'Boosty · Téléchargements illimités',requires:'Téléchargez ce titre avant de le noter.',terms:'Usage personnel uniquement',accept:'J’ai compris, continuer',loading:'Chargement des options…',failed:'Les options de lecture sont temporairement indisponibles.',sent:'Continuez dans le chat privé du bot pour recevoir les fichiers.'},
    de:{reader:'Dollar-TL-Übersetzung',rating:'Bewertung',rate:'Titel bewerten',download:'Herunterladen',thank:'Danke & herunterladen',openBot:'Privaten Bot-Chat öffnen',quota:'Downloads heute',unlimited:'Boosty · Unbegrenzte Downloads',requires:'Lade diesen Titel herunter, bevor du ihn bewertest.',terms:'Nur zur persönlichen Nutzung',accept:'Verstanden, weiter',loading:'Reader-Optionen werden geladen…',failed:'Reader-Optionen sind vorübergehend nicht verfügbar.',sent:'Im privaten Bot-Chat fortfahren, um die Dateien zu erhalten.'},
    ur:{reader:'Dollar TL ترجمہ',rating:'ریٹنگ',rate:'ریٹنگ دیں',download:'ڈاؤن لوڈ',thank:'شکریہ اور ڈاؤن لوڈ',openBot:'نجی بوٹ چیٹ کھولیں',quota:'آج کے ڈاؤن لوڈ',unlimited:'Boosty · لامحدود ڈاؤن لوڈ',requires:'ریٹنگ دینے سے پہلے یہ عنوان ڈاؤن لوڈ کریں۔',terms:'صرف ذاتی استعمال کے لیے',accept:'سمجھ گیا، جاری رکھیں',loading:'ریڈر آپشنز لوڈ ہو رہے ہیں…',failed:'ریڈر آپشنز عارضی طور پر دستیاب نہیں۔',sent:'فائلیں حاصل کرنے کے لیے نجی بوٹ چیٹ میں جاری رکھیں۔'},
  };
  const locale=()=>COPY[app.state.locale]?app.state.locale:'en';
  const tr=k=>COPY[locale()][k]||COPY.en[k]||k;
  const esc=(v='')=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function novel(){const row=app.state.detailNovel;return row&&Number(row.id)>0?row:null;}
  function ensureHost(){
    if(app.state.view!=='detail')return null;
    const page=document.querySelector('.live-detail');
    if(!page)return null;
    let host=page.querySelector('[data-reader-title-ui]');
    if(!host){host=document.createElement('section');host.className='reader-title-card';host.dataset.readerTitleUi='1';const history=page.querySelector('[data-title-release-history]');if(history)history.before(host);else{const actions=page.querySelector('.live-detail-actions');if(actions)actions.before(host);else page.append(host);}}
    return host;
  }

  async function load(id){
    if(cache.get(id)?.status==='loading')return;
    const epoch=refreshEpoch;
    cache.set(id,{status:'loading'});mount();
    try{
      const [detail,state]=await Promise.all([app.api(`/api/app/reader/title/${id}`),readerState?Promise.resolve(readerState):app.api('/api/app/reader/state')]);
      if(epoch!==refreshEpoch)return;
      readerState=state;cache.set(id,{status:'ready',detail});
    }catch(error){if(epoch===refreshEpoch)cache.set(id,{status:'error',error});}
    if(epoch===refreshEpoch&&Number(novel()?.id)===id)mount();
  }

  function mount(){
    const row=novel(),host=ensureHost();if(!row||!host)return;
    const entry=cache.get(Number(row.id));
    if(!entry){host.innerHTML=`<div class="reader-title-state">${esc(tr('loading'))}</div>`;if(!app.state.preview)void load(Number(row.id));return;}
    if(entry.status==='loading'){host.innerHTML=`<div class="reader-title-state">${esc(tr('loading'))}</div>`;return;}
    if(entry.status==='error'){host.innerHTML=`<div class="reader-title-state error">${esc(tr('failed'))}</div>`;return;}
    render(host,row,entry.detail);
  }

  function render(host,row,data){
    const rating=data?.rating||{};const latest=data?.releases?.[0];const state=readerState||{};
    const quota=state.quota||{};
    const quotaText=quota.unlimited?tr('unlimited'):`${tr('quota')}: ${Number(quota.used||0)} / ${Number(quota.limit||5)}`;
    const stars=[1,2,3,4,5].map(value=>`<button type="button" class="reader-star${Number(rating.mine)===value?' active':''}" data-reader-rate="${value}" ${rating.can_rate?'':'disabled'} aria-label="${value}/5">★</button>`).join('');
    host.innerHTML=`
      <div class="reader-title-head"><div><span class="reader-kicker">${esc(tr('reader'))}</span><h2>${esc(tr('download'))}</h2></div><span class="reader-quota${quota.unlimited?' unlimited':''}">${esc(quotaText)}</span></div>
      <div class="reader-rating"><div><strong>${rating.average?`★ ${Number(rating.average).toFixed(2)}`:'—'}</strong><span>${Number(rating.count||0)} · ${esc(tr('rating'))}</span></div><div class="reader-stars">${stars}</div></div>
      ${!rating.can_rate?`<p class="reader-hint">${esc(tr('requires'))}</p>`:''}
      ${latest?`<div class="reader-download-row"><div><strong>${esc(releaseLabel(latest))}</strong><small>${Number(latest.file_count||0)} file${Number(latest.file_count)===1?'':'s'}</small></div><button class="primary-button reader-thank" type="button" data-reader-thank="${Number(latest.id)}">${esc(tr('thank'))}</button></div>`:''}
      <div class="reader-terms"><strong>${esc(state.terms?.title||tr('terms'))}</strong><p>${esc(state.terms?.body||'')}</p></div>`;
    host.querySelectorAll('[data-reader-rate]').forEach(button=>button.addEventListener('click',()=>void rate(Number(row.id),Number(button.dataset.readerRate))));
    host.querySelector('[data-reader-thank]')?.addEventListener('click',event=>void download(Number(row.id),Number(event.currentTarget.dataset.readerThank),event.currentTarget));
  }

  async function ensureTerms(){
    if(readerState?.terms?.accepted)return true;
    const body=readerState?.terms?.body||'';
    if(!window.confirm(`${readerState?.terms?.title||tr('terms')}\n\n${body}`))return false;
    const result=await app.api('/api/app/reader/terms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    if(readerState?.terms)readerState.terms.accepted=Boolean(result.accepted);
    return Boolean(result.accepted);
  }

  async function download(submissionId,publicationId,button){
    if(button.disabled)return;
    button.disabled=true;
    try{
      if(!(await ensureTerms()))return;
      const result=await app.api(`/api/app/reader/title/${submissionId}/thank-you`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publication_id:publicationId})});
      app.toast(tr('sent'));
      if(result.bot_url){try{tg?.openTelegramLink?.(result.bot_url);}catch{location.href=result.bot_url;}}
    }catch(error){app.toast(error?.message||tr('failed'),'error');}
    finally{button.disabled=false;}
  }

  async function rate(submissionId,value){
    try{await app.api(`/api/app/reader/title/${submissionId}/rating`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rating:value})});cache.delete(submissionId);await load(submissionId);}
    catch(error){app.toast(error?.message||tr('failed'),'error');}
  }

  function refresh(){
    refreshEpoch+=1;
    readerState=null;
    cache.clear();
    const id=Number(novel()?.id);
    if(app.state.view==='detail'&&Number.isSafeInteger(id)&&id>0){mount();if(!app.state.preview)void load(id);}
  }

  function releaseLabel(release){const a=Number(release.chapter_start),b=Number(release.chapter_end);if(a>0&&b>0)return a===b?`Chapter ${a}`:`Chapters ${a}–${b}`;return release.title||tr('download');}
  const remount=()=>queueMicrotask(mount);
  document.addEventListener('dtl:detail',remount);
  document.addEventListener('dtl:viewrender',event=>{if(event.detail?.view==='detail')remount();});
  document.addEventListener('dtl:localechange',()=>{readerState=null;cache.clear();remount();});
  document.addEventListener('dtl:datarefresh',refresh);
  window.DTL_READER_TITLE=Object.freeze({mount,cache,refresh});
})();
