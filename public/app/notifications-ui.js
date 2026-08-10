(() => {
  const tg=window.Telegram?.WebApp;
  const runtime=window.DTL_RUNTIME;
  let cache=null;
  let settingsOpen=false;
  let saveTimer=null;
  let preferenceVersion=0;

  const T={
    en:{title:'Notifications',sub:'Updates from Dollar TL',back:'Back',prefs:'Notification settings',request:'My request updates',release:'New translation releases',announce:'Announcements',referral:'Referral updates',empty:'No notifications yet.',save:'Save settings',saved:'Settings saved',failed:'Could not save settings'},
    ru:{title:'Уведомления',sub:'Все важные события Dollar TL',back:'Назад',prefs:'Настройки уведомлений',request:'Статусы моих заявок',release:'Новые переводы',announce:'Объявления',referral:'Реферальные события',empty:'Уведомлений пока нет.',save:'Сохранить настройки',saved:'Настройки сохранены',failed:'Не удалось сохранить настройки'},
    es:{title:'Notificaciones',sub:'Novedades de Dollar TL',back:'Atrás',prefs:'Ajustes de notificaciones',request:'Actualizaciones de mis solicitudes',release:'Nuevas traducciones',announce:'Anuncios',referral:'Referidos',empty:'Aún no hay notificaciones.',save:'Guardar',saved:'Ajustes guardados',failed:'No se pudieron guardar los ajustes'},
    fil:{title:'Mga Abiso',sub:'Mga update mula sa Dollar TL',back:'Bumalik',prefs:'Mga setting ng abiso',request:'Update sa mga kahilingan ko',release:'Bagong mga salin',announce:'Mga anunsyo',referral:'Referral updates',empty:'Wala pang abiso.',save:'I-save',saved:'Na-save ang settings',failed:'Hindi na-save ang settings'},
    hi:{title:'सूचनाएँ',sub:'Dollar TL के अपडेट',back:'वापस',prefs:'सूचना सेटिंग',request:'मेरे अनुरोधों की स्थिति',release:'नए अनुवाद',announce:'घोषणाएँ',referral:'रेफ़रल अपडेट',empty:'अभी कोई सूचना नहीं है।',save:'सेटिंग सहेजें',saved:'सेटिंग सहेजी गई',failed:'सेटिंग सहेजी नहीं जा सकी'},
    pt:{title:'Notificações',sub:'Atualizações do Dollar TL',back:'Voltar',prefs:'Configurações',request:'Atualizações dos meus pedidos',release:'Novas traduções',announce:'Anúncios',referral:'Indicações',empty:'Ainda não há notificações.',save:'Salvar',saved:'Configurações salvas',failed:'Não foi possível salvar as configurações'},
    id:{title:'Notifikasi',sub:'Pembaruan dari Dollar TL',back:'Kembali',prefs:'Pengaturan notifikasi',request:'Pembaruan permintaan saya',release:'Rilis terjemahan baru',announce:'Pengumuman',referral:'Pembaruan referral',empty:'Belum ada notifikasi.',save:'Simpan',saved:'Pengaturan disimpan',failed:'Pengaturan tidak dapat disimpan'},
    vi:{title:'Thông báo',sub:'Cập nhật từ Dollar TL',back:'Quay lại',prefs:'Cài đặt thông báo',request:'Cập nhật yêu cầu của tôi',release:'Bản dịch mới',announce:'Thông báo chung',referral:'Giới thiệu bạn bè',empty:'Chưa có thông báo.',save:'Lưu',saved:'Đã lưu cài đặt',failed:'Không thể lưu cài đặt'},
    fr:{title:'Notifications',sub:'Actualités de Dollar TL',back:'Retour',prefs:'Paramètres',request:'Suivi de mes demandes',release:'Nouvelles traductions',announce:'Annonces',referral:'Parrainages',empty:'Aucune notification pour le moment.',save:'Enregistrer',saved:'Paramètres enregistrés',failed:'Impossible d’enregistrer les paramètres'},
    de:{title:'Benachrichtigungen',sub:'Neuigkeiten von Dollar TL',back:'Zurück',prefs:'Einstellungen',request:'Status meiner Anfragen',release:'Neue Übersetzungen',announce:'Ankündigungen',referral:'Empfehlungen',empty:'Noch keine Benachrichtigungen.',save:'Speichern',saved:'Einstellungen gespeichert',failed:'Einstellungen konnten nicht gespeichert werden'},
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
    try{cache=await api('/api/app/notifications');}catch{return;}
    settingsOpen=false;
    root.innerHTML=`<section class="page notification-page">
      <div class="notification-head">
        <button class="notification-back" id="notifBack" type="button" aria-label="${esc(tr('back'))}">${ico('arrow-left')}</button>
        <div class="notification-head-copy"><h1>${esc(tr('title'))}</h1><p>${esc(tr('sub'))}</p></div>
        <button class="notification-settings-trigger" id="notifPrefsButton" type="button" aria-label="${esc(tr('prefs'))}" aria-expanded="false" aria-controls="notificationSettings">${ico('sliders-horizontal')}<span id="notifPrefsCount">${preferenceCount()}/4</span></button>
      </div>
      <section class="notification-settings surface-card" id="notificationSettings" hidden>
        <div class="notification-settings-head"><h2>${esc(tr('prefs'))}</h2><span>${preferenceCount()}/4</span></div>
        <div class="notification-settings-list">
          ${toggle('request_updates',tr('request'),'clipboard-check')}
          ${toggle('releases',tr('release'),'book-open-check')}
          ${toggle('announcements',tr('announce'),'megaphone')}
          ${toggle('referrals',tr('referral'),'users-round')}
        </div>
      </section>
      <section class="notification-list">${(cache.notifications||[]).length?(cache.notifications||[]).map(item).join(''):`<div class="surface-card notification-empty">${ico('bell-off')}<span>${esc(tr('empty'))}</span></div>`}</section>
    </section>`;

    document.getElementById('notifBack')?.addEventListener('click',goBack);
    document.getElementById('notifPrefsButton')?.addEventListener('click',toggleSettings);
    document.querySelectorAll('[data-pref]').forEach(input=>input.addEventListener('change',schedulePreferenceSave));
    icons();
    dot(0);
    document.dispatchEvent(new CustomEvent('dtl:notifications',{detail:{root}}));
    api('/api/app/notifications/read',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(()=>{
      document.querySelectorAll('.notification-item.unread').forEach(el=>el.classList.remove('unread'));
      if(cache?.notifications)cache.notifications.forEach(n=>{n.read_at=n.read_at||new Date().toISOString();});
      cache.unread=0;
    }).catch(()=>{});
  }

  function goBack(){
    if(window.DTL_APP?.navigate){window.DTL_APP.navigate('home');return;}
    document.querySelector('[data-nav="home"]')?.click();
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
    const unread=n.read_at?'':' unread';
    return`<article class="surface-card notification-item${unread}" data-notification-id="${Number(n.id)||0}">
      <div class="notification-item-icon">${ico(typeIcon(n.type))}</div>
      <div class="notification-item-copy">
        <div class="notification-item-top"><strong>${esc(n.title)}</strong>${n.read_at?'':'<i class="notification-unread-dot" aria-hidden="true"></i>'}</div>
        ${bodyMarkup(n.body)}
        <time datetime="${esc(n.created_at||'')}">${fmt(n.created_at)}</time>
      </div>
    </article>`;
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
      await api('/api/app/notifications/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      if(version!==preferenceVersion)return;
      cache.preferences={...payload};
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
      open();
    }
  },true);
  document.addEventListener('dtl:localechange',()=>{
    if(document.querySelector('.notification-page'))open();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshDot,900),{once:true});else setTimeout(refreshDot,900);
})();
