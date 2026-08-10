(() => {
  const tg = window.Telegram?.WebApp;
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime core must load before home-v2.js');

  let owner = null;
  let releases = null;
  let loading = null;
  let generation = 0;

  const copy = {
    en:{title:'Translated Chapters',subtitle:'The latest chapters released by Dollar TL.',empty:'No translated chapters have been published yet.',open:'Open release',files:n=>`${n} file${n===1?'':'s'}`},
    ru:{title:'Переведённые главы',subtitle:'Последние главы, выпущенные Dollar TL.',empty:'Переведённых глав пока нет.',open:'Открыть релиз',files:n=>`${n} файл${n%10===1&&n%100!==11?'':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'а':'ов'}`},
    es:{title:'Capítulos traducidos',subtitle:'Los últimos capítulos publicados por Dollar TL.',empty:'Todavía no se han publicado capítulos traducidos.',open:'Abrir publicación',files:n=>`${n} archivo${n===1?'':'s'}`},
    fil:{title:'Mga naisaling kabanata',subtitle:'Pinakabagong mga kabanatang inilabas ng Dollar TL.',empty:'Wala pang nailalabas na naisaling kabanata.',open:'Buksan ang release',files:n=>`${n} file`},
    hi:{title:'अनुवादित अध्याय',subtitle:'Dollar TL द्वारा जारी नवीनतम अध्याय।',empty:'अभी कोई अनुवादित अध्याय प्रकाशित नहीं हुआ है।',open:'रिलीज़ खोलें',files:n=>`${n} फ़ाइल`},
    pt:{title:'Capítulos traduzidos',subtitle:'Os capítulos mais recentes publicados pela Dollar TL.',empty:'Ainda não há capítulos traduzidos publicados.',open:'Abrir lançamento',files:n=>`${n} arquivo${n===1?'':'s'}`},
    id:{title:'Bab yang diterjemahkan',subtitle:'Bab terbaru yang dirilis Dollar TL.',empty:'Belum ada bab terjemahan yang diterbitkan.',open:'Buka rilis',files:n=>`${n} berkas`},
    vi:{title:'Các chương đã dịch',subtitle:'Những chương mới nhất do Dollar TL phát hành.',empty:'Chưa có chương dịch nào được phát hành.',open:'Mở bản phát hành',files:n=>`${n} tệp`},
    fr:{title:'Chapitres traduits',subtitle:'Les derniers chapitres publiés par Dollar TL.',empty:'Aucun chapitre traduit n’a encore été publié.',open:'Ouvrir la publication',files:n=>`${n} fichier${n===1?'':'s'}`},
    de:{title:'Übersetzte Kapitel',subtitle:'Die neuesten von Dollar TL veröffentlichten Kapitel.',empty:'Noch keine übersetzten Kapitel veröffentlicht.',open:'Release öffnen',files:n=>`${n} Datei${n===1?'':'en'}`},
  };

  function locale(){
    const value = runtime.locale();
    return copy[value] ? value : 'en';
  }
  function t(){ return copy[locale()] || copy.en; }
  function esc(value=''){ return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function formatDate(value){
    if(!value) return '';
    const tags={en:'en-US',es:'es-ES',fil:'fil-PH',hi:'hi-IN',pt:'pt-BR',id:'id-ID',vi:'vi-VN',fr:'fr-FR',de:'de-DE',ru:'ru-RU'};
    try{return new Intl.DateTimeFormat(tags[locale()]||'en-US',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value);}
  }

  function resetForOwner(nextOwner){
    if(owner===nextOwner)return;
    owner=nextOwner;
    releases=null;
    loading=null;
    generation+=1;
  }

  function loadReleases(){
    if(releases) return Promise.resolve(releases);
    if(loading) return loading;
    if(!tg?.initData){releases=[];return Promise.resolve(releases);}
    const token=generation;
    loading=fetch('/api/app/releases',{
      cache:'no-store',
      headers:{'x-telegram-init-data':tg.initData},
    })
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`HTTP ${r.status}`);return Array.isArray(d.releases)?d.releases:[];})
      .then(rows=>{if(token===generation)releases=rows;return rows;})
      .catch(()=>{if(token===generation)releases=[];return[];})
      .finally(()=>{if(token===generation)loading=null;runtime.schedule();});
    return loading;
  }

  function releaseCard(row){
    const c=t();
    const image=row.has_image&&row.image_url
      ? `<img src="${esc(row.image_url)}" alt="" loading="lazy">`
      : '<i data-lucide="book-open-check" aria-hidden="true"></i>';
    const meta=[formatDate(row.published_at),Number(row.file_count)>0?c.files(Number(row.file_count)):null].filter(Boolean).map(esc).join('<span>·</span>');
    const openIcon=row.telegram_url?'<span class="dtl-release-open" aria-hidden="true"><i data-lucide="circle-arrow-right"></i></span>':'';
    const inner=`<span class="dtl-release-thumb">${image}</span><span class="dtl-release-main"><strong>${esc(row.title)}</strong>${row.excerpt?`<p>${esc(row.excerpt)}</p>`:''}<span class="dtl-release-meta">${meta}</span></span>${openIcon}`;
    return row.telegram_url
      ? `<a class="dtl-release-card dtl-release-link" href="${esc(row.telegram_url)}" aria-label="${esc(c.open)}: ${esc(row.title)}">${inner}</a>`
      : `<article class="dtl-release-card">${inner}</article>`;
  }

  function ensureSection(){
    const requestsButton=document.getElementById('homeRequests');
    const queueButton=document.getElementById('homeQueue');
    if(!requestsButton||!queueButton){owner=null;return null;}
    const requestsSection=requestsButton.closest('.section');
    if(!requestsSection){owner=null;return null;}
    resetForOwner(requestsSection);
    let section=document.querySelector('.dtl-releases-section');
    if(!section){
      section=document.createElement('section');
      section.className='section dtl-releases-section';
      requestsSection.parentNode.insertBefore(section,requestsSection);
    }
    return section;
  }

  function renderSection(section){
    const c=t();
    const stateKey=`${locale()}:${releases===null?'loading':releases.length}:${generation}`;
    if(section.dataset.releaseState===stateKey)return;
    section.dataset.releaseState=stateKey;
    if(releases===null){
      section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div><div class="dtl-releases-loading" aria-hidden="true"></div>`;
      loadReleases();
      return;
    }
    section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div>${releases.length?`<div class="dtl-release-list">${releases.slice(0,4).map(releaseCard).join('')}</div>`:`<div class="surface-card empty-state"><div class="empty-icon">✓</div><p>${esc(c.empty)}</p></div>`}`;
  }

  function patch(){
    const section=ensureSection();
    if(section)renderSection(section);
  }

  document.addEventListener('click',event=>{
    const link=event.target.closest?.('.dtl-release-link');
    if(link&&tg?.openTelegramLink){event.preventDefault();tg.openTelegramLink(link.href);}
  },true);

  runtime.registerPatcher(patch);
})();
