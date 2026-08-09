(() => {
  const tg=window.Telegram?.WebApp;
  const extra={publications:['files','Публикации'],users:['users','Пользователи'],analytics:['chart-no-axes-combined','Аналитика']};
  let active='',selectedUser=null,userFilter='all',userQuery='',analyticsDays=30,busy=false;
  const H=()=>({'x-telegram-init-data':tg?.initData||''});
  async function api(path,options={}){const r=await fetch(path,{...options,headers:{...H(),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.message||`HTTP ${r.status}`);return d;}
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function toast(text,error=false){const r=document.getElementById('toastRegion');if(!r)return;const e=document.createElement('div');e.className=`toast ${error?'error':'success'}`;e.textContent=text;r.append(e);setTimeout(()=>e.remove(),3200);}
  function admin(){return document.querySelector('.admin-v2');}

  function install(){
    const root=admin();if(!root)return;
    for(const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')){
      for(const [id,[ic,label]] of Object.entries(extra)){
        if(nav.querySelector(`[data-admin-v3="${id}"]`))continue;
        const b=document.createElement('button');b.type='button';b.dataset.adminV3=id;b.innerHTML=`${icon(ic)}<span>${label}</span>`;
        const settings=nav.querySelector('[data-admin-section="settings"]');settings?nav.insertBefore(b,settings):nav.append(b);
      }
    }
    syncActive();icons();
  }
  function syncActive(){
    document.querySelectorAll('[data-admin-v3]').forEach(b=>b.classList.toggle('active',Boolean(active)&&b.dataset.adminV3===active));
    if(active)document.querySelectorAll('[data-admin-section]').forEach(b=>b.classList.remove('active'));
  }
  function setHead(title,subtitle){const h=document.querySelector('.admin-work-head h1'),p=document.querySelector('.admin-work-head p');if(h)h.textContent=title;if(p)p.textContent=subtitle;}
  function content(html){const c=document.querySelector('.admin-content');if(c)c.innerHTML=html;icons();}
  function loading(label='Загружаем…'){content(`<div class="admin-loading">${icon('loader-circle')} ${esc(label)}</div>`);}
  function error(message){content(`<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось загрузить раздел</strong><span>${esc(message)}</span></div>`);}

  async function render(section){active=section;syncActive();if(section==='users')return renderUsers();if(section==='analytics')return renderAnalytics();return renderPublications();}

  async function renderUsers(){
    setHead('Пользователи','Профили, квота, Boosty, referrals и история заявок');loading('Загружаем пользователей…');
    try{
      const qs=new URLSearchParams({filter:userFilter});if(userQuery)qs.set('q',userQuery);
      const data=await api(`/api/app/admin/users?${qs}`),rows=data.users||[];
      content(`<section class="admin-v3-users">
        <div class="admin-v3-toolbar admin-panel"><div class="admin-search">${icon('search')}<input id="adminUserSearch" value="${esc(userQuery)}" placeholder="@username, имя или Telegram ID"></div><div class="admin-v3-filters">${[['all','Все'],['boosty','Boosty'],['regular','Обычные'],['unlimited','Безлимит']].map(([id,label])=>`<button data-user-filter="${id}" class="${userFilter===id?'active':''}">${label}</button>`).join('')}</div><span class="admin-count">${Number(data.total||0)} пользователей</span></div>
        <div class="admin-users-layout"><section class="admin-panel admin-users-list">${rows.length?rows.map(userRow).join(''):'<div class="admin-empty">Ничего не найдено.</div>'}</section><section class="admin-panel admin-user-detail" id="adminUserDetail"><div class="admin-user-placeholder">${icon('user-round-search')}<strong>Выберите пользователя</strong><span>Справа появится профиль, квота и история.</span></div></section></div>
      </section>`);
      document.getElementById('adminUserSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){userQuery=e.currentTarget.value.trim();renderUsers();}});
      document.querySelectorAll('[data-user-filter]').forEach(b=>b.addEventListener('click',()=>{userFilter=b.dataset.userFilter;renderUsers();}));
      document.querySelectorAll('[data-user-id]').forEach(b=>b.addEventListener('click',()=>openUser(Number(b.dataset.userId))));
      if(selectedUser&&rows.some(x=>Number(x.telegram_id)===selectedUser))openUser(selectedUser);icons();
    }catch(e){error(e.message);}
  }
  function userRow(u){const name=u.first_name||u.username||`ID ${u.telegram_id}`,plan=u.last_plan==='subscriber'?'Boosty':'Обычный';return `<button class="admin-user-row" data-user-id="${u.telegram_id}"><div class="admin-user-avatar">${esc((u.first_name||u.username||'?').slice(0,1).toUpperCase())}</div><div class="admin-user-row-copy"><strong>${esc(name)}</strong><span>${u.username?'@'+esc(u.username)+' · ':''}${u.telegram_id}</span><small>${Number(u.submissions_total||0)} заявок · ${Number(u.referrals_qualified||0)} referrals</small></div><div class="admin-user-row-side"><span class="admin-badge ${u.quota_unlimited?'gold':u.last_plan==='subscriber'?'working':'draft'}">${u.quota_unlimited?'∞ Безлимит':plan}</span><small>${fmt(u.last_activity)}</small></div></button>`;}

  async function openUser(id){selectedUser=id;document.querySelectorAll('[data-user-id]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.userId)===id));const box=document.getElementById('adminUserDetail');if(!box)return;box.innerHTML=`<div class="admin-loading">${icon('loader-circle')} Загружаем профиль…</div>`;icons();
    try{const d=await api(`/api/app/admin/users/${id}`),u=d.user||{},q=d.quota||{},s=d.stats||{};box.innerHTML=`
      <div class="admin-profile-head"><div class="admin-profile-avatar">${esc((u.first_name||u.username||'?').slice(0,1).toUpperCase())}</div><div><div class="admin-kicker">TELEGRAM USER</div><h2>${esc(u.first_name||u.username||`ID ${id}`)}</h2><p>${u.username?'@'+esc(u.username)+' · ':''}${id} · ${esc(u.language||'en')}</p></div><span class="admin-badge ${q.unlimited?'gold':d.subscription?.subscriber?'working':'draft'}">${q.unlimited?'∞ Безлимит':d.subscription?.subscriber?'Boosty':'Обычный'}</span></div>
      <div class="admin-profile-stats"><div><span>Заявки</span><strong>${s.total||0}</strong></div><div><span>Завершено</span><strong>${s.completed||0}</strong></div><div><span>Referrals</span><strong>${(d.referrals||[]).filter(x=>x.status==='qualified').length}</strong></div></div>
      <section class="admin-quota-box ${q.unlimited?'unlimited':''}"><div><span>Квота этого месяца</span><strong>${q.unlimited?'∞ ДОХУЯ':`${q.used} / ${q.limit}`}</strong><small>${q.unlimited?'Ограничение отключено вручную':`База ${q.baseLimit}${q.adminAdjustment?` · админ ${q.adminAdjustment>0?'+':''}${q.adminAdjustment}`:''} · referrals +${q.referralBonus}`}</small></div><button id="toggleUnlimited" class="${q.unlimited?'danger':''}">${icon(q.unlimited?'infinity':'sparkles')} ${q.unlimited?'Отключить безлимит':'Сделать безлимит'}</button></section>
      <div class="admin-quota-actions"><button data-quota-delta="1">+1</button><button data-quota-delta="5">+5</button><button data-quota-delta="-1">−1</button><div><input id="customQuotaDelta" type="number" min="-100" max="100" placeholder="± число"><button id="applyQuota">Применить</button></div></div>
      <section class="admin-profile-section"><div class="admin-panel-head"><div><h3>Последние заявки</h3><p>История пользователя</p></div></div>${(d.submissions||[]).length?(d.submissions||[]).slice(0,10).map(r=>`<div class="admin-profile-line"><div><strong>#${r.id} · ${esc(r.title)}</strong><span>${esc(r.original_language)} · ${r.chapter_count} глав</span></div><span>${statusRu(r)}</span></div>`).join(''):'<div class="admin-empty">Заявок нет.</div>'}</section>
      <section class="admin-profile-section"><div class="admin-panel-head"><div><h3>Изменения квоты</h3><p>Административный журнал</p></div></div>${(d.quota_events||[]).length?(d.quota_events||[]).map(x=>`<div class="admin-profile-line"><div><strong>${x.delta>0?'+':''}${x.delta} слот(ов)</strong><span>${esc(x.reason||'Без комментария')}</span></div><small>${fmt(x.created_at)}</small></div>`).join(''):'<div class="admin-empty">Ручных изменений не было.</div>'}</section>`;
      document.querySelectorAll('[data-quota-delta]').forEach(b=>b.addEventListener('click',()=>changeQuota(id,{delta:Number(b.dataset.quotaDelta)})));
      document.getElementById('applyQuota')?.addEventListener('click',()=>{const n=Number(document.getElementById('customQuotaDelta')?.value);if(Number.isInteger(n)&&n!==0)changeQuota(id,{delta:n});else toast('Введите целое число, кроме нуля.',true);});
      document.getElementById('toggleUnlimited')?.addEventListener('click',()=>changeQuota(id,{unlimited:!q.unlimited}));icons();
    }catch(e){box.innerHTML=`<div class="admin-error">${esc(e.message)}</div>`;}
  }
  async function changeQuota(id,payload){if(busy)return;busy=true;try{const reason=payload.delta?window.prompt('Причина изменения квоты (необязательно):','')||'':'';await api(`/api/app/admin/users/${id}/quota`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,reason})});toast('Квота обновлена.');await openUser(id);}catch(e){toast(e.message,true);}finally{busy=false;}}

  async function renderAnalytics(){
    setHead('Аналитика','Заявки, пользователи, referrals и качество публикаций');loading('Собираем аналитику…');
    try{const d=await api(`/api/app/admin/analytics?days=${analyticsDays}`),s=d.summary||{},max=Math.max(1,...(d.daily||[]).map(x=>Number(x.requests||0)));
      content(`<section class="admin-analytics"><div class="admin-v3-toolbar admin-panel"><div class="admin-v3-filters">${[7,30,90].map(x=>`<button data-days="${x}" class="${analyticsDays===x?'active':''}">${x} дней</button>`).join('')}</div><span class="admin-count">С ${fmtDate(d.since)}</span></div>
      <div class="analytics-kpis">${kpi('users',s.users_total,'Пользователей',`+${s.users_new||0} новых`)}${kpi('inbox',s.submissions,'Заявок',`${s.pending_now||0} ждут решения`)}${kpi('languages',s.translating_now,'В работе',`${s.completed||0} завершено`)}${kpi('send',s.publications,'Публикаций',`${s.referrals_qualified||0} referrals`)}</div>
      <div class="analytics-grid"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Заявки по дням</h2><p>Активность за выбранный период</p></div></div><div class="analytics-bars">${(d.daily||[]).map(x=>`<div class="analytics-bar-col" title="${esc(x.day)} · ${x.requests}"><div class="analytics-bar" style="height:${Math.max(5,Number(x.requests||0)/max*100)}%"></div><span>${String(x.day||'').slice(5)}</span></div>`).join('')||'<div class="admin-empty">Пока нет данных.</div>'}</div></section>
      <section class="admin-panel"><div class="admin-panel-head"><div><h2>Языки оригинала</h2><p>Что чаще всего предлагают</p></div></div><div class="analytics-ranking">${rank(d.languages||[])}</div></section>
      <section class="admin-panel"><div class="admin-panel-head"><div><h2>Referral funnel</h2><p>Путь приглашённых пользователей</p></div></div>${funnel(d.referrals||{})}</section>
      <section class="admin-panel"><div class="admin-panel-head"><div><h2>Надёжность публикаций</h2><p>Комментарии и доставка файлов</p></div></div>${publicationHealth(d.publishing||{})}</section></div></section>`);
      document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{analyticsDays=Number(b.dataset.days);renderAnalytics();}));icons();
    }catch(e){error(e.message);}
  }
  function kpi(ic,n,label,sub){return `<div class="analytics-kpi"><div>${icon(ic)}</div><strong>${Number(n||0).toLocaleString('ru-RU')}</strong><span>${label}</span><small>${esc(sub)}</small></div>`;}
  function rank(rows){const max=Math.max(1,...rows.map(x=>Number(x.count||0)));return rows.map((x,i)=>`<div class="analytics-rank"><b>${i+1}</b><div><strong>${esc(x.language)}</strong><span><i style="width:${Number(x.count||0)/max*100}%"></i></span></div><em>${x.count}</em></div>`).join('')||'<div class="admin-empty">Нет данных.</div>';}
  function funnel(r){const started=Number(r.started||0),qualified=Number(r.qualified||0);return `<div class="analytics-funnel"><div><span>Начали</span><strong>${started}</strong></div><div><span>Ожидают 7 дней</span><strong>${Number(r.pending||0)}</strong></div><div><span>Засчитаны</span><strong>${qualified}</strong></div><div><span>Отменены</span><strong>${Number(r.cancelled||0)}</strong></div><small>Конверсия: ${started?Math.round(qualified/started*100):0}%</small></div>`;}
  function publicationHealth(p){return `<div class="analytics-health"><div><span>Опубликовано</span><strong>${Number(p.published||0)}</strong></div><div class="good"><span>Проверка файлов OK</span><strong>${Number(p.comments_complete||0)}</strong></div><div class="warn"><span>Требует внимания</span><strong>${Number(p.needs_attention||0)}</strong></div><div class="good"><span>Файлов доставлено</span><strong>${Number(p.files_sent||0)}</strong></div><div class="bad"><span>Ошибок файлов</span><strong>${Number(p.files_failed||0)}</strong></div></div>`;}

  async function renderPublications(){
    setHead('Публикации','Управление опубликованными постами и автоматическая проверка файлов');loading('Загружаем публикации…');
    try{const d=await api('/api/app/admin/publishing'),rows=d.publications||[];content(`<section class="admin-publications-v3"><div class="admin-v3-toolbar admin-panel"><div><strong>${rows.length} публикаций</strong><span>Check comments for files работает автоматически через cron</span></div><button id="checkAllVisible">${icon('refresh-cw')} Проверить проблемные</button></div><div class="admin-publications-grid">${rows.length?rows.map(pubCard).join(''):'<div class="admin-empty admin-panel">Публикаций пока нет.</div>'}</div></section>`);
      document.querySelectorAll('[data-check-pub]').forEach(b=>b.addEventListener('click',()=>checkPublication(Number(b.dataset.checkPub),b)));
      document.getElementById('checkAllVisible')?.addEventListener('click',async()=>{for(const b of [...document.querySelectorAll('[data-check-pub]')].slice(0,10)){if(b.dataset.state!=='complete')await checkPublication(Number(b.dataset.checkPub),b,false);}toast('Проверка завершена.');});icons();
    }catch(e){error(e.message);}
  }
  function pubCard(p){const state=p.comments_check_status||'pending',labels={complete:'Файлы проверены',pending:'Ожидаем комментарии',needs_attention:'Требует внимания',not_required:'Проверка не нужна'};return `<article class="admin-publication-card"><div class="admin-publication-cover">${p.image_key?`<img src="/media/publications/${p.id}/image" alt="">`:icon('file-text')}${p.image_spoiler?`<span>${icon('eye-off')} Spoiler</span>`:''}</div><div class="admin-publication-main"><div class="admin-publication-top"><div><small>ПУБЛИКАЦИЯ #${p.id}</small><h3>${esc(p.internal_title)}</h3><p>${fmt(p.published_at||p.created_at)} · ${Number(p.file_count||0)} файл(ов)</p></div><span class="delivery-badge ${state}">${labels[state]||state}</span></div><div class="admin-publication-meta"><span>${icon('message-circle')} Thread: ${p.discussion_message_id||'—'}</span><span>${icon('refresh-cw')} Проверок: ${p.comments_check_attempts||0}</span><span>${icon('bot')} Promo: ${esc(p.bot_comment_status||'—')}</span></div>${p.error_text?`<div class="admin-publication-error">${esc(p.error_text)}</div>`:''}<div class="admin-publication-actions"><button data-check-pub="${p.id}" data-state="${state}">${icon('file-check-2')} Check comments for files</button></div><div class="publication-delivery-detail" id="delivery-${p.id}"></div></div></article>`;}
  async function checkPublication(id,button,notify=true){if(button)button.disabled=true;try{const d=await api(`/api/app/admin/publications/${id}/check-comments`,{method:'POST'});const box=document.getElementById(`delivery-${id}`),p=d.publication||{},assets=d.assets||[];if(box)box.innerHTML=`<div class="delivery-result ${p.comments_check_status}"><strong>${p.comments_check_status==='complete'?'✓ Всё доставлено':p.comments_check_status==='pending'?'Ждём discussion thread':'Нужна проверка'}</strong>${assets.map(a=>`<span>${a.delivery_status==='sent'?'✓':a.delivery_status==='failed'?'×':'…'} ${esc(a.file_name)}${a.delivery_error?` · ${esc(a.delivery_error)}`:''}</span>`).join('')||'<span>Файлов нет.</span>'}</div>`;if(notify)toast(p.comments_check_status==='complete'?'Файлы и комментарии проверены.':'Проверка выполнена — смотрите статус ниже.',p.comments_check_status==='needs_attention');}catch(e){toast(e.message,true);}finally{if(button)button.disabled=false;}}

  function statusRu(r){if(r.status==='pending')return'На проверке';if(r.status==='rejected')return r.slot_returned?'Отклонена · слот возвращён':'Отклонена';if(r.queue_status==='completed')return'Завершена';if(r.queue_status==='in_progress')return'В работе';return'В очереди';}
  function fmt(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}}
  function fmtDate(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium'}).format(new Date(v));}catch{return String(v);}}

  document.addEventListener('click',e=>{
    const custom=e.target.closest?.('[data-admin-v3]');if(custom){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();render(custom.dataset.adminV3);return;}
    const original=e.target.closest?.('[data-admin-section]');if(original){active='';selectedUser=null;}
  },true);
  const root=document.getElementById('viewRoot');if(root)new MutationObserver(()=>queueMicrotask(install)).observe(root,{childList:true,subtree:false});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
