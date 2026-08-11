(() => {
  const admin=window.DTL_ADMIN;
  if(!admin?.api)throw new Error('Canonical admin runtime must load before admin-request-ops.js');

  let busy=false,currentId=null,baseline='',dirty=false;
  const api=(path,options={})=>admin.api(path,options);
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icons=()=>admin.icons?.();
  const toast=(text,error=false)=>admin.toast?.(text,error);
  const isRequestsRoute=()=>admin.activeRoute?.()==='section:requests';
  const isCurrent=id=>isRequestsRoute()&&Number(currentId)===Number(id);
  const stale=(id,error)=>error?.name==='AbortError'||!isCurrent(id);

  async function open(id){
    id=Number(id);if(!id||!isRequestsRoute())return false;
    currentId=id;dirty=false;baseline='';lockNavigation(false);
    const area=document.querySelector('.admin-content');if(!area)return false;
    area.innerHTML=`<div class="admin-loading">${ico('loader-circle')} Загружаем заявку #${id}…</div>`;icons();
    admin.setHead?.(`Заявка #${id}`,'Редактор заявки');
    try{const data=await api(`/api/app/admin/requests/${id}`);if(!isCurrent(id))return false;render(data);return true;}
    catch(e){if(stale(id,e))return false;if(area.isConnected){area.innerHTML=`<div class="admin-panel admin-error">${ico('triangle-alert')}<strong>Не удалось открыть заявку</strong><span>${esc(e.message)}</span><button type="button" id="requestOpsBack">${ico('arrow-left')} Назад к заявкам</button></div>`;document.getElementById('requestOpsBack')?.addEventListener('click',()=>void goBack());icons();}return false;}
  }

  function render(data){
    const area=document.querySelector('.admin-content');if(!area||!isRequestsRoute())return;
    const r=data.request||{},m=data.admin_meta||{},pubs=data.publications||[],audit=data.audit||[];
    if(Number(currentId)!==Number(r.id))return;
    const queued=r.status==='accepted'&&r.queue_status==='queued';
    const rejected=r.status==='rejected';

    area.innerHTML=`<section class="request-ops request-ops-v2">
      <div class="request-ops-topbar">
        <button type="button" id="requestOpsBack">${ico('arrow-left')} Назад</button>
        <div><span>ЗАЯВКА #${r.id}</span><h2>${esc(r.title)}</h2><p>${r.username?'@'+esc(r.username)+' · ':''}${r.user_id} · ${status(r)}</p></div>
        <div class="request-ops-top-actions"><button type="button" id="requestOpsRaw">${ico('paperclip')} Raw</button><button type="button" id="requestOpsPublish">${ico('send')} Публикация</button></div>
      </div>

      <div class="request-ops-grid request-ops-grid-v2">
        <main class="request-ops-main">
          <section class="admin-panel request-ops-editor">
            <div class="request-section-head"><div><span>01</span><h3>Основное</h3></div><p>Название, язык и объём</p></div>
            <div class="request-edit-grid">
              <label class="admin-field wide"><span>Название</span><input id="reqTitle" maxlength="300" value="${esc(r.title||'')}"></label>
              <label class="admin-field"><span>Язык оригинала</span><input id="reqLanguage" maxlength="120" value="${esc(r.original_language||'')}"></label>
              <label class="admin-field"><span>Количество глав</span><input id="reqChapters" type="number" min="1" max="10000000" value="${Number(r.chapter_count||0)}"></label>
            </div>
          </section>

          <section class="admin-panel request-ops-section">
            <div class="request-section-head"><div><span>02</span><h3>Источник</h3></div><p>Состояние оригинала и ссылка</p></div>
            <div class="request-edit-grid">
              <label class="admin-field"><span>Статус оригинала</span><select id="reqPublicationStatus"><option value="ongoing" ${r.publication_status==='ongoing'?'selected':''}>Продолжается</option><option value="completed" ${r.publication_status==='completed'?'selected':''}>Завершён</option></select></label>
              <label class="admin-field wide"><span>Source URL</span><input id="reqSource" maxlength="500" value="${esc(r.source_url||'')}" placeholder="https://…"></label>
            </div>
          </section>

          <section class="admin-panel request-ops-section">
            <div class="request-section-head"><div><span>03</span><h3>Контент</h3></div><p>Теги и модерационные поля</p></div>
            <div class="request-edit-grid">
              <label class="admin-field wide"><span>Жанры / теги</span><textarea id="reqTags" maxlength="450" rows="3">${esc(r.genres_tags||'')}</textarea></label>
              <label class="admin-field wide"><span>Sexual content</span><textarea id="reqSexual" maxlength="450" rows="3">${esc(r.sexual_content||'')}</textarea></label>
              <label class="admin-field wide"><span>Sensitive content</span><textarea id="reqSensitive" maxlength="450" rows="3">${esc(r.sensitive_content||'')}</textarea></label>
            </div>
          </section>

          <section class="admin-panel request-ops-section">
            <div class="request-section-head"><div><span>04</span><h3>Внутреннее</h3></div><p>Видит только администрация</p></div>
            <div class="request-edit-grid">
              <label class="admin-field wide"><span>Заметки</span><textarea id="reqAdminNotes" rows="5" maxlength="4000" placeholder="Контекст, договорённости, проблемы…">${esc(m.notes||'')}</textarea></label>
              <label class="admin-field"><span>Дубликат заявки #</span><input id="reqDuplicate" type="number" min="1" value="${m.duplicate_of_submission_id||''}" placeholder="Не указан"></label>
              <label class="request-archive-toggle wide"><input id="reqArchived" type="checkbox" ${m.archived_at?'checked':''}><span><b>Архивировать в админке</b><small>Не меняет пользовательский статус заявки.</small></span></label>
            </div>
          </section>
        </main>

        <aside class="request-ops-side">
          <section class="admin-panel request-ops-state"><div class="admin-panel-head"><div><h2>Состояние</h2><p>Не входит в обычное сохранение</p></div></div>
            <div class="request-state-card"><span>Статус</span><strong>${status(r)}</strong><small>${queued?`Позиция #${r.queue_position??'—'}`:r.queue_status==='in_progress'?`Прогресс ${r.current_chapter??0}/${r.chapter_count}`:'Статус меняется на экране заявки'}</small></div>
            ${queued?`<div class="request-position-control"><label>Позиция в очереди</label><div><input id="reqQueuePosition" type="number" min="1" value="${Number(r.queue_position||1)}"><button id="requestOpsMove">${ico('list-ordered')} Переместить</button></div></div>`:''}
            ${rejected?`<button class="request-danger-soft" type="button" id="requestOpsRestore">${ico('rotate-ccw')} Вернуть на проверку</button>`:''}
            <dl class="request-facts"><div><dt>План</dt><dd>${r.plan==='subscriber'?'Boosty':'Обычный'}</dd></div><div><dt>Создано</dt><dd>${fmt(r.created_at)}</dd></div><div><dt>Обновлено</dt><dd data-request-updated>${fmt(r.updated_at)}</dd></div><div><dt>Raw</dt><dd>${esc(r.raw_file_name||'Telegram file')}</dd></div></dl>
          </section>
          <section class="admin-panel request-ops-links"><div class="admin-panel-head"><div><h2>Публикации</h2><p>${pubs.length} связанных</p></div><button type="button" id="requestOpsPublish2">${ico('plus')} Новая</button></div>${pubs.length?pubs.map(pubRow).join(''):'<div class="admin-empty">Публикаций пока нет.</div>'}</section>
          <details class="admin-panel request-ops-history"><summary><span>${ico('history')} История</span><small>${audit.length} событий</small></summary><div class="request-history-list">${audit.length?audit.map(auditRow).join(''):'<div class="admin-empty">В журнале пока пусто.</div>'}</div></details>
        </aside>
      </div>

      <div class="request-save-dock" data-request-save-dock>
        <div class="request-save-status"><span class="request-save-dot"></span><div><strong id="requestSaveState">Нет изменений</strong><small id="requestSaveHint">Все данные сохранены</small></div></div>
        <div class="request-save-actions"><button type="button" id="requestOpsDiscard" disabled>Отменить изменения</button><button type="button" class="primary" id="requestOpsSaveAll" disabled>${ico('save')} Сохранить</button></div>
      </div>
    </section>`;

    bind(r);
    baseline=formSnapshot();dirty=false;syncDirty();
    icons();
  }

  function bind(r){
    document.getElementById('requestOpsBack')?.addEventListener('click',()=>void goBack());
    document.getElementById('requestOpsSaveAll')?.addEventListener('click',()=>void saveAll(r.id));
    document.getElementById('requestOpsDiscard')?.addEventListener('click',discardChanges);
    document.getElementById('requestOpsMove')?.addEventListener('click',()=>void moveQueue(r.id));
    document.getElementById('requestOpsRestore')?.addEventListener('click',()=>void restore(r.id));
    document.getElementById('requestOpsRaw')?.addEventListener('click',()=>void sendRaw(r.id));
    for(const id of ['requestOpsPublish','requestOpsPublish2'])document.getElementById(id)?.addEventListener('click',()=>void createPublication(r));
    document.querySelectorAll('.request-ops-main input,.request-ops-main textarea,.request-ops-main select').forEach(el=>{
      el.addEventListener('input',syncDirty);el.addEventListener('change',syncDirty);
    });
    document.querySelector('.request-ops')?.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='s'){
        event.preventDefault();if(dirty&&!busy)void saveAll(r.id);
      }
    });
  }

  function formSnapshot(){
    return JSON.stringify({
      title:v('reqTitle'),original_language:v('reqLanguage'),chapter_count:Number(v('reqChapters')),
      publication_status:v('reqPublicationStatus'),source_url:v('reqSource'),genres_tags:v('reqTags'),
      sexual_content:v('reqSexual'),sensitive_content:v('reqSensitive'),notes:v('reqAdminNotes'),
      duplicate_of_submission_id:v('reqDuplicate')?Number(v('reqDuplicate')):null,archived:Boolean(document.getElementById('reqArchived')?.checked),
    });
  }

  function formBody(){return JSON.parse(formSnapshot());}

  function syncDirty(){
    if(!currentId)return;
    dirty=formSnapshot()!==baseline;
    const save=document.getElementById('requestOpsSaveAll');
    const discard=document.getElementById('requestOpsDiscard');
    if(save)save.disabled=!dirty||busy;
    if(discard)discard.disabled=!dirty||busy;
    setSaveState(busy?'Сохраняем…':dirty?'Есть изменения':'Нет изменений',busy?'Не закрывайте редактор':dirty?'Нажмите Сохранить или Ctrl+S':'Все данные сохранены',busy?'saving':dirty?'dirty':'');
    lockNavigation(dirty||busy);
  }

  function setSaveState(title,hint,tone=''){
    const dock=document.querySelector('[data-request-save-dock]');if(dock)dock.dataset.tone=tone;
    const state=document.getElementById('requestSaveState');if(state)state.textContent=title;
    const sub=document.getElementById('requestSaveHint');if(sub)sub.textContent=hint;
  }

  async function saveAll(id){
    if(busy||!dirty)return;
    busy=true;syncDirty();
    try{
      const data=await api(`/api/app/admin/requests/${id}/save`,json(formBody()));
      if(!isCurrent(id))return;
      const r=data.request||{};
      baseline=formSnapshot();dirty=false;
      const heading=document.querySelector('.request-ops-topbar h2');if(heading)heading.textContent=r.title||v('reqTitle');
      const updated=document.querySelector('[data-request-updated]');if(updated)updated.textContent=fmt(r.updated_at);
      setSaveState('Сохранено',`Последнее сохранение ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`,'saved');
      toast('Заявка сохранена.');
    }catch(e){setSaveState('Ошибка сохранения',e.message||'Повторите попытку','error');toast(e.message,true);}
    finally{busy=false;syncDirty();}
  }

  function discardChanges(){
    if(!dirty||!baseline)return;
    const data=JSON.parse(baseline);
    set('reqTitle',data.title);set('reqLanguage',data.original_language);set('reqChapters',data.chapter_count);set('reqPublicationStatus',data.publication_status);set('reqSource',data.source_url);set('reqTags',data.genres_tags);set('reqSexual',data.sexual_content);set('reqSensitive',data.sensitive_content);set('reqAdminNotes',data.notes);set('reqDuplicate',data.duplicate_of_submission_id??'');
    const archived=document.getElementById('reqArchived');if(archived)archived.checked=Boolean(data.archived);
    syncDirty();
  }

  async function confirmLeave(){
    if(!dirty)return true;
    if(window.DTL_ADMIN_STABILITY?.confirm)return window.DTL_ADMIN_STABILITY.confirm({title:'Есть несохранённые изменения',body:'Если выйти сейчас, изменения в заявке будут потеряны.',confirm:'Выйти без сохранения',danger:true});
    return window.confirm('Есть несохранённые изменения. Выйти без сохранения?');
  }

  async function goBack(){
    if(!isRequestsRoute()||busy)return;
    if(!(await confirmLeave()))return;
    dirty=false;baseline='';lockNavigation(false);currentId=null;void admin.refresh();
  }

  async function createPublication(r){
    if(busy)return;
    if(!(await confirmLeave()))return;
    dirty=false;baseline='';lockNavigation(false);
    try{sessionStorage.setItem('dtl:publicationSubmissionId',String(r.id));sessionStorage.setItem('dtl:publicationSubmissionTitle',String(v('reqTitle')||r.title||''));}catch{}
    currentId=null;void admin.open('section:publishing');
  }

  function lockNavigation(locked){
    document.querySelectorAll('.admin-side-nav button,.admin-mobile-nav button').forEach(button=>{
      if(button.dataset.adminSection==='requests')return;
      if(locked){if(!button.disabled){button.disabled=true;button.dataset.requestEditLocked='1';}}
      else if(button.dataset.requestEditLocked==='1'){button.disabled=false;delete button.dataset.requestEditLocked;}
    });
  }

  async function moveQueue(id){if(busy)return;busy=true;syncDirty();try{const data=await api(`/api/app/admin/requests/${id}/queue-position`,json({position:Number(v('reqQueuePosition'))}));toast('Позиция очереди обновлена.');if(isCurrent(id)){render(data);}}catch(e){toast(e.message,true);}finally{busy=false;syncDirty();}}
  async function restore(id){if(busy)return;const ok=window.DTL_ADMIN_STABILITY?.confirm?await window.DTL_ADMIN_STABILITY.confirm({title:'Вернуть заявку на проверку?',body:'Если слот ранее возвращался, заявка снова будет считаться активной.',confirm:'Восстановить'}):window.confirm('Вернуть заявку на проверку?');if(!ok)return;busy=true;syncDirty();try{const data=await api(`/api/app/admin/requests/${id}/restore-pending`,{method:'POST'});toast('Заявка восстановлена.');if(isCurrent(id))render(data);}catch(e){toast(e.message,true);}finally{busy=false;syncDirty();}}
  async function sendRaw(id){if(busy)return;busy=true;syncDirty();try{await api(`/api/app/admin/requests/${id}/raw`,{method:'POST'});toast('Raw-файл отправлен вам в Telegram.');}catch(e){toast(e.message,true);}finally{busy=false;syncDirty();}}

  function pubRow(p){return `<div class="request-linked-pub"><div>${ico('send')}<span><strong>#${p.id} · ${esc(p.internal_title||'Публикация')}</strong><small>${esc(p.status)} · ${p.published_at?fmt(p.published_at):fmt(p.created_at)}</small></span></div>${p.telegram_deleted_at?'<em>Удалено</em>':''}</div>`;}
  function auditRow(a){const label={submission_admin_save:'Сохранён редактор',submission_edit:'Редактирование данных',submission_queue_position:'Позиция очереди',submission_admin_meta:'Внутренние данные',submission_restore_pending:'Восстановление заявки',submission_raw_sent:'Raw-файл отправлен',submission_accept:'Принята',submission_reject:'Отклонена',submission_return:'Отклонена + слот возвращён',submission_start:'Перевод начат',submission_complete:'Перевод завершён',submission_backqueue:'Возвращена в очередь',submission_reopen:'Возвращена в работу',submission_progress:'Обновлён прогресс'}[a.action]||a.action;return `<div class="request-history-row"><span class="request-history-dot"></span><div><strong>${esc(label)}</strong><small>${fmt(a.created_at)} · admin ${a.admin_user_id}</small>${a.details?`<details><summary>Детали</summary><pre>${esc(pretty(a.details))}</pre></details>`:''}</div></div>`;}
  function pretty(value){try{return JSON.stringify(JSON.parse(value),null,2);}catch{return String(value||'');}}
  function status(r){if(r.status==='pending')return'На проверке';if(r.status==='rejected')return r.slot_returned?'Отклонена · слот возвращён':'Отклонена';if(r.queue_status==='completed')return'Завершена';if(r.queue_status==='in_progress')return'В работе';if(r.queue_status==='queued')return`В очереди #${r.queue_position??'—'}`;return String(r.status||'—');}
  function fmt(value){if(!value)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch{return String(value);}}
  const v=id=>document.getElementById(id)?.value?.trim?.()||'';
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=String(value??'');};
  const json=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

  window.addEventListener('beforeunload',event=>{if(!dirty)return;event.preventDefault();event.returnValue='';});
  document.addEventListener('dtl:adminroutechange',event=>{if(event.detail?.id==='section:requests')return;dirty=false;baseline='';lockNavigation(false);currentId=null;});
  window.DTL_ADMIN_REQUEST_OPS=Object.freeze({open,close:goBack,state:()=>({busy,currentId,dirty})});
})();
