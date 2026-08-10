(() => {
  const tg=window.Telegram?.WebApp;
  const runtime=window.DTL_RUNTIME;
  if(!runtime?.registerPatcher)throw new Error('DTL runtime core must load before publishing-fixes.js');

  let busy=false,logTimer=0,lastImageUrl='',installedEditor=null;
  const H=()=>({'x-telegram-init-data':tg?.initData||''});
  async function api(path,options={}){const r=await fetch(path,{...options,headers:{...H(),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.message||`HTTP ${r.status}`);return d;}
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}
  function toast(text,error=false){const r=document.getElementById('toastRegion');if(!r)return;const e=document.createElement('div');e.className=`toast ${error?'error':'success'}`;e.textContent=text;r.append(e);setTimeout(()=>e.remove(),3600);}
  function editor(){return document.querySelector('.publisher-editor');}
  function isPublishing(){return Boolean(editor());}

  function install(){
    const current=editor();
    if(!current){installedEditor=null;stopLogs();return;}
    injectSpoiler();injectHealth();injectLogs();injectNativeCommentsNote();bindSpoilerPreview();startLogs();icons();
    if(installedEditor===current)return;
    installedEditor=current;
    refreshDiagnostics();refreshLogs();
  }
  function injectSpoiler(){
    const options=document.querySelector('.publisher-options');if(!options||document.getElementById('pubImageSpoiler'))return;
    const label=document.createElement('label');label.className='publisher-spoiler-option';label.innerHTML=`<input id="pubImageSpoiler" type="checkbox"><span><b>${ico('eye-off')} Скрыть изображение под спойлером</b><small>Telegram покажет встроенную spoiler-анимацию до нажатия.</small></span>`;options.prepend(label);
  }
  function injectHealth(){
    const layout=document.querySelector('.publisher-layout');if(!layout||document.getElementById('publishingHealth'))return;
    const box=document.createElement('section');box.id='publishingHealth';box.className='admin-panel publishing-health';box.innerHTML=`<div class="admin-panel-head"><div><h2>Проверка Telegram</h2><p>Канал, discussion group и права бота</p></div><button type="button" id="publishingHealthRefresh">${ico('refresh-cw')} Проверить</button></div><div id="publishingHealthBody" class="publishing-health-grid"><div class="publishing-health-loading">${ico('loader-circle')} Проверяем…</div></div>`;layout.before(box);box.querySelector('#publishingHealthRefresh')?.addEventListener('click',refreshDiagnostics);
  }
  function injectLogs(){
    const history=document.querySelector('.admin-publication-history');if(!history||document.getElementById('publishingLogs'))return;
    const box=document.createElement('section');box.id='publishingLogs';box.className='admin-panel publishing-logs';box.innerHTML=`<div class="admin-panel-head"><div><h2>Журнал публикаций</h2><p>Что реально произошло на Worker и в Telegram</p></div><button type="button" id="publishingLogsRefresh">${ico('refresh-cw')} Обновить</button></div><div id="publishingLogsBody" class="publishing-log-list"><div class="admin-empty">Загружаем журнал…</div></div>`;history.before(box);box.querySelector('#publishingLogsRefresh')?.addEventListener('click',refreshLogs);
  }
  function injectNativeCommentsNote(){
    const preview=document.querySelector('.publisher-preview .tg-preview');if(!preview)return;
    if(!preview.querySelector('.tg-preview-comments-note')){
      const note=document.createElement('div');
      note.className='tg-preview-comments-note';
      note.innerHTML=`${ico('message-circle')}<div><strong>Комментарии останутся нативными</strong><small>Кнопки Suggest a Novel и Donate будут отправлены в первый комментарий, поэтому Telegram не скроет кнопку «Комментарии» у поста.</small></div>`;
      preview.append(note);
    }
  }

  async function refreshDiagnostics(){
    const body=document.getElementById('publishingHealthBody');if(!body)return;
    body.innerHTML=`<div class="publishing-health-loading">${ico('loader-circle')} Проверяем Telegram…</div>`;icons();
    try{const d=(await api('/api/app/admin/publishing/diagnostics')).diagnostics||{};body.innerHTML=healthCard('radio',d.channel,'Канал публикации')+healthCard('messages-square',d.discussion,'Комментарии');}
    catch(e){body.innerHTML=`<div class="publisher-health-card bad">${ico('circle-x')}<div><strong>Диагностика не выполнена</strong><span>${esc(e.message)}</span></div></div>`;}icons();
  }
  function healthCard(iconName,item={},title){const ok=Boolean(item.ok);return `<div class="publisher-health-card ${ok?'ok':'bad'}"><div class="publisher-health-icon">${ico(ok?'circle-check':iconName)}</div><div><strong>${esc(title)}</strong><span>${esc(item.message||'Нет данных')}</span>${item.id?`<small>ID: ${esc(item.id)}</small>`:''}</div></div>`;}

  async function refreshLogs(){
    const body=document.getElementById('publishingLogsBody');if(!body)return;
    try{const rows=(await api('/api/app/admin/publishing/logs')).logs||[];body.innerHTML=rows.length?rows.map(logRow).join(''):'<div class="admin-empty">Событий пока нет. После теста или публикации они появятся здесь.</div>';}
    catch(e){body.innerHTML=`<div class="admin-empty">Не удалось загрузить журнал: ${esc(e.message)}</div>`;}icons();
  }
  function logRow(x){const map={success:['circle-check','Готово'],error:['circle-x','Ошибка'],warning:['triangle-alert','Внимание'],info:['circle-dot','Инфо']},[ic,label]=map[x.level]||map.info;return `<article class="publishing-log-row ${esc(x.level)}"><div class="publishing-log-icon">${ico(ic)}</div><div class="publishing-log-copy"><div><strong>${esc(x.message)}</strong><span>${esc(label)}</span></div><small>${fmt(x.created_at)}${x.publication_id?` · публикация #${x.publication_id}`:''}</small>${x.details?`<details><summary>Технические детали</summary><pre>${esc(x.details)}</pre></details>`:''}</div></article>`;}
  function fmt(v){try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v));}catch{return v||'';}}
  function startLogs(){if(logTimer)return;logTimer=setInterval(()=>{if(document.visibilityState==='visible'&&isPublishing())refreshLogs();},10000);}
  function stopLogs(){if(logTimer){clearInterval(logTimer);logTimer=0;}}

  function bindSpoilerPreview(){
    const spoiler=document.getElementById('pubImageSpoiler'),image=document.getElementById('pubImage');if(!spoiler||spoiler.dataset.bound)return;spoiler.dataset.bound='1';
    const update=()=>{const box=document.getElementById('tgPreviewImage');if(!box)return;box.classList.toggle('spoiler',Boolean(spoiler.checked&&box.querySelector('img')));if(spoiler.checked&&box.querySelector('img')){if(!box.querySelector('.tg-spoiler-badge'))box.insertAdjacentHTML('beforeend',`<div class="tg-spoiler-badge">${ico('eye-off')}<span>СПОЙЛЕР</span></div>`);}else box.querySelector('.tg-spoiler-badge')?.remove();icons();};
    spoiler.addEventListener('change',update);image?.addEventListener('change',()=>setTimeout(update,0));update();
  }

  async function createAndAct(mode){
    if(busy)return;
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
      await refreshLogs();
      if(mode==='test'){await api(`/api/app/admin/publications/${id}/test`,{method:'POST'});toast('Тест отправлен вам в Telegram.');}
      else if(mode==='publish'){const r=await api(`/api/app/admin/publications/${id}/publish`,{method:'POST'});toast(`Пост опубликован${r.channel_message_id?` · message #${r.channel_message_id}`:''}.`);}
      else toast(`Черновик #${id} сохранён.`);
      await refreshDiagnostics();await refreshLogs();
      setTimeout(()=>document.querySelector('[data-admin-section="publishing"]')?.click(),mode==='save'?350:900);
    }catch(e){toast(e.message,true);await refreshDiagnostics();await refreshLogs();}
    finally{busy=false;setBusy(false,mode);}
  }
  function setBusy(on,mode){for(const id of ['pubSave','pubTest','pubPublish']){const b=document.getElementById(id);if(b)b.disabled=on;}const active=document.getElementById(mode==='test'?'pubTest':mode==='publish'?'pubPublish':'pubSave');if(active&&on){active.dataset.old=active.innerHTML;active.innerHTML=`${ico('loader-circle')} Выполняем…`;active.classList.add('is-busy');icons();}else document.querySelectorAll('.publisher-actions button[data-old]').forEach(b=>{b.innerHTML=b.dataset.old;b.removeAttribute('data-old');b.classList.remove('is-busy');icons();});}

  document.addEventListener('click',e=>{const b=e.target.closest?.('#pubSave,#pubTest,#pubPublish');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();createAndAct(b.id==='pubTest'?'test':b.id==='pubPublish'?'publish':'save');},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isPublishing()){refreshDiagnostics();refreshLogs();}});
  runtime.registerPatcher(install);
})();
