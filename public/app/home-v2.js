(() => {
  const tg = window.Telegram?.WebApp;
  const runtime = window.DTL_RUNTIME;
  const app = window.DTL_APP;
  if (!runtime?.locale) throw new Error('DTL runtime core must load before home-v2.js');

  let releases = null;
  let loading = null;

  const copy = {
    en:{title:'Library',subtitle:'Read and download Dollar TL translations.',empty:'No translated titles have been published yet.',open:'Open title',files:n=>`${n} file${n===1?'':'s'}`,chapter:'Ch.'},
    ru:{title:'Библиотека',subtitle:'Читайте и скачивайте переводы Dollar TL.',empty:'Опубликованных переводов пока нет.',open:'Открыть тайтл',files:n=>`${n} файл${n%10===1&&n%100!==11?'':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'а':'ов'}`,chapter:'Гл.'},
    es:{title:'Biblioteca',subtitle:'Lee y descarga traducciones de Dollar TL.',empty:'Todavía no hay títulos traducidos publicados.',open:'Abrir título',files:n=>`${n} archivo${n===1?'':'s'}`,chapter:'Cap.'},
    fil:{title:'Library',subtitle:'Basahin at i-download ang Dollar TL translations.',empty:'Wala pang published na translated titles.',open:'Buksan ang title',files:n=>`${n} file`,chapter:'Ch.'},
    hi:{title:'लाइब्रेरी',subtitle:'Dollar TL अनुवाद पढ़ें और डाउनलोड करें।',empty:'अभी कोई अनुवादित शीर्षक प्रकाशित नहीं हुआ है।',open:'शीर्षक खोलें',files:n=>`${n} फ़ाइल`,chapter:'अध्याय'},
    pt:{title:'Biblioteca',subtitle:'Leia e baixe traduções da Dollar TL.',empty:'Ainda não há títulos traduzidos publicados.',open:'Abrir título',files:n=>`${n} arquivo${n===1?'':'s'}`,chapter:'Cap.'},
    id:{title:'Perpustakaan',subtitle:'Baca dan unduh terjemahan Dollar TL.',empty:'Belum ada judul terjemahan yang diterbitkan.',open:'Buka judul',files:n=>`${n} berkas`,chapter:'Bab'},
    vi:{title:'Thư viện',subtitle:'Đọc và tải các bản dịch Dollar TL.',empty:'Chưa có tác phẩm dịch nào được xuất bản.',open:'Mở tác phẩm',files:n=>`${n} tệp`,chapter:'Ch.'},
    fr:{title:'Bibliothèque',subtitle:'Lisez et téléchargez les traductions Dollar TL.',empty:'Aucun titre traduit n’a encore été publié.',open:'Ouvrir le titre',files:n=>`${n} fichier${n===1?'':'s'}`,chapter:'Ch.'},
    de:{title:'Bibliothek',subtitle:'Dollar-TL-Übersetzungen lesen und herunterladen.',empty:'Noch keine übersetzten Titel veröffentlicht.',open:'Titel öffnen',files:n=>`${n} Datei${n===1?'':'en'}`,chapter:'Kap.'},
    ur:{title:'لائبریری',subtitle:'Dollar TL تراجم پڑھیں اور ڈاؤن لوڈ کریں۔',empty:'ابھی کوئی ترجمہ شدہ عنوان شائع نہیں ہوا۔',open:'عنوان کھولیں',files:n=>`${n} فائل`,chapter:'باب'},
  };

  function locale(){ const value=runtime.locale(); return copy[value]?value:'en'; }
  function t(){ return copy[locale()] || copy.en; }
  function esc(value=''){ return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function formatDate(value){
    if(!value) return '';
    const tags={en:'en-US',es:'es-ES',fil:'fil-PH',hi:'hi-IN',pt:'pt-BR',id:'id-ID',vi:'vi-VN',fr:'fr-FR',de:'de-DE',ru:'ru-RU',ur:'ur-PK'};
    try{return new Intl.DateTimeFormat(tags[locale()]||'en-US',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value);}
  }

  function rerenderIfHome(){ if(window.DTL_APP?.state?.view==='home')renderHomeReleaseSection(); }

  function loadReleases(){
    if(releases) return Promise.resolve(releases);
    if(loading) return loading;
    if(!tg?.initData){ releases=[]; queueMicrotask(rerenderIfHome); return Promise.resolve(releases); }
    loading=fetch('/api/app/releases',{cache:'no-store',headers:{'x-telegram-init-data':tg.initData}})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`HTTP ${r.status}`);return Array.isArray(d.releases)?d.releases:[];})
      .then(rows=>{releases=rows;return rows;})
      .catch(()=>{releases=[];return[];})
      .finally(()=>{loading=null;rerenderIfHome();});
    return loading;
  }

  function releaseCard(row){
    const c=t();
    const image=row.has_image&&row.image_url
      ? `<img src="${esc(row.image_url)}" alt="" loading="lazy">`
      : '<i data-lucide="book-open-check" aria-hidden="true"></i>';
    const rating=Number(row.rating_count)>0&&Number(row.rating_average)>0?`★ ${Number(row.rating_average).toFixed(1)} (${Number(row.rating_count)})`:null;
    const chapter=Number(row.chapter_end)>0?`${c.chapter} ${Number(row.chapter_end)}`:null;
    const meta=[rating,chapter,formatDate(row.published_at)].filter(Boolean).map(esc).join('<span>·</span>');
    const inner=`<span class="dtl-release-thumb">${image}</span><span class="dtl-release-main"><strong>${esc(row.title)}</strong>${row.excerpt?`<p>${esc(row.excerpt)}</p>`:''}<span class="dtl-release-meta">${meta}</span></span><span class="dtl-release-open" aria-hidden="true"><i data-lucide="circle-arrow-right"></i></span>`;
    return row.submission_id
      ? `<button type="button" class="dtl-release-card dtl-release-link" data-reader-title="${Number(row.submission_id)}" aria-label="${esc(c.open)}: ${esc(row.title)}">${inner}</button>`
      : `<article class="dtl-release-card">${inner}</article>`;
  }

  function ensureSection(){
    const requestsButton=document.getElementById('homeRequests');
    const queueButton=document.getElementById('homeQueue');
    if(!requestsButton||!queueButton)return null;
    const requestsSection=requestsButton.closest('.section');
    if(!requestsSection)return null;
    let section=document.querySelector('.dtl-releases-section');
    if(!section){section=document.createElement('section');section.className='section dtl-releases-section';requestsSection.parentNode.insertBefore(section,requestsSection);}
    return section;
  }

  function renderSection(section){
    const c=t();
    const stateKey=`${locale()}:${releases===null?'loading':releases.length}`;
    if(section.dataset.releaseState===stateKey)return;
    section.dataset.releaseState=stateKey;
    if(releases===null){
      section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div><div class="dtl-releases-loading" aria-hidden="true"></div>`;
      loadReleases();return;
    }
    section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div>${releases.length?`<div class="dtl-release-list">${releases.slice(0,6).map(releaseCard).join('')}</div>`:`<div class="surface-card empty-state"><div class="empty-icon">✓</div><p>${esc(c.empty)}</p></div>`}`;
    if(window.lucide?.createIcons)window.lucide.createIcons({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});
  }

  function renderHomeReleaseSection(){ const section=ensureSection(); if(section)renderSection(section); }

  document.addEventListener('dtl:home',renderHomeReleaseSection);
  document.addEventListener('dtl:localechange',rerenderIfHome);
  document.addEventListener('click',event=>{
    const card=event.target.closest?.('[data-reader-title]');
    if(!card)return;
    event.preventDefault();
    const id=Number(card.dataset.readerTitle);
    if(Number.isSafeInteger(id)&&id>0&&typeof app?.openNovel==='function')app.openNovel(id);
    else if(Number.isSafeInteger(id)&&id>0)location.href=`/app/?title=${id}`;
  },true);
})();
