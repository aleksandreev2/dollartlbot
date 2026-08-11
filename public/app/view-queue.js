(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-queue.js');
  const {state,viewRoot,tr,copy,escapeHtml,languageFlag,languageName,cover,relativeTime,tagLabel}=app;
  const c=app.components;

  const DETAIL_COPY={
    en:{live:'Currently translating',completed:'Translation completed',queued:'Waiting in queue',progress:'Translation progress',translated:'translated',current:'Current chapter',remaining:'Remaining',complete:'Complete',start:'Start',finish:'Complete',updated:'Updated',started:'Translation started',about:'About this novel',language:'Original language',publication:'Publication status',chapters:'Chapters',activity:'Translation activity',working:'Current translation progress',workingSub:'The team is actively translating this title.',completedSub:'Translation has been marked complete.',queuedSub:'This title is waiting for translation to begin.',openOriginal:'Open original',viewQueue:'View queue',ongoing:'Ongoing',finished:'Completed',unknown:'Unknown',requested:'Requested by'},
    es:{live:'Traduciendo ahora',completed:'Traducción completada',queued:'En espera en la cola',progress:'Progreso de traducción',translated:'traducido',current:'Capítulo actual',remaining:'Restantes',complete:'Completado',start:'Inicio',finish:'Final',updated:'Actualizado',started:'Traducción iniciada',about:'Sobre esta novela',language:'Idioma original',publication:'Estado de publicación',chapters:'Capítulos',activity:'Actividad de traducción',working:'Progreso actual de traducción',workingSub:'El equipo está traduciendo activamente este título.',completedSub:'La traducción se ha marcado como completada.',queuedSub:'Este título está esperando a que comience la traducción.',openOriginal:'Abrir original',viewQueue:'Ver cola',ongoing:'En publicación',finished:'Completada',unknown:'Desconocido',requested:'Solicitado por'},
    fil:{live:'Kasalukuyang isinasalin',completed:'Tapos na ang pagsasalin',queued:'Naghihintay sa pila',progress:'Progreso ng pagsasalin',translated:'naisalin',current:'Kasalukuyang kabanata',remaining:'Natitira',complete:'Kumpleto',start:'Simula',finish:'Tapos',updated:'Na-update',started:'Nagsimula ang pagsasalin',about:'Tungkol sa nobelang ito',language:'Orihinal na wika',publication:'Status ng publikasyon',chapters:'Mga kabanata',activity:'Aktibidad ng pagsasalin',working:'Kasalukuyang progreso',workingSub:'Aktibong isinasalin ng team ang titulong ito.',completedSub:'Minarkahang kumpleto ang pagsasalin.',queuedSub:'Naghihintay ang titulong ito na simulan ang pagsasalin.',openOriginal:'Buksan ang orihinal',viewQueue:'Tingnan ang pila',ongoing:'Patuloy',finished:'Kumpleto',unknown:'Hindi alam',requested:'Hiniling ni'},
    hi:{live:'अभी अनुवाद हो रहा है',completed:'अनुवाद पूरा हुआ',queued:'कतार में प्रतीक्षा',progress:'अनुवाद प्रगति',translated:'अनुवादित',current:'वर्तमान अध्याय',remaining:'बाकी',complete:'पूर्ण',start:'शुरुआत',finish:'पूर्ण',updated:'अपडेट',started:'अनुवाद शुरू हुआ',about:'इस उपन्यास के बारे में',language:'मूल भाषा',publication:'प्रकाशन स्थिति',chapters:'अध्याय',activity:'अनुवाद गतिविधि',working:'वर्तमान अनुवाद प्रगति',workingSub:'टीम इस शीर्षक का सक्रिय रूप से अनुवाद कर रही है।',completedSub:'अनुवाद को पूर्ण चिह्नित किया गया है।',queuedSub:'यह शीर्षक अनुवाद शुरू होने की प्रतीक्षा में है।',openOriginal:'मूल खोलें',viewQueue:'कतार देखें',ongoing:'जारी',finished:'पूर्ण',unknown:'अज्ञात',requested:'अनुरोध किया'},
    pt:{live:'Em tradução agora',completed:'Tradução concluída',queued:'Aguardando na fila',progress:'Progresso da tradução',translated:'traduzido',current:'Capítulo atual',remaining:'Restantes',complete:'Concluído',start:'Início',finish:'Fim',updated:'Atualizado',started:'Tradução iniciada',about:'Sobre esta novel',language:'Idioma original',publication:'Status de publicação',chapters:'Capítulos',activity:'Atividade da tradução',working:'Progresso atual da tradução',workingSub:'A equipe está traduzindo este título agora.',completedSub:'A tradução foi marcada como concluída.',queuedSub:'Este título aguarda o início da tradução.',openOriginal:'Abrir original',viewQueue:'Ver fila',ongoing:'Em andamento',finished:'Concluída',unknown:'Desconhecido',requested:'Solicitado por'},
    id:{live:'Sedang diterjemahkan',completed:'Terjemahan selesai',queued:'Menunggu di antrean',progress:'Progres terjemahan',translated:'diterjemahkan',current:'Bab saat ini',remaining:'Tersisa',complete:'Selesai',start:'Mulai',finish:'Selesai',updated:'Diperbarui',started:'Terjemahan dimulai',about:'Tentang novel ini',language:'Bahasa asli',publication:'Status publikasi',chapters:'Bab',activity:'Aktivitas terjemahan',working:'Progres terjemahan saat ini',workingSub:'Tim sedang aktif menerjemahkan judul ini.',completedSub:'Terjemahan telah ditandai selesai.',queuedSub:'Judul ini menunggu proses terjemahan dimulai.',openOriginal:'Buka sumber asli',viewQueue:'Lihat antrean',ongoing:'Berjalan',finished:'Selesai',unknown:'Tidak diketahui',requested:'Diminta oleh'},
    vi:{live:'Đang được dịch',completed:'Đã dịch xong',queued:'Đang chờ trong hàng',progress:'Tiến độ dịch',translated:'đã dịch',current:'Chương hiện tại',remaining:'Còn lại',complete:'Hoàn thành',start:'Bắt đầu',finish:'Hoàn tất',updated:'Cập nhật',started:'Bắt đầu dịch',about:'Về tiểu thuyết này',language:'Ngôn ngữ gốc',publication:'Trạng thái xuất bản',chapters:'Chương',activity:'Hoạt động dịch',working:'Tiến độ dịch hiện tại',workingSub:'Đội ngũ đang tích cực dịch tác phẩm này.',completedSub:'Bản dịch đã được đánh dấu hoàn tất.',queuedSub:'Tác phẩm này đang chờ bắt đầu dịch.',openOriginal:'Mở bản gốc',viewQueue:'Xem hàng đợi',ongoing:'Đang tiếp tục',finished:'Hoàn thành',unknown:'Không rõ',requested:'Được yêu cầu bởi'},
    fr:{live:'Traduction en cours',completed:'Traduction terminée',queued:'En attente dans la file',progress:'Progression de la traduction',translated:'traduit',current:'Chapitre actuel',remaining:'Restants',complete:'Terminé',start:'Début',finish:'Fin',updated:'Mis à jour',started:'Traduction commencée',about:'À propos de ce roman',language:'Langue originale',publication:'Statut de publication',chapters:'Chapitres',activity:'Activité de traduction',working:'Progression actuelle',workingSub:'L’équipe traduit activement ce titre.',completedSub:'La traduction a été marquée comme terminée.',queuedSub:'Ce titre attend le début de la traduction.',openOriginal:'Ouvrir l’original',viewQueue:'Voir la file',ongoing:'En cours',finished:'Terminé',unknown:'Inconnu',requested:'Demandé par'},
    de:{live:'Wird gerade übersetzt',completed:'Übersetzung abgeschlossen',queued:'Wartet in der Warteschlange',progress:'Übersetzungsfortschritt',translated:'übersetzt',current:'Aktuelles Kapitel',remaining:'Verbleibend',complete:'Fertig',start:'Start',finish:'Fertig',updated:'Aktualisiert',started:'Übersetzung gestartet',about:'Über diesen Roman',language:'Originalsprache',publication:'Veröffentlichungsstatus',chapters:'Kapitel',activity:'Übersetzungsaktivität',working:'Aktueller Übersetzungsfortschritt',workingSub:'Das Team übersetzt diesen Titel gerade aktiv.',completedSub:'Die Übersetzung wurde als abgeschlossen markiert.',queuedSub:'Dieser Titel wartet auf den Start der Übersetzung.',openOriginal:'Original öffnen',viewQueue:'Warteschlange öffnen',ongoing:'Laufend',finished:'Abgeschlossen',unknown:'Unbekannt',requested:'Angefragt von'},
    ru:{live:'Сейчас переводим',completed:'Перевод завершён',queued:'Ожидает в очереди',progress:'Прогресс перевода',translated:'переведено',current:'Текущая глава',remaining:'Осталось',complete:'Готово',start:'Старт',finish:'Готово',updated:'Обновлено',started:'Перевод начат',about:'О новелле',language:'Язык оригинала',publication:'Статус оригинала',chapters:'Главы',activity:'Активность перевода',working:'Текущий прогресс перевода',workingSub:'Команда прямо сейчас работает над этим тайтлом.',completedSub:'Перевод отмечен как завершённый.',queuedSub:'Тайтл ожидает начала перевода.',openOriginal:'Открыть оригинал',viewQueue:'Открыть очередь',ongoing:'Продолжается',finished:'Завершена',unknown:'Неизвестно',requested:'Запросил'},
  };

  function detailLocale(){const value=state.locale||window.DTL_RUNTIME?.locale?.()||'en';return DETAIL_COPY[value]?value:'en';}
  function dt(key){const locale=detailLocale();return DETAIL_COPY[locale]?.[key]||DETAIL_COPY.en[key]||key;}

  function renderQueue() {
    const q=state.bootstrap.queue;
    const active=q.active||[], upcoming=(q.upcoming||[]).filter(row=>matchesLanguage(row,state.queueLanguage));
    viewRoot.innerHTML=`<section class="page"><div class="page-heading"><h1>${escapeHtml(tr('translationQueue'))}</h1><p class="subtitle">${escapeHtml(tr('queueSubtitle'))}</p></div>
    <div class="filter-row">${[['all',tr('all')],['korean',tr('korean')],['japanese',tr('japanese')],['chinese',tr('chinese')]].map(([id,label])=>`<button class="filter-chip${state.queueLanguage===id?' active':''}" type="button" data-q-lang="${id}">${escapeHtml(label)}</button>`).join('')}</div>
    <div class="segmented"><button class="${state.queueSegment==='active'?'active':''}" type="button" data-q-segment="active">⚡ ${escapeHtml(tr('currentlyTranslating'))}</button><button class="${state.queueSegment==='upcoming'?'active':''}" type="button" data-q-segment="upcoming">◷ ${escapeHtml(tr('upNext'))}</button></div>
    ${state.queueSegment==='active'?renderActiveQueue(active):renderUpcomingQueue(upcoming)}
    <div class="small muted" style="text-align:center;margin:22px 10px 0">◇ ${escapeHtml(tr('queueAuto'))}</div></section>`;
    document.querySelectorAll('[data-q-lang]').forEach(btn=>btn.addEventListener('click',()=>{state.queueLanguage=btn.dataset.qLang;app.render();}));
    document.querySelectorAll('[data-q-segment]').forEach(btn=>btn.addEventListener('click',()=>{state.queueSegment=btn.dataset.qSegment;app.render();}));
    c.bindNovelLinks();
  }
  function matchesLanguage(row,filter){
    if(filter==='all')return true;
    const code=window.DTL_RUNTIME?.detectLanguage?.(row.original_language);
    const expected={korean:'ko',japanese:'ja',chinese:'zh'}[filter];
    if(code&&expected)return code===expected;
    return row.original_language?.toLowerCase().includes(filter);
  }
  function renderActiveQueue(rows){if(!rows.length)return c.emptyCard('⚡',tr('noActive'));return `<section class="section" style="margin-top:0"><div class="section-header"><div><h2>⚡ ${escapeHtml(tr('currentlyTranslating'))}</h2><p class="subtitle" style="margin-top:4px">${escapeHtml(tr('currentlyTranslatingDesc'))}</p></div></div><div class="stagger">${rows.map(c.featuredNovel).join('')}</div></section>`;}
  function renderUpcomingQueue(rows){if(!rows.length)return c.emptyCard('◷',tr('queueEmpty'));return `<section class="section" style="margin-top:0"><div class="section-header"><h2>◷ ${escapeHtml(tr('upNext'))}</h2></div><div class="surface-card simple-list">${rows.map((r,i)=>{const language=languageName(r.original_language)||r.original_language;return`<button class="list-row queue-row" type="button" data-novel="${r.id}"><span class="queue-number">${r.queue_position??i+1}</span>${cover(r.title,true)}<span class="list-copy"><span class="list-title">${escapeHtml(r.title)}</span><span class="list-meta">${languageFlag(r.original_language)} ${escapeHtml(language)} · ${r.chapter_count} ${escapeHtml(tr('chapters'))}</span></span><span class="chevron">›</span></button>`;}).join('')}</div></section>`;}

  async function openNovel(id) {
    let novel=[...(state.bootstrap.queue.active||[]),...(state.bootstrap.queue.upcoming||[]),...(state.bootstrap.queue.completed||[]),...(state.bootstrap.my_requests||[])].find(x=>x.id===id);
    if(!state.preview){
      try{
        const fresh=(await app.api(`/api/app/novel/${id}`)).novel;
        if(fresh)novel={...(novel||{}),...fresh};
      }catch(e){
        if(!novel){app.toast(e.message,'error');return;}
      }
    }
    if(!novel)return;
    state.detailNovel=novel;
    app.navigate('detail');
  }

  function parseTags(value){
    if(Array.isArray(value))return value.map(String).map(v=>v.trim()).filter(Boolean).slice(0,10);
    const raw=String(value||'').trim();
    if(!raw)return[];
    if(raw.startsWith('[')){
      try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))return parsed.map(String).map(v=>v.trim()).filter(Boolean).slice(0,10);}catch{}
    }
    return raw.split(/[,;\n|]+/).map(v=>v.trim()).filter(Boolean).slice(0,10);
  }
  function displayTag(value){try{return tagLabel?.(value)||value;}catch{return value;}}
  function dateLocale(){return {en:'en-US',es:'es-ES',fil:'fil-PH',hi:'hi-IN',pt:'pt-PT',id:'id-ID',vi:'vi-VN',fr:'fr-FR',de:'de-DE',ru:'ru-RU'}[detailLocale()]||'en-US';}
  function formatDate(value){
    if(!value)return'';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return'';
    try{return new Intl.DateTimeFormat(dateLocale(),{day:'numeric',month:'short',year:'numeric'}).format(d);}catch{return d.toLocaleDateString();}
  }
  function publicationLabel(status){
    const value=String(status||'').toLowerCase();
    if(value==='completed'||value==='complete'||value==='finished')return dt('finished');
    if(value==='ongoing'||value==='publishing'||value==='serializing')return dt('ongoing');
    return status?String(status):dt('unknown');
  }
  function stateNameOf(novel){return novel.queue_status==='in_progress'?'in_progress':novel.queue_status==='completed'?'completed':novel.queue_status==='queued'?'queued':novel.status==='rejected'?'rejected':'pending';}
  function activityCopy(stateName){
    if(stateName==='in_progress')return [dt('working'),dt('workingSub'),'languages',true];
    if(stateName==='completed')return [dt('completed'),dt('completedSub'),'circle-check-big',false];
    if(stateName==='queued')return [dt('queued'),dt('queuedSub'),'clock-3',false];
    return [tr('status'),tr(stateName),'circle',false];
  }
  function requesterAttribution(novel){
    const username=String(novel.requester_username||'').trim().replace(/^@/,'');
    const safe=/^[A-Za-z0-9_]{5,32}$/.test(username)?username:'';
    if(safe)return `<a href="https://t.me/${escapeHtml(safe)}" target="_blank" rel="noopener">@${escapeHtml(safe)}</a>`;
    return `<strong>#${Number(novel.id)||'—'}</strong>`;
  }

  function renderDetail(){
    const novel=state.detailNovel;
    if(!novel){app.navigate(state.previousView||'queue',false);return;}
    const total=Math.max(0,Number(novel.chapter_count)||0);
    const current=Math.max(0,Math.min(total||Number.MAX_SAFE_INTEGER,Number(novel.current_chapter)||0));
    const progress=Number.isFinite(Number(novel.progress_percent))?Math.max(0,Math.min(100,Number(novel.progress_percent))):(total?Math.round(current/total*100):0);
    const remaining=Math.max(0,total-current);
    const stateName=stateNameOf(novel);
    const isLive=stateName==='in_progress';
    const original=languageName(novel.original_language)||novel.original_language;
    const target=languageName('English');
    const tags=parseTags(novel.genres_tags);
    const started=formatDate(novel.started_at);
    const updated=relativeTime(novel.progress_updated_at||novel.updated_at);
    const statusLabel=stateName==='in_progress'?dt('live'):stateName==='completed'?dt('completed'):stateName==='queued'?dt('queued'):tr(stateName);
    const [activityTitle,activitySub,activityIcon,activityLive]=activityCopy(stateName);
    const chapterLabel=total?`${current} / ${total}`:String(current||'—');
    const progressLabel=dt('progress')||copy('progress');

    viewRoot.innerHTML=`<section class="page page-back live-detail" data-live-detail data-detail-state="${escapeHtml(stateName)}">
      <button class="detail-back" type="button" id="detailBack" aria-label="${escapeHtml(tr('back'))}"><i data-lucide="arrow-left" aria-hidden="true"></i></button>
      <section class="detail-hero">
        ${cover(novel.title)}
        <div class="live-detail-copy">
          <div class="live-detail-eyebrow ${isLive?'is-live':''}">${isLive?'<span class="live-detail-live-dot" aria-hidden="true"></span>':''}${escapeHtml(statusLabel)}</div>
          <div class="live-detail-title">${escapeHtml(novel.title)}</div>
          <div class="live-detail-language"><span>${languageFlag(novel.original_language)} ${escapeHtml(original||dt('unknown'))}</span><span class="live-detail-language-arrow">→</span><span>${escapeHtml(target)}</span></div>
          <div class="live-detail-requester"><i data-lucide="user-round" aria-hidden="true"></i><span>${escapeHtml(dt('requested'))}</span>${requesterAttribution(novel)}</div>
          <div class="live-detail-chapter-line"><strong>${escapeHtml(dt('current'))}: ${escapeHtml(chapterLabel)}</strong><span class="live-detail-percent">${progress}% ${escapeHtml(dt('translated'))}</span></div>
          <div class="live-detail-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="${escapeHtml(progressLabel)}"><div class="live-detail-progress-fill" style="--progress:${progress}%"></div></div>
          <div class="live-detail-progress-caption"><span>${escapeHtml(progressLabel)}</span><span>${escapeHtml(dt('updated'))} ${escapeHtml(updated)}</span></div>
        </div>
      </section>

      <section class="live-detail-section">
        <div class="live-detail-section-head"><div class="live-detail-section-title">${escapeHtml(progressLabel)}</div><div class="live-detail-updated">${escapeHtml(dt('updated'))} ${escapeHtml(updated)}</div></div>
        <div class="live-progress-card">
          <div class="live-progress-stats">
            <div class="live-progress-stat"><strong>${current}</strong><span>${escapeHtml(dt('current'))}</span></div>
            <div class="live-progress-stat"><strong>${remaining}</strong><span>${escapeHtml(dt('remaining'))}</span></div>
            <div class="live-progress-stat"><strong>${progress}%</strong><span>${escapeHtml(dt('complete'))}</span></div>
          </div>
          <div class="live-progress-rail" style="--progress:${progress}%"><div class="live-progress-rail-fill"></div><div class="live-progress-marker"></div></div>
          <div class="live-progress-labels"><span>${escapeHtml(dt('start'))}</span><span>${escapeHtml(dt('finish'))}</span></div>
        </div>
      </section>

      <div class="live-detail-grid">
        <section class="live-detail-card">
          <h2>${escapeHtml(dt('about'))}</h2>
          <div class="live-about-meta">
            <div class="live-about-item"><span>${escapeHtml(dt('language'))}</span><strong>${escapeHtml(original||dt('unknown'))}</strong></div>
            <div class="live-about-item"><span>${escapeHtml(dt('publication'))}</span><strong>${escapeHtml(publicationLabel(novel.publication_status))}</strong></div>
            <div class="live-about-item"><span>${escapeHtml(dt('chapters'))}</span><strong>${total||'—'}</strong></div>
            <div class="live-about-item"><span>${escapeHtml(tr('status'))}</span><strong>${escapeHtml(statusLabel)}</strong></div>
          </div>
          ${tags.length?`<div class="live-tag-list">${tags.map(tag=>`<span class="live-tag">${escapeHtml(displayTag(tag))}</span>`).join('')}</div>`:''}
        </section>

        <section class="live-detail-card">
          <h2>${escapeHtml(dt('activity'))}</h2>
          <div class="live-activity-list">
            <div class="live-activity-item"><div class="live-activity-icon ${activityLive?'is-live':''}"><i data-lucide="${activityIcon}" aria-hidden="true"></i></div><div class="live-activity-copy"><strong>${escapeHtml(activityTitle)}</strong><span>${escapeHtml(activitySub)} · ${escapeHtml(dt('updated'))} ${escapeHtml(updated)}</span></div></div>
            ${started?`<div class="live-activity-item"><div class="live-activity-icon"><i data-lucide="play" aria-hidden="true"></i></div><div class="live-activity-copy"><strong>${escapeHtml(dt('started'))}</strong><span>${escapeHtml(started)}</span></div></div>`:''}
          </div>
        </section>
      </div>

      <div class="live-detail-actions">
        ${novel.source_url?`<a class="secondary-button" href="${escapeHtml(novel.source_url)}" target="_blank" rel="noopener"><i data-lucide="external-link" aria-hidden="true"></i>${escapeHtml(dt('openOriginal'))}</a>`:''}
        <button class="link-button" type="button" id="detailQueue">${escapeHtml(dt('viewQueue'))} →</button>
      </div>
    </section>`;
    document.getElementById('detailBack')?.addEventListener('click',()=>app.navigate(state.previousView||'queue',false));
    document.getElementById('detailQueue')?.addEventListener('click',()=>{state.queueSegment=stateName==='queued'?'upcoming':'active';app.navigate('queue');});
  }

  app.openNovel=openNovel;
  app.registerView('queue',renderQueue);
  app.registerView('detail',renderDetail);
})();
