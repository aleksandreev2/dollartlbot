(() => {
  const runtime=window.DTL_RUNTIME;
  const admin=window.DTL_ADMIN;
  const tg=window.Telegram?.WebApp;
  if(!runtime?.registerPatcher||!runtime?.registerFetchMiddleware||!admin?.api||!admin?.open)throw new Error('Publishing Center requires canonical admin/runtime APIs.');

  const ROUTES=new Set(['section:publishing','tools:publications','section:broadcasts']);
  const state={data:null,draftSource:null,pendingSubmission:null,saveTimer:0,preflightTimer:0,preflightSeq:0,saveSeq:0,suppress:false,attachmentsDirty:false,lastPreflight:null,lastPreflightHash:'',loadingEditor:null};
  const api=(path,options={})=>admin.api(path,options);
  const esc=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const ico=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const activeRoute=()=>admin.activeRoute?.()||'';
  const isCreate=()=>activeRoute()==='section:publishing';
  const isManage=()=>activeRoute()==='tools:publications';

  function install(){
    const root=document.querySelector('.admin-v2');if(!root)return;
    unifyNavigation(root);injectTabs();
    if(isCreate()){
      const editor=document.querySelector('.publisher-editor');
      if(editor){syncPendingSubmission();void installCreate(editor);}
      enhanceDraftHistory();
    }else if(isManage())installCloneButtons();
  }

  function unifyNavigation(root){
    for(const selector of ['[data-admin-tools="publications"]','[data-admin-section="broadcasts"]']){
      root.querySelectorAll(selector).forEach(button=>{button.dataset.publishingCenterHidden='1';button.classList.remove('active');button.setAttribute('aria-hidden','true');button.tabIndex=-1;});
    }
    root.querySelectorAll('[data-admin-section="publishing"]').forEach(button=>{
      const label=button.querySelector('span');if(label)label.textContent='Publishing';
      if(ROUTES.has(activeRoute()))button.classList.add('active');
    });
  }

  function injectTabs(){
    if(!ROUTES.has(activeRoute()))return;
    const host=document.querySelector('.admin-content');if(!host||host.querySelector(':scope > .publishing-center-shell'))return;
    const routes=[['section:publishing','pen-line','Создать'],['tools:publications','files','Публикации'],['section:broadcasts','megaphone','Рассылки']];
    const bar=document.createElement('div');bar.className='publishing-center-shell';bar.innerHTML=`<div class="publishing-center-tabs">${routes.map(([id,icon,label])=>`<button type="button" data-pc-route="${id}" class="${activeRoute()===id?'active':''}">${ico(icon)}<span>${label}</span></button>`).join('')}</div><span class="publishing-center-context">Publishing Center · один рабочий поток</span>`;
    host.prepend(bar);
    bar.querySelectorAll('[data-pc-route]').forEach(button=>button.addEventListener('click',()=>void openCenterRoute(button.dataset.pcRoute)));
    admin.icons?.();
  }

  async function openCenterRoute(route){
    if(!route||route===activeRoute())return;
    if(isCreate()&&state.attachmentsDirty){
      const config={title:'Вложения не автосохраняются',body:'Текст и настройки уже сохранены, но выбранные файлы будут потеряны при переходе. Продолжить?',confirm:'Перейти'};
      const ok=window.DTL_ADMIN_STABILITY?.confirm?await window.DTL_ADMIN_STABILITY.confirm(config):window.confirm(config.body);
      if(!ok)return;
    }
    await admin.open(route);
  }

  async function installCreate(editor){
    if(editor.dataset.publishingCenterReady==='1'){syncPendingSubmission();return;}
    if(state.loadingEditor===editor)return;
    state.loadingEditor=editor;
    editor.dataset.publishingCenterReady='loading';
    injectCreateChrome(editor);
    setPreflightPending('Загружаем рабочий черновик…');
    try{
      const data=await api('/api/app/admin/publishing-center');
      if(!isCreate()||!editor.isConnected)return;
      state.data=data;state.draftSource=data.draft?.source_publication_id||null;state.pendingSubmission=data.draft?.submission_id||null;
      fillTemplateSelect();
      if(data.draft)applySnapshot(data.draft,{preserveFiles:true,autosave:false});
      bindCreateEditor(editor);
      editor.dataset.publishingCenterReady='1';
      setSaveStatus(data.draft?`Восстановлено · ${formatTime(data.draft.updated_at)}`:'Автосохранение включено','saved');
      syncPendingSubmission();
      void runPreflight();
    }catch(error){
      if(error?.name==='AbortError'||!editor.isConnected)return;
      editor.dataset.publishingCenterReady='error';setSaveStatus(`Автосохранение недоступно: ${error.message}`,'error');
      setPreflightPending('Не удалось загрузить Publishing Center.');
    }finally{if(state.loadingEditor===editor)state.loadingEditor=null;}
  }

  function injectCreateChrome(editor){
    if(editor.querySelector('.publishing-center-createbar'))return;
    const head=editor.querySelector('.admin-panel-head');
    const tools=document.createElement('div');tools.className='publishing-center-createbar';tools.innerHTML=`
      <div class="publishing-center-createbar-top"><div><strong>Шаблон публикации</strong><small style="display:block;margin-top:3px;color:#8a857e">Встроенные и сохранённые командой заготовки</small></div><div class="publishing-center-template-control"><select id="pcTemplate"><option value="">Загрузка…</option></select><button type="button" id="pcApplyTemplate">${ico('wand-sparkles')} Применить</button><button type="button" id="pcDeleteTemplate" class="danger" hidden>${ico('trash-2')} Удалить</button></div></div>
      <div class="publishing-center-template-save"><input id="pcTemplateName" maxlength="80" placeholder="Название своего шаблона"><button type="button" id="pcSaveTemplate">${ico('bookmark-plus')} Сохранить текущий текст как шаблон</button></div>
      <div class="publishing-center-save-status" id="pcSaveStatus">${ico('cloud')} <span>Подключаем автосохранение…</span></div>
      <div class="publishing-center-attachment-warning" id="pcAttachmentWarning" hidden>${ico('triangle-alert')} Файлы и изображение не сохраняются между открытиями Mini App — текст и настройки сохраняются.</div>`;
    head?.after(tools);
    const preflight=document.createElement('section');preflight.className='publishing-center-preflight';preflight.innerHTML=`<div class="publishing-center-preflight-head"><div><h3>Проверка перед публикацией</h3><p>Контент, Telegram-канал, права бота, discussion group и вложения.</p></div><div><span class="publishing-center-preflight-state blocked" id="pcPreflightState">Проверяем…</span><button type="button" id="pcPreflightRefresh">${ico('refresh-cw')} Проверить</button></div></div><div class="publishing-center-preflight-list" id="pcPreflightList"><div class="publishing-center-check info"><span>${ico('loader-circle')}</span><div><strong>Подготовка</strong><small>Собираем данные редактора…</small></div></div></div>`;
    tools.after(preflight);admin.icons?.();
  }

  function fillTemplateSelect(){
    const select=document.getElementById('pcTemplate');if(!select||!state.data)return;
    select.innerHTML='<option value="">Выберите шаблон…</option>'+state.data.templates.map(template=>`<option value="${esc(template.template_key)}">${template.kind==='builtin'?'★ ':'✦ '}${esc(template.name)}</option>`).join('');
    updateTemplateDelete();
  }

  function updateTemplateDelete(){
    const select=document.getElementById('pcTemplate'),button=document.getElementById('pcDeleteTemplate');if(!select||!button)return;
    button.hidden=!String(select.value||'').startsWith('custom:');
  }

  function bindCreateEditor(editor){
    if(editor.dataset.publishingCenterBound==='1')return;editor.dataset.publishingCenterBound='1';
    document.getElementById('pcTemplate')?.addEventListener('change',updateTemplateDelete);
    document.getElementById('pcApplyTemplate')?.addEventListener('click',applySelectedTemplate);
    document.getElementById('pcSaveTemplate')?.addEventListener('click',()=>void saveTemplate());
    document.getElementById('pcDeleteTemplate')?.addEventListener('click',()=>void deleteTemplate());
    document.getElementById('pcPreflightRefresh')?.addEventListener('click',()=>void runPreflight());

    for(const id of ['pubTitle','pubBody']){
      const input=document.getElementById(id);input?.addEventListener('input',()=>{scheduleAutosave();invalidatePreflight();});input?.addEventListener('blur',()=>schedulePreflight(0));
    }
    for(const id of ['pubFooter','pubDonate','pubBotComment','pubNotify','pubSubmissionId']){
      document.getElementById(id)?.addEventListener('change',()=>{scheduleAutosave();invalidatePreflight();schedulePreflight(120);});
    }
    for(const id of ['pubImage','pubFiles'])document.getElementById(id)?.addEventListener('change',()=>{state.attachmentsDirty=hasAttachments();updateAttachmentState();invalidatePreflight();schedulePreflight(120);});
    syncClosingConfirmation();
  }

  function editorSnapshot(){
    return {
      internal_title:document.getElementById('pubTitle')?.value||'',body_html:document.getElementById('pubBody')?.value||'',
      add_footer:Boolean(document.getElementById('pubFooter')?.checked),add_donate:Boolean(document.getElementById('pubDonate')?.checked),add_bot_comment:Boolean(document.getElementById('pubBotComment')?.checked),notify_users:Boolean(document.getElementById('pubNotify')?.checked),
      submission_id:positive(document.getElementById('pubSubmissionId')?.value)||state.pendingSubmission||null,source_publication_id:state.draftSource||null,
    };
  }

  function applySnapshot(snapshot,{preserveFiles=false,autosave=true}={}){
    state.suppress=true;
    try{
      setValue('pubTitle',snapshot.internal_title||'');setValue('pubBody',snapshot.body_html||'');setChecked('pubFooter',Number(snapshot.add_footer)!==0);setChecked('pubDonate',Number(snapshot.add_donate)!==0);setChecked('pubBotComment',Number(snapshot.add_bot_comment)!==0);setChecked('pubNotify',Number(snapshot.notify_users)===1);
      state.pendingSubmission=positive(snapshot.submission_id);state.draftSource=positive(snapshot.source_publication_id);syncPendingSubmission();
      if(!preserveFiles){for(const id of ['pubImage','pubFiles']){const input=document.getElementById(id);if(input){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}}state.attachmentsDirty=false;updateAttachmentState();}
      document.getElementById('pubBody')?.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('pubFooter')?.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('pubDonate')?.dispatchEvent(new Event('change',{bubbles:true}));
    }finally{state.suppress=false;}
    invalidatePreflight();schedulePreflight(80);if(autosave)scheduleAutosave(0);
  }

  function setValue(id,value){const node=document.getElementById(id);if(node)node.value=String(value??'');}
  function setChecked(id,value){const node=document.getElementById(id);if(node)node.checked=Boolean(value);}
  function positive(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
  function syncPendingSubmission(){const select=document.getElementById('pubSubmissionId');if(!select||!state.pendingSubmission)return;const value=String(state.pendingSubmission);if(select.value!==value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}}

  function applySelectedTemplate(){
    const key=document.getElementById('pcTemplate')?.value||'',template=state.data?.templates?.find(item=>item.template_key===key);if(!template)return;
    const current=editorSnapshot();applySnapshot({...current,internal_title:template.internal_title||current.internal_title,body_html:template.body_html||'',add_footer:template.add_footer,add_donate:template.add_donate,add_bot_comment:template.add_bot_comment,notify_users:template.notify_users},{preserveFiles:true,autosave:true});
    admin.toast?.(`Шаблон «${template.name}» применён.`);
  }

  async function saveTemplate(){
    const name=document.getElementById('pcTemplateName')?.value.trim()||'',snapshot=editorSnapshot();if(!name)return admin.toast?.('Введите название шаблона.',true);if(!snapshot.body_html.trim())return admin.toast?.('Сначала добавьте текст публикации.',true);
    try{await api('/api/app/admin/publishing-center/templates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...snapshot,name})});document.getElementById('pcTemplateName').value='';state.data=await api('/api/app/admin/publishing-center');fillTemplateSelect();admin.toast?.('Шаблон сохранён.');}
    catch(error){admin.toast?.(error.message,true);}
  }

  async function deleteTemplate(){
    const select=document.getElementById('pcTemplate'),key=select?.value||'';if(!key.startsWith('custom:'))return;const id=positive(key.split(':')[1]);if(!id)return;
    const ok=window.DTL_ADMIN_STABILITY?.confirm?await window.DTL_ADMIN_STABILITY.confirm({title:'Удалить шаблон?',body:'Шаблон исчезнет из Publishing Center. Публикации не изменятся.',confirm:'Удалить',danger:true}):window.confirm('Удалить шаблон?');if(!ok)return;
    try{await api(`/api/app/admin/publishing-center/templates/${id}`,{method:'DELETE'});state.data=await api('/api/app/admin/publishing-center');fillTemplateSelect();admin.toast?.('Шаблон удалён.');}catch(error){admin.toast?.(error.message,true);}
  }

  function scheduleAutosave(delay=650){
    if(state.suppress||!isCreate())return;clearTimeout(state.saveTimer);setSaveStatus('Сохраняем изменения…','');state.saveTimer=setTimeout(()=>{state.saveTimer=0;void saveDraft();},delay);syncClosingConfirmation();
  }

  async function saveDraft(){
    const seq=++state.saveSeq,snapshot=editorSnapshot();
    try{const result=await api('/api/app/admin/publishing-center/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot)});if(seq!==state.saveSeq||!isCreate())return;state.draftSource=result.draft?.source_publication_id||snapshot.source_publication_id||null;setSaveStatus(`Автосохранено · ${formatTime(result.draft?.updated_at||new Date().toISOString())}`,'saved');}
    catch(error){if(error?.name==='AbortError'||!isCreate())return;setSaveStatus(`Не сохранено: ${error.message}`,'error');}
    finally{syncClosingConfirmation();}
  }

  function setSaveStatus(text,tone=''){
    const box=document.getElementById('pcSaveStatus');if(!box)return;box.className=`publishing-center-save-status ${tone}`.trim();box.innerHTML=`${ico(tone==='saved'?'cloud-check':tone==='error'?'cloud-off':'cloud-upload')}<span>${esc(text)}</span>`;admin.icons?.();
  }

  function hasAttachments(){return Boolean(document.getElementById('pubImage')?.files?.length||document.getElementById('pubFiles')?.files?.length);}
  function updateAttachmentState(){const box=document.getElementById('pcAttachmentWarning');if(box)box.hidden=!state.attachmentsDirty;syncClosingConfirmation();}
  function syncClosingConfirmation(){const risky=Boolean(state.attachmentsDirty||state.saveTimer);try{if(risky)tg?.enableClosingConfirmation?.();else tg?.disableClosingConfirmation?.();}catch{}}

  function invalidatePreflight(){
    state.lastPreflight=null;state.lastPreflightHash='';const button=document.getElementById('pubPublish');if(button&&!button.dataset.dtlAdminBusy)button.disabled=true;setPreflightPending('Есть непроверенные изменения.');
  }
  function schedulePreflight(delay=350){clearTimeout(state.preflightTimer);state.preflightTimer=setTimeout(()=>{state.preflightTimer=0;void runPreflight();},delay);}

  async function runPreflight(){
    if(!isCreate())return;const snapshot=editorSnapshot(),image=document.getElementById('pubImage')?.files?.[0]||null,files=[...(document.getElementById('pubFiles')?.files||[])];
    // Send both canonical and legacy aliases so cached Telegram WebViews remain compatible.
    const payload={...snapshot,title:snapshot.internal_title,body:snapshot.body_html,image_size:image?.size||0,file_sizes:files.map(file=>file.size)},hash=JSON.stringify(payload),seq=++state.preflightSeq;setPreflightPending('Проверяем Telegram и содержимое…');
    try{const result=await api('/api/app/admin/publishing-center/preflight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(seq!==state.preflightSeq||!isCreate())return;state.lastPreflight=result;state.lastPreflightHash=hash;renderPreflight(result);}
    catch(error){if(error?.name==='AbortError'||!isCreate())return;renderPreflight({ready:false,checks:[{id:'network',label:'Проверка',status:'error',message:error.message}]});}
  }

  function setPreflightPending(text){
    const stateNode=document.getElementById('pcPreflightState'),list=document.getElementById('pcPreflightList');if(stateNode){stateNode.className='publishing-center-preflight-state blocked';stateNode.textContent='Не готово';}if(list)list.innerHTML=`<div class="publishing-center-check info"><span>${ico('loader-circle')}</span><div><strong>Проверка</strong><small>${esc(text)}</small></div></div>`;admin.icons?.();
  }
  function renderPreflight(result){
    const ready=Boolean(result?.ready),stateNode=document.getElementById('pcPreflightState'),list=document.getElementById('pcPreflightList');if(stateNode){stateNode.className=`publishing-center-preflight-state ${ready?'ready':'blocked'}`;stateNode.textContent=ready?'Готово к публикации':'Есть блокирующие проблемы';}
    if(list)list.innerHTML=(result?.checks||[]).map(check=>`<div class="publishing-center-check ${esc(check.status)}"><span>${ico(check.status==='ok'?'check':check.status==='error'?'x':'info')}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.message)}</small></div></div>`).join('')||'<div class="admin-empty">Нет данных проверки.</div>';
    const button=document.getElementById('pubPublish');if(button&&!button.dataset.dtlAdminBusy)button.disabled=!ready;admin.icons?.();
  }

  function enhanceDraftHistory(){
    const actions=[
      ['[data-pub-test]','flask-conical','Тест'],
      ['[data-pub-send]','send','Опубликовать'],
      ['[data-pub-del]','trash-2','Удалить'],
    ];
    document.querySelectorAll('.publication-row .publication-actions').forEach(host=>{
      for(const [selector,icon,label] of actions){
        const button=host.querySelector(selector);if(!button||button.dataset.pcLabeled==='1')continue;
        button.dataset.pcLabeled='1';button.innerHTML=`${ico(icon)}<span>${label}</span>`;button.setAttribute('aria-label',label);
      }
    });
    admin.icons?.();
  }

  function installCloneButtons(){
    document.querySelectorAll('.admin-publication-card').forEach(card=>{
      if(card.querySelector('[data-pc-clone]'))return;const source=card.querySelector('[data-check-pub]'),id=positive(source?.dataset.checkPub),actions=card.querySelector('.admin-publication-actions');if(!id||!actions)return;
      const button=document.createElement('button');button.type='button';button.className='publishing-center-clone';button.dataset.pcClone=String(id);button.innerHTML=`${ico('copy-plus')} Использовать как шаблон`;button.addEventListener('click',()=>void clonePublication(id,button));actions.append(button);
    });admin.icons?.();
  }
  async function clonePublication(id,button){
    button.disabled=true;try{await api(`/api/app/admin/publishing-center/from-publication/${id}`,{method:'POST'});state.data=null;state.draftSource=id;admin.toast?.(`Публикация #${id} загружена в новый черновик.`);await admin.open('section:publishing');}catch(error){admin.toast?.(error.message,true);if(button.isConnected)button.disabled=false;}
  }

  async function clearDraftAfterPublish(){
    try{await api('/api/app/admin/publishing-center/draft',{method:'DELETE'});state.draftSource=null;state.pendingSubmission=null;state.attachmentsDirty=false;syncClosingConfirmation();if(isCreate())setSaveStatus('Публикация отправлена — рабочий черновик очищен.','saved');}catch{}
  }

  runtime.registerFetchMiddleware(async(input,init={},next)=>{
    const raw=typeof input==='string'?input:input instanceof Request?input.url:String(input||'');let url;try{url=new URL(raw,location.href);}catch{return next(input,init);}
    const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();const response=await next(input,init);
    const published=/^\/api\/app\/admin\/publications\/\d+\/publish$/.test(url.pathname);
    if(method==='POST'&&published&&response.ok)queueMicrotask(()=>void clearDraftAfterPublish());
    return response;
  });

  document.addEventListener('dtl:adminroutechange',()=>{if(!isCreate()){clearTimeout(state.saveTimer);clearTimeout(state.preflightTimer);state.attachmentsDirty=false;syncClosingConfirmation();}runtime.schedule();});
  window.addEventListener('beforeunload',event=>{if(!state.attachmentsDirty&&!state.saveTimer)return;event.preventDefault();event.returnValue='';});
  runtime.registerPatcher(install);
  window.DTL_PUBLISHING_CENTER=Object.freeze({refresh:install,state:()=>({...state,data:state.data?{templates:state.data.templates?.length||0}:null}),runPreflight,saveDraft});
})();
