(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.registerRoute || !admin?.api) throw new Error('Broadcast Center requires canonical admin runtime.');

  const state = { data:null, templateKey:'unused_quota', audience:'unused_quota', actionUrl:'/app/?view=suggest', locale:'en', messages:{}, estimate:null, busy:false, estimateSeq:0 };
  const api=(path,options={})=>admin.api(path,options);
  const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const ico=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const toast=(text,error=false)=>admin.toast?.(text,error);
  const isActive=()=>admin.activeRoute?.()==='section:broadcasts';
  const localeInfo=code=>state.data?.locales?.find(item=>item.code===code)||{code,label:code.toUpperCase()};
  const currentMessage=()=>state.messages[state.locale]||{title:'',body:'',action_label:''};
  const fallbackMessage=()=>state.messages.en||{title:'',body:'',action_label:''};
  const effectiveMessage=()=>{const current=currentMessage(),fallback=fallbackMessage();return{title:current.title||fallback.title||'',body:current.body||fallback.body||'',action_label:current.action_label||fallback.action_label||'Open Dollar TL'};};

  async function render(){
    admin.setHead?.('Рассылки','Кастомные кампании, готовые шаблоны, сегменты и локализация');
    admin.content?.(`<div class="admin-loading">${ico('loader-circle')} Загружаем центр рассылок…</div>`);
    try{
      state.data=await api('/api/app/admin/broadcasts');
      if(!isActive())return false;
      if(!Object.keys(state.messages).length)applyTemplate(state.templateKey,false);
      draw();void refreshEstimate();return true;
    }catch(error){
      if(error?.name==='AbortError'||!isActive())return false;
      admin.content?.(`<div class="admin-panel admin-error">${ico('triangle-alert')}<strong>Не удалось загрузить рассылки</strong><span>${esc(error.message)}</span></div>`);return false;
    }
  }

  function applyTemplate(key,redraw=true){
    if(!state.data)return;
    const template=state.data.templates?.find(item=>item.key===key);state.templateKey=key||'custom';
    if(template){state.audience=template.audience;state.actionUrl=template.action_url;state.messages=JSON.parse(JSON.stringify(template.localizations||{}));state.locale='en';}
    else if(key==='custom'){state.audience='all';state.actionUrl='/app/?view=suggest';state.messages={en:{title:'',body:'',action_label:'Open Dollar TL'}};state.locale='en';}
    state.estimate=null;if(redraw){draw();void refreshEstimate();}
  }

  function draw(){
    if(!isActive()||!state.data)return;const templates=state.data.templates||[],history=state.data.broadcasts||[];
    admin.content?.(`<section class="broadcast-center">
      <div class="broadcast-template-grid">${templates.map(templateCard).join('')}<button type="button" class="broadcast-template-card ${state.templateKey==='custom'?'active':''}" data-broadcast-template="custom"><span class="broadcast-template-icon">${ico('pencil-line')}</span><span><strong>Своя рассылка</strong><small>Полностью свой текст, сегмент и локализации.</small></span></button></div>
      <div class="broadcast-workspace"><section class="admin-panel broadcast-composer">
        <div class="admin-panel-head"><div><h2>Новая рассылка</h2><p>Пользователь получит сообщение на своём языке; если перевода нет — используется English.</p></div><span class="admin-badge ${state.templateKey==='custom'?'draft':'gold'}">${state.templateKey==='custom'?'CUSTOM':'TEMPLATE'}</span></div>
        <div class="broadcast-target-grid"><label class="admin-field"><span>Получатели</span><select id="broadcastAudience">${(state.data.audiences||[]).map(a=>`<option value="${esc(a.id)}" ${a.id===state.audience?'selected':''}>${esc(a.label)}</option>`).join('')}</select><small id="broadcastEstimate">${estimateText()}</small></label><label class="admin-field"><span>Куда ведёт кнопка</span><input id="broadcastActionUrl" value="${esc(state.actionUrl)}" placeholder="/app/?view=suggest"><small>HTTPS-ссылка или путь внутри /app/.</small></label></div>
        <div class="broadcast-locale-head"><div><h3>Локализация</h3><p>${localizedCount()} / ${state.data.locales?.length||0} языков заполнено</p></div><button type="button" data-copy-english ${state.locale==='en'?'disabled':''}>${ico('copy')} Скопировать English</button></div>
        <div class="broadcast-locale-tabs">${(state.data.locales||[]).map(localeTab).join('')}</div>
        <div class="broadcast-locale-editor"><div class="broadcast-language-title"><strong>${esc(localeInfo(state.locale).label)}</strong>${state.locale!=='en'&&!hasCompleteLocale(state.locale)?'<span>Fallback → English</span>':''}</div><label class="admin-field"><span>Заголовок <small id="broadcastTitleCount">${currentMessage().title.length} / 180</small></span><input id="broadcastTitle" maxlength="180" value="${esc(currentMessage().title)}" placeholder="${state.locale==='en'?'Required':'Оставьте пустым для English fallback'}"></label><label class="admin-field"><span>Текст <small id="broadcastBodyCount">${currentMessage().body.length} / 3000</small></span><textarea id="broadcastBody" maxlength="3000" rows="7" placeholder="${state.locale==='en'?'Required':'Оставьте пустым для English fallback'}">${esc(currentMessage().body)}</textarea></label><label class="admin-field"><span>Текст кнопки <small id="broadcastActionCount">${currentMessage().action_label.length} / 64</small></span><input id="broadcastActionLabel" maxlength="64" value="${esc(currentMessage().action_label)}" placeholder="${state.locale==='en'?'Open Dollar TL':'English fallback'}"></label></div>
        <div class="broadcast-actions"><button type="button" id="broadcastTest">${ico('flask-conical')} Тест мне · ${esc(localeInfo(state.locale).code.toUpperCase())}</button><button type="button" id="broadcastSend" class="primary">${ico('send')} Запустить рассылку</button></div>
      </section><aside class="admin-panel broadcast-preview"><div class="admin-panel-head"><div><h2>Предпросмотр</h2><p>${esc(localeInfo(state.locale).label)}</p></div></div>${previewHtml()}<div class="broadcast-audience-summary">${ico('users')}<div><span>Ожидаемая аудитория</span><strong>${state.estimate?Number(state.estimate.total||0).toLocaleString('ru-RU'):'—'}</strong><small>${state.estimate?estimateLocaleBreakdown():'Считаем по текущему сегменту…'}</small></div></div></aside></div>
      <section class="admin-panel broadcast-history"><div class="admin-panel-head"><div><h2>История</h2><p>Release и кастомные кампании используют одну надёжную очередь доставки.</p></div><button type="button" data-broadcast-refresh>${ico('refresh-cw')} Обновить</button></div><div class="broadcast-history-list">${history.length?history.map(historyRow).join(''):'<div class="admin-empty">Рассылок пока нет.</div>'}</div></section>
    </section>`);bind();admin.icons?.();
  }

  function templateCard(template){return `<button type="button" class="broadcast-template-card ${state.templateKey===template.key?'active':''}" data-broadcast-template="${esc(template.key)}"><span class="broadcast-template-icon">${ico(template.key==='unused_quota'?'ticket-check':template.key==='requests_open'?'inbox':'sparkles')}</span><span><strong>${esc(template.label)}</strong><small>${esc(template.description)}</small></span></button>`;}
  function localeTab(locale){const complete=hasCompleteLocale(locale.code);return `<button type="button" class="${state.locale===locale.code?'active':''} ${complete?'complete':''}" data-broadcast-locale="${esc(locale.code)}"><span>${esc(locale.label)}</span>${complete?ico('check'):''}</button>`;}
  function hasCompleteLocale(code){const item=state.messages[code];return Boolean(item?.title?.trim()&&item?.body?.trim());}
  function localizedCount(){return(state.data?.locales||[]).filter(item=>hasCompleteLocale(item.code)).length;}
  function estimateText(){if(!state.estimate)return'Подсчёт реальной аудитории с учётом opt-out и блокировок…';return`${Number(state.estimate.total||0).toLocaleString('ru-RU')} получателей · месяц ${esc(state.estimate.month_key||'')}`;}
  function estimateLocaleBreakdown(){const entries=Object.entries(state.estimate?.locales||{}).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,4);return entries.map(([locale,count])=>`${locale.toUpperCase()} ${count}`).join(' · ')||'Нет получателей';}
  function previewHtml(){const copy=effectiveMessage();return `<div class="broadcast-tg-preview"><div class="broadcast-tg-brand"><span>${ico('megaphone')}</span><div><strong>Dollar TL</strong><small>Bot message</small></div></div><h3>📣 ${esc(copy.title||'Broadcast title')}</h3><p>${esc(copy.body||'Текст рассылки появится здесь.').replace(/\n/g,'<br>')}</p><span class="broadcast-preview-button">${esc(copy.action_label||'Open Dollar TL')}</span></div>`;}
  function historyRow(row){const status=String(row.status||''),recipientCount=Number(row.recipient_count||0),sent=Number(row.sent_count||0),failed=Number(row.failed_count||0),skipped=Number(row.skipped_count||0),pending=Number(row.pending_count||0),template=row.template_key?` · ${esc(row.template_key)}`:'',statusLabel=status==='completed'?'Готово':status==='running'?'Отправляется':status==='failed'?'Ошибка':'В очереди';return `<article class="broadcast-history-row"><div class="broadcast-history-icon">${ico(row.kind==='release'?'book-open-check':'megaphone')}</div><div class="broadcast-history-copy"><div><strong>#${row.id} · ${esc(row.title)}</strong><span class="admin-badge ${status==='completed'?'done':status==='running'?'working':status==='failed'?'bad':'queued'}">${statusLabel}</span></div><p>${row.kind==='release'?'Release':'Announcement'}${template} · ${audienceLabel(row.audience)}</p><small>${fmt(row.created_at)} · получателей ${recipientCount} · отправлено ${sent} · пропущено ${skipped}${pending?` · ждут ${pending}`:''}${failed?` · ошибок ${failed}`:''}${row.locale_count?` · ${row.locale_count} локализаций`:''}</small></div>${failed?`<button type="button" data-broadcast-retry="${row.id}">${ico('rotate-ccw')} Повторить ошибки</button>`:''}</article>`;}
  function audienceLabel(id){return state.data?.audiences?.find(item=>item.id===id)?.label||(id==='release_followers'?'Подписаны на релизы':id||'—');}
  function fmt(value){if(!value)return'—';try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return String(value);}}

  function bind(){
    document.querySelectorAll('[data-broadcast-template]').forEach(button=>button.addEventListener('click',()=>applyTemplate(button.dataset.broadcastTemplate)));
    document.querySelectorAll('[data-broadcast-locale]').forEach(button=>button.addEventListener('click',()=>{saveEditor();state.locale=button.dataset.broadcastLocale||'en';draw();}));
    document.getElementById('broadcastAudience')?.addEventListener('change',event=>{state.audience=event.currentTarget.value;state.estimate=null;draw();void refreshEstimate();});
    document.getElementById('broadcastActionUrl')?.addEventListener('input',event=>{state.actionUrl=event.currentTarget.value;});
    for(const[id,key,counter]of[['broadcastTitle','title','broadcastTitleCount'],['broadcastBody','body','broadcastBodyCount'],['broadcastActionLabel','action_label','broadcastActionCount']])document.getElementById(id)?.addEventListener('input',event=>{const message=ensureLocale(state.locale);message[key]=event.currentTarget.value;const max=key==='title'?180:key==='body'?3000:64,count=document.getElementById(counter);if(count)count.textContent=`${event.currentTarget.value.length} / ${max}`;updatePreviewOnly();});
    document.querySelector('[data-copy-english]')?.addEventListener('click',()=>{if(state.locale==='en')return;state.messages[state.locale]={...fallbackMessage()};draw();});
    document.getElementById('broadcastTest')?.addEventListener('click',()=>void sendTest());document.getElementById('broadcastSend')?.addEventListener('click',()=>void sendBroadcast());document.querySelector('[data-broadcast-refresh]')?.addEventListener('click',()=>void render());document.querySelectorAll('[data-broadcast-retry]').forEach(button=>button.addEventListener('click',()=>void retryBroadcast(Number(button.dataset.broadcastRetry))));
  }
  function ensureLocale(locale){if(!state.messages[locale])state.messages[locale]={title:'',body:'',action_label:''};return state.messages[locale];}
  function saveEditor(){const message=ensureLocale(state.locale),title=document.getElementById('broadcastTitle'),body=document.getElementById('broadcastBody'),action=document.getElementById('broadcastActionLabel');if(title)message.title=title.value;if(body)message.body=body.value;if(action)message.action_label=action.value;const actionUrl=document.getElementById('broadcastActionUrl');if(actionUrl)state.actionUrl=actionUrl.value;}
  function cleanLocalizations(){const out={};for(const[locale,copy]of Object.entries(state.messages)){const title=String(copy?.title||'').trim(),body=String(copy?.body||'').trim(),actionLabel=String(copy?.action_label||'').trim();if(!title&&!body&&!actionLabel)continue;out[locale]={title,body,action_label:actionLabel};}return out;}
  function updatePreviewOnly(){const preview=document.querySelector('.broadcast-tg-preview');if(!preview)return;const replacement=document.createElement('div');replacement.innerHTML=previewHtml();preview.replaceWith(replacement.firstElementChild);}

  async function refreshEstimate(){const seq=++state.estimateSeq;try{const estimate=await api('/api/app/admin/broadcasts/estimate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({audience:state.audience})});if(seq!==state.estimateSeq||!isActive())return;state.estimate=estimate;const label=document.getElementById('broadcastEstimate');if(label)label.textContent=`${Number(estimate.total||0).toLocaleString('ru-RU')} получателей · месяц ${estimate.month_key||''}`;const summary=document.querySelector('.broadcast-audience-summary');if(summary)summary.innerHTML=`${ico('users')}<div><span>Ожидаемая аудитория</span><strong>${Number(estimate.total||0).toLocaleString('ru-RU')}</strong><small>${estimateLocaleBreakdown()}</small></div>`;admin.icons?.();}catch(error){if(error?.name==='AbortError'||!isActive())return;const label=document.getElementById('broadcastEstimate');if(label)label.textContent=`Не удалось посчитать: ${error.message}`;}}
  async function sendTest(){if(state.busy)return;saveEditor();const localizations=cleanLocalizations();if(!localizations.en?.title||!localizations.en?.body)return toast('Сначала заполните English — это обязательный fallback.',true);state.busy=true;try{await api('/api/app/admin/broadcasts/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({template_key:state.templateKey==='custom'?null:state.templateKey,audience:state.audience,action_url:state.actionUrl,locale:state.locale,localizations})});toast(`Тест ${state.locale.toUpperCase()} отправлен вам в Telegram.`);}catch(error){toast(error.message,true);}finally{state.busy=false;}}
  async function sendBroadcast(){if(state.busy)return;saveEditor();const localizations=cleanLocalizations();if(!localizations.en?.title||!localizations.en?.body)return toast('English версия обязательна как fallback.',true);const total=Number(state.estimate?.total||0);if(total<=0)return toast('В выбранном сегменте нет получателей.',true);const ok=await window.DTL_ADMIN_STABILITY?.confirm?.({title:'Запустить рассылку?',body:`Будет создан снимок аудитории примерно из ${total.toLocaleString('ru-RU')} пользователей. Повторные доставки защищены recipient-state и retry-логикой.`,confirm:'Запустить'});if(!ok||!isActive())return;state.busy=true;try{const result=await api('/api/app/admin/broadcasts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({template_key:state.templateKey==='custom'?null:state.templateKey,audience:state.audience,action_url:state.actionUrl,localizations})});toast(`Рассылка #${result.broadcast_id} поставлена в очередь.`);await render();}catch(error){toast(error.message,true);}finally{state.busy=false;}}
  async function retryBroadcast(id){if(state.busy||!id)return;const ok=await window.DTL_ADMIN_STABILITY?.confirm?.({title:'Повторить неудачные доставки?',body:'В очередь вернутся только получатели со статусом failed. Уже отправленные сообщения повторно не уйдут.',confirm:'Повторить'});if(!ok||!isActive())return;state.busy=true;try{await api(`/api/app/admin/broadcasts/${id}/retry`,{method:'POST'});toast(`Ошибки рассылки #${id} возвращены в retry.`);await render();}catch(error){toast(error.message,true);}finally{state.busy=false;}}

  admin.registerRoute('section:broadcasts',{mount:()=>render(),refresh:()=>render(),unmount:()=>{state.estimateSeq+=1;}});
  runtime.registerPatcher(()=>{if(!document.querySelector('.admin-v2'))return;document.querySelectorAll('[data-admin-section="broadcasts"] span').forEach(span=>{span.textContent='Рассылки';});});
  window.DTL_ADMIN_BROADCASTS=Object.freeze({open:()=>admin.open('section:broadcasts'),refresh:()=>render(),state:()=>({templateKey:state.templateKey,audience:state.audience,locale:state.locale,estimate:state.estimate})});
})();
