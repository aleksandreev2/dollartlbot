(() => {
  const runtime=window.DTL_RUNTIME;
  const admin=window.DTL_ADMIN;
  if(!runtime?.registerResponseHandler||!runtime?.registerPatcher||!admin?.activeRoute)return;

  let product=null;
  let days=30;
  let stamp='';

  runtime.registerResponseHandler(async(response,context)=>{
    if(response.ok&&context.pathname==='/api/app/admin/analytics'){
      try{
        const payload=await response.clone().json();
        product=payload?.product||null;
        days=Number(payload?.days||30);
        stamp=JSON.stringify(product||{}).slice(0,20000);
        queueMicrotask(patch);
      }catch{}
    }
    return response;
  });

  runtime.registerPatcher(patch);
  document.addEventListener('dtl:adminrender',()=>queueMicrotask(patch));
  document.addEventListener('dtl:adminroutechange',()=>queueMicrotask(patch));

  function patch(){
    if(admin.activeRoute()!=='tools:analytics'||!product)return;
    const root=document.querySelector('.admin-analytics');
    if(!root)return;
    let host=root.querySelector('[data-product-analytics]');
    if(host?.dataset.productStamp===stamp)return;
    if(!host){host=document.createElement('section');host.dataset.productAnalytics='1';root.prepend(host);}
    host.dataset.productStamp=stamp;
    host.className='product-analytics-v2';
    host.innerHTML=render(product);
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function render(p){
    const funnel=p.funnel||{};
    const suggest=p.suggest||{};
    const tracking=p.tracking_since?formatDate(p.tracking_since):'после первого события';
    return `
      <div class="product-analytics-head">
        <div><span class="product-analytics-eyebrow">PRODUCT ANALYTICS</span><h2>Поведение и конверсия</h2><p>Поиск → открытие → интерес → заявка. Поведенческая воронка собирается с ${esc(tracking)}; реальные заявки и текущее состояние demand/follows считаются из основных таблиц.</p></div>
        <span class="product-analytics-period">${days} дней</span>
      </div>
      <div class="product-analytics-kpis">
        ${kpi('search',fmt(p.searches),'Поисков')}
        ${kpi('circle-off',`${fmt(p.zero_result_rate)}%`,'Zero-result')}
        ${kpi('heart',fmt(Number(p.interest_adds||0)+Number(p.follow_adds||0)),'Intent actions')}
        ${kpi('send',fmt(funnel.requests),'Реальных заявок')}
      </div>
      <div class="product-analytics-grid">
        <article class="product-analytics-card product-funnel-card">
          <div class="product-card-head"><div><h3>Основная воронка</h3><p>Уникальные пользователи, зафиксированные телеметрией за выбранный период.</p></div><i data-lucide="route" aria-hidden="true"></i></div>
          <div class="product-funnel">
            ${funnelRow('Поиск',funnel.search_users,null)}
            ${funnelRow('Открыли тайтл',funnel.open_users,funnel.search_users)}
            ${funnelRow('Demand / Follow',funnel.intent_users,funnel.open_users)}
            ${funnelRow('Отправили заявку',funnel.request_users,funnel.intent_users)}
          </div>
          <div class="product-hard-split"><span>Active demand +${fmt(funnel.demand_adds)}</span><span>Active follows +${fmt(funnel.follow_adds)}</span><span>Duplicate intercept ${fmt(p.duplicates_intercepted)}</span></div>
        </article>
        <article class="product-analytics-card product-suggest-card">
          <div class="product-card-head"><div><h3>Suggest drop-off</h3><p>Где пользователь прекращает заполнение.</p></div><i data-lucide="list-checks" aria-hidden="true"></i></div>
          <div class="suggest-flow-stats"><div><strong>${fmt(suggest.started_users)}</strong><span>Начали</span></div><div><strong>${fmt(suggest.submitted_users)}</strong><span>Отправили</span></div><div><strong>${fmt(suggest.abandoned_users)}</strong><span>Ушли</span></div><div><strong>${fmt(suggest.completion_rate)}%</strong><span>Completion</span></div></div>
          <div class="suggest-step-list">${renderSuggestSteps(suggest.steps)}</div>
        </article>
      </div>
      <div class="product-analytics-grid lower">
        <article class="product-analytics-card product-zero-card">
          <div class="product-card-head"><div><h3>Что ищут и не находят</h3><p>Лучшие кандидаты для каталога и ручной проверки спроса.</p></div><span class="product-count">${fmt(p.zero_results)}</span></div>
          ${renderZeroResults(p.zero_result_queries)}
        </article>
        <article class="product-analytics-card product-interactions-card">
          <div class="product-card-head"><div><h3>Дальнейшие действия</h3><p>Что люди делают после открытия контента.</p></div><i data-lucide="mouse-pointer-click" aria-hidden="true"></i></div>
          <div class="product-action-list">
            ${actionRow('file-down','RAW opens',p.raw_opens)}
            ${actionRow('share-2','Shares',p.shares)}
            ${actionRow('send','Release opens',p.release_opens)}
            ${actionRow('gem','Boosty clicks',p.boosty_clicks)}
            ${actionRow('layers-2','Telemetry events',p.events_total)}
          </div>
        </article>
      </div>`;
  }

  function funnelRow(label,value,previous){
    const n=Number(value||0),prev=Number(previous||0);
    const conversion=prev>0&&n<=prev?`${Math.round((n/prev)*1000)/10}%`:'—';
    return `<div class="product-funnel-row"><div><strong>${esc(label)}</strong><span>${prev?`${conversion} от предыдущего шага`:'telemetry'}</span></div><b>${fmt(n)}</b></div>`;
  }

  function renderSuggestSteps(rows){
    const labels={upload:'1 · Файл',details:'2 · Данные',content:'3 · Контент',review:'4 · Проверка'};
    const map=new Map((Array.isArray(rows)?rows:[]).map(row=>[String(row.step||''),Number(row.users||0)]));
    const max=Math.max(1,...map.values());
    return ['upload','details','content','review'].map(step=>{
      const value=map.get(step)||0;
      return `<div class="suggest-step-row"><span>${esc(labels[step])}</span><div><i style="--product-progress:${Math.round(value/max*100)}%"></i></div><strong>${fmt(value)}</strong></div>`;
    }).join('');
  }

  function renderZeroResults(rows){
    const list=Array.isArray(rows)?rows:[];
    if(!list.length)return '<div class="product-empty"><i data-lucide="search-check" aria-hidden="true"></i><span>Zero-result запросов пока нет.</span></div>';
    return `<div class="product-zero-list">${list.slice(0,12).map((row,index)=>`<div class="product-zero-row"><span>${index+1}</span><div><strong title="${esc(row.query_text||'')}">${esc(row.query_text||'—')}</strong><small>${fmt(row.users)} польз. · последний ${esc(relative(row.last_seen))}</small></div><b>${fmt(row.count)}</b></div>`).join('')}</div>`;
  }

  function kpi(icon,value,label){return `<div class="product-kpi"><i data-lucide="${icon}" aria-hidden="true"></i><div><strong>${esc(value)}</strong><span>${esc(label)}</span></div></div>`;}
  function actionRow(icon,label,value){return `<div><i data-lucide="${icon}" aria-hidden="true"></i><span>${esc(label)}</span><strong>${fmt(value)}</strong></div>`;}
  function fmt(value){const n=Number(value||0);return Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n):'0';}
  function formatDate(value){try{return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value||'');}}
  function relative(value){if(!value)return '—';const t=Date.parse(value);if(!Number.isFinite(t))return String(value);const d=Date.now()-t;if(d<60000)return'только что';if(d<3600000)return`${Math.max(1,Math.round(d/60000))} мин назад`;if(d<86400000)return`${Math.max(1,Math.round(d/3600000))} ч назад`;return formatDate(value);}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();
