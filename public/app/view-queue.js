(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-queue.js');
  const {state,viewRoot,tr,escapeHtml,languageFlag,cover,relativeTime}=app;
  const c=app.components;

  function renderQueue() {
    const q=state.bootstrap.queue;
    const active=q.active||[], upcoming=(q.upcoming||[]).filter(row=>matchesLanguage(row,state.queueLanguage));
    viewRoot.innerHTML=`<section class="page"><div class="page-heading"><h1>${escapeHtml(tr('translationQueue'))}</h1><p class="subtitle">${escapeHtml(tr('queueSubtitle'))}</p></div>
    <div class="filter-row">${[['all',tr('all')],['korean',tr('korean')],['japanese',tr('japanese')],['chinese',tr('chinese')]].map(([id,label])=>`<button class="filter-chip${state.queueLanguage===id?' active':''}" type="button" data-q-lang="${id}">${escapeHtml(label)}</button>`).join('')}</div>
    <div class="segmented"><button class="${state.queueSegment==='active'?'active':''}" type="button" data-q-segment="active">⚡ ${escapeHtml(tr('currentlyTranslating'))}</button><button class="${state.queueSegment==='upcoming'?'active':''}" type="button" data-q-segment="upcoming">◷ ${escapeHtml(tr('upNext'))}</button></div>
    ${state.queueSegment==='active'?renderActiveQueue(active):renderUpcomingQueue(upcoming)}
    <div class="small muted" style="text-align:center;margin:22px 10px 0">◇ ${escapeHtml(tr('queueAuto'))}</div></section>`;
    document.querySelectorAll('[data-q-lang]').forEach(btn=>btn.addEventListener('click',()=>{state.queueLanguage=btn.dataset.qLang;renderQueue();}));
    document.querySelectorAll('[data-q-segment]').forEach(btn=>btn.addEventListener('click',()=>{state.queueSegment=btn.dataset.qSegment;renderQueue();}));
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
  function renderUpcomingQueue(rows){if(!rows.length)return c.emptyCard('◷',tr('queueEmpty'));return `<section class="section" style="margin-top:0"><div class="section-header"><h2>◷ ${escapeHtml(tr('upNext'))}</h2></div><div class="surface-card simple-list">${rows.map((r,i)=>`<button class="list-row queue-row" type="button" data-novel="${r.id}"><span class="queue-number">${r.queue_position??i+1}</span>${cover(r.title,true)}<span class="list-copy"><span class="list-title">${escapeHtml(r.title)}</span><span class="list-meta">${languageFlag(r.original_language)} ${escapeHtml(r.original_language)} · ${r.chapter_count} ${escapeHtml(tr('chapters'))}</span></span><span class="chevron">›</span></button>`).join('')}</div></section>`;}

  async function openNovel(id) {
    let novel=[...(state.bootstrap.queue.active||[]),...(state.bootstrap.queue.upcoming||[]),...(state.bootstrap.queue.completed||[]),...(state.bootstrap.my_requests||[])].find(x=>x.id===id);
    if(!novel&&!state.preview){try{novel=(await app.api(`/api/app/novel/${id}`)).novel;}catch(e){app.toast(e.message,'error');return;}}
    if(!novel)return;
    state.detailNovel=novel;
    app.navigate('detail');
  }
  function renderDetail(){
    const novel=state.detailNovel;
    if(!novel){app.navigate(state.previousView||'queue',false);return;}
    const progress=Number.isFinite(novel.progress_percent)?novel.progress_percent:(novel.current_chapter&&novel.chapter_count?Math.round(novel.current_chapter/novel.chapter_count*100):null);
    const stateName=novel.queue_status==='in_progress'?'in_progress':novel.queue_status==='completed'?'completed':novel.queue_status==='queued'?'queued':novel.status==='rejected'?'rejected':'pending';
    viewRoot.innerHTML=`<section class="page page-back"><button class="back-button" type="button" id="detailBack">‹</button><div class="detail-hero">${cover(novel.title)}<div><div class="detail-title">${escapeHtml(novel.title)}</div><div class="novel-meta" style="margin-top:10px"><span>${languageFlag(novel.original_language)} ${escapeHtml(novel.original_language)}</span><span>→</span><span>English</span></div><div style="margin-top:10px">${c.statusPill(stateName)}</div>${progress!==null?`<div class="progress-block"><div class="progress-labels"><span>Chapter Progress</span><strong>${novel.current_chapter} / ${novel.chapter_count}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>`:''}</div></div>
    <div class="surface-card info-list"><div class="info-row"><div class="round-icon">▱</div><div><div class="info-label">${escapeHtml(tr('originalLanguage'))}</div><div class="info-value">${escapeHtml(novel.original_language||'—')}</div></div></div><div class="info-row"><div class="round-icon">▤</div><div><div class="info-label">${escapeHtml(tr('totalChapters'))}</div><div class="info-value">${novel.chapter_count} ${escapeHtml(tr('chapters'))}</div></div></div><div class="info-row"><div class="round-icon">#</div><div><div class="info-label">${escapeHtml(tr('queuePosition'))}</div><div class="info-value">${novel.queue_position?`#${novel.queue_position}`:'—'}</div></div></div><div class="info-row"><div class="round-icon">✦</div><div><div class="info-label">${escapeHtml(tr('status'))}</div><div class="info-value">${escapeHtml(tr(stateName==='in_progress'?'inProgress':stateName==='queued'?'inQueue':stateName))}</div></div></div><div class="info-row"><div class="round-icon">◷</div><div><div class="info-label">${escapeHtml(tr('lastUpdated'))}</div><div class="info-value">${escapeHtml(relativeTime(novel.progress_updated_at||novel.updated_at))}</div></div></div></div>
    ${novel.source_url?`<a class="primary-button wide-button" href="${escapeHtml(novel.source_url)}" target="_blank" rel="noopener" style="margin-top:16px">↗ ${escapeHtml(tr('openOriginal'))}</a>`:''}</section>`;
    document.getElementById('detailBack')?.addEventListener('click',()=>app.navigate(state.previousView||'queue',false));
  }

  app.openNovel=openNovel;
  app.registerView('queue',renderQueue);
  app.registerView('detail',renderDetail);
})();
