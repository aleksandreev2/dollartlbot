(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-home.js');
  const {state,viewRoot,tr,escapeHtml,languageFlag,cover,relativeTime}=app;

  function renderHome() {
    const b=state.bootstrap, a=b.account, active=b.queue.active?.[0], mine=b.my_requests||[];
    const name=escapeHtml(b.user.first_name || b.user.username || 'Reader');
    viewRoot.innerHTML=`<section class="page stagger">
      <div class="page-heading"><h1>${escapeHtml(tr('greeting'))}, ${name} 👋</h1><p class="subtitle">${escapeHtml(tr('tagline'))}</p></div>
      ${accountCard(a)}
      <div class="cta-wrap"><button class="primary-button wide-button" type="button" id="homeSuggest">▱ ${escapeHtml(tr('suggestNovel'))} <span style="margin-left:auto">›</span></button></div>
      <div class="small muted" style="text-align:center;margin-top:10px">◇ ${escapeHtml(tr('qualityLine'))}</div>
      <section class="section"><div class="section-header"><h2>${escapeHtml(tr('currentlyTranslating'))}</h2><button class="link-button" id="homeQueue" type="button">${escapeHtml(tr('viewQueue'))} ›</button></div>${active?featuredNovel(active):emptyCard('⚡',tr('noActive'))}</section>
      <section class="section"><div class="section-header"><h2>${escapeHtml(tr('myRequests'))}</h2><button class="link-button" id="homeRequests" type="button">${escapeHtml(tr('viewAll'))} ›</button></div>${mine.length?`<div class="surface-card simple-list">${mine.slice(0,3).map(requestListRow).join('')}</div>`:emptyCard('▤','No requests yet.')}</section>
    </section>`;
    document.getElementById('homeSuggest')?.addEventListener('click',()=>app.navigate('suggest'));
    document.getElementById('homeQueue')?.addEventListener('click',()=>app.navigate('queue'));
    document.getElementById('homeRequests')?.addEventListener('click',()=>app.navigate('requests'));
    bindNovelLinks();
  }

  function accountCard(a) {
    const subscriber=a.plan==='subscriber';
    return `<div class="premium-card"><div class="premium-top"><div class="premium-emblem">${subscriber?'♛':'◇'}</div><div><div class="premium-label">${escapeHtml(tr(subscriber?'premiumAccount':'regularAccount'))}</div><div class="premium-name">${escapeHtml(tr(subscriber?'boostySubscriber':'regularStatus'))}</div><div class="premium-note">${subscriber?'Thank you for supporting novel translations!':`Up to ${a.regular_max_chapters} chapters per novel.`}</div></div><div class="plan-check">✓</div></div><div class="usage-box"><div class="usage-item"><div class="round-icon">▣</div><div><div class="usage-label">${escapeHtml(tr('thisMonthUsage'))}</div><div class="usage-value">${a.used} / ${a.limit}</div><div class="usage-caption">${escapeHtml(tr('requestsUsed'))}</div></div></div><div class="usage-divider"></div><div class="usage-item"><div class="round-icon">✦</div><div><div class="usage-label">${escapeHtml(tr('remainingRequests'))}</div><div class="usage-value">${a.remaining}</div><div class="usage-caption">${escapeHtml(tr('requestsLeft'))}</div></div></div></div>${a.verification_error?`<div class="tip-card warn" style="margin-top:12px"><div class="round-icon">!</div><div><div class="tip-title">${escapeHtml(tr('verificationUnavailable'))}</div></div></div>`:''}</div>`;
  }

  function featuredNovel(row) {
    const progress=Number.isFinite(row.progress_percent)?row.progress_percent:null;
    return `<button class="surface-card novel-card" type="button" data-novel="${row.id}" style="width:100%;text-align:left;border-style:solid"><div>${cover(row.title)}</div><div class="novel-card-main"><div class="novel-title">${escapeHtml(row.title)}</div><div class="novel-meta"><span>${languageFlag(row.original_language)} ${escapeHtml(row.original_language)}</span><span>→</span><span>English</span></div>${progress!==null?`<div class="progress-block"><div class="progress-labels"><span>Chapter Progress</span><strong>${row.current_chapter} / ${row.chapter_count}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>`:''}<div class="novel-status-row"><span class="status-pill green"><span class="status-dot"></span>${escapeHtml(tr('active'))}</span><span class="updated-text">${escapeHtml(relativeTime(row.progress_updated_at||row.updated_at))}</span></div></div></button>`;
  }
  function requestListRow(row) { return `<button class="list-row" type="button" data-novel="${row.id}">${cover(row.title,true)}<span class="list-copy"><span class="list-title">${escapeHtml(row.title)}</span><span class="list-meta">${languageFlag(row.original_language)} ${escapeHtml(row.original_language)} · ${row.chapter_count} ${escapeHtml(tr('chapters'))}</span></span>${statusPill(row.state)}</button>`; }
  function emptyCard(icon,text) { return `<div class="surface-card empty-state"><div class="empty-icon">${icon}</div><p>${escapeHtml(text)}</p></div>`; }
  function statusPill(stateName) { const map={pending:['orange','pending'],queued:['blue','inQueue'],in_progress:['green','inProgress'],completed:['green','completed'],rejected:['red','rejected'],rejected_returned:['red','rejectedReturned']}; const [color,key]=map[stateName]||['gold','pending']; return `<span class="status-pill ${color}">${escapeHtml(tr(key))}</span>`; }
  function bindNovelLinks() { document.querySelectorAll('[data-novel]').forEach(el=>el.addEventListener('click',()=>app.openNovel?.(Number(el.dataset.novel)))); }

  Object.assign(app.components,{accountCard,featuredNovel,requestListRow,emptyCard,statusPill,bindNovelLinks});
  app.registerView('home',renderHome);
})();
