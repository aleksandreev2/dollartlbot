(() => {
  const app=window.DTL_APP;
  if(!app?.registerView)throw new Error('DTL app core must load before view-requests-account.js');
  const {state,viewRoot,sheetRoot,tr,copy,i18nTable,escapeHtml,languageFlag,languageName,formatDate,LANGUAGE_NAMES}=app;
  const c=app.components;

  const ACCOUNT_COPY={
    en:{notifications:'Notifications',notificationsSub:'Request updates, releases and announcements'},
    ru:{notifications:'Уведомления',notificationsSub:'Статусы заявок, новые переводы и объявления'},
    es:{notifications:'Notificaciones',notificationsSub:'Solicitudes, nuevas traducciones y anuncios'},
    fil:{notifications:'Mga Abiso',notificationsSub:'Mga request, bagong salin at anunsyo'},
    hi:{notifications:'सूचनाएँ',notificationsSub:'अनुरोध, नए अनुवाद और घोषणाएँ'},
    pt:{notifications:'Notificações',notificationsSub:'Pedidos, novas traduções e anúncios'},
    id:{notifications:'Notifikasi',notificationsSub:'Permintaan, rilis terjemahan, dan pengumuman'},
    vi:{notifications:'Thông báo',notificationsSub:'Yêu cầu, bản dịch mới và thông báo chung'},
    fr:{notifications:'Notifications',notificationsSub:'Demandes, nouvelles traductions et annonces'},
    de:{notifications:'Benachrichtigungen',notificationsSub:'Anfragen, neue Übersetzungen und Ankündigungen'},
  };
  const ac=key=>ACCOUNT_COPY[state.locale]?.[key]||ACCOUNT_COPY.en[key]||key;
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const ACTIVE_REQUEST_STATES=new Set(['pending','needs_info','user_replied','queued','in_progress']);
  function refreshIcons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}

  function renderRequests(){
    const rows=state.bootstrap.my_requests||[];
    const filtered=rows.filter(r=>state.requestFilter==='all'||state.requestFilter==='active'&&ACTIVE_REQUEST_STATES.has(r.state)||state.requestFilter==='completed'&&r.state==='completed'||state.requestFilter==='rejected'&&(String(r.state).startsWith('rejected')||r.state==='withdrawn'));
    viewRoot.innerHTML=`<section class="page"><div class="page-heading"><h1>${escapeHtml(tr('myRequests'))}</h1><p class="subtitle">${escapeHtml(tr('requestsSubtitle'))}</p></div><div class="filter-row">${[['all',tr('all')],['active',tr('active')],['completed',tr('completed')],['rejected',tr('rejected')]].map(([id,label])=>`<button class="filter-chip ${state.requestFilter===id?'active':''}" type="button" data-r-filter="${id}">${escapeHtml(label)}</button>`).join('')}</div><div class="stagger" style="display:grid;gap:12px;margin-top:14px">${filtered.length?filtered.map(requestCard).join(''):c.emptyCard('▤',copy('noMatching'))}</div></section>`;
    document.querySelectorAll('[data-r-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.requestFilter=btn.dataset.rFilter;app.render();}));c.bindNovelLinks();
  }
  function requestCard(r){
    const steps=requestTimeline(r),language=languageName(r.original_language)||r.original_language;
    const pillState=['needs_info','user_replied'].includes(r.state)?'pending':r.state==='withdrawn'?'rejected_returned':r.state;
    return `<button class="surface-card request-card" data-novel="${r.id}" data-review-state="${escapeHtml(r.review_state||'ready')}" type="button" style="width:100%;text-align:left;border-style:solid">${app.cover(r.title)}<div><div class="request-top"><div><div class="novel-title">${escapeHtml(r.title)}</div><div class="novel-meta"><span>${languageFlag(r.original_language)} ${escapeHtml(language)}</span><span>·</span><span>${escapeHtml(formatDate(r.created_at))}</span></div></div>${c.statusPill(pillState)}</div>${r.state==='queued'&&r.queue_position?`<div class="request-position" style="margin-top:8px">${escapeHtml(tr('position'))} #${r.queue_position}</div>`:''}${r.state==='in_progress'&&Number.isFinite(r.progress_percent)?`<div class="progress-block"><div class="progress-labels"><span>${escapeHtml(tr('inProgress'))}</span><strong>${r.progress_percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${r.progress_percent}%"></div></div></div>`:''}<div class="timeline">${steps.map(s=>`<div class="timeline-step ${s.state}"><span class="timeline-dot">${s.state==='done'?'✓':s.state==='current'?'●':'○'}</span><span>${escapeHtml(s.label)}</span></div>`).join('')}</div></div></button>`;
  }
  function requestTimeline(r){
    const base=[{label:tr('pending'),state:''},{label:tr('inQueue'),state:''},{label:tr('inProgress'),state:''},{label:tr('completed'),state:''}];
    if(['pending','needs_info','user_replied','withdrawn'].includes(r.state))base[0].state='current';
    else if(r.state==='queued'){base[0].state='done';base[1].state='current';}
    else if(r.state==='in_progress'){base[0].state='done';base[1].state='done';base[2].state='current';}
    else if(r.state==='completed')base.forEach(x=>x.state='done');
    else base[0].state='current';
    return base;
  }

  function renderAccount(){
    const b=state.bootstrap,a=b.account;
    viewRoot.innerHTML=`<section class="page account-page">
      <div class="page-heading"><h1>${escapeHtml(tr('accountTitle'))}</h1><p class="subtitle">${escapeHtml(tr('accountSubtitle'))}</p></div>
      ${c.accountCard(a)}
      <div class="account-settings-grid">
        <div class="settings-group account-preferences-group">
          <div class="settings-label">${escapeHtml(tr('preferences'))}</div>
          <div class="surface-card settings-list">
            <button class="setting-row" id="languageSetting" type="button"><span class="round-icon">${icon('languages')}</span><span><span class="setting-title">${escapeHtml(tr('language'))}</span><span class="setting-sub">${escapeHtml(LANGUAGE_NAMES[state.locale]||state.locale)}</span></span><span class="chevron">›</span></button>
            <button class="setting-row account-notifications-row" id="notificationsSetting" type="button"><span class="round-icon">${icon('bell-ring')}</span><span><span class="setting-title">${escapeHtml(ac('notifications'))}</span><span class="setting-sub">${escapeHtml(ac('notificationsSub'))}</span></span><span class="chevron">›</span></button>
          </div>
        </div>
        <div class="settings-group account-support-group">
          <div class="settings-label">${escapeHtml(tr('supportResources'))}</div>
          <div class="surface-card settings-list">
            <button class="setting-row" id="guideSetting" type="button"><span class="round-icon">${icon('circle-help')}</span><span><span class="setting-title">${escapeHtml(tr('helpGuide'))}</span><span class="setting-sub">${escapeHtml(copy('guideSub'))}</span></span><span class="chevron">›</span></button>
            <button class="setting-row" id="rulesSetting" type="button"><span class="round-icon">${icon('shield-check')}</span><span><span class="setting-title">${escapeHtml(tr('rules'))}</span><span class="setting-sub">${escapeHtml(copy('rulesSub'))}</span></span><span class="chevron">›</span></button>
            <button class="setting-row" id="chatSetting" type="button"><span class="round-icon">${icon('send')}</span><span><span class="setting-title">${escapeHtml(tr('openTelegramChat'))}</span><span class="setting-sub">${escapeHtml(copy('chatSub'))}</span></span><span class="chevron">↗</span></button>
            ${a.plan!=='subscriber'?`<button class="setting-row account-upgrade-row" id="boostySetting" type="button"><span class="round-icon">${icon('crown')}</span><span><span class="setting-title">${escapeHtml(tr('subscription'))}</span><span class="setting-sub">${escapeHtml(copy('boostySub'))}</span></span><span class="chevron">↗</span></button>`:''}
          </div>
        </div>
      </div>
    </section>`;
    document.getElementById('languageSetting')?.addEventListener('click',languageSheet);
    document.getElementById('notificationsSetting')?.addEventListener('click',openNotifications);
    document.getElementById('guideSetting')?.addEventListener('click',guideSheet);
    document.getElementById('rulesSetting')?.addEventListener('click',rulesSheet);
    document.getElementById('chatSetting')?.addEventListener('click',openBotChat);
    document.getElementById('boostySetting')?.addEventListener('click',()=>openLink(a.boosty_url));
    refreshIcons();
  }

  function openNotifications(){
    if(window.DTL_NOTIFICATIONS?.open){void window.DTL_NOTIFICATIONS.open();return;}
    document.getElementById('notificationButton')?.click();
  }
  function languageSheet(){const active=state.locale;showSheet(`<div class="sheet-title">${escapeHtml(tr('language'))}</div><div class="sheet-actions">${Object.entries(LANGUAGE_NAMES).map(([code,label])=>`<button class="secondary-button wide-button language-picker-option" type="button" data-lang="${code}" data-language-picker-stamp="${active}:${code}" aria-current="${active===code?'true':'false'}"><span class="language-picker-name">${escapeHtml(label)}</span>${active===code?'<span class="language-picker-check" aria-label="Selected">✓</span>':'<span class="language-picker-check-spacer" aria-hidden="true"></span>'}</button>`).join('')}</div>`);sheetRoot.querySelector('.bottom-sheet')?.classList.add('language-picker-sheet');sheetRoot.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',async()=>{const locale=btn.dataset.lang;if(state.preview){app.applyLocale(locale);closeSheet();app.renderNav();app.render();return;}try{await app.api('/api/app/language',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale})});app.applyLocale(locale);closeSheet();app.renderNav();app.render();app.toast('✓','success');}catch(e){app.toast(e.message,'error');}}));}
  function guideSheet(){const guide=i18nTable('guide');const steps=Array.isArray(guide.steps)?guide.steps:[];showSheet(`<div class="sheet-title">${escapeHtml(tr('helpGuide'))}</div><div class="sheet-copy"><p>${escapeHtml(guide.intro||copy('guideSub'))}</p><ol>${steps.map(([title,text])=>`<li><strong>${escapeHtml(title)}</strong><br>${escapeHtml(text)}</li>`).join('')}</ol></div><div class="sheet-actions"><button class="primary-button wide-button" type="button" data-close-sheet>${escapeHtml(tr('close'))}</button></div>`);}
  function rulesSheet(){const rules=i18nTable('rules');const required=Array.isArray(rules.required)?rules.required:[],blocked=Array.isArray(rules.blocked)?rules.blocked:[];showSheet(`<div class="sheet-title">${escapeHtml(tr('rules'))}</div><div class="sheet-copy"><p>${escapeHtml(rules.intro||copy('rulesSub'))}</p><strong>${escapeHtml(rules.requiredTitle||'')}</strong><ul>${required.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul><strong>${escapeHtml(rules.blockedTitle||'')}</strong><ul>${blocked.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>${rules.repostTitle?`<strong>${escapeHtml(rules.repostTitle)}</strong><p>${escapeHtml(rules.repost||'')}</p>`:''}</div><div class="sheet-actions"><button class="primary-button wide-button" type="button" data-close-sheet>${escapeHtml(tr('close'))}</button></div>`);}
  function showSheet(content){sheetRoot.innerHTML=`<div class="sheet-backdrop" id="sheetBackdrop"><div class="bottom-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${content}</div></div>`;document.getElementById('sheetBackdrop').addEventListener('click',e=>{if(e.target.id==='sheetBackdrop')closeSheet();});sheetRoot.querySelectorAll('[data-close-sheet]').forEach(x=>x.addEventListener('click',closeSheet));document.dispatchEvent(new CustomEvent('dtl:sheetopen',{detail:{root:sheetRoot}}));}
  function closeSheet(){sheetRoot.innerHTML='';document.dispatchEvent(new CustomEvent('dtl:sheetclose'));}
  function openLink(url){if(!url)return;try{app.tg?.openLink(url);}catch{window.open(url,'_blank','noopener');}}
  function openBotChat(){const url='https://t.me/dollartlbot';try{app.tg?.openTelegramLink(url);}catch{location.href=url;}}

  Object.assign(app.components,{requestCard,requestTimeline,showSheet,closeSheet,openLink});
  app.registerView('requests',renderRequests);
  app.registerView('account',renderAccount);
})();