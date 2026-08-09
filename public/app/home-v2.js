(() => {
  const tg = window.Telegram?.WebApp;
  const view = document.getElementById('viewRoot');
  const regionalFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
  let releasesCache = null;
  let releasesAt = 0;
  let request = null;
  let scheduled = false;

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

  const languageMatchers = [
    ['kr',['korean','корей','coreano','coréen','koreanisch','korea','hàn quốc','कोरियाई','한국']],
    ['jp',['japanese','япон','japonés','japonês','japonais','japanisch','jepang','nhật','जापानी','日本']],
    ['cn',['chinese','китай','chino','chinês','chinois','chinesisch','tiongkok','trung quốc','चीनी','中文']],
    ['gb',['english','англ','inglés','inglês','anglais','englisch','inggris','tiếng anh','अंग्रेज़ी']],
    ['ru',['russian','русск','ruso','russo','russe','russisch','rusia','nga','रूसी']],
    ['es',['spanish','испан','español','espagnol','spanisch','spanyol','tây ban nha','स्पेनिश']],
    ['pt',['portuguese','португал','português','portugais','portugiesisch','portugis','bồ đào nha','पुर्तगाली']],
    ['id',['indonesian','индонез','indonesio','indonésien','indonesisch','indonesia','इंडोनेशियाई']],
    ['vn',['vietnamese','вьетнам','vietnamita','vietnamien','vietnamesisch','vietnam','việt nam','वियतनामी']],
    ['fr',['french','француз','francés','francês','français','französisch','prancis','pháp','फ़्रेंच']],
    ['de',['german','немец','alemán','alemão','allemand','deutsch','jerman','đức','जर्मन']],
    ['in',['hindi','хинди','hindi','हिन्दी','हिंदी']],
    ['ph',['filipino','филиппин','filipino','philippin','filipino']],
  ];

  function locale(){
    const value = String(window.__DTL_LOCALE__ || document.documentElement.lang || tg?.initDataUnsafe?.user?.language_code || 'en').toLowerCase();
    return copy[value] ? value : 'en';
  }
  function t(){ return copy[locale()] || copy.en; }
  function esc(value=''){ return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function detectFlag(text=''){
    const raw=String(text).toLowerCase();
    for(const [code,terms] of languageMatchers) if(terms.some(term=>raw.includes(term))) return code;
    return null;
  }
  function flagMarkup(code){ return code ? `<span class="dtl-country-flag flag-${code}" aria-hidden="true"></span>` : ''; }

  function decorateFlags(){
    const selectors=['.novel-meta > span:first-child','.list-meta','.review-sub'];
    for(const el of document.querySelectorAll(selectors.join(','))){
      if(el.querySelector('.dtl-country-flag')) continue;
      const raw=(el.textContent||'').replace(regionalFlags,'').replace(/^\s+/,'');
      const code=detectFlag(raw); if(!code) continue;
      el.textContent=raw;
      el.insertAdjacentHTML('afterbegin',flagMarkup(code)+' ');
    }
  }

  function formatDate(value){
    if(!value) return '';
    const tags={en:'en-US',es:'es-ES',fil:'fil-PH',hi:'hi-IN',pt:'pt-BR',id:'id-ID',vi:'vi-VN',fr:'fr-FR',de:'de-DE',ru:'ru-RU'};
    try{return new Intl.DateTimeFormat(tags[locale()]||'en-US',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value);}
  }

  async function getReleases(){
    if(releasesCache && Date.now()-releasesAt<30000) return releasesCache;
    if(request) return request;
    if(!tg?.initData) return [];
    request=fetch('/api/app/releases',{headers:{'x-telegram-init-data':tg.initData}})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||`HTTP ${r.status}`);return Array.isArray(d.releases)?d.releases:[];})
      .then(rows=>{releasesCache=rows;releasesAt=Date.now();return rows;})
      .finally(()=>{request=null;});
    return request;
  }

  function releaseCard(row){
    const c=t();
    const image=row.has_image&&row.image_url
      ? `<img src="${esc(row.image_url)}" alt="" loading="lazy">`
      : '<i data-lucide="book-open-check" aria-hidden="true"></i>';
    const meta=[formatDate(row.published_at),Number(row.file_count)>0?c.files(Number(row.file_count)):null].filter(Boolean).map(esc).join('<span>·</span>');
    const inner=`<span class="dtl-release-thumb">${image}</span><span class="dtl-release-main"><strong>${esc(row.title)}</strong>${row.excerpt?`<p>${esc(row.excerpt)}</p>`:''}<span class="dtl-release-meta">${meta}</span></span>${row.telegram_url?'<span class="dtl-release-open">›</span>':''}`;
    return row.telegram_url
      ? `<a class="dtl-release-card dtl-release-link" href="${esc(row.telegram_url)}" aria-label="${esc(c.open)}: ${esc(row.title)}">${inner}</a>`
      : `<article class="dtl-release-card">${inner}</article>`;
  }

  function ensureSection(){
    const requestsButton=document.getElementById('homeRequests');
    const queueButton=document.getElementById('homeQueue');
    if(!requestsButton||!queueButton) return null;
    const requestsSection=requestsButton.closest('.section');
    if(!requestsSection) return null;
    let section=document.querySelector('.dtl-releases-section');
    if(!section){
      section=document.createElement('section');
      section.className='section dtl-releases-section';
      section.innerHTML='<div class="dtl-releases-loading" aria-hidden="true"></div>';
      requestsSection.parentNode.insertBefore(section,requestsSection);
    }
    return section;
  }

  async function renderReleases(){
    const section=ensureSection(); if(!section) return;
    const c=t();
    if(!section.dataset.loaded){
      section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div><div class="dtl-releases-loading" aria-hidden="true"></div>`;
    }else{
      const h=section.querySelector('h2'),p=section.querySelector('.subtitle');if(h)h.textContent=c.title;if(p)p.textContent=c.subtitle;
    }
    try{
      const rows=await getReleases();
      if(!section.isConnected) return;
      section.dataset.loaded='1';
      section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div>${rows.length?`<div class="dtl-release-list">${rows.slice(0,4).map(releaseCard).join('')}</div>`:`<div class="surface-card empty-state"><div class="empty-icon">✓</div><p>${esc(c.empty)}</p></div>`}`;
      try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
    }catch{
      section.dataset.loaded='1';
      section.innerHTML=`<div class="section-header"><div class="dtl-releases-copy"><h2>${esc(c.title)}</h2><p class="subtitle">${esc(c.subtitle)}</p></div></div><div class="surface-card empty-state"><div class="empty-icon">◇</div><p>${esc(c.empty)}</p></div>`;
    }
  }

  function enhance(){
    decorateFlags();
    if(document.getElementById('homeQueue')&&document.getElementById('homeRequests')) renderReleases();
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}

  document.addEventListener('click',event=>{
    const link=event.target.closest?.('.dtl-release-link');
    if(link&&tg?.openTelegramLink){event.preventDefault();tg.openTelegramLink(link.href);return;}
    if(event.target.closest?.('[data-nav="home"],.brand')) setTimeout(schedule,0);
  },true);
  document.addEventListener('dtl:localechange',()=>{releasesAt=0;schedule();});
  if(view)new MutationObserver(schedule).observe(view,{childList:true,subtree:false});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
