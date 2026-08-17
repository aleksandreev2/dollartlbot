(() => {
  const runtime=window.DTL_RUNTIME;
  const admin=window.DTL_ADMIN;
  if(!runtime?.registerPatcher||!runtime?.registerResponseHandler||!admin?.api)return;

  const EVENT_LABELS={
    thank_you_click:['Нажал «Спасибо»','heart-handshake'],
    download_open:['Открыл получение файла','mouse-pointer-click'],
    delivery_started:['Началась отправка файла','send'],
    delivery_success:['Получил файл','file-check-2'],
    delivery_failed:['Не удалось выдать файл','file-x-2'],
    access_denied:['Доступ не прошёл проверку','shield-x'],
    rate_limited:['Слишком много действий подряд','timer-off'],
    donate_click:['Перешёл к поддержке','heart'],
    delivery_blocked_security:['Выдача остановлена проверкой файла','shield-alert'],
    thank_you_required:['Попытался получить без «Спасибо»','circle-alert'],
    reader_quota_blocked:['Достиг дневного лимита','gauge'],
    reader_quota_would_block:['Достиг бы дневного лимита','gauge'],
  };
  let releases=[];
  let detailGeneration=0;

  const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const isActive=()=>admin.activeRoute?.()==='section:statistics';

  runtime.registerResponseHandler(async(response,context)=>{
    if(response.ok&&context.pathname==='/api/app/admin/analytics'){
      try{
        const payload=await response.clone().json();
        releases=Array.isArray(payload?.top_releases)?payload.top_releases:[];
        queueMicrotask(enhanceRanking);
      }catch{}
    }
    return response;
  });

  function enhanceRanking(){
    if(!isActive()||document.querySelector('[data-stat-title-profile]'))return;
    const panel=[...document.querySelectorAll('.statistics-panel')].find(node=>node.querySelector('h2')?.textContent?.trim()==='Самые читаемые релизы');
    if(!panel)return;
    const rows=[...panel.querySelectorAll('.statistics-ranking-row')];
    rows.forEach((row,index)=>{
      const release=releases[index];
      if(!release?.id)return;
      row.dataset.statTitlePublication=String(release.id);
      row.tabIndex=0;
      row.setAttribute('role','button');
      row.setAttribute('aria-label',`Открыть статистику тайтла ${release.title||''}`.trim());
      row.classList.add('statistics-title-link');
      if(!row.querySelector('.statistics-title-link-hint')){
        const hint=document.createElement('span');
        hint.className='statistics-title-link-hint';
        hint.innerHTML=`Подробнее ${icon('chevron-right')}`;
        row.append(hint);
      }
    });
    icons();
  }

  async function openTitle(publicationId){
    if(!Number.isSafeInteger(publicationId)||publicationId<=0||!isActive())return;
    const local=++detailGeneration;
    admin.setHead?.('Статистика тайтла','Релизы, читатели и история действий по конкретному произведению');
    admin.content?.(`<div class="admin-loading">${icon('loader-circle')} Открываем профиль тайтла…</div>`);
    try{
      const data=await admin.api(`/api/app/admin/analytics/title?publication_id=${encodeURIComponent(publicationId)}`);
      if(!isActive()||local!==detailGeneration)return;
      paintTitle(data);
      bindTitleControls(data);
    }catch(error){
      if(error?.name==='AbortError'||!isActive()||local!==detailGeneration)return;
      admin.content?.(`<section class="statistics-title-page"><button type="button" class="statistics-back" data-stat-title-back>${icon('arrow-left')} К общей статистике</button><section class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось открыть статистику тайтла</strong><span>${esc(error.message)}</span></section></section>`);
      document.querySelector('[data-stat-title-back]')?.addEventListener('click',backToStatistics);
      icons();
    }
  }

  function paintTitle(data){
    const title=data.title||{};
    const s=data.summary||{};
    const users=data.users||[];
    const publications=data.publications||[];
    const status=titleStatus(title.request_status,title.queue_status);
    const meta=[
      title.original_language?`Оригинал: ${title.original_language}`:'',
      title.chapter_count?`${fmt(title.chapter_count)} ${word(title.chapter_count,'глава','главы','глав')}`:'',
      status,
      title.publication_status==='completed'?'Произведение завершено':title.publication_status==='ongoing'?'Произведение выходит':'',
    ].filter(Boolean);

    admin.content?.(`<section class="statistics-title-page" data-stat-title-profile>
      <button type="button" class="statistics-back" data-stat-title-back>${icon('arrow-left')} К общей статистике</button>
      <section class="admin-panel statistics-title-hero">
        <div class="statistics-title-hero-main"><span class="statistics-title-mark">${icon('book-open-text')}</span><div><span class="statistics-title-eyebrow">Профиль тайтла</span><h2>${esc(title.name||'Без названия')}</h2><div class="statistics-title-meta">${meta.map(item=>`<span>${esc(item)}</span>`).join('')}</div></div></div>
        ${title.genres_tags?`<p class="statistics-title-genres">${esc(title.genres_tags)}</p>`:''}
      </section>

      <div class="statistics-title-kpis">
        ${titleKpi('send','Релизов',s.releases)}
        ${titleKpi('users','Читателей',s.unique_readers)}
        ${titleKpi('file-down','Выдано файлов',s.deliveries)}
        ${titleKpi('heart-handshake','«Спасибо»',s.thank_you_clicks)}
        ${titleKpi('rotate-ccw','Повторных выдач',s.repeat_deliveries)}
        ${titleKpi('heart','Переходов к поддержке',s.donate_clicks)}
        ${titleKpi('file-x-2','Ошибок выдачи',s.delivery_failures)}
        ${titleKpi('shield-x','Отказов в доступе',s.access_denied)}
      </div>

      <div class="statistics-title-layout">
        <section class="admin-panel statistics-panel statistics-title-releases">
          ${panelHead('layers-3','Все релизы тайтла','Каждая публикация и её собственные показатели')}
          ${titleReleaseRows(publications)}
        </section>

        <section class="admin-panel statistics-panel statistics-title-users">
          ${panelHead('users-round','Пользователи','Нажмите на человека, чтобы увидеть точную историю действий')}
          <label class="statistics-user-search">${icon('search')}<input type="search" data-stat-title-user-search placeholder="Найти по имени, @username или Telegram ID" autocomplete="off"></label>
          <div class="statistics-title-user-list" data-stat-title-user-list>${titleUserRows(users)}</div>
        </section>

        <section class="admin-panel statistics-panel statistics-title-timeline">
          ${panelHead('history','История действий пользователя','Что именно человек делал с этим тайтлом и когда')}
          <div data-stat-title-user-detail>${empty('Выберите пользователя — здесь появится его подробная история.')}</div>
        </section>
      </div>
    </section>`);
    icons();
  }

  function bindTitleControls(data){
    const publicationId=Number(data.publication_id||0);
    document.querySelector('[data-stat-title-back]')?.addEventListener('click',backToStatistics);
    document.querySelector('[data-stat-title-user-search]')?.addEventListener('input',event=>filterUsers(event.currentTarget.value));
    document.querySelectorAll('[data-stat-title-user]').forEach(button=>button.addEventListener('click',()=>void loadUserTimeline(publicationId,Number(button.dataset.statTitleUser),button)));
  }

  function backToStatistics(){
    detailGeneration+=1;
    const renderer=window.DTL_ADMIN_STATISTICS?.render;
    if(typeof renderer==='function')void renderer();
    else void admin.refresh?.();
  }

  function filterUsers(query){
    const needle=String(query||'').trim().toLocaleLowerCase();
    document.querySelectorAll('[data-stat-title-user]').forEach(row=>{
      row.hidden=Boolean(needle)&&!String(row.dataset.statSearch||'').includes(needle);
    });
  }

  async function loadUserTimeline(publicationId,userId,button){
    if(!Number.isSafeInteger(userId)||userId<=0)return;
    const host=document.querySelector('[data-stat-title-user-detail]');
    if(!host)return;
    const local=detailGeneration;
    document.querySelectorAll('[data-stat-title-user]').forEach(row=>row.classList.toggle('active',row===button));
    host.innerHTML=`<div class="statistics-inline-loading">${icon('loader-circle')} Загружаем действия пользователя…</div>`;
    icons();
    try{
      const data=await admin.api(`/api/app/admin/analytics/title?publication_id=${encodeURIComponent(publicationId)}&user_id=${encodeURIComponent(userId)}`);
      if(!isActive()||local!==detailGeneration||!document.contains(host))return;
      host.innerHTML=userTimeline(data.user||{},data.events||[]);
      icons();
    }catch(error){
      if(error?.name==='AbortError'||!isActive()||local!==detailGeneration||!document.contains(host))return;
      host.innerHTML=`<div class="statistics-user-error">${icon('triangle-alert')}<span>${esc(error.message)}</span></div>`;
      icons();
    }
  }

  function panelHead(ic,title,subtitle){return `<div class="statistics-panel-head"><div><span class="statistics-panel-icon">${icon(ic)}</span><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div></div>`;}
  function titleKpi(ic,label,value){return `<article class="statistics-title-kpi"><span>${icon(ic)}</span><div><strong>${fmt(value)}</strong><small>${esc(label)}</small></div></article>`;}

  function titleReleaseRows(rows){
    if(!rows.length)return empty('Публикаций для этого тайтла пока нет.');
    return `<div class="statistics-title-release-list">${rows.map(row=>{
      const range=chapterRange(row.chapter_start,row.chapter_end);
      return `<article><div><strong>${esc(range||`Релиз #${fmt(row.id)}`)}</strong><span>${row.published_at?formatDateTime(row.published_at):'Ещё не опубликован'}</span></div><div class="statistics-title-release-metrics"><span><b>${fmt(row.readers)}</b> читателей</span><span><b>${fmt(row.deliveries)}</b> выдач</span><span><b>${fmt(row.thank_you_clicks)}</b> «Спасибо»</span>${Number(row.donate_clicks||0)?`<span><b>${fmt(row.donate_clicks)}</b> поддержка</span>`:''}${Number(row.delivery_failures||0)?`<span class="bad"><b>${fmt(row.delivery_failures)}</b> ошибок</span>`:''}</div></article>`;
    }).join('')}</div>`;
  }

  function titleUserRows(rows){
    if(!rows.length)return empty('По этому тайтлу пока нет действий пользователей.');
    return rows.map(row=>{
      const display=userDisplay(row);
      const secondary=[row.username&&display!==`@${row.username}`?`@${row.username}`:'',`ID ${row.user_id}`].filter(Boolean).join(' · ');
      const search=[row.username,row.first_name,row.last_name,row.user_id].filter(Boolean).join(' ').toLocaleLowerCase();
      return `<button type="button" class="statistics-title-user" data-stat-title-user="${esc(row.user_id)}" data-stat-search="${esc(search)}"><span class="statistics-user-avatar">${esc(userInitial(row))}</span><span class="statistics-user-main"><strong>${esc(display)}</strong><small>${esc(secondary)}</small><span><b>${fmt(row.deliveries)}</b> файлов · <b>${fmt(row.thank_you_clicks)}</b> «Спасибо»${Number(row.donate_clicks||0)?` · <b>${fmt(row.donate_clicks)}</b> поддержка`:''}</span></span><span class="statistics-user-last">${relativeDate(row.last_seen)}${icon('chevron-right')}</span></button>`;
    }).join('');
  }

  function userTimeline(user,events){
    const display=userDisplay(user);
    const fullName=[user.first_name,user.last_name].filter(Boolean).join(' ');
    return `<div class="statistics-user-profile">
      <div class="statistics-user-profile-head"><span class="statistics-user-avatar large">${esc(userInitial(user))}</span><div><strong>${esc(display)}</strong><span>${fullName&&display!==fullName?`${esc(fullName)} · `:''}Telegram ID ${esc(user.user_id||'—')}</span><small>Первое действие: ${formatDateTime(user.first_seen)} · последнее: ${formatDateTime(user.last_seen)}</small></div></div>
      <div class="statistics-user-metrics">${userMetric('mouse-pointer-click','Открытий',user.download_opens)}${userMetric('heart-handshake','«Спасибо»',user.thank_you_clicks)}${userMetric('file-check-2','Файлов',user.deliveries)}${userMetric('rotate-ccw','Повторов',user.repeat_deliveries)}${userMetric('heart','Поддержка',user.donate_clicks)}${userMetric('file-x-2','Ошибок',user.delivery_failures)}</div>
      <div class="statistics-event-list">${events.length?events.map(eventRow).join(''):empty('История действий пуста.')}</div>
    </div>`;
  }

  function userMetric(ic,label,value){return `<div>${icon(ic)}<span>${esc(label)}</span><strong>${fmt(value)}</strong></div>`;}
  function eventRow(event){
    const [label,ic]=EVENT_LABELS[event.event_type]||['Другое действие','circle-dot'];
    const range=chapterRange(event.chapter_start,event.chapter_end);
    const repeat=event.event_type==='delivery_success'&&String(event.metadata_json||'').includes('"repeat":true');
    const details=[range,repeat?'повторная выдача':''].filter(Boolean).join(' · ');
    return `<article class="statistics-event-row"><span class="statistics-event-icon">${icon(ic)}</span><div><strong>${esc(label)}</strong>${details?`<span>${esc(details)}</span>`:''}</div><time>${esc(formatDateTime(event.created_at))}</time></article>`;
  }

  function empty(text){return `<div class="statistics-empty">${icon('inbox')}<span>${esc(text)}</span></div>`;}
  function userDisplay(row){if(row.username)return`@${row.username}`;const name=[row.first_name,row.last_name].filter(Boolean).join(' ').trim();return name||`Пользователь ${row.user_id||''}`.trim();}
  function userInitial(row){const value=(row.first_name||row.username||String(row.user_id||'?')).trim();return value.slice(0,1).toLocaleUpperCase()||'?';}
  function chapterRange(start,end){const a=Number(start||0),b=Number(end||0);if(a&&b&&a!==b)return`Главы ${a}–${b}`;if(a||b)return`Глава ${a||b}`;return'';}
  function titleStatus(status,queue){if(status==='pending')return'Заявка на проверке';if(status==='rejected')return'Заявка отклонена';if(status==='accepted'&&queue==='completed')return'Перевод завершён';if(status==='accepted'&&queue==='in_progress')return'Сейчас переводится';if(status==='accepted'&&queue==='queued')return'В очереди на перевод';if(status==='accepted')return'Принято в работу';return'';}
  function fmt(value){const n=Number(value||0);return Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n):'0';}
  function formatDate(value){if(!value)return'—';try{return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value);}}
  function formatDateTime(value){if(!value)return'—';try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return String(value);}}
  function relativeDate(value){if(!value)return'—';const time=Date.parse(value);if(!Number.isFinite(time))return String(value);const diff=Date.now()-time;if(diff<60_000)return'только что';if(diff<3_600_000)return`${Math.max(1,Math.round(diff/60_000))} мин назад`;if(diff<86_400_000)return`${Math.max(1,Math.round(diff/3_600_000))} ч назад`;return formatDate(value);}
  function word(value,one,few,many){const n=Math.abs(Number(value||0))%100,m=n%10;if(n>10&&n<20)return many;if(m>1&&m<5)return few;if(m===1)return one;return many;}
  function icons(){try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}}

  document.addEventListener('click',event=>{
    const row=event.target.closest?.('[data-stat-title-publication]');
    if(!row||!isActive())return;
    event.preventDefault();
    void openTitle(Number(row.dataset.statTitlePublication));
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const row=event.target.closest?.('[data-stat-title-publication]');
    if(!row||!isActive())return;
    event.preventDefault();
    void openTitle(Number(row.dataset.statTitlePublication));
  });
  document.addEventListener('dtl:adminrender',()=>queueMicrotask(enhanceRanking));
  document.addEventListener('dtl:adminroutechange',()=>queueMicrotask(enhanceRanking));
  runtime.registerPatcher(enhanceRanking);
  window.DTL_ADMIN_TITLE_STATISTICS=Object.freeze({openTitle,enhanceRanking});
})();