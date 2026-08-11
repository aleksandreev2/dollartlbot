(() => {
  const tg=window.Telegram?.WebApp;
  const runtime=window.DTL_RUNTIME;
  let cache=null;
  let settingsOpen=false;
  let filter='all';
  let saveTimer=null;
  let preferenceVersion=0;
  let returnView='home';
  let sessionUnreadIds=new Set();

  const T={
    en:{title:'Notifications',sub:'Updates from Dollar TL',back:'Back',prefs:'Notification settings',request:'My request updates',release:'New translation releases',announce:'Announcements',referral:'Referral updates',empty:'No notifications yet.',emptyUnread:'You’re all caught up.',all:'All',unread:'Unread',newGroup:'New',earlierGroup:'Earlier',saved:'Settings saved',failed:'Could not save settings'},
    ru:{title:'Уведомления',sub:'Все важные события Dollar TL',back:'Назад',prefs:'Настройки уведомлений',request:'Статусы моих заявок',release:'Новые переводы',announce:'Объявления',referral:'Реферальные события',empty:'Уведомлений пока нет.',emptyUnread:'Новых уведомлений нет.',all:'Все',unread:'Новые',newGroup:'Новые',earlierGroup:'Ранее',saved:'Настройки сохранены',failed:'Не удалось сохранить настройки'},
    es:{title:'Notificaciones',sub:'Novedades de Dollar TL',back:'Atrás',prefs:'Ajustes de notificaciones',request:'Actualizaciones de mis solicitudes',release:'Nuevas traducciones',announce:'Anuncios',referral:'Referidos',empty:'Aún no hay notificaciones.',emptyUnread:'No tienes notificaciones nuevas.',all:'Todas',unread:'Nuevas',newGroup:'Nuevas',earlierGroup:'Anteriores',saved:'Ajustes guardados',failed:'No se pudieron guardar los ajustes'},
    fil:{title:'Mga Abiso',sub:'Mga update mula sa Dollar TL',back:'Bumalik',prefs:'Mga setting ng abiso',request:'Update sa mga kahilingan ko',release:'Bagong mga salin',announce:'Mga anunsyo',referral:'Referral updates',empty:'Wala pang abiso.',emptyUnread:'Wala kang bagong abiso.',all:'Lahat',unread:'Bago',newGroup:'Bago',earlierGroup:'Nauna',saved:'Na-save ang settings',failed:'Hindi na-save ang settings'},
    hi:{title:'सूचनाएँ',sub:'Dollar TL के अपडेट',back:'वापस',prefs:'सूचना सेटिंग',request:'मेरे अनुरोधों की स्थिति',release:'नए अनुवाद',announce:'घोषणाएँ',referral:'रेफ़रल अपडेट',empty:'अभी कोई सूचना नहीं है।',emptyUnread:'कोई नई सूचना नहीं है।',all:'सभी',unread:'नई',newGroup:'नई',earlierGroup:'पहले की',saved:'सेटिंग सहेजी गई',failed:'सेटिंग सहेजी नहीं जा सकी'},
    pt:{title:'Notificações',sub:'Atualizações do Dollar TL',back:'Voltar',prefs:'Configurações',request:'Atualizações dos meus pedidos',release:'Novas traduções',announce:'Anúncios',referral:'Indicações',empty:'Ainda não há notificações.',emptyUnread:'Você não tem novas notificações.',all:'Todas',unread:'Novas',newGroup:'Novas',earlierGroup:'Anteriores',saved:'Configurações salvas',failed:'Não foi possível salvar as configurações'},
    id:{title:'Notifikasi',sub:'Pembaruan dari Dollar TL',back:'Kembali',prefs:'Pengaturan notifikasi',request:'Pembaruan permintaan saya',release:'Rilis terjemahan baru',announce:'Pengumuman',referral:'Pembaruan referral',empty:'Belum ada notifikasi.',emptyUnread:'Tidak ada notifikasi baru.',all:'Semua',unread:'Baru',newGroup:'Baru',earlierGroup:'Sebelumnya',saved:'Pengaturan disimpan',failed:'Pengaturan tidak dapat disimpan'},
    vi:{title:'Thông báo',sub:'Cập nhật từ Dollar TL',back:'Quay lại',prefs:'Cài đặt thông báo',request:'Cập nhật yêu cầu của tôi',release:'Bản dịch mới',announce:'Thông báo chung',referral:'Giới thiệu bạn bè',empty:'Chưa có thông báo.',emptyUnread:'Bạn không có thông báo mới.',all:'Tất cả',unread:'Mới',newGroup:'Mới',earlierGroup:'Trước đó',saved:'Đã lưu cài đặt',failed:'Không thể lưu cài đặt'},
    fr:{title:'Notifications',sub:'Actualités de Dollar TL',back:'Retour',prefs:'Paramètres',request:'Suivi de mes demandes',release:'Nouvelles traductions',announce:'Annonces',referral:'Parrainages',empty:'Aucune notification pour le moment.',emptyUnread:'Aucune nouvelle notification.',all:'Toutes',unread:'Nouvelles',newGroup:'Nouvelles',earlierGroup:'Précédentes',saved:'Paramètres enregistrés',failed:'Impossible d’enregistrer les paramètres'},
    de:{title:'Benachrichtigungen',sub:'Neuigkeiten von Dollar TL',back:'Zurück',prefs:'Einstellungen',request:'Status meiner Anfragen',release:'Neue Übersetzungen',announce:'Ankündigungen',referral:'Empfehlungen',empty:'Noch keine Benachrichtigungen.',emptyUnread:'Keine neuen Benachrichtigungen.',all:'Alle',unread:'Neu',newGroup:'Neu',earlierGroup:'Früher',saved:'Einstellungen gespeichert',failed:'Einstellungen konnten nicht gespeichert werden'},
  };

  function lang(){
    const value=runtime?.locale?.()||document.documentElement.lang||'en';
    const l=String(value).toLowerCase().split('-')[0];
    return T[l]?l:'en';
  }
  function tr(k){return T[lang()]?.[k]||T.en[k]||k;}
  function h(extra={}){return{'x-telegram-init-data':tg?.initData||'',...extra};}
  async function api(path,o={}){const r=await fetch(path,{...o,headers:h(o.headers||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||'Error');return d;}
  function esc(v=''){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
  function ico(n){return`<i data-lucide="${n}" aria-hidden="true"></i>`;}
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function toast(s,error=false){const r=document.getElementById('toastRegion');if(!r)return;const e=document.createElement('div');e.className=`toast ${error?'error':'success'}`;e.textContent=s;r.append(e);setTimeout(()=>e.remove(),2300);}
  function dot(n){const d=document.querySelector('#notificationButton .notification-dot');if(!d)return;d.hidden=!n;d.dataset.count=String(n||0);}

  async function refreshDot(){
    if(!tg?.initData)return;
    try{cache=await api('/api/app/notifications');dot(cache.unread||0);}catch{}
  }

  function preferenceCount(){
    const p=cache?.preferences||{};
    return ['request_updates','releases','announcements','referrals'].reduce((n,key)=>n+(p[key]!==false?1:0),0);
  }

  async function open(){
    const root=document.getElementById('viewRoot');
    if(!root)return;
    returnView=window.DTL_APP?.state?.view||'home';
    try{cache=await api('/api/app/notifications');}catch{return;}
    settingsOpen=false;
    filter='all';
    sessionUnreadIds=new Set((cache.notifications||[]).filter(n=>!n.read_at).map(n=>Number(n.id)||0));
    renderPage(root);
    dot(0);
    document.dispatchEvent(new CustomEvent('dtl:notifications',{detail:{root}}));
    api('/api/app/notifications/read',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(()=>{
      if(cache?.notifications)cache.notifications.forEach(n=>{n.read_at=n.read_at||new Date().toISOString();});
      cache.unread=0;
    }).catch(()=>{});
  }

  function renderPage(root=document.getElementById('viewRoot')){
    if(!root||!cache)return;
    root.innerHTML=`<section class="page notification-page" data-notification-page>
      <div class="notification-head">
        <button class="notification-back" id="notifBack" type="button" aria-label="${esc(tr('back'))}">${ico('arrow-left')}</button>
        <div class="notification-head-copy"><h1>${esc(tr('title'))}</h1><p>${esc(tr('sub'))}</p></div>
        <button class="notification-settings-trigger" id="notifPrefsButton" type="button" aria-label="${esc(tr('prefs'))}" aria-expanded="${settingsOpen?'true':'false'}" aria-controls="notificationSettings">${ico('sliders-horizontal')}<span id="notifPrefsCount">${preferenceCount()}/4</span></button>
      </div>
      <section class="notification-toolbar" aria-label="${esc(tr('title'))}">
        <div class="notification-filter" role="tablist">
          <button type="button" role="tab" data-notification-filter="all" aria-selected="${filter==='all'}" class="${filter==='all'?'active':''}">${esc(tr('all'))}</button>
          <button type="button" role="tab" data-notification-filter="unread" aria-selected="${filter==='unread'}" class="${filter==='unread'?'active':''}">${esc(tr('unread'))}<span>${sessionUnreadIds.size}</span></button>
        </div>
      </section>
      <section class="notification-settings surface-card" id="notificationSettings" ${settingsOpen?'':'hidden'}>
        <div class="notification-settings-head"><h2>${esc(tr('prefs'))}</h2><span>${preferenceCount()}/4</span></div>
        <div class="notification-settings-list">
          ${toggle('request_updates',tr('request'),'clipboard-check')}
          ${toggle('releases',tr('release'),'book-open-check')}
          ${toggle('announcements',tr('announce'),'megaphone')}
          ${toggle('referrals',tr('referral'),'users-round')}
        </div>
      </section>
      <section class="notification-list" id="notificationList">${listMarkup()}</section>
    </section>`;

    document.getElementById('notifBack')?.addEventListener('click',goBack);
    document.getElementById('notifPrefsButton')?.addEventListener('click',toggleSettings);
    document.querySelectorAll('[data-notification-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.notificationFilter)));
    bindDynamicContent();
    icons();
  }

  function bindDynamicContent(){
    document.querySelectorAll('[data-pref]').forEach(input=>input.addEventListener('change',schedulePreferenceSave));
    document.querySelectorAll('[data-action-url]').forEach(card=>card.addEventListener('click',()=>window.DTL_NOTIFICATION_LINK?.open(card.dataset.actionUrl)));
  }

  function setFilter(next){
    if(next!=='all'&&next!=='unread')return;
    filter=next;
    document.querySelectorAll('[data-notification-filter]').forEach(button=>{
      const active=button.dataset.notificationFilter===filter;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    const list=document.getElementById('notificationList');
    if(list){list.innerHTML=listMarkup();bindDynamicContent();icons();}
  }

  function listMarkup(){
    const all=cache?.notifications||[];
    const visible=filter==='unread'?all.filter(n=>sessionUnreadIds.has(Number(n.id)||0)):all;
    if(!visible.length)return `<div class="surface-card notification-empty">${ico(filter==='unread'?'check-check':'bell-off')}<span>${esc(tr(filter==='unread'?'emptyUnread':'empty'))}</span></div>`;
    const fresh=visible.filter(n=>sessionUnreadIds.has(Number(n.id)||0));
    const earlier=visible.filter(n=>!sessionUnreadIds.has(Number(n.id)||0));
    const groups=[];
    if(fresh.length)groups.push(groupMarkup(tr('newGroup'),fresh,'new'));
    if(earlier.length&&filter==='all')groups.push(groupMarkup(tr('earlierGroup'),earlier,'earlier'));
    return groups.join('');
  }

  function groupMarkup(label,rows,kind){
    return `<div class="notification-group notification-group-${kind}"><div class="notification-group-label"><span>${esc(label)}</span><span>${rows.length}</span></div><div class="notification-group-items">${rows.map(item).join('')}</div></div>`;
  }

  function goBack(){
    const target=returnView&&returnView!=='admin'?returnView:'home';
    if(window.DTL_APP?.navigate){window.DTL_APP.navigate(target);return;}
    document.querySelector(`[data-nav="${target}"]`)?.click()||document.querySelector('[data-nav="home"]')?.click();
  }

  function toggleSettings(){
    settingsOpen=!settingsOpen;
    const panel=document.getElementById('notificationSettings');
    const button=document.getElementById('notifPrefsButton');
    if(panel)panel.hidden=!settingsOpen;
    if(button)button.setAttribute('aria-expanded',settingsOpen?'true':'false');
    if(settingsOpen)icons();
  }

  function toggle(key,label,ic){
    const checked=cache?.preferences?.[key]!==false;
    return`<label class="notification-toggle"><span class="round-icon">${ico(ic)}</span><span>${esc(label)}</span><input type="checkbox" data-pref="${key}" ${checked?'checked':''}><i class="notification-switch"></i></label>`;
  }

  function bodyMarkup(body){
    const lines=String(body||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length)return'';
    return `<div class="notification-item-body">${lines.map((line,index)=>`<span class="${index===0?'notification-subject':'notification-detail'}">${esc(line)}</span>`).join('')}</div>`;
  }

  function item(n){
    const wasUnread=sessionUnreadIds.has(Number(n.id)||0);
    const unread=wasUnread?' unread':'';
    const action=n.action_url?` data-action-url="${esc(n.action_url)}"`:'';
    const tag=n.action_url?'button':'article';
    const type=n.action_url?' type="button"':'';
    return`<${tag}${type} class="surface-card notification-item${unread}${n.action_url?' notification-action':''}" data-notification-id="${Number(n.id)||0}"${action}>
      <div class="notification-item-icon">${ico(typeIcon(n.type))}</div>
      <div class="notification-item-copy">
        <div class="notification-item-top"><strong>${esc(n.title)}</strong>${wasUnread?'<i class="notification-unread-dot" aria-hidden="true"></i>':''}</div>
        ${bodyMarkup(n.body)}
        <time datetime="${esc(n.created_at||'')}">${fmt(n.created_at)}</time>
      </div>
      ${n.action_url?`<span class="notification-item-chevron" aria-hidden="true">${ico('chevron-right')}</span>`:''}
    </${tag}>`;
  }

  function typeIcon(t=''){
    if(t==='release')return'book-open-check';
    if(String(t).includes('ref'))return'users-round';
    if(String(t).includes('request'))return'clipboard-check';
    if(String(t).includes('announce'))return'megaphone';
    return'bell';
  }

  function fmt(v){
    try{return new Intl.DateTimeFormat(lang(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return'';}
  }

  function currentPreferencePayload(){
    const body={};
    document.querySelectorAll('[data-pref]').forEach(x=>body[x.dataset.pref]=x.checked);
    return body;
  }

  function schedulePreferenceSave(){
    const version=++preferenceVersion;
    clearTimeout(saveTimer);
    updatePreferenceCountFromInputs();
    saveTimer=setTimeout(()=>savePreferences(version),260);
  }

  function updatePreferenceCountFromInputs(){
    const inputs=[...document.querySelectorAll('[data-pref]')];
    const count=inputs.length?inputs.filter(x=>x.checked).length:preferenceCount();
    const inline=document.getElementById('notifPrefsCount');
    const panel=document.querySelector('.notification-settings-head span');
    if(inline)inline.textContent=`${count}/4`;
    if(panel)panel.textContent=`${count}/4`;
  }

  function restorePreferenceInputs(){
    document.querySelectorAll('[data-pref]').forEach(input=>{input.checked=cache?.preferences?.[input.dataset.pref]!==false;});
    updatePreferenceCountFromInputs();
  }

  async function savePreferences(version){
    const panel=document.getElementById('notificationSettings');
    const payload=currentPreferencePayload();
    panel?.classList.add('saving');
    try{
      const result=await api('/api/app/notifications/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      if(version!==preferenceVersion)return;
      cache.preferences=result.preferences||{...payload};
      updatePreferenceCountFromInputs();
      toast(tr('saved'));
    }catch{
      if(version!==preferenceVersion)return;
      restorePreferenceInputs();
      toast(tr('failed'),true);
    }finally{
      if(version===preferenceVersion)panel?.classList.remove('saving');
    }
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('#notificationButton')){
      e.preventDefault();
      e.stopImmediatePropagation();
      void open();
    }
  },true);
  document.addEventListener('dtl:localechange',()=>{
    if(document.querySelector('[data-notification-page]'))renderPage();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshDot,900),{once:true});else setTimeout(refreshDot,900);

  window.DTL_NOTIFICATIONS=Object.freeze({open,refreshDot});
})();
