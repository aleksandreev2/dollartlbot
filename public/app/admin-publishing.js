(() => {
  const runtime=window.DTL_RUNTIME;
  const adminRuntime=window.DTL_ADMIN;
  if(!runtime?.registerPatcher||!adminRuntime?.api)throw new Error('Canonical admin runtime must load before admin-publishing.js');

  let busy=false,logTimer=0,installedEditor=null;
  const api=(path,options={})=>adminRuntime.api(path,options);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  function icons(){adminRuntime.icons?.();}
  function toast(text,error=false){adminRuntime.toast?.(text,error);}
  function editor(){return document.querySelector('.publisher-editor');}
  function isPublishingRoute(){return adminRuntime.activeRoute?.()==='section:publishing'&&Boolean(editor());}
  function isManagementRoute(){return adminRuntime.activeRoute?.()==='tools:publications';}
  function stalePublishing(error){return error?.name==='AbortError'||!isPublishingRoute();}

  function install(){
    if(!isPublishingRoute()){installedEditor=null;stopLogs();return;}
    const current=editor();
    if(!current){installedEditor=null;stopLogs();return;}
    injectSpoiler();injectHealth();injectLogs();injectNativeCommentsNote();bindSpoilerPreview();startLogs();icons();
    if(installedEditor===current)return;
    installedEditor=current;
    void refreshDiagnostics();void refreshLogs();
  }
  function injectSpoiler(){
    const options=document.querySelector('.publisher-options');if(!options||document.getElementById('pubImageSpoiler'))return;
    const label=document.createElement('label');label.className='publisher-spoiler-option';label.innerHTML=`<input id="pubImageSpoiler" type="checkbox"><span><b>${ico('eye-off')} Скрыть изображение под спойлером</b><small>Telegram покажет встроенную spoiler-анимацию до нажатия.</small></span>`;options.prepend(label);
  }
  function injectHealth(){
    const layout=document.querySelector('.publisher-layout');if(!layout||document.getElementById('publishingHealth'))return;
    const box=document.createElement('section');box.id='publishingHealth';box.className='admin-panel publishing-health';box.innerHTML=`<div class="admin-panel-head"><div><h2>Проверка Telegram</h2><p>Канал, discussion group и права бота</p></div><button type="button" id="publishingHealthRefresh">${ico('refresh-cw')} Проверить</button></div><div id="publishingHealthBody" class="publishing-health-grid"><div class="publishing-health-loading">${ico('loader-circle')} Проверяем…</div></div>`;layout.before(box);box.querySelector('#publishingHealthRefresh')?.addEventListener('click',()=>void refreshDiagnostics());
  }
  function injectLogs(){
    const history=document.querySelector('.admin-publication-history');if(!history||document.getElementById('publishingLogs'))return;
    const box=document.createElement('section');box.id='publishingLogs';box.className='admin-panel publishing-logs';box.innerHTML=`<div class="admin-panel-head"><div><h2>Журнал публикаций</h2><p>Что реально произошло на Worker и в Telegram</p></div><button type="button" id="publishingLogsRefresh">${ico('refresh-cw')} Обновить</button></div><div id="publishingLogsBody" class="publishing-log-list"><div class="admin-empty">Загружаем журнал…</div></div>`;history.before(box);box.querySelector('#publishingLogsRefresh')?.addEventListener('click',()=>void refreshLogs());
  }
  function injectNativeCommentsNote(){
    const preview=document.querySelector('.publisher-preview .tg-preview');if(!preview)return;
    if(!preview.querySelector('.tg-preview-comments-note')){
      const note=document.createElement('div');note.className='tg-preview-comments-note';note.innerHTML=`${ico('message-circle')}<div><strong>Комментарии останутся нативными</strong><small>Кнопки Suggest a Novel и Donate будут отправлены в первый комментарий, поэтому Telegram не скроет кнопку «Комментарии» у поста.</small></div>`;preview.append(note);
    }
  }

  async function refreshDiagnostics(){
    const body=document.getElementById('publishingHealthBody');if(!body||!isPublishingRoute())return;
    body.innerHTML=`<div class="publishing-health-loading">${ico('loader-circle')} Проверяем Telegram…</div>`;icons();
    try{const d=(await api('/api/app/admin/publishing/diagnostics')).diagnostics||{};if(!isPublishingRoute()||!body.isConnected)return;body.innerHTML=healthCard('radio',d.channel,'Канал публикации')+healthCard('messages-square',d.discussion,'Комментарии');}
    catch(e){if(stalePublishing(e)||!body.isConnected)return;body.innerHTML=`<div class="publisher-health-card bad">${ico('circle-x')}<div><strong>Диагностика не выполнена</strong><span>${esc(e.message)}</span></div></div>`;}icons();
  }
  function healthCard(iconName,item={},title){const ok=Boolean(item.ok);return `<div class="publisher-health-card ${ok?'ok':'bad'}"><div class="publisher-health-icon">${ico(ok?'circle-check':iconName)}</div><div><strong>${esc(title)}</strong><span>${esc(item.message||'Нет данных')}</span>${item.id?`<small>ID: ${esc(item.id)}</small>`:''}</div></div>`;}
  async function refreshLogs(){
    const body=document.getElementById('publishingLogsBody');if(!body||!isPublishingRoute())return;
    try{const rows=(await api('/api/app/admin/publishing/logs')).logs||[];if(!isPublishingRoute()||!body.isConnected)return;body.innerHTML=rows.length?rows.map(logRow).join(''):'<div class="admin-empty">Событий пока нет. После теста или публикации они появятся здесь.</div>';}
    catch(e){if(stalePublishing(e)||!body.isConnected)return;body.innerHTML=`<div class="admin-empty">Не удалось загрузить журнал: ${esc(e.message)}</div>`;}icons();
  }
  function logRow(x){const map={success:['circle-check','Готово'],error:['circle-x','Ошибка'],warning:['triangle-alert','Внимание'],info:['circle-dot','Инфо']},[ic,label]=map[x.level]||map.info;return `<article class="publishing-log-row ${esc(x.level)}"><div class="publishing-log-icon">${ico(ic)}</div><div class="publishing-log-copy"><div><strong>${esc(x.message)}</strong><span>${esc(label)}</span></div><small>${fmt(x.created_at)}${x.publication_id?` · публикация #${x.publication_id}`:''}</small>${x.details?`<details><summary>Технические детали</summary><pre>${esc(x.details)}</pre></details>`:''}</div></article>`;}
  function fmt(v){try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v));}catch{return v||'';}}
  function startLogs(){
    if(logTimer||!isPublishingRoute())return;
    logTimer=setTimeout(async()=>{
      logTimer=0;
      if(document.visibilityState==='visible'&&isPublishingRoute())await refreshLogs();
      startLogs();
    },10000);
  }
  function stopLogs(){if(logTimer){clearTimeout(logTimer);logTimer=0;}}
  function bindSpoilerPreview(){
    const spoiler=document.getElementById('pubImageSpoiler'),image=document.getElementById('pubImage');if(!spoiler||spoiler.dataset.bound)return;spoiler.dataset.bound='1';
    const update=()=>{const box=document.getElementById('tgPreviewImage');if(!box)return;box.classList.toggle('spoiler',Boolean(spoiler.checked&&box.querySelector('img')));if(spoiler.checked&&box.querySelector('img')){if(!box.querySelector('.tg-spoiler-badge'))box.insertAdjacentHTML('beforeend',`<div class="tg-spoiler-badge">${ico('eye-off')}<span>СПОЙЛЕР</span></div>`);}else box.querySelector('.tg-spoiler-badge')?.remove();icons();};
    spoiler.addEventListener('change',update);image?.addEventListener('change',()=>setTimeout(update,0));update();
  }
  async function createAndAct(mode){
    if(busy||!isPublishingRoute())return;
    const title=document.getElementById('pubTitle')?.value.trim()||'',body=document.getElementById('pubBody')?.value.trim()||'';
    if(!title||!body)return toast('Заполните название и текст публикации.',true);
    if(mode==='publish'&&!window.confirm('Опубликовать пост в канале прямо сейчас?'))return;
    busy=true;setBusy(true,mode);
    try{
      const form=new FormData();form.set('internal_title',title);form.set('body',body);
      for(const [key,id] of [['add_footer','pubFooter'],['add_donate','pubDonate'],['add_bot_comment','pubBotComment'],['notify_users','pubNotify'],['image_spoiler','pubImageSpoiler']])form.set(key,document.getElementById(id)?.checked?'1':'0');
      const image=document.getElementById('pubImage')?.files?.[0];if(image)form.set('image',image,image.name);
      [...(document.getElementById('pubFiles')?.files||[])].slice(0,8).forEach(f=>form.append('files',f,f.name));
      const created=await api('/api/app/admin/publications',{method:'POST',body:form});const id=created.publication?.publication?.id;if(!id)throw new Error('Worker не вернул ID созданного черновика.');
      if(isPublishingRoute())await refreshLogs();
      if(mode==='test'){await api(`/api/app/admin/publications/${id}/test`,{method:'POST'});toast('Тест отправлен вам в Telegram.');}
      else if(mode==='publish'){const r=await api(`/api/app/admin/publications/${id}/publish`,{method:'POST'});toast(`Пост опубликован${r.channel_message_id?` · message #${r.channel_message_id}`:''}.`);}
      else toast(`Черновик #${id} сохранён.`);
      if(isPublishingRoute()){
        await refreshDiagnostics();
        await refreshLogs();
        // Save and test are non-destructive actions: keep every field and selected file in place.
        // A full route refresh is only useful after a real publish, when the result screen takes over.
        if(mode==='publish')scheduleRouteRefresh(900);
      }
    }catch(e){toast(e.message,true);if(isPublishingRoute()){await refreshDiagnostics();await refreshLogs();}}
    finally{busy=false;setBusy(false,mode);}
  }
  function scheduleRouteRefresh(delay){setTimeout(()=>{if(isPublishingRoute())void adminRuntime.refresh();},delay);}
  function setBusy(on,mode){for(const id of ['pubSave','pubTest','pubPublish']){const b=document.getElementById(id);if(b)b.disabled=on;}const active=document.getElementById(mode==='test'?'pubTest':mode==='publish'?'pubPublish':'pubSave');if(active&&on){active.dataset.old=active.innerHTML;active.innerHTML=`${ico('loader-circle')} Выполняем…`;active.classList.add('is-busy');icons();}else document.querySelectorAll('.publisher-actions button[data-old]').forEach(b=>{b.innerHTML=b.dataset.old;b.removeAttribute('data-old');b.classList.remove('is-busy');icons();});}

  let managementCache=null,managementLoading=false;
  async function managementData(force=false){if(force)managementCache=null;if(managementCache&&!force)return managementCache;if(managementLoading)return managementCache||{};managementLoading=true;try{managementCache=await api('/api/app/admin/publishing');return managementCache;}finally{managementLoading=false;}}
  async function installManagement(){
    if(!isManagementRoute()||!document.querySelector('.admin-publications-v3'))return;
    const d=await managementData().catch(()=>null);if(!d||!isManagementRoute())return;
    const map=new Map((d.publications||[]).map(x=>[Number(x.id),x]));
    document.querySelectorAll('.admin-publication-card').forEach(card=>{
      const check=card.querySelector('[data-check-pub]'),id=Number(check?.dataset.checkPub),p=map.get(id);
      if(!id||!p||card.dataset.managementReady==='1')return;
      card.dataset.managementReady='1';if(p.status!=='published')return;
      const actions=card.querySelector('.admin-publication-actions');if(!actions)return;
      if(p.telegram_deleted_at){card.classList.add('telegram-deleted');actions.insertAdjacentHTML('beforeend',`<span class="telegram-deleted-label">${ico('trash-2')} Удалено из Telegram</span>`);icons();return;}
      const edit=document.createElement('button');edit.type='button';edit.className='publication-edit-button';edit.innerHTML=`${ico('pencil-line')} Редактировать текст`;
      const del=document.createElement('button');del.type='button';del.className='publication-delete-button';del.innerHTML=`${ico('trash-2')} Удалить из Telegram`;
      edit.addEventListener('click',()=>openEditor(card,p));del.addEventListener('click',()=>void deleteTelegram(card,p));actions.append(edit,del);
    });icons();
  }
  function openEditor(card,p){
    if(!isManagementRoute()||!card.isConnected)return;
    let box=card.querySelector('.publication-inline-editor');if(box){box.remove();return;}
    box=document.createElement('div');box.className='publication-inline-editor';box.innerHTML=`<div class="publication-editor-head"><strong>${ico('pencil-line')} Редактирование опубликованного поста</strong><span>Изменится текст в Telegram. Изображение, spoiler и комментарии останутся на месте.</span></div><textarea maxlength="700">${esc(p.body_html||'')}</textarea><div class="publication-editor-count">${String(p.body_html||'').length} / 700</div><div class="publication-editor-actions"><button type="button" data-edit-cancel>Отмена</button><button type="button" class="primary" data-edit-save>${ico('save')} Сохранить в Telegram</button></div>`;
    card.querySelector('.admin-publication-main')?.append(box);const ta=box.querySelector('textarea'),count=box.querySelector('.publication-editor-count');ta?.addEventListener('input',()=>count.textContent=`${ta.value.length} / 700`);box.querySelector('[data-edit-cancel]')?.addEventListener('click',()=>box.remove());box.querySelector('[data-edit-save]')?.addEventListener('click',async e=>{const body=ta.value.trim();if(!body)return toast('Текст публикации не может быть пустым.',true);const b=e.currentTarget;b.disabled=true;try{await api(`/api/app/admin/publications/${p.id}/edit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})});p.body_html=body;toast('Пост обновлён в Telegram.');if(isManagementRoute()&&box.isConnected)box.remove();managementCache=null;}catch(err){toast(err.message,true);}finally{if(b.isConnected)b.disabled=false;}});icons();setTimeout(()=>{if(isManagementRoute())ta?.focus();},0);
  }
  async function deleteTelegram(card,p){
    if(!isManagementRoute()||!window.confirm(`Удалить публикацию «${p.internal_title}» из Telegram?\n\nЗапись, вложения и журнал останутся в Dollar TL.`))return;
    const b=card.querySelector('.publication-delete-button');if(b)b.disabled=true;
    try{const d=await api(`/api/app/admin/publications/${p.id}/delete-telegram`,{method:'POST'});p.telegram_deleted_at=d.telegram_deleted_at||new Date().toISOString();managementCache=null;toast('Пост удалён из Telegram. История сохранена.');if(!isManagementRoute()||!card.isConnected)return;card.classList.add('telegram-deleted');card.querySelector('.publication-edit-button')?.remove();b?.remove();const actions=card.querySelector('.admin-publication-actions');actions?.insertAdjacentHTML('beforeend',`<span class="telegram-deleted-label">${ico('trash-2')} Удалено из Telegram</span>`);icons();}catch(err){toast(err.message,true);if(b?.isConnected)b.disabled=false;}
  }

  document.addEventListener('click',e=>{if(!isPublishingRoute())return;const b=e.target.closest?.('#pubSave,#pubTest,#pubPublish');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();void createAndAct(b.id==='pubTest'?'test':b.id==='pubPublish'?'publish':'save');},true);
  document.addEventListener('dtl:adminroutechange',event=>{
    const id=event.detail?.id||'';
    if(id==='section:publishing'){runtime.schedule();startLogs();}
    else{installedEditor=null;stopLogs();}
    if(id==='tools:publications'){managementCache=null;runtime.schedule();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isPublishingRoute()){void refreshDiagnostics();void refreshLogs();startLogs();}});
  runtime.registerPatcher(()=>{
    if(isPublishingRoute())install();else{installedEditor=null;stopLogs();}
    if(isManagementRoute())void installManagement();
  });

  window.DTL_ADMIN_PUBLISHING=Object.freeze({
    refresh:()=>{if(isPublishingRoute()){void refreshDiagnostics();void refreshLogs();}},
    stop:stopLogs,
    state:()=>({busy,polling:Boolean(logTimer),route:adminRuntime.activeRoute?.()||null}),
  });
})();
