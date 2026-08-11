(() => {
  const adminRuntime=window.DTL_ADMIN;
  if(!adminRuntime?.api)throw new Error('Canonical admin runtime must load before admin-request-ops.js');

  let busy=false,currentId=null;
  const api=(path,options={})=>adminRuntime.api(path,options);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icons=()=>adminRuntime.icons?.();
  const toast=(text,error=false)=>adminRuntime.toast?.(text,error);
  const isRequestsRoute=()=>adminRuntime.activeRoute?.()==='section:requests';
  const isCurrent=id=>isRequestsRoute()&&Number(currentId)===Number(id);
  const stale=(id,error)=>error?.name==='AbortError'||!isCurrent(id);

  async function open(id){
    id=Number(id);if(!id||!isRequestsRoute())return false;
    currentId=id;
    const area=document.querySelector('.admin-content');if(!area)return false;
    area.innerHTML=`<div class="admin-loading">${ico('loader-circle')} Загружаем заявку #${id}…</div>`;icons();
    adminRuntime.setHead?.(`Заявка #${id}`,'Расширенное управление, очередь, связи и журнал действий');
    try{const data=await api(`/api/app/admin/requests/${id}`);if(!isCurrent(id))return false;render(data);return true;}
    catch(e){if(stale(id,e))return false;if(area.isConnected){area.innerHTML=`<div class="admin-panel admin-error">${ico('triangle-alert')}<strong>Не удалось открыть заявку</strong><span>${esc(e.message)}</span><button type="button" id="requestOpsBack">${ico('arrow-left')} Назад к заявкам</button></div>`;document.getElementById('requestOpsBack')?.addEventListener('click',goBack);icons();}return false;}
  }

  function render(data){
    const area=document.querySelector('.admin-content');if(!area||!isRequestsRoute())return;
    const r=data.request||{},m=data.admin_meta||{},pubs=data.publications||[],audit=data.audit||[];
    if(Number(currentId)!==Number(r.id))return;
    const queued=r.status==='accepted'&&r.queue_status==='queued';
    const rejected=r.status==='rejected';
    area.innerHTML=`<section class="request-ops">
      <div class="request-ops-topbar"><button type="button" id="requestOpsBack">${ico('arrow-left')} Назад</button><div><span>ЗАЯВКА #${r.id}</span><h2>${esc(r.title)}</h2><p>${r.username?'@'+esc(r.username)+' · ':''}${r.user_id} · ${status(r)}</p></div><div class="request-ops-top-actions"><button type="button" id="requestOpsRaw">${ico('paperclip')} Raw-файл</button><button type="button" id="requestOpsPublish">${ico('send')} Создать публикацию</button></div></div>
      <div class="request-ops-grid">
        <section class="admin-panel request-ops-editor"><div class="admin-panel-head"><div><h2>Данные заявки</h2><p>Изменения применяются к канонической записи</p></div><button type="button" id="requestOpsSave">${ico('save')} Сохранить</button></div>
          <div class="request-edit-grid"><label class="admin-field wide"><span>Название</span><input id="reqTitle" maxlength="300" value="${esc(r.title||'')}"></label><label class="admin-field"><span>Язык оригинала</span><input id="reqLanguage" maxlength="120" value="${esc(r.original_language||'')}"></label><label class="admin-field"><span>Глав</span><input id="reqChapters" type="number" min="1" max="10000000" value="${Number(r.chapter_count||0)}"></label><label class="admin-field"><span>Статус оригинала</span><select id="reqPublicationStatus"><option value="ongoing" ${r.publication_status==='ongoing'?'selected':''}>Ongoing</option><option value="completed" ${r.publication_status==='completed'?'selected':''}>Completed</option></select></label><label class="admin-field wide"><span>Source URL</span><input id="reqSource" maxlength="500" value="${esc(r.source_url||'')}"></label><label class="admin-field wide"><span>Жанры / теги</span><textarea id="reqTags" maxlength="450" rows="3">${esc(r.genres_tags||'')}</textarea></label><label class="admin-field wide"><span>Sexual content</span><textarea id="reqSexual" maxlength="450" rows="3">${esc(r.sexual_content||'')}</textarea></label><label class="admin-field wide"><span>Sensitive content</span><textarea id="reqSensitive" maxlength="450" rows="3">${esc(r.sensitive_content||'')}</textarea></label></div>
        </section>
        <aside class="admin-panel request-ops-state"><div class="admin-panel-head"><div><h2>Операции</h2><p>Состояние и очередь</p></div></div>
          <div class="request-state-card"><span>Статус</span><strong>${status(r)}</strong><small>${queued?`Позиция #${r.queue_position??'—'}`:r.queue_status==='in_progress'?`Прогресс ${r.current_chapter??0}/${r.chapter_count}`:'Изменение состояния — через основные кнопки заявки'}</small></div>
          ${queued?`<div class="request-position-control"><label>Точная позиция в очереди</label><div><input id="reqQueuePosition" type="number" min="1" value="${Number(r.queue_position||1)}"><button id="requestOpsMove">${ico('list-ordered')} Переместить</button></div></div>`:''}
          ${rejected?`<button class="request-danger-soft" type="button" id="requestOpsRestore">${ico('rotate-ccw')} Восстановить в «На проверке»</button>`:''}
          <dl class="request-facts"><div><dt>План</dt><dd>${r.plan==='subscriber'?'Boosty':'Обычный'}</dd></div><div><dt>Создано</dt><dd>${fmt(r.created_at)}</dd></div><div><dt>Обновлено</dt><dd>${fmt(r.updated_at)}</dd></div><div><dt>Raw</dt><dd>${esc(r.raw_file_name||'Telegram file')}</dd></div></dl>
        </aside>
        <section class="admin-panel request-ops-meta"><div class="admin-panel-head"><div><h2>Внутренние данные</h2><p>Пользователь их никогда не увидит</p></div><button type="button" id="requestOpsMetaSave">${ico('save')} Сохранить</button></div><label class="admin-field"><span>Admin notes</span><textarea id="reqAdminNotes" rows="6" maxlength="4000" placeholder="Контекст, договорённости, проблемы…">${esc(m.notes||'')}</textarea></label><label class="admin-field"><span>Дубликат заявки #</span><input id="reqDuplicate" type="number" min="1" value="${m.duplicate_of_submission_id||''}" placeholder="Пусто — не дубликат"></label><label class="request-archive-toggle"><input id="reqArchived" type="checkbox" ${m.archived_at?'checked':''}><span><b>Архивировать в админке</b><small>Не меняет пользовательский статус заявки.</small></span></label></section>
        <section class="admin-panel request-ops-links"><div class="admin-panel-head"><div><h2>Связанные публикации</h2><p>Request ↔ Publication</p></div><button type="button" id="requestOpsPublish2">${ico('plus')} Новая</button></div>${pubs.length?pubs.map(pubRow).join(''):'<div class="admin-empty">Публикаций пока нет.</div>'}</section>
        <section class="admin-panel request-ops-history"><div class="admin-panel-head"><div><h2>История</h2><p>Административные изменения</p></div></div><div class="request-history-list">${audit.length?audit.map(auditRow).join(''):'<div class="admin-empty">В журнале пока пусто.</div>'}</div></section>
      </div></section>`;

    document.getElementById('requestOpsBack')?.addEventListener('click',goBack);
    document.getElementById('requestOpsSave')?.addEventListener('click',()=>void saveEdit(r.id));
    document.getElementById('requestOpsMetaSave')?.addEventListener('click',()=>void saveMeta(r.id));
    document.getElementById('requestOpsMove')?.addEventListener('click',()=>void moveQueue(r.id));
    document.getElementById('requestOpsRestore')?.addEventListener('click',()=>void restore(r.id));
    document.getElementById('requestOpsRaw')?.addEventListener('click',()=>void sendRaw(r.id));
    for(const id of ['requestOpsPublish','requestOpsPublish2'])document.getElementById(id)?.addEventListener('click',()=>createPublication(r));
    icons();
  }

  async function saveEdit(id){if(busy)return;busy=true;try{const body={title:v('reqTitle'),original_language:v('reqLanguage'),chapter_count:Number(v('reqChapters')),publication_status:v('reqPublicationStatus'),source_url:v('reqSource'),genres_tags:v('reqTags'),sexual_content:v('reqSexual'),sensitive_content:v('reqSensitive')};const data=await api(`/api/app/admin/requests/${id}/edit`,json(body));toast('Заявка обновлена.');if(isCurrent(id))render(data);}catch(e){toast(e.message,true);}finally{busy=false;}}
  async function saveMeta(id){if(busy)return;busy=true;try{const duplicateRaw=v('reqDuplicate');const body={notes:v('reqAdminNotes'),duplicate_of_submission_id:duplicateRaw?Number(duplicateRaw):null,archived:Boolean(document.getElementById('reqArchived')?.checked)};const data=await api(`/api/app/admin/requests/${id}/meta`,json(body));toast('Внутренние данные сохранены.');if(isCurrent(id))render(data);}catch(e){toast(e.message,true);}finally{busy=false;}}
  async function moveQueue(id){if(busy)return;busy=true;try{const data=await api(`/api/app/admin/requests/${id}/queue-position`,json({position:Number(v('reqQueuePosition'))}));toast('Позиция очереди обновлена.');if(isCurrent(id))render(data);}catch(e){toast(e.message,true);}finally{busy=false;}}
  async function restore(id){if(!window.confirm('Вернуть отклонённую заявку в статус «На проверке»? Если слот ранее возвращался, заявка снова будет считаться активной.'))return;if(busy)return;busy=true;try{const data=await api(`/api/app/admin/requests/${id}/restore-pending`,{method:'POST'});toast('Заявка восстановлена.');if(isCurrent(id))render(data);}catch(e){toast(e.message,true);}finally{busy=false;}}
  async function sendRaw(id){if(busy)return;busy=true;try{await api(`/api/app/admin/requests/${id}/raw`,{method:'POST'});toast('Raw-файл отправлен вам в Telegram.');}catch(e){toast(e.message,true);}finally{busy=false;}}
  function createPublication(r){try{sessionStorage.setItem('dtl:publicationSubmissionId',String(r.id));sessionStorage.setItem('dtl:publicationSubmissionTitle',String(r.title||''));}catch{}currentId=null;void adminRuntime.open('section:publishing');}
  function goBack(){if(!isRequestsRoute())return;currentId=null;void adminRuntime.refresh();}

  function pubRow(p){return `<div class="request-linked-pub"><div>${ico('send')}<span><strong>#${p.id} · ${esc(p.internal_title||'Публикация')}</strong><small>${esc(p.status)} · ${p.published_at?fmt(p.published_at):fmt(p.created_at)}${p.channel_message_id?` · Telegram #${p.channel_message_id}`:''}</small></span></div>${p.telegram_deleted_at?'<em>Удалено из Telegram</em>':''}</div>`;}
  function auditRow(a){const label={submission_edit:'Редактирование данных',submission_queue_position:'Позиция очереди',submission_admin_meta:'Заметки / архив',submission_restore_pending:'Восстановление заявки',submission_raw_sent:'Raw-файл отправлен',submission_accept:'Принята',submission_reject:'Отклонена',submission_return:'Отклонена + слот возвращён',submission_start:'Перевод начат',submission_complete:'Перевод завершён',submission_backqueue:'Возвращена в очередь',submission_reopen:'Возвращена в работу',submission_progress:'Обновлён прогресс',submission_up:'Поднята в очереди',submission_down:'Опущена в очереди'}[a.action]||a.action;return `<div class="request-history-row"><span class="request-history-dot"></span><div><strong>${esc(label)}</strong><small>${fmt(a.created_at)} · admin ${a.admin_user_id}</small>${a.details?`<details><summary>Детали</summary><pre>${esc(pretty(a.details))}</pre></details>`:''}</div></div>`;}
  function pretty(value){try{return JSON.stringify(JSON.parse(value),null,2);}catch{return String(value||'');}}
  function status(r){if(r.status==='pending')return'На проверке';if(r.status==='rejected')return r.slot_returned?'Отклонена · слот возвращён':'Отклонена';if(r.queue_status==='completed')return'Завершена';if(r.queue_status==='in_progress')return'В работе';if(r.queue_status==='queued')return`В очереди #${r.queue_position??'—'}`;return String(r.status||'—');}
  function fmt(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}}
  const v=id=>document.getElementById(id)?.value?.trim?.()||'';
  const json=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

  document.addEventListener('dtl:adminroutechange',event=>{if(event.detail?.id!=='section:requests')currentId=null;});
  window.DTL_ADMIN_REQUEST_OPS=Object.freeze({open,close:goBack,state:()=>({busy,currentId})});
})();
