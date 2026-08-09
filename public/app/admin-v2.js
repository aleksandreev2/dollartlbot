(() => {
  const tg = window.Telegram?.WebApp;
  const state = { section:'overview', kind:'pending', busy:false, publishing:null, image:null, files:[] };
  const A = {
    overview:['layout-dashboard','Обзор'], requests:['inbox','Заявки'], queue:['list-ordered','Очередь'],
    publishing:['send','Публикация'], broadcasts:['megaphone','Рассылки'], settings:['settings-2','Настройки'],
  };

  function headers(extra={}) { return {'x-telegram-init-data':tg?.initData||'',...extra}; }
  async function api(path, options={}) {
    const response = await fetch(path,{...options,headers:headers(options.headers||{})});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error?.message || data?.message || 'Ошибка запроса');
    return data;
  }
  function esc(v=''){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
  function icon(name){return `<i data-lucide="${name}" aria-hidden="true"></i>`;}
  function refreshIcons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function toast(text,error=false){const r=document.getElementById('toastRegion');if(!r)return;const e=document.createElement('div');e.className=`toast ${error?'error':'success'}`;e.textContent=text;r.appendChild(e);setTimeout(()=>e.remove(),2800);}

  function activateAdminClass(on=true){document.documentElement.classList.toggle('admin-console-active',on);document.body.classList.toggle('admin-console-active',on);}
  function shell(content, subtitle='Рабочая панель Dollar TL') {
    const root=document.getElementById('viewRoot'); if(!root)return;
    activateAdminClass(true);
    root.innerHTML=`<section class="admin-v2">
      <aside class="admin-side">
        <div class="admin-side-brand"><img src="/app/logo.png" alt=""><div><strong>Dollar TL</strong><span>ADMIN</span></div></div>
        <nav class="admin-side-nav">${Object.entries(A).map(([id,[ic,label]])=>`<button type="button" data-admin-section="${id}" class="${state.section===id?'active':''}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
      </aside>
      <div class="admin-workspace">
        <header class="admin-work-head"><div><div class="admin-kicker">АДМИН-ПАНЕЛЬ</div><h1>${A[state.section]?.[1]||'Админ'}</h1><p>${esc(subtitle)}</p></div><div class="admin-live"><span></span> Система активна</div></header>
        <div class="admin-mobile-nav">${Object.entries(A).map(([id,[ic,label]])=>`<button type="button" data-admin-section="${id}" class="${state.section===id?'active':''}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
        <main class="admin-content">${content}</main>
      </div>
    </section>`;
    root.querySelectorAll('[data-admin-section]').forEach(b=>b.addEventListener('click',()=>{state.section=b.dataset.adminSection;render();}));
    document.querySelector('[data-nav="admin"] span:last-child')?.replaceChildren(document.createTextNode('Админ'));
    refreshIcons();
  }

  async function render(){
    if(state.section==='overview')return renderOverview();
    if(state.section==='requests')return renderRequests('pending');
    if(state.section==='queue')return renderRequests('queue');
    if(state.section==='publishing')return renderPublishing();
    if(state.section==='broadcasts')return renderBroadcasts();
    return renderSettings();
  }

  async function renderOverview(){
    shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем данные…</div>`,'Заявки, очередь и публикации в одном месте');
    try{
      const [req,pub]=await Promise.all([api('/api/app/admin/list?kind=pending'),api('/api/app/admin/publishing')]);
      state.publishing=pub;
      const c=req.counts||{}; const recent=(req.requests||[]).slice(0,4); const pubs=(pub.publications||[]).slice(0,4);
      shell(`<div class="admin-stat-grid">
        ${stat('clock-3',c.pending||0,'На проверке','orange')}${stat('layers-3',c.queued||0,'В очереди','blue')}${stat('languages',c.in_progress||0,'В работе','green')}${stat('circle-check-big',c.completed||0,'Завершено','gold')}
      </div>
      <div class="admin-dashboard-grid">
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Требуют внимания</h2><p>Новые заявки пользователей</p></div><button data-jump="requests">Все заявки ${icon('arrow-right')}</button></div>${recent.length?recent.map(requestCompact).join(''):'<div class="admin-empty">Новых заявок нет.</div>'}</section>
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Последние публикации</h2><p>Черновики и опубликованные посты</p></div><button data-jump="publishing">Публикация ${icon('arrow-right')}</button></div>${pubs.length?pubs.map(publicationCompact).join(''):'<div class="admin-empty">Публикаций пока нет.</div>'}</section>
      </div>`,`Сегодня: ${c.pending||0} заявок ждут решения`);
      document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{state.section=b.dataset.jump;render();}));
    }catch(e){shell(errorBox(e.message),'Не удалось загрузить админ-панель');}
  }
  function stat(ic,n,label,tone){return `<div class="admin-stat ${tone}"><div class="admin-stat-icon">${icon(ic)}</div><div><strong>${n}</strong><span>${label}</span></div></div>`;}
  function requestCompact(r){return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon('book-open')}</div><div class="admin-compact-copy"><strong>${esc(r.title)}</strong><span>${esc(r.original_language)} · ${r.chapter_count} глав${r.username?` · @${esc(r.username)}`:''}</span></div><span class="admin-badge pending">На проверке</span></div>`;}
  function publicationCompact(p){return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon(p.image_key?'image':'file-text')}</div><div class="admin-compact-copy"><strong>${esc(p.internal_title)}</strong><span>${date(p.created_at)} · ${Number(p.file_count||0)} файл(ов)</span></div>${pubBadge(p.status)}</div>`;}

  async function renderRequests(kind){
    state.kind=kind; shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем…</div>`,kind==='queue'?'Управление порядком и прогрессом перевода':'Ручная проверка заявок');
    try{const data=await api(`/api/app/admin/list?kind=${kind}`);const rows=data.requests||[];shell(`<div class="admin-toolbar"><div class="admin-segments"><button class="${kind==='pending'?'active':''}" data-kind="pending">Новые</button><button class="${kind==='all'?'active':''}" data-kind="all">Все</button>${state.section==='queue'?'<button class="active" data-kind="queue">Очередь</button>':''}</div><div class="admin-count">${rows.length} записей</div></div><div class="admin-request-grid">${rows.length?rows.map(adminCard).join(''):'<div class="admin-empty admin-panel">Здесь пока ничего нет.</div>'}</div>`,kind==='queue'?'Очередь переводов':'Заявки пользователей');document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.kind;if(k==='queue'){state.section='queue';renderRequests('queue');}else{state.section='requests';renderRequests(k);}}));bindActions();}
    catch(e){shell(errorBox(e.message),'Ошибка загрузки заявок');}
  }
  function adminCard(r){const pending=r.status==='pending',queued=r.status==='accepted'&&r.queue_status==='queued',working=r.status==='accepted'&&r.queue_status==='in_progress';return `<article class="admin-request-card"><div class="admin-request-top"><div><div class="admin-card-id">ЗАЯВКА #${r.id}</div><h3>${esc(r.title)}</h3><p>${esc(r.original_language)} · ${r.chapter_count} глав · ${r.plan==='subscriber'?'Boosty':'Обычный'}${r.username?` · @${esc(r.username)}`:''}</p></div>${pending?'<span class="admin-badge pending">На проверке</span>':working?'<span class="admin-badge working">В работе</span>':queued?'<span class="admin-badge queued">В очереди</span>':'<span class="admin-badge done">Готово</span>'}</div>
    ${queued?`<div class="admin-position">Позиция в очереди <strong>#${r.queue_position??'—'}</strong></div>`:''}
    ${working?`<div class="admin-progress-edit"><label>Текущая глава</label><div><input type="number" id="adm-progress-${r.id}" min="0" max="${r.chapter_count}" value="${r.current_chapter??0}"><span>/ ${r.chapter_count}</span><button data-progress="${r.id}">${icon('save')} Сохранить</button></div></div>`:''}
    <div class="admin-card-actions">${pending?`<button class="ok" data-action="accept" data-id="${r.id}">${icon('check')} Принять</button><button class="bad" data-action="reject" data-id="${r.id}">${icon('x')} Отклонить</button><button data-action="return" data-id="${r.id}">${icon('rotate-ccw')} Отклонить + вернуть слот</button>`:''}${queued?`<button class="ok" data-action="start" data-id="${r.id}">${icon('play')} Начать перевод</button><button data-action="up" data-id="${r.id}">${icon('arrow-up')} Выше</button><button data-action="down" data-id="${r.id}">${icon('arrow-down')} Ниже</button>`:''}${working?`<button class="ok" data-action="complete" data-id="${r.id}">${icon('circle-check')} Завершить</button><button data-action="backqueue" data-id="${r.id}">${icon('undo-2')} Вернуть в очередь</button>`:''}</div></article>`;}
  function bindActions(){document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>runAction(b.dataset.action,Number(b.dataset.id))));document.querySelectorAll('[data-progress]').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.progress),value=Number(document.getElementById(`adm-progress-${id}`)?.value);runAction('progress',id,{current_chapter:value});}));refreshIcons();}
  async function runAction(action,id,extra={}){if(state.busy)return;state.busy=true;try{await api('/api/app/admin/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action,...extra})});toast('Готово');await renderRequests(state.kind);}catch(e){toast(e.message,true);}finally{state.busy=false;}}

  async function loadPublishing(force=false){if(state.publishing&&!force)return state.publishing;state.publishing=await api('/api/app/admin/publishing');return state.publishing;}
  async function renderPublishing(){
    shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем редактор…</div>`,'Создание поста, файлов в комментариях и рассылки');
    try{const data=await loadPublishing(true);const pubs=data.publications||[];shell(`<div class="publisher-layout">
      <section class="publisher-editor admin-panel"><div class="admin-panel-head"><div><h2>Новая публикация</h2><p>Пост в канале + файлы в комментариях</p></div><span class="admin-badge draft">Черновик</span></div>
        <label class="admin-field"><span>Название для админки</span><input id="pubTitle" maxlength="180" placeholder="Например: Chapters 78–85 · Pure Love"></label>
        <label class="admin-field"><span>Текст поста <small id="pubCounter">0 / 700</small></span><textarea id="pubBody" maxlength="700" rows="9" placeholder="Напишите основной текст публикации…"></textarea></label>
        <div class="publisher-upload-grid"><label class="publisher-drop" id="pubImageDrop">${icon('image-plus')}<strong>Изображение поста</strong><span>JPEG, PNG, WebP или AVIF · до 8 МБ</span><input id="pubImage" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label><label class="publisher-drop" id="pubFilesDrop">${icon('paperclip')}<strong>Файлы в комментарий</strong><span>До 8 файлов · каждый до 45 МБ</span><input id="pubFiles" type="file" multiple hidden></label></div>
        <div id="pubAssetSummary" class="publisher-assets"></div>
        <div class="publisher-options"><label><input id="pubFooter" type="checkbox" checked><span><b>Шаблонный footer</b><small>Need a translation? → Dollar TL Bot</small></span></label><label><input id="pubDonate" type="checkbox" checked><span><b>Кнопка Donate</b><small>Boosty donation</small></span></label><label><input id="pubBotComment" type="checkbox" checked><span><b>Реклама бота под файлами</b><small>Отдельным комментарием</small></span></label><label><input id="pubNotify" type="checkbox"><span><b>Разослать релиз пользователям</b><small>Только тем, кто не отключил релизы</small></span></label></div>
        <div class="publisher-actions"><button id="pubSave">${icon('save')} Сохранить черновик</button><button id="pubTest">${icon('flask-conical')} Отправить тест мне</button><button id="pubPublish" class="primary">${icon('send')} Опубликовать</button></div>
      </section>
      <aside class="publisher-preview admin-panel"><div class="admin-panel-head"><div><h2>Предпросмотр</h2><p>Как пост будет выглядеть в Telegram</p></div></div><div class="tg-preview"><div id="tgPreviewImage" class="tg-preview-image empty">${icon('image')}</div><div class="tg-preview-body" id="tgPreviewBody">Текст публикации появится здесь.</div><div class="tg-preview-footer"><b>Need a translation?</b><br>Open <span>Dollar TL Bot</span> and suggest a novel for translation.</div><div class="tg-preview-buttons"><span>Suggest a Novel</span><span>Donate</span></div></div></aside>
    </div><section class="admin-panel admin-publication-history"><div class="admin-panel-head"><div><h2>История публикаций</h2><p>Черновики и отправленные посты</p></div></div><div class="admin-publication-list">${pubs.length?pubs.map(publicationRow).join(''):'<div class="admin-empty">Пока пусто.</div>'}</div></section>`,'Создавайте публикацию и сразу проверяйте её перед отправкой');bindPublisher();bindPublicationRows();}
    catch(e){shell(errorBox(e.message),'Ошибка редактора публикаций');}
  }
  function publicationRow(p){return `<div class="publication-row"><div class="publication-thumb">${p.image_key?`<img src="/media/publications/${p.id}/image" alt="">`:icon('file-text')}</div><div class="publication-copy"><strong>${esc(p.internal_title)}</strong><span>${date(p.created_at)} · ${p.file_count||0} файл(ов)</span>${p.error_text?`<small>${esc(p.error_text)}</small>`:''}</div>${pubBadge(p.status)}<div class="publication-actions">${p.status!=='published'?`<button data-pub-test="${p.id}" title="Тест">${icon('flask-conical')}</button><button data-pub-send="${p.id}" title="Опубликовать">${icon('send')}</button><button data-pub-del="${p.id}" title="Удалить">${icon('trash-2')}</button>`:''}</div></div>`;}
  function pubBadge(s){const map={draft:['draft','Черновик'],publishing:['queued','Отправляется'],published:['done','Опубликовано'],failed:['bad','Ошибка']};const [c,t]=map[s]||['draft',s];return `<span class="admin-badge ${c}">${t}</span>`;}
  function bindPublisher(){const title=document.getElementById('pubTitle'),body=document.getElementById('pubBody'),image=document.getElementById('pubImage'),files=document.getElementById('pubFiles');const update=()=>{document.getElementById('pubCounter').textContent=`${body.value.length} / 700`;document.getElementById('tgPreviewBody').textContent=body.value||'Текст публикации появится здесь.';document.querySelector('.tg-preview-footer').style.display=document.getElementById('pubFooter').checked?'block':'none';document.querySelector('.tg-preview-buttons').children[1].style.display=document.getElementById('pubDonate').checked?'inline-flex':'none';};body.addEventListener('input',update);document.getElementById('pubFooter').addEventListener('change',update);document.getElementById('pubDonate').addEventListener('change',update);document.getElementById('pubImageDrop').addEventListener('click',()=>image.click());document.getElementById('pubFilesDrop').addEventListener('click',()=>files.click());image.addEventListener('change',()=>{state.image=image.files?.[0]||null;if(state.image){const url=URL.createObjectURL(state.image);const box=document.getElementById('tgPreviewImage');box.className='tg-preview-image';box.innerHTML=`<img src="${url}" alt="">`;}assetSummary();});files.addEventListener('change',()=>{state.files=[...(files.files||[])].slice(0,8);assetSummary();});document.getElementById('pubSave').addEventListener('click',()=>createPublication('save'));document.getElementById('pubTest').addEventListener('click',()=>createPublication('test'));document.getElementById('pubPublish').addEventListener('click',()=>createPublication('publish'));update();refreshIcons();}
  function assetSummary(){const e=document.getElementById('pubAssetSummary');if(!e)return;const rows=[];if(state.image)rows.push(`<span>${icon('image')} ${esc(state.image.name)}</span>`);for(const f of state.files)rows.push(`<span>${icon('file')} ${esc(f.name)}</span>`);e.innerHTML=rows.join('');refreshIcons();}
  async function createPublication(mode){if(state.busy)return;const title=document.getElementById('pubTitle')?.value.trim(),body=document.getElementById('pubBody')?.value.trim();if(!title||!body){toast('Заполните название и текст.',true);return;}state.busy=true;try{const form=new FormData();form.set('internal_title',title);form.set('body',body);form.set('add_footer',document.getElementById('pubFooter').checked?'1':'0');form.set('add_donate',document.getElementById('pubDonate').checked?'1':'0');form.set('add_bot_comment',document.getElementById('pubBotComment').checked?'1':'0');form.set('notify_users',document.getElementById('pubNotify').checked?'1':'0');if(state.image)form.set('image',state.image,state.image.name);state.files.forEach(f=>form.append('files',f,f.name));const created=await api('/api/app/admin/publications',{method:'POST',body:form});const id=created.publication?.publication?.id;if(!id)throw new Error('Не удалось создать черновик');if(mode==='test'){await api(`/api/app/admin/publications/${id}/test`,{method:'POST'});toast('Тест отправлен вам в Telegram.');}else if(mode==='publish'){if(!confirm('Опубликовать пост в канале прямо сейчас?'))return;await api(`/api/app/admin/publications/${id}/publish`,{method:'POST'});toast('Пост опубликован.');}else toast('Черновик сохранён.');state.image=null;state.files=[];state.publishing=null;await renderPublishing();}catch(e){toast(e.message,true);}finally{state.busy=false;}}
  function bindPublicationRows(){document.querySelectorAll('[data-pub-test]').forEach(b=>b.addEventListener('click',()=>pubAction(Number(b.dataset.pubTest),'test')));document.querySelectorAll('[data-pub-send]').forEach(b=>b.addEventListener('click',()=>pubAction(Number(b.dataset.pubSend),'publish')));document.querySelectorAll('[data-pub-del]').forEach(b=>b.addEventListener('click',()=>deletePub(Number(b.dataset.pubDel))));refreshIcons();}
  async function pubAction(id,action){if(action==='publish'&&!confirm('Опубликовать этот черновик?'))return;try{await api(`/api/app/admin/publications/${id}/${action}`,{method:'POST'});toast(action==='test'?'Тест отправлен.':'Пост опубликован.');state.publishing=null;renderPublishing();}catch(e){toast(e.message,true);}}
  async function deletePub(id){if(!confirm('Удалить черновик и его файлы?'))return;try{await api(`/api/app/admin/publications/${id}`,{method:'DELETE'});toast('Черновик удалён.');state.publishing=null;renderPublishing();}catch(e){toast(e.message,true);}}

  async function renderBroadcasts(){shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем…</div>`,'Рассылки новых переводов');try{const d=await loadPublishing(true);const rows=(d.publications||[]).filter(p=>Number(p.notify_users)===1);shell(`<section class="admin-panel"><div class="admin-panel-head"><div><h2>Рассылки релизов</h2><p>Создаются автоматически при публикации поста с включённой опцией рассылки</p></div></div><div class="broadcast-note">${icon('info')} Пользователи могут отключить релизы в настройках уведомлений. Системные статусы собственных заявок остаются отдельными.</div><div class="admin-publication-list">${rows.length?rows.map(p=>`<div class="publication-row"><div class="publication-thumb">${icon('megaphone')}</div><div class="publication-copy"><strong>${esc(p.internal_title)}</strong><span>${p.published_at?`Опубликовано ${date(p.published_at)}`:'Ожидает публикации'}</span></div>${pubBadge(p.status)}</div>`).join(''):'<div class="admin-empty">Рассылок релизов пока не было.</div>'}</div></section>`,'Рассылка запускается вместе с публикацией');}catch(e){shell(errorBox(e.message));}}

  async function renderSettings(){shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем настройки…</div>`,'Канал публикации и автоматические комментарии');try{const d=await loadPublishing(true),s=d.settings||{};shell(`<div class="settings-admin-grid"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Telegram</h2><p>Куда публиковать посты и комментарии</p></div></div><label class="admin-field"><span>Канал публикации</span><input id="setChannel" value="${esc(s.publish_channel_id||'')}" placeholder="@channel или -100…"><small>Бот должен быть администратором канала.</small></label><label class="admin-field"><span>Discussion group</span><input id="setDiscussion" value="${esc(s.discussion_chat_id||'')}" placeholder="-100…"><small>Связанная группа комментариев. Файлы будут отправлены ответом под постом.</small></label><label class="admin-field"><span>Username бота</span><input id="setBot" value="${esc(s.bot_username||'dollartlbot')}" placeholder="dollartlbot"></label></section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Шаблон публикации</h2><p>Постоянные ссылки</p></div></div><label class="admin-field"><span>Donate URL</span><input id="setDonate" value="${esc(s.donation_url||'')}" placeholder="https://boosty.to/…"></label><div class="settings-preview"><b>Need a translation?</b><p>Open Dollar TL Bot and suggest a novel for translation.</p><div><span>Suggest a Novel</span><span>Donate</span></div></div></section></div><button class="admin-save-settings" id="saveAdminSettings">${icon('save')} Сохранить настройки</button>`,'Настройки используются для всех будущих публикаций');document.getElementById('saveAdminSettings').addEventListener('click',saveSettings);refreshIcons();}catch(e){shell(errorBox(e.message));}}
  async function saveSettings(){try{const body={publish_channel_id:document.getElementById('setChannel').value,discussion_chat_id:document.getElementById('setDiscussion').value,bot_username:document.getElementById('setBot').value,donation_url:document.getElementById('setDonate').value};await api('/api/app/admin/publishing/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});state.publishing=null;toast('Настройки сохранены.');}catch(e){toast(e.message,true);}}

  function errorBox(t){return `<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось выполнить действие</strong><span>${esc(t)}</span></div>`;}
  function date(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return v;}}

  function scheduleAdminRender(){setTimeout(()=>{const old=document.querySelector('#viewRoot .admin-stats');if(old&&!document.querySelector('.admin-v2'))render();},0);}
  document.addEventListener('click',e=>{const nav=e.target.closest?.('[data-nav]');if(!nav)return;if(nav.dataset.nav==='admin')scheduleAdminRender();else activateAdminClass(false);},true);
  const root=document.getElementById('viewRoot');if(root)new MutationObserver(()=>{if(root.querySelector('.admin-stats')&&!root.querySelector('.admin-v2'))scheduleAdminRender();}).observe(root,{childList:true,subtree:false});
})();
