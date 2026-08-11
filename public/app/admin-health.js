(() => {
  const runtime=window.DTL_RUNTIME;
  const tg=window.Telegram?.WebApp;
  if(!runtime?.registerPatcher)throw new Error('DTL runtime must load before admin-health.js');

  let active=false,busy=false,last=null;
  const H=()=>({'x-telegram-init-data':tg?.initData||''});
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ico=n=>`<i data-lucide="${n}" aria-hidden="true"></i>`;
  const icons=()=>{try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}};
  const fmt=v=>{try{return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v));}catch{return v||'—';}};
  async function api(path,options={}){const r=await fetch(path,{...options,headers:{...H(),...(options.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||d?.message||`HTTP ${r.status}`);return d;}
  function toast(text,error=false){const host=document.getElementById('toastRegion');if(!host)return;const n=document.createElement('div');n.className=`toast ${error?'error':'success'}`;n.textContent=text;host.append(n);setTimeout(()=>n.remove(),3600);}

  function installNav(){
    for(const nav of document.querySelectorAll('.admin-side-nav,.admin-mobile-nav')){
      if(nav.querySelector('[data-admin-health]'))continue;
      const b=document.createElement('button');b.type='button';b.dataset.adminHealth='1';b.innerHTML=`${ico('heart-pulse')}<span>Health</span>`;
      const settings=nav.querySelector('[data-admin-section="settings"]');if(settings)settings.before(b);else nav.append(b);
      b.addEventListener('click',()=>{active=true;markActive();void render();});
    }
    markActive();icons();
  }
  function markActive(){document.querySelectorAll('[data-admin-health]').forEach(b=>b.classList.toggle('active',active));if(active)document.querySelectorAll('[data-admin-section]').forEach(b=>b.classList.remove('active'));}
  function setHead(title,subtitle){const h=document.querySelector('.admin-work-head h1'),p=document.querySelector('.admin-work-head p');if(h)h.textContent=title;if(p)p.textContent=subtitle;}

  async function render(){
    const area=document.querySelector('.admin-content');if(!area)return;
    active=true;markActive();setHead('Operations & Health','Очереди, Telegram, публикации и доставка уведомлений');
    area.innerHTML=`<div class="admin-loading">${ico('loader-circle')} Проверяем систему…</div>`;icons();
    try{last=await api('/api/app/admin/health');paint(last);}catch(e){area.innerHTML=`<div class="admin-panel admin-error">${ico('triangle-alert')}<strong>Не удалось получить состояние системы</strong><span>${esc(e.message)}</span></div>`;icons();}
  }

  function paint(d){
    const area=document.querySelector('.admin-content');if(!area||!active)return;
    const s=d.status||'warning',q=d.queue||{},p=d.publications||{},n=d.notifications||{},t=d.telegram||{},issues=d.issues||{};
    area.innerHTML=`<section class="ops-health">
      <div class="ops-health-status ${esc(s)}"><div class="ops-health-status-icon">${ico(s==='healthy'?'circle-check-big':s==='critical'?'octagon-alert':'triangle-alert')}</div><div><span>СОСТОЯНИЕ СИСТЕМЫ</span><strong>${s==='healthy'?'Всё работает штатно':s==='critical'?'Нужна проверка':'Есть предупреждения'}</strong><small>Обновлено ${fmt(d.generated_at)}</small></div><button type="button" data-health-refresh>${ico('refresh-cw')} Обновить</button></div>
      <div class="ops-health-actions">
        ${actionButton('run_maintenance','play-circle','Запустить обслуживание','Прогонит безопасные очереди и проверки сейчас')}
        ${actionButton('normalize_queue','list-restart','Нормализовать очередь','Исправит позиции заявок')}
        ${actionButton('retry_notifications','bell-ring','Повторить уведомления','До 100 failed Telegram deliveries')}
        ${actionButton('retry_broadcasts','send','Повторить рассылки','До 250 failed recipients')}
        ${actionButton('retry_publications','message-square-reply','Повторить комментарии','Файлы и bot comment у опубликованных постов')}
        ${actionButton('retry_admin_deliveries','inbox','Доставить заявки админу','Повторит недоставленные summary/raw')}
      </div>
      <div class="ops-health-grid">
        ${healthCard('list-ordered','Очередь',tone(queueProblems(q)),[
          metric(q.queued,'В очереди'),metric(q.in_progress,'В работе'),metric(q.invalid_positions,'Некорректных позиций'),metric(q.duplicate_positions,'Дубликатов позиций'),metric(q.admin_delivery_pending,'Не доставлено админу')
        ],queueProblems(q)?'Позиции или admin delivery требуют внимания.':'Позиции очереди согласованы.')}
        ${healthCard('send','Публикации',tone(publicationProblems(p)),[
          metric(p.failed_main,'Основных ошибок'),metric(p.stuck_publishing,'Зависло publishing'),metric(p.comments_attention,'Комментарии требуют внимания'),metric(p.asset_failed,'Файлов failed'),metric(p.bot_comment_failed,'Bot comment failed')
        ],publicationProblems(p)?'Основные failed-публикации не переотправляются автоматически — это защита от дублей.':'Ошибок доставки публикаций нет.')}
        ${healthCard('bell','Уведомления',tone(notificationProblems(n)),[
          metric(n.direct_failed,'Direct failed'),metric(n.direct_retry,'Direct retry'),metric(n.broadcast_recipient_failed,'Broadcast failed'),metric(n.broadcasts_active,'Активных рассылок'),metric(n.progress_due,'Progress due')
        ],notificationProblems(n)?'Failed можно вручную вернуть в bounded retry.':'Очереди уведомлений без постоянных ошибок.')}
        ${telegramCard(t)}
      </div>
      ${issueSection('Проблемные публикации','Ошибки основного поста, файлов и discussion delivery',issues.publications||[],publicationIssue)}
      ${issueSection('Failed уведомления','Telegram direct deliveries, исчерпавшие автоматические попытки',issues.direct_notifications||[],notificationIssue)}
      ${issueSection('Failed получатели рассылок','Пользователи, для которых release broadcast завершился ошибкой',issues.broadcast_recipients||[],broadcastIssue)}
      ${logSection(issues.publication_logs||[])}
    </section>`;
    bind();icons();
  }

  function actionButton(action,icon,title,text){return `<button type="button" data-health-action="${action}">${ico(icon)}<span><b>${title}</b><small>${text}</small></span></button>`;}
  function metric(value,label){return `<div><strong>${Number(value||0)}</strong><span>${esc(label)}</span></div>`;}
  function tone(v){return v?'warn':'ok';}
  function queueProblems(q){return Number(q.invalid_positions||0)+Number(q.duplicate_positions||0)+Number(q.ordering_issue||0)+Number(q.admin_delivery_pending||0);}
  function publicationProblems(p){return Number(p.failed_main||0)+Number(p.stuck_publishing||0)+Number(p.comments_attention||0)+Number(p.asset_failed||0)+Number(p.bot_comment_failed||0);}
  function notificationProblems(n){return Number(n.direct_failed||0)+Number(n.broadcast_recipient_failed||0);}
  function healthCard(icon,title,state,metrics,note){return `<article class="admin-panel ops-health-card ${state}"><div class="ops-health-card-head"><div>${ico(icon)}<h2>${esc(title)}</h2></div><span>${state==='ok'?'OK':'CHECK'}</span></div><div class="ops-health-metrics">${metrics.join('')}</div><p>${esc(note)}</p></article>`;}
  function telegramCard(t){const rows=[['Бот',t.bot],['Канал',t.channel],['Комментарии',t.discussion]];const bad=rows.some(([,x])=>x&&!x.ok);return `<article class="admin-panel ops-health-card ${bad?'warn':'ok'}"><div class="ops-health-card-head"><div>${ico('radio')}<h2>Telegram</h2></div><span>${bad?'CHECK':'OK'}</span></div><div class="ops-telegram-list">${rows.map(([label,x])=>`<div><span class="ops-dot ${x?.ok?'ok':'bad'}"></span><div><strong>${label}</strong><small>${esc(x?.message||'Нет данных')}</small>${x?.id?`<em>ID ${esc(x.id)}</em>`:''}</div></div>`).join('')}</div></article>`;}
  function issueSection(title,subtitle,rows,rowFn){return `<section class="admin-panel ops-health-issues"><div class="admin-panel-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><span class="ops-count">${rows.length}</span></div>${rows.length?`<div class="ops-issue-list">${rows.map(rowFn).join('')}</div>`:'<div class="admin-empty">Активных проблем нет.</div>'}</section>`;}
  function publicationIssue(x){const details=[x.error_text,x.comments_check_status==='needs_attention'?'comments: needs_attention':'',Number(x.failed_assets||0)?`failed files: ${x.failed_assets}`:'',x.bot_comment_status==='failed'?'bot comment: failed':''].filter(Boolean).join(' · ');return `<article class="ops-issue-row"><div class="ops-issue-icon">${ico(x.status==='failed'?'circle-x':'triangle-alert')}</div><div><strong>#${x.id} · ${esc(x.internal_title||'Без названия')}</strong><span>${esc(details||x.status||'issue')}</span><small>${fmt(x.updated_at)}</small></div><button type="button" data-open-publishing>${ico('arrow-right')} Публикация</button></article>`;}
  function notificationIssue(x){return `<article class="ops-issue-row"><div class="ops-issue-icon">${ico('bell-off')}</div><div><strong>#${x.id} · user ${esc(x.user_id)} · ${esc(x.type||'notification')}</strong><span>${esc(x.telegram_last_error||'Telegram delivery failed')}</span><small>${Number(x.telegram_attempts||0)} попыток · ${fmt(x.created_at)}</small></div></article>`;}
  function broadcastIssue(x){return `<article class="ops-issue-row"><div class="ops-issue-icon">${ico('send-horizontal')}</div><div><strong>Broadcast #${x.broadcast_id} · user ${esc(x.user_id)}</strong><span>${esc(x.title||'Release')} · ${esc(x.last_error||'Delivery failed')}</span><small>${Number(x.attempts||0)} попыток · ${fmt(x.updated_at)}</small></div></article>`;}
  function logSection(rows){return `<section class="admin-panel ops-health-logs"><div class="admin-panel-head"><div><h2>Последние ошибки публикаций</h2><p>Warning/error события из publication_logs</p></div><span class="ops-count">${rows.length}</span></div>${rows.length?`<div class="ops-log-list">${rows.map(x=>`<article><span class="ops-dot ${x.level==='error'?'bad':'warn'}"></span><div><strong>${x.publication_id?`#${x.publication_id} · `:''}${esc(x.message||x.event)}</strong><small>${esc(x.event||'')} · ${fmt(x.created_at)}</small>${x.details?`<details><summary>Технические детали</summary><pre>${esc(x.details)}</pre></details>`:''}</div></article>`).join('')}</div>`:'<div class="admin-empty">Ошибок в журнале нет.</div>'}</section>`;}

  function bind(){
    document.querySelector('[data-health-refresh]')?.addEventListener('click',()=>void render());
    document.querySelectorAll('[data-health-action]').forEach(b=>b.addEventListener('click',()=>void runAction(b.dataset.healthAction,b)));
    document.querySelectorAll('[data-open-publishing]').forEach(b=>b.addEventListener('click',()=>document.querySelector('[data-admin-section="publishing"]')?.click()));
  }
  async function runAction(action,button){
    if(busy)return;
    const risky=new Set(['run_maintenance','retry_notifications','retry_broadcasts','retry_publications','retry_admin_deliveries']);
    if(risky.has(action)&&!window.confirm(action==='retry_notifications'||action==='retry_broadcasts'?'Повторить failed-доставки сейчас? Это может отправить сообщения пользователям.':'Запустить выбранное обслуживание прямо сейчас?'))return;
    busy=true;const old=button.innerHTML;button.disabled=true;button.innerHTML=`${ico('loader-circle')}<span><b>Выполняем…</b><small>Не закрывайте экран</small></span>`;icons();
    try{const d=await api('/api/app/admin/health/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});last=d;toast('Операция завершена.');paint(d);}catch(e){toast(e.message,true);button.disabled=false;button.innerHTML=old;icons();}finally{busy=false;}
  }

  document.addEventListener('click',e=>{if(e.target.closest?.('[data-admin-section]')){active=false;document.querySelectorAll('[data-admin-health]').forEach(b=>b.classList.remove('active'));}},true);
  runtime.registerPatcher(()=>{if(document.querySelector('.admin-v2'))installNav();});
  window.DTL_ADMIN_HEALTH=Object.freeze({render,refresh:render,isActive:()=>active,last:()=>last});
})();
