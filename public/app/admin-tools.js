(() => {
  const tg=window.Telegram?.WebApp;
  const runtime=window.DTL_RUNTIME;
  const adminRuntime=window.DTL_ADMIN;
  if(!runtime?.registerPatcher||!adminRuntime?.registerRoute)throw new Error('Canonical admin runtime must load before admin-tools.js');

  const extra={publications:['files','Публикации'],users:['users','Пользователи'],analytics:['chart-no-axes-combined','Аналитика']};
  let active='',selectedUser=null,userFilter='all',userSort='recent',userQuery='',userOffset=0,analyticsDays=30,busy=false,searchTimer=0;
  const api=(path,options={})=>adminRuntime.api(path,options);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const icon=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  function icons(){adminRuntime.icons?.();}
  function toast(text,error=false){adminRuntime.toast?.(text,error);}
  function admin(){return document.querySelector('.admin-v2');}
  function routeId(section){return `tools:${section}`;}
  function isActive(section){return active===section&&adminRuntime.activeRoute?.()===routeId(section);}
  function stale(section,error){return error?.name==='AbortError'||!isActive(section);}

  function install(){
    const root=admin();if(!root)return;
    for(const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')){
      for(const [id,[ic,label]] of Object.entries(extra)){
        if(nav.querySelector(`[data-admin-tools="${id}"]`))continue;
        const b=document.createElement('button');b.type='button';b.dataset.adminTools=id;b.innerHTML=`${icon(ic)}<span>${label}</span>`;
        const settings=nav.querySelector('[data-admin-section="settings"]');settings?nav.insertBefore(b,settings):nav.append(b);
      }
    }
    syncActive();icons();
  }
  function syncActive(){
    document.querySelectorAll('[data-admin-tools]').forEach(b=>b.classList.toggle('active',Boolean(active)&&b.dataset.adminTools===active));
    if(active)document.querySelectorAll('[data-admin-section],[data-admin-health]').forEach(b=>b.classList.remove('active'));
  }
  function deactivate(section=''){
    if(section&&active!==section)return;
    active='';selectedUser=null;userOffset=0;clearTimeout(searchTimer);syncActive();
  }
  function setHead(title,subtitle){adminRuntime.setHead?.(title,subtitle);}
  function content(html){adminRuntime.content?.(html);}
  function loading(label='Загружаем…'){content(`<div class="admin-loading">${icon('loader-circle')} ${esc(label)}</div>`);}
  function error(message){content(`<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось загрузить раздел</strong><span>${esc(message)}</span></div>`);}

  async function render(section){
    active=section;selectedUser=section==='users'?selectedUser:null;syncActive();
    if(section==='users')return renderUsers();
    if(section==='analytics')return renderAnalytics();
    return renderPublications();
  }

  async function renderUsers(){
    const section='users';
    setHead('Пользователи','Доступ, профили, сообщения, квоты, заметки и полная история');loading('Загружаем пользователей…');
    try{
      const qs=new URLSearchParams({filter:userFilter,sort:userSort,offset:String(userOffset)});if(userQuery)qs.set('q',userQuery);
      const data=await api(`/api/app/admin/users?${qs}`),rows=data.users||[];
      if(!isActive(section))return;
      const filters=[['all','Все'],['active','Активные'],['new','Новые'],['blocked','Заблокированные'],['boosty','Boosty'],['unlimited','Безлимит'],['has_requests','С заявками'],['no_requests','Без заявок'],['inactive','Неактивные']];
      content(`<section class="admin-v3-users"><div class="admin-v3-toolbar admin-panel admin-users-toolbar"><div class="admin-search">${icon('search')}<input id="adminUserSearch" value="${esc(userQuery)}" placeholder="@username, имя, Telegram ID, тег или заметка"></div><div class="admin-v3-filters">${filters.map(([id,label])=>`<button data-user-filter="${id}" class="${userFilter===id?'active':''}">${label}</button>`).join('')}</div><div class="admin-user-sort"><span>Сортировка</span><select id="adminUserSort"><option value="recent" ${userSort==='recent'?'selected':''}>Недавняя активность</option><option value="newest" ${userSort==='newest'?'selected':''}>Новые</option><option value="requests" ${userSort==='requests'?'selected':''}>Больше заявок</option><option value="referrals" ${userSort==='referrals'?'selected':''}>Больше referrals</option><option value="id" ${userSort==='id'?'selected':''}>Telegram ID</option></select></div><span class="admin-count">${Number(data.total||0)} пользователей</span></div><div class="admin-users-layout"><section class="admin-panel admin-users-list"><div class="admin-user-list-body">${rows.length?rows.map(userRow).join(''):'<div class="admin-empty">Ничего не найдено.</div>'}</div><div class="admin-user-pagination"><button data-user-page="prev" ${userOffset<=0?'disabled':''}>${icon('chevron-left')} Назад</button><span>${rows.length?`${userOffset+1}–${userOffset+rows.length}`:'0'} из ${Number(data.total||0)}</span><button data-user-page="next" ${data.has_more?'':'disabled'}>Дальше ${icon('chevron-right')}</button></div></section><section class="admin-panel admin-user-detail" id="adminUserDetail"><div class="admin-user-placeholder">${icon('user-round-search')}<strong>Выберите пользователя</strong><span>Здесь будут доступ, действия, сообщения, заметки и история.</span></div></section></div></section>`);
      if(!isActive(section))return;
      const search=document.getElementById('adminUserSearch');
      search?.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(searchTimer);userQuery=e.currentTarget.value.trim();userOffset=0;void renderUsers();}});
      search?.addEventListener('input',e=>{clearTimeout(searchTimer);const v=e.currentTarget.value.trim();searchTimer=setTimeout(()=>{if(v!==userQuery&&isActive(section)){userQuery=v;userOffset=0;void renderUsers();}},420);});
      document.querySelectorAll('[data-user-filter]').forEach(b=>b.addEventListener('click',()=>{userFilter=b.dataset.userFilter;userOffset=0;void renderUsers();}));
      document.getElementById('adminUserSort')?.addEventListener('change',e=>{userSort=e.currentTarget.value;userOffset=0;void renderUsers();});
      document.querySelectorAll('[data-user-page]').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;userOffset=Math.max(0,userOffset+(b.dataset.userPage==='next'?Number(data.limit||40):-Number(data.limit||40)));void renderUsers();}));
      document.querySelectorAll('[data-user-id]').forEach(b=>b.addEventListener('click',()=>void openUser(Number(b.dataset.userId))));
      if(selectedUser&&rows.some(x=>Number(x.telegram_id)===selectedUser))void openUser(selectedUser);
    }catch(e){if(!stale(section,e))error(e.message);}
  }

  function userRow(u){
    const name=u.first_name||u.username||`ID ${u.telegram_id}`,plan=u.last_plan==='subscriber'?'Boosty':'Обычный',blocked=Boolean(u.blocked_at),tags=Array.isArray(u.tags)?u.tags:[];
    return `<button class="admin-user-row ${blocked?'blocked':''}" data-user-id="${u.telegram_id}"><div class="admin-user-avatar">${esc((u.first_name||u.username||'?').slice(0,1).toUpperCase())}</div><div class="admin-user-row-copy"><strong>${esc(name)}</strong><span>${u.username?'@'+esc(u.username)+' · ':''}${u.telegram_id}</span><small>${Number(u.submissions_total||0)} заявок · ${Number(u.referrals_qualified||0)} referrals${tags.length?` · ${tags.slice(0,2).map(x=>'#'+esc(x)).join(' ')}`:''}</small></div><div class="admin-user-row-side"><span class="admin-badge ${blocked?'danger':u.quota_unlimited?'gold':u.last_plan==='subscriber'?'working':'draft'}">${blocked?'Заблокирован':u.quota_unlimited?'∞ Безлимит':plan}</span><small>${fmt(u.last_activity)}</small></div></button>`;
  }

  async function openUser(id){
    if(!isActive('users'))return;
    selectedUser=id;document.querySelectorAll('[data-user-id]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.userId)===id));const box=document.getElementById('adminUserDetail');if(!box)return;box.innerHTML=`<div class="admin-loading">${icon('loader-circle')} Загружаем профиль…</div>`;icons();
    try{
      const d=await api(`/api/app/admin/users/${id}`),u=d.user||{},q=d.quota||{},s=d.stats||{},c=d.control||{},cache=d.access_cache||{},tags=Array.isArray(c.tags)?c.tags:[];
      if(!isActive('users')||selectedUser!==id||!box.isConnected)return;
      const plan=d.subscription?.subscriber?'Boosty':'Обычный';
      const accessState=c.blocked?'Заблокирован':cache.is_member===1?'В канале':cache.is_member===0?'Не в канале':'Не проверен';
      box.innerHTML=`<div class="admin-profile-head"><div class="admin-profile-avatar">${esc((u.first_name||u.username||'?').slice(0,1).toUpperCase())}</div><div><div class="admin-kicker">TELEGRAM USER</div><h2>${esc(u.first_name||u.username||`ID ${id}`)}</h2><p>${u.username?`<button class="admin-linklike" id="openTelegramUser">@${esc(u.username)}</button> · `:''}${id} · ${esc(u.language||'en')}</p></div><span class="admin-badge ${c.blocked?'danger':q.unlimited?'gold':d.subscription?.subscriber?'working':'draft'}">${c.blocked?'Заблокирован':q.unlimited?'∞ Безлимит':plan}</span></div>
      <div class="admin-profile-stats admin-profile-stats-four"><div><span>Заявки</span><strong>${s.total||0}</strong></div><div><span>Завершено</span><strong>${s.completed||0}</strong></div><div><span>Referrals</span><strong>${(d.referrals||[]).filter(x=>x.status==='qualified').length}</strong></div><div><span>Последняя активность</span><strong class="admin-stat-small">${fmt(u.last_seen_at||u.updated_at||u.created_at)}</strong></div></div>
      <section class="admin-control-summary"><div class="admin-control-status ${c.blocked?'bad':'good'}">${icon(c.blocked?'shield-x':'shield-check')}<div><span>Доступ</span><strong>${esc(accessState)}</strong><small>${c.blocked?esc(c.blocked_reason||'Без причины'):cache.checked_at?`Проверено ${fmt(cache.checked_at)}`:'Нажмите «Перепроверить»'}</small></div></div><div class="admin-control-status ${d.subscription?.subscriber?'good':''}">${icon('badge-check')}<div><span>Статус</span><strong>${plan}</strong><small>${d.subscription?.verification_error?'Проверка временно недоступна':'Проверено при открытии профиля'}</small></div></div></section>
      <div class="admin-user-commandbar"><button id="refreshTelegramUser">${icon('refresh-cw')} Обновить Telegram</button><button id="recheckUserAccess">${icon('scan-search')} Перепроверить доступ</button><button id="focusUserMessage">${icon('send')} Написать</button></div>
      <section class="admin-profile-section admin-user-control-editor"><div class="admin-panel-head"><div><h3>Внутренние данные</h3><p>Никогда не показываются пользователю</p></div><button id="saveUserControl">${icon('save')} Сохранить</button></div><label><span>Теги</span><input id="userAdminTags" value="${esc(tags.join(', '))}" placeholder="VIP, trusted, problematic"></label><label><span>Заметки</span><textarea id="userAdminNotes" rows="4" maxlength="2000" placeholder="Контекст, договорённости, важные замечания…">${esc(c.notes||'')}</textarea></label></section>
      <section class="admin-profile-section admin-user-blockbox ${c.blocked?'is-blocked':''}"><div><h3>${c.blocked?'Доступ заблокирован':'Блокировка доступа'}</h3><p>${c.blocked?`С ${fmt(c.blocked_at)} · ${esc(c.blocked_reason||'')}`:'Полностью отключает бот и Mini App для этого аккаунта.'}</p></div>${c.blocked?`<button id="toggleUserBlock" class="danger-outline">${icon('shield-check')} Разблокировать</button>`:`<div class="admin-block-action"><input id="userBlockReason" maxlength="300" placeholder="Внутренняя причина блокировки"><button id="toggleUserBlock" class="danger-solid">${icon('shield-x')} Заблокировать</button></div>`}</section>
      <section class="admin-quota-box ${q.unlimited?'unlimited':''}"><div><span>Квота этого месяца</span><strong>${q.unlimited?'∞ БЕЗЛИМИТ':`${q.used} / ${q.limit}`}</strong><small>${q.unlimited?'Ограничение отключено вручную':`База ${q.baseLimit}${q.adminAdjustment?` · админ ${q.adminAdjustment>0?'+':''}${q.adminAdjustment}`:''} · referrals +${q.referralBonus}`}</small></div><button id="toggleUnlimited" class="${q.unlimited?'danger':''}">${icon(q.unlimited?'infinity':'sparkles')} ${q.unlimited?'Отключить безлимит':'Сделать безлимит'}</button></section><div class="admin-quota-actions"><button data-quota-delta="1">+1</button><button data-quota-delta="5">+5</button><button data-quota-delta="-1">−1</button><div><input id="customQuotaDelta" type="number" min="-100" max="100" placeholder="± число"><button id="applyQuota">Применить</button></div><input id="quotaReason" class="admin-quota-reason" maxlength="300" placeholder="Причина изменения квоты (необязательно)"></div>
      <section class="admin-profile-section admin-message-user" id="adminMessageUser"><div class="admin-panel-head"><div><h3>Сообщение пользователю</h3><p>Отправляется напрямую через Telegram-бота</p></div></div><textarea id="adminUserMessageText" rows="4" maxlength="3500" placeholder="Введите сообщение…"></textarea><div><span id="adminMessageCount">0 / 3500</span><button id="sendAdminUserMessage">${icon('send')} Отправить</button></div></section>
      <section class="admin-profile-section"><div class="admin-panel-head"><div><h3>Последние заявки</h3><p>До 50 заявок пользователя</p></div></div>${(d.submissions||[]).length?(d.submissions||[]).slice(0,15).map(r=>`<div class="admin-profile-line"><div><strong>#${r.id} · ${esc(r.title)}</strong><span>${esc(r.original_language)} · ${r.chapter_count} глав</span></div><span>${statusRu(r)}</span></div>`).join(''):'<div class="admin-empty">Заявок нет.</div>'}</section>
      <section class="admin-profile-section"><div class="admin-panel-head"><div><h3>Timeline</h3><p>Пользовательские и административные события</p></div></div><div class="admin-user-timeline">${(d.timeline||[]).length?(d.timeline||[]).slice(0,30).map(timelineRow).join(''):'<div class="admin-empty">История пока пуста.</div>'}</div></section>
      <section class="admin-profile-section"><div class="admin-panel-head"><div><h3>Отправленные сообщения</h3><p>Последние сообщения администратора</p></div></div>${(d.messages||[]).length?(d.messages||[]).slice(0,10).map(m=>`<div class="admin-profile-line"><div><strong>${m.status==='sent'?'Отправлено':'Ошибка доставки'}</strong><span>${esc(String(m.text||'').slice(0,180))}${m.error_text?` · ${esc(m.error_text)}`:''}</span></div><small>${fmt(m.created_at)}</small></div>`).join(''):'<div class="admin-empty">Сообщений ещё не было.</div>'}</section>`;

      document.getElementById('openTelegramUser')?.addEventListener('click',()=>{if(!u.username)return;const url=`https://t.me/${u.username}`;try{tg?.openTelegramLink?tg.openTelegramLink(url):window.open(url,'_blank','noopener,noreferrer');}catch{window.open(url,'_blank','noopener,noreferrer');}});
      document.getElementById('refreshTelegramUser')?.addEventListener('click',()=>void userAction(id,'refresh-telegram',{},'Профиль Telegram обновлён.'));
      document.getElementById('recheckUserAccess')?.addEventListener('click',()=>void recheckUser(id));
      document.getElementById('focusUserMessage')?.addEventListener('click',()=>{document.getElementById('adminUserMessageText')?.focus();document.getElementById('adminMessageUser')?.scrollIntoView({behavior:'smooth',block:'center'});});
      document.getElementById('saveUserControl')?.addEventListener('click',()=>void saveUserControl(id));
      document.getElementById('toggleUserBlock')?.addEventListener('click',()=>void toggleUserBlock(id,c));
      document.querySelectorAll('[data-quota-delta]').forEach(b=>b.addEventListener('click',()=>void changeQuota(id,{delta:Number(b.dataset.quotaDelta)})));
      document.getElementById('applyQuota')?.addEventListener('click',()=>{const n=Number(document.getElementById('customQuotaDelta')?.value);if(Number.isInteger(n)&&n!==0)void changeQuota(id,{delta:n});else toast('Введите целое число, кроме нуля.',true);});
      document.getElementById('toggleUnlimited')?.addEventListener('click',()=>void changeQuota(id,{unlimited:!q.unlimited}));
      const msg=document.getElementById('adminUserMessageText'),count=document.getElementById('adminMessageCount');msg?.addEventListener('input',()=>{if(count)count.textContent=`${msg.value.length} / 3500`;});
      document.getElementById('sendAdminUserMessage')?.addEventListener('click',()=>void sendUserMessage(id));
      icons();
    }catch(e){if(stale('users',e))return;if(box.isConnected)box.innerHTML=`<div class="admin-error">${esc(e.message)}</div>`;}
  }

  function timelineRow(x){const map={activated:'badge-check',created:'user-plus',request:'book-open',quota:'ticket-plus',message:'send',message_failed:'circle-x',admin:'shield'};return `<div class="admin-timeline-row"><div>${icon(map[x.type]||'circle')}</div><div><strong>${esc(x.title||'Событие')}</strong><span>${esc(x.detail||'')}</span></div><small>${fmt(x.at)}</small></div>`;}

  async function saveUserControl(id){
    if(busy)return;busy=true;try{const notes=document.getElementById('userAdminNotes')?.value||'',raw=document.getElementById('userAdminTags')?.value||'',tags=raw.split(',').map(x=>x.trim()).filter(Boolean);await api(`/api/app/admin/users/${id}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notes,tags})});toast('Заметки и теги сохранены.');if(isActive('users'))await openUser(id);}catch(e){toast(e.message,true);}finally{busy=false;}
  }

  async function toggleUserBlock(id,c){
    if(busy)return;const blocked=Boolean(c.blocked);let payload;
    if(blocked){if(!window.confirm('Разблокировать этого пользователя?'))return;payload={blocked:false};}
    else{const reason=document.getElementById('userBlockReason')?.value.trim()||'';if(!reason){toast('Укажите внутреннюю причину блокировки.',true);return;}if(!window.confirm('Заблокировать пользователю доступ к боту и Mini App?'))return;payload={blocked:true,blocked_reason:reason};}
    busy=true;try{await api(`/api/app/admin/users/${id}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});toast(blocked?'Пользователь разблокирован.':'Доступ пользователя заблокирован.');if(isActive('users')){await openUser(id);await refreshUserRow();}}catch(e){toast(e.message,true);}finally{busy=false;}
  }

  async function sendUserMessage(id){if(busy)return;const text=document.getElementById('adminUserMessageText')?.value.trim()||'';if(!text){toast('Введите сообщение.',true);return;}busy=true;try{await api(`/api/app/admin/users/${id}/message`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});toast('Сообщение отправлено.');if(isActive('users'))await openUser(id);}catch(e){toast(e.message,true);}finally{busy=false;}}

  async function recheckUser(id){if(busy)return;busy=true;try{const d=await api(`/api/app/admin/users/${id}/recheck`,{method:'POST'}),member=d.channel?.member,sub=d.subscription?.subscriber;toast(`Канал: ${member===true?'участник':member===false?'не участник':'ошибка'} · Boosty: ${sub?'активен':'нет'}`,Boolean(d.channel?.error));if(isActive('users'))await openUser(id);}catch(e){toast(e.message,true);}finally{busy=false;}}

  async function userAction(id,action,payload,success){if(busy)return;busy=true;try{await api(`/api/app/admin/users/${id}/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload||{})});toast(success);if(isActive('users')){await openUser(id);await refreshUserRow();}}catch(e){toast(e.message,true);}finally{busy=false;}}
  async function refreshUserRow(){if(!isActive('users'))return;try{const qs=new URLSearchParams({filter:userFilter,sort:userSort,offset:String(userOffset)});if(userQuery)qs.set('q',userQuery);const d=await api(`/api/app/admin/users?${qs}`);if(!isActive('users'))return;const body=document.querySelector('.admin-user-list-body');if(body)body.innerHTML=(d.users||[]).map(userRow).join('')||'<div class="admin-empty">Ничего не найдено.</div>';document.querySelectorAll('[data-user-id]').forEach(b=>b.addEventListener('click',()=>void openUser(Number(b.dataset.userId))));document.querySelector(`[data-user-id="${selectedUser}"]`)?.classList.add('selected');icons();}catch(e){if(e?.name!=='AbortError')toast(e.message,true);}}

  async function changeQuota(id,payload){if(busy)return;busy=true;try{const reason=document.getElementById('quotaReason')?.value.trim()||'';await api(`/api/app/admin/users/${id}/quota`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,reason})});toast('Квота обновлена.');if(isActive('users')){await openUser(id);await refreshUserRow();}}catch(e){toast(e.message,true);}finally{busy=false;}}

  async function renderAnalytics(){
    const section='analytics';setHead('Аналитика','Заявки, пользователи, referrals и качество публикаций');loading('Собираем аналитику…');
    try{const d=await api(`/api/app/admin/analytics?days=${analyticsDays}`);if(!isActive(section))return;const s=d.summary||{},max=Math.max(1,...(d.daily||[]).map(x=>Number(x.requests||0)));
      content(`<section class="admin-analytics"><div class="admin-v3-toolbar admin-panel"><div class="admin-v3-filters">${[7,30,90].map(x=>`<button data-days="${x}" class="${analyticsDays===x?'active':''}">${x} дней</button>`).join('')}</div><span class="admin-count">С ${fmtDate(d.since)}</span></div><div class="analytics-kpis">${kpi('users',s.users_total,'Пользователей',`+${s.users_new||0} новых`)}${kpi('inbox',s.submissions,'Заявок',`${s.pending_now||0} ждут решения`)}${kpi('languages',s.translating_now,'В работе',`${s.completed||0} завершено`)}${kpi('send',s.publications,'Публикаций',`${s.referrals_qualified||0} referrals`)}</div><div class="analytics-grid"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Заявки по дням</h2><p>Активность за выбранный период</p></div></div><div class="analytics-bars">${(d.daily||[]).map(x=>`<div class="analytics-bar-col" title="${esc(x.day)} · ${x.requests}"><div class="analytics-bar" style="height:${Math.max(5,Number(x.requests||0)/max*100)}%"></div><span>${String(x.day||'').slice(5)}</span></div>`).join('')||'<div class="admin-empty">Пока нет данных.</div>'}</div></section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Языки оригинала</h2><p>Что чаще всего предлагают</p></div></div><div class="analytics-ranking">${rank(d.languages||[])}</div></section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Referral funnel</h2><p>Путь приглашённых пользователей</p></div></div>${funnel(d.referrals||{})}</section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Надёжность публикаций</h2><p>Комментарии и доставка файлов</p></div></div>${publicationHealth(d.publishing||{})}</section></div></section>`);
      if(!isActive(section))return;document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{analyticsDays=Number(b.dataset.days);void renderAnalytics();}));
    }catch(e){if(!stale(section,e))error(e.message);}
  }
  function kpi(ic,n,label,sub){return `<div class="analytics-kpi"><div>${icon(ic)}</div><strong>${Number(n||0).toLocaleString('ru-RU')}</strong><span>${label}</span><small>${esc(sub)}</small></div>`;}
  function rank(rows){const max=Math.max(1,...rows.map(x=>Number(x.count||0)));return rows.map((x,i)=>`<div class="analytics-rank"><b>${i+1}</b><div><strong>${esc(x.language)}</strong><span><i style="width:${Number(x.count||0)/max*100}%"></i></span></div><em>${x.count}</em></div>`).join('')||'<div class="admin-empty">Нет данных.</div>';}
  function funnel(r){const started=Number(r.started||0),qualified=Number(r.qualified||0);return `<div class="analytics-funnel"><div><span>Начали</span><strong>${started}</strong></div><div><span>Ожидают 7 дней</span><strong>${Number(r.pending||0)}</strong></div><div><span>Засчитаны</span><strong>${qualified}</strong></div><div><span>Отменены</span><strong>${Number(r.cancelled||0)}</strong></div><small>Конверсия: ${started?Math.round(qualified/started*100):0}%</small></div>`;}
  function publicationHealth(p){return `<div class="analytics-health"><div><span>Опубликовано</span><strong>${Number(p.published||0)}</strong></div><div class="good"><span>Проверка файлов OK</span><strong>${Number(p.comments_complete||0)}</strong></div><div class="warn"><span>Требует внимания</span><strong>${Number(p.needs_attention||0)}</strong></div><div class="good"><span>Файлов доставлено</span><strong>${Number(p.files_sent||0)}</strong></div><div class="bad"><span>Ошибок файлов</span><strong>${Number(p.files_failed||0)}</strong></div></div>`;}

  async function renderPublications(){
    const section='publications';setHead('Публикации','Управление опубликованными постами и автоматическая проверка файлов');loading('Загружаем публикации…');
    try{const d=await api('/api/app/admin/publishing'),rows=d.publications||[];if(!isActive(section))return;content(`<section class="admin-publications-v3"><div class="admin-v3-toolbar admin-panel"><div><strong>${rows.length} публикаций</strong><span>Проверка комментариев и файлов выполняется автоматически через cron</span></div><button id="checkAllVisible">${icon('refresh-cw')} Проверить проблемные</button></div><div class="admin-publications-grid">${rows.length?rows.map(pubCard).join(''):'<div class="admin-empty admin-panel">Публикаций пока нет.</div>'}</div></section>`);
      if(!isActive(section))return;document.querySelectorAll('[data-check-pub]').forEach(b=>b.addEventListener('click',()=>void checkPublication(Number(b.dataset.checkPub),b)));
      document.getElementById('checkAllVisible')?.addEventListener('click',async()=>{for(const b of [...document.querySelectorAll('[data-check-pub]')].slice(0,10)){if(!isActive(section))return;if(b.dataset.state!=='complete')await checkPublication(Number(b.dataset.checkPub),b,false);}if(isActive(section))toast('Проверка завершена.');});
    }catch(e){if(!stale(section,e))error(e.message);}
  }
  function pubCard(p){const state=p.comments_check_status||'pending',labels={complete:'Файлы проверены',pending:'Ожидаем комментарии',needs_attention:'Требует внимания',not_required:'Проверка не нужна'};return `<article class="admin-publication-card"><div class="admin-publication-cover">${p.image_key?`<img src="/media/publications/${p.id}/image" alt="">`:icon('file-text')}${p.image_spoiler?`<span>${icon('eye-off')} Spoiler</span>`:''}</div><div class="admin-publication-main"><div class="admin-publication-top"><div><small>ПУБЛИКАЦИЯ #${p.id}</small><h3>${esc(p.internal_title)}</h3><p>${fmt(p.published_at||p.created_at)} · ${Number(p.file_count||0)} файл(ов)</p></div><span class="delivery-badge ${state}">${labels[state]||state}</span></div><div class="admin-publication-meta"><span>${icon('message-circle')} Thread: ${p.discussion_message_id||'—'}</span><span>${icon('refresh-cw')} Проверок: ${p.comments_check_attempts||0}</span><span>${icon('bot')} Promo: ${esc(p.bot_comment_status||'—')}</span></div>${p.error_text?`<div class="admin-publication-error">${esc(p.error_text)}</div>`:''}<div class="admin-publication-actions"><button data-check-pub="${p.id}" data-state="${state}">${icon('file-check-2')} Проверить комментарии и файлы</button></div><div class="publication-delivery-detail" id="delivery-${p.id}"></div></div></article>`;}
  async function checkPublication(id,button,notify=true){if(button)button.disabled=true;try{const d=await api(`/api/app/admin/publications/${id}/check-comments`,{method:'POST'});if(!isActive('publications'))return;const box=document.getElementById(`delivery-${id}`),p=d.publication||{},assets=d.assets||[];if(box)box.innerHTML=`<div class="delivery-result ${p.comments_check_status}"><strong>${p.comments_check_status==='complete'?'✓ Всё доставлено':p.comments_check_status==='pending'?'Ждём discussion thread':'Нужна проверка'}</strong>${assets.map(a=>`<span>${a.delivery_status==='sent'?'✓':a.delivery_status==='failed'?'×':'…'} ${esc(a.file_name)}${a.delivery_error?` · ${esc(a.delivery_error)}`:''}</span>`).join('')||'<span>Файлов нет.</span>'}</div>`;if(notify)toast(p.comments_check_status==='complete'?'Файлы и комментарии проверены.':'Проверка выполнена — смотрите статус ниже.',p.comments_check_status==='needs_attention');}catch(e){if(e?.name!=='AbortError')toast(e.message,true);}finally{if(button?.isConnected)button.disabled=false;}}

  function statusRu(r){if(r.status==='pending')return'На проверке';if(r.status==='rejected')return r.slot_returned?'Отклонена · слот возвращён':'Отклонена';if(r.queue_status==='completed')return'Завершена';if(r.queue_status==='in_progress')return'В работе';return'В очереди';}
  function fmt(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}}
  function fmtDate(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium'}).format(new Date(v));}catch{return String(v);}}

  for(const section of Object.keys(extra)){
    adminRuntime.registerRoute(routeId(section),{
      mount:()=>render(section),
      refresh:()=>render(section),
      unmount:()=>deactivate(section),
    });
  }
  runtime.registerPatcher(install);
  document.addEventListener('dtl:adminrender',()=>runtime.schedule());

  window.DTL_ADMIN_TOOLS=Object.freeze({
    open:section=>adminRuntime.open(routeId(section)),
    refresh:()=>active?render(active):false,
    deactivate,
    state:()=>({active,selectedUser,userFilter,userSort,userQuery,userOffset,analyticsDays,busy}),
  });
})();
