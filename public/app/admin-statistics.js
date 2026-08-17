(() => {
  const runtime=window.DTL_RUNTIME;
  const admin=window.DTL_ADMIN;
  if(!runtime?.registerPatcher||!admin?.registerRoute||!admin?.api)return;

  const ECHARTS_URL='https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js';
  const PERIODS=[
    [7,'7 дней'],[30,'30 дней'],[90,'90 дней'],[365,'Год'],[0,'Всё время'],
  ];
  const COLORS=['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];
  let days=30;
  let charts=[];
  let observers=[];
  let chartLoader=null;
  let generation=0;

  const api=(path,options={})=>admin.api(path,options);
  const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const isActive=()=>admin.activeRoute?.()==='section:statistics';

  function installNavigation(){
    const root=document.querySelector('.admin-v2');
    if(!root)return;
    root.querySelectorAll('[data-admin-tools="analytics"]').forEach(button=>button.remove());
    for(const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')){
      if(nav.querySelector('[data-admin-section="statistics"]'))continue;
      const button=document.createElement('button');
      button.type='button';
      button.dataset.adminSection='statistics';
      button.innerHTML=`${icon('chart-no-axes-combined')}<span>Статистика</span>`;
      const overview=nav.querySelector('[data-admin-section="overview"]');
      if(overview)overview.after(button);else nav.prepend(button);
    }
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function cleanup(){
    generation+=1;
    for(const observer of observers){try{observer.disconnect();}catch{}}
    observers=[];
    for(const chart of charts){try{chart.dispose();}catch{}}
    charts=[];
  }

  async function render(){
    cleanup();
    const localGeneration=generation;
    admin.setHead?.('Статистика','Пользователи, заявки, публикации и чтение — без технических терминов');
    admin.content?.(`<div class="admin-loading">${icon('loader-circle')} Собираем статистику…</div>`);
    try{
      const data=await api(`/api/app/admin/analytics?days=${days}`);
      if(!isActive()||localGeneration!==generation)return false;
      paint(data);
      bindControls(data);
      void renderCharts(data,localGeneration);
      return true;
    }catch(error){
      if(error?.name==='AbortError'||!isActive())return false;
      admin.content?.(`<section class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось загрузить статистику</strong><span>${esc(error.message)}</span></section>`);
      return false;
    }
  }

  function paint(data){
    const s=data.summary||{};
    const previous=data.previous||null;
    const reader=data.readers||{};
    const request=data.requests||{};
    const states=request.states||{};
    const product=data.product||{};
    const funnel=product.funnel||{};
    const publishing=data.publishing||{};
    const referrals=data.referrals||{};
    const periodLabel=days===0?'за всё время':`за ${days} дней`;
    const comparison=days===0?'':` · сравнение с предыдущими ${days} днями`;

    admin.content?.(`<section class="statistics-page">
      <div class="statistics-toolbar admin-panel">
        <div class="statistics-periods" role="group" aria-label="Период статистики">
          ${PERIODS.map(([value,label])=>`<button type="button" data-stat-days="${value}" class="${days===value?'active':''}">${label}</button>`).join('')}
        </div>
        <div class="statistics-toolbar-side"><span>${icon('calendar-days')} ${esc(periodLabel)}${esc(comparison)}</span><button type="button" data-stat-refresh>${icon('refresh-cw')} Обновить</button></div>
      </div>

      <div class="statistics-kpis">
        ${kpi('users-round','Всего пользователей',s.users_total,`+${fmt(s.users_new)} ${word(s.users_new,'новый','новых','новых')} ${periodLabel}`,null)}
        ${kpi('activity','Активные пользователи',s.active_users,'Совершали действия в выбранный период',delta(s.active_users,previous?.active_users))}
        ${kpi('inbox','Заявки',s.submissions,`${fmt(s.pending_now)} сейчас ждут решения`,delta(s.submissions,previous?.submissions))}
        ${kpi('circle-check-big','Завершённые переводы',s.completed,`${fmt(states.active_chapters)} глав сейчас в работе`,delta(s.completed,previous?.completed))}
        ${kpi('send','Опубликованные релизы',s.publications,`${fmt(publishing.needs_attention)} требуют внимания`,delta(s.publications,previous?.publications))}
        ${kpi('book-open-check','Уникальные читатели',s.unique_readers,'Получили хотя бы один файл',delta(s.unique_readers,previous?.unique_readers))}
        ${kpi('file-down','Выдано файлов',s.deliveries,`${fmt(reader.repeat_deliveries)} повторных выдач`,delta(s.deliveries,previous?.deliveries))}
        ${kpi('heart-handshake','Нажали «Спасибо»',s.thank_you_clicks,`${fmt(s.donate_clicks)} переходов на поддержку`,delta(s.thank_you_clicks,previous?.thank_you_clicks))}
      </div>

      <div class="statistics-grid statistics-grid-main">
        ${panel('Динамика','Как менялись пользователи, заявки, завершения и публикации',`<div id="statisticsMainChart" class="statistics-chart statistics-chart-large"></div><div class="statistics-chart-hint">Нажимайте на названия показателей, чтобы скрывать и показывать линии.${days>=90||days===0?' На графике можно приближать нужный отрезок.':''}</div>`,'trending-up')}
        ${panel('Чтение и выдача файлов','Что происходит после публикации релиза',`<div id="statisticsReaderChart" class="statistics-chart statistics-chart-large"></div><div class="statistics-reader-summary">${miniMetric('mouse-pointer-click','Открыли получение',reader.download_opens)}${miniMetric('users','Читателей',reader.unique_readers)}${miniMetric('rotate-ccw','Повторных выдач',reader.repeat_deliveries)}${miniMetric('heart','Переходов на поддержку',reader.donate_clicks)}</div>`,'book-open')}
      </div>

      <div class="statistics-grid statistics-grid-three">
        ${panel('Состояние заявок','Что стало с заявками, созданными в выбранный период',`<div id="statisticsRequestsChart" class="statistics-chart statistics-chart-medium"></div>${requestStateLegend(states)}`,'list-checks')}
        ${panel('Сколько занимает перевод','Среднее время по завершённым заявкам',timingCards(request.timing||{}),'timer')}
        ${panel('Путь до заявки','Сколько людей проходит каждый шаг',journey(funnel,product),'route')}
      </div>

      <div class="statistics-grid statistics-grid-two">
        ${panel('Языки оригинала','Какие языки чаще всего встречаются в новых заявках',`<div id="statisticsLanguageChart" class="statistics-chart statistics-chart-medium"></div>`,'languages')}
        ${panel('Приглашения','Сколько приглашений превратилось в подтверждённых пользователей',referralBlock(referrals),'user-plus')}
      </div>

      <div class="statistics-grid statistics-grid-two statistics-detail-grid">
        ${panel('Самые читаемые релизы','Рейтинг по уникальным читателям за выбранный период',releaseRows(data.top_releases||[]),'trophy')}
        ${panel('Самые активные заявители','Кто отправил больше всего заявок за выбранный период',userRows(data.top_users||[]),'users')}
      </div>

      <div class="statistics-grid statistics-grid-two statistics-detail-grid">
        ${panel('Что ищут и не находят','Запросы, по которым поиск не смог ничего предложить',searchRows(product.zero_result_queries||[],product.tracking_since),'search-x')}
        ${panel('Качество публикаций','Доставка, комментарии и ошибки — простыми словами',publishingHealth(publishing,reader),'badge-check')}
      </div>

      ${attentionBlock(publishing,reader,states)}
    </section>`);
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function bindControls(){
    document.querySelectorAll('[data-stat-days]').forEach(button=>button.addEventListener('click',()=>{
      const next=Number(button.dataset.statDays);
      if(next===days)return;
      days=next;
      void render();
    }));
    document.querySelector('[data-stat-refresh]')?.addEventListener('click',()=>void render());
  }

  function panel(title,subtitle,body,ic){
    return `<section class="admin-panel statistics-panel"><div class="statistics-panel-head"><div><span class="statistics-panel-icon">${icon(ic)}</span><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div></div>${body}</section>`;
  }

  function kpi(ic,label,value,sub,change){
    return `<article class="statistics-kpi"><div class="statistics-kpi-icon">${icon(ic)}</div><div class="statistics-kpi-copy"><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(sub)}</small></div>${change?`<span class="statistics-change ${change.direction}">${icon(change.direction==='up'?'trending-up':change.direction==='down'?'trending-down':'minus')} ${esc(change.text)}</span>`:''}</article>`;
  }

  function delta(current,previous){
    if(previous==null||days===0)return null;
    const now=Number(current||0),before=Number(previous||0);
    if(now===before)return{direction:'same',text:'без изменений'};
    if(before===0)return{direction:now>0?'up':'same',text:now>0?`+${fmt(now)} к прошлому периоду`:'без изменений'};
    const pct=Math.round(((now-before)/before)*1000)/10;
    return{direction:pct>0?'up':'down',text:`${pct>0?'+':''}${fmt(pct)}% к прошлому периоду`};
  }

  function miniMetric(ic,label,value){return `<div>${icon(ic)}<span>${esc(label)}</span><strong>${fmt(value)}</strong></div>`;}

  function requestStateLegend(s){
    const rows=[['Ждут решения',s.pending],['В очереди',s.queued],['Переводятся',s.in_progress],['Завершены',s.completed],['Отклонены',s.rejected]];
    return `<div class="statistics-legend-list">${rows.map(([label,value],index)=>`<div><i style="--legend-color:${COLORS[index%COLORS.length]}"></i><span>${label}</span><strong>${fmt(value)}</strong></div>`).join('')}</div><div class="statistics-inline-note">Принято в работу: <b>${fmt(Number(s.queued||0)+Number(s.in_progress||0)+Number(s.completed||0))}</b> · глав принято: <b>${fmt(s.accepted_chapters)}</b></div>`;
  }

  function timingCards(t){
    return `<div class="statistics-timing">${timeCard('В очереди до старта',t.wait_hours)}${timeCard('Непосредственно в работе',t.work_hours)}${timeCard('От заявки до завершения',t.total_hours)}</div>`;
  }
  function timeCard(label,hours){return `<div><span>${esc(label)}</span><strong>${formatDuration(hours)}</strong></div>`;}

  function journey(f,product){
    const rows=[
      ['Искали произведение',f.search_users],
      ['Открыли карточку',f.open_users],
      ['Проявили интерес',f.intent_users],
      ['Отправили заявку',f.request_users],
    ];
    const max=Math.max(1,...rows.map(row=>Number(row[1]||0)));
    return `<div class="statistics-journey">${rows.map(([label,value],index)=>{
      const n=Number(value||0),prev=index?Number(rows[index-1][1]||0):0;
      const rate=prev?Math.min(100,Math.round(n/prev*1000)/10):null;
      return `<div class="statistics-journey-row"><div><span>${esc(label)}</span><strong>${fmt(n)}</strong></div><div class="statistics-journey-track"><i style="width:${Math.max(n?6:0,n/max*100)}%"></i></div><small>${rate==null?'Начало пути':`${fmt(rate)}% от предыдущего шага`}</small></div>`;
    }).join('')}</div>${product.tracking_since?`<p class="statistics-footnote">История поиска доступна с ${formatDate(product.tracking_since)}.</p>`:''}`;
  }

  function referralBlock(r){
    const started=Number(r.started||0),qualified=Number(r.qualified||0),pending=Number(r.pending||0),cancelled=Number(r.cancelled||0);
    const rate=started?Math.round(qualified/started*1000)/10:0;
    return `<div class="statistics-referrals"><div class="statistics-referral-rate"><strong>${fmt(rate)}%</strong><span>приглашений подтверждено</span></div><div class="statistics-progress"><i style="width:${Math.min(100,rate)}%"></i></div><div class="statistics-referral-grid"><div><span>Начато</span><strong>${fmt(started)}</strong></div><div><span>Подтверждено</span><strong>${fmt(qualified)}</strong></div><div><span>Ожидают</span><strong>${fmt(pending)}</strong></div><div><span>Отменено</span><strong>${fmt(cancelled)}</strong></div></div></div>`;
  }

  function releaseRows(rows){
    if(!rows.length)return empty('Пока недостаточно данных о чтении релизов.');
    return `<div class="statistics-ranking-list">${rows.map((row,index)=>`<article class="statistics-ranking-row"><span class="statistics-rank">${index+1}</span><div class="statistics-ranking-copy"><strong>${esc(row.title||`Публикация #${row.id}`)}</strong><span>${row.published_at?formatDate(row.published_at):'Дата публикации не указана'}</span><div><b>${fmt(row.readers)}</b> читателей · <b>${fmt(row.deliveries)}</b> выдач · <b>${fmt(row.thank_you_clicks)}</b> «Спасибо»${Number(row.donate_clicks||0)?` · <b>${fmt(row.donate_clicks)}</b> поддержка`:''}</div></div></article>`).join('')}</div>`;
  }

  function userRows(rows){
    if(!rows.length)return empty('За выбранный период новых заявок не было.');
    return `<div class="statistics-ranking-list">${rows.map((row,index)=>{
      const name=row.username?`@${row.username}`:(row.first_name||'Пользователь без имени');
      return `<article class="statistics-ranking-row compact"><span class="statistics-rank">${index+1}</span><div class="statistics-ranking-copy"><strong>${esc(name)}</strong><span>${fmt(row.requests)} ${word(row.requests,'заявка','заявки','заявок')}</span></div></article>`;
    }).join('')}</div>`;
  }

  function searchRows(rows,trackingSince){
    if(!rows.length)return `${empty('Поисков без результата за этот период нет.')} ${trackingSince?`<p class="statistics-footnote">История поиска доступна с ${formatDate(trackingSince)}.</p>`:''}`;
    return `<div class="statistics-search-list">${rows.slice(0,12).map((row,index)=>`<div><span>${index+1}</span><div><strong>${esc(row.query_text||'—')}</strong><small>${fmt(row.users)} ${word(row.users,'человек','человека','человек')} · последний раз ${relativeDate(row.last_seen)}</small></div><b>${fmt(row.count)}</b></div>`).join('')}</div>`;
  }

  function publishingHealth(p,r){
    const total=Math.max(0,Number(p.total||0));
    const published=Number(p.published||0),failed=Number(p.failed||0),attention=Number(p.needs_attention||0);
    const successRate=total?Math.round(published/total*1000)/10:0;
    return `<div class="statistics-health">
      <div class="statistics-health-score"><strong>${fmt(successRate)}%</strong><span>созданных публикаций успешно опубликованы</span></div>
      <div class="statistics-health-list">
        ${healthRow('circle-check','Опубликовано',published,'good')}
        ${healthRow('message-circle-check','Комментарии и выдача готовы',p.comments_complete,'good')}
        ${healthRow('triangle-alert','Требуют внимания',attention,attention?'warn':'good')}
        ${healthRow('circle-x','Не удалось опубликовать',failed,failed?'bad':'good')}
        ${healthRow('file-check-2','Файлы доставлены в комментарии',p.files_sent,'good')}
        ${healthRow('file-x-2','Ошибки файлов в комментариях',p.files_failed,Number(p.files_failed||0)?'bad':'good')}
        ${healthRow('send','Успешные личные выдачи',r.deliveries,'good')}
        ${healthRow('shield-alert','Ошибки личной выдачи',r.delivery_failures,Number(r.delivery_failures||0)?'bad':'good')}
      </div>
    </div>`;
  }
  function healthRow(ic,label,value,state){return `<div class="${state}">${icon(ic)}<span>${esc(label)}</span><strong>${fmt(value)}</strong></div>`;}

  function attentionBlock(p,r,s){
    const items=[];
    if(Number(p.failed||0)>0)items.push(`${fmt(p.failed)} ${word(p.failed,'публикация не отправилась','публикации не отправились','публикаций не отправились')}`);
    if(Number(p.needs_attention||0)>0)items.push(`${fmt(p.needs_attention)} ${word(p.needs_attention,'публикация требует проверки','публикации требуют проверки','публикаций требуют проверки')}`);
    if(Number(p.files_failed||0)>0)items.push(`${fmt(p.files_failed)} ${word(p.files_failed,'файл не доставлен','файла не доставлены','файлов не доставлены')} в комментарии`);
    if(Number(r.delivery_failures||0)>0)items.push(`${fmt(r.delivery_failures)} ${word(r.delivery_failures,'ошибка личной выдачи','ошибки личной выдачи','ошибок личной выдачи')}`);
    if(Number(s.pending||0)>0)items.push(`${fmt(s.pending)} ${word(s.pending,'новая заявка ждёт решения','новые заявки ждут решения','новых заявок ждут решения')}`);
    if(!items.length)return `<section class="statistics-attention all-good">${icon('badge-check')}<div><strong>Сейчас всё выглядит нормально</strong><span>По выбранному периоду нет заметных проблем, которые требуют внимания.</span></div></section>`;
    return `<section class="statistics-attention">${icon('circle-alert')}<div><strong>Стоит посмотреть</strong><span>${items.map(esc).join(' · ')}</span></div></section>`;
  }

  function empty(text){return `<div class="statistics-empty">${icon('inbox')}<span>${esc(text)}</span></div>`;}

  async function renderCharts(data,localGeneration){
    const ready=await ensureCharts();
    if(!ready||!isActive()||localGeneration!==generation){
      if(isActive()&&localGeneration===generation)document.querySelectorAll('.statistics-chart').forEach(host=>fallback(host));
      return;
    }
    const rows=Array.isArray(data.daily)?data.daily:[];
    mainChart(document.getElementById('statisticsMainChart'),rows);
    readerChart(document.getElementById('statisticsReaderChart'),rows);
    requestChart(document.getElementById('statisticsRequestsChart'),data.requests?.states||{});
    languageChart(document.getElementById('statisticsLanguageChart'),data.languages||[]);
  }

  function mainChart(host,rows){
    createChart(host,{
      color:COLORS,
      tooltip:{trigger:'axis',renderMode:'richText'},
      legend:{top:4,textStyle:{fontSize:12}},
      grid:{left:38,right:18,top:48,bottom:rows.length>45?48:28,containLabel:true},
      xAxis:{type:'category',boundaryGap:false,data:rows.map(row=>shortDate(row.day)),axisLabel:{hideOverlap:true}},
      yAxis:{type:'value',minInterval:1,splitLine:{lineStyle:{color:'#e8ecf2'}}},
      dataZoom:rows.length>45?[{type:'inside',start:Math.max(0,100-45/rows.length*100),end:100},{type:'slider',height:18,bottom:4,showDetail:false}]:[],
      series:[
        lineSeries('Новые пользователи',rows.map(row=>Number(row.new_users||0)),true),
        lineSeries('Заявки',rows.map(row=>Number(row.requests||0)),true),
        lineSeries('Завершено',rows.map(row=>Number(row.completed||0)),false),
        lineSeries('Публикации',rows.map(row=>Number(row.publications||0)),false),
      ],
    });
  }

  function readerChart(host,rows){
    createChart(host,{
      color:['#8b5cf6','#2563eb','#ec4899'],
      tooltip:{trigger:'axis',renderMode:'richText'},
      legend:{top:4,textStyle:{fontSize:12}},
      grid:{left:38,right:18,top:48,bottom:rows.length>45?48:28,containLabel:true},
      xAxis:{type:'category',boundaryGap:false,data:rows.map(row=>shortDate(row.day)),axisLabel:{hideOverlap:true}},
      yAxis:{type:'value',minInterval:1,splitLine:{lineStyle:{color:'#e8ecf2'}}},
      dataZoom:rows.length>45?[{type:'inside',start:Math.max(0,100-45/rows.length*100),end:100},{type:'slider',height:18,bottom:4,showDetail:false}]:[],
      series:[
        lineSeries('«Спасибо»',rows.map(row=>Number(row.thank_you||0)),true),
        lineSeries('Выдано файлов',rows.map(row=>Number(row.deliveries||0)),true),
        lineSeries('Поддержка',rows.map(row=>Number(row.donations||0)),false),
      ],
    });
  }

  function requestChart(host,s){
    const data=[
      {name:'Ждут решения',value:Number(s.pending||0)},
      {name:'В очереди',value:Number(s.queued||0)},
      {name:'Переводятся',value:Number(s.in_progress||0)},
      {name:'Завершены',value:Number(s.completed||0)},
      {name:'Отклонены',value:Number(s.rejected||0)},
    ];
    createChart(host,{
      color:COLORS,
      tooltip:{trigger:'item',renderMode:'richText',formatter:'{b}: {c} ({d}%)'},
      series:[{type:'pie',radius:['52%','76%'],center:['50%','48%'],avoidLabelOverlap:true,label:{show:false},itemStyle:{borderColor:'#fff',borderWidth:3},data}],
    });
  }

  function languageChart(host,rows){
    const list=[...rows].slice(0,10).reverse();
    createChart(host,{
      color:['#2563eb'],
      tooltip:{trigger:'axis',axisPointer:{type:'shadow'},renderMode:'richText'},
      grid:{left:8,right:28,top:8,bottom:8,containLabel:true},
      xAxis:{type:'value',minInterval:1,splitLine:{lineStyle:{color:'#edf0f5'}}},
      yAxis:{type:'category',data:list.map(row=>String(row.language||'Не указан')),axisLabel:{width:110,overflow:'truncate'}},
      series:[{type:'bar',data:list.map(row=>Number(row.count||0)),barMaxWidth:18,itemStyle:{borderRadius:[0,6,6,0]}}],
    });
  }

  function lineSeries(name,data,area){return{name,type:'line',data,smooth:.25,symbol:'circle',symbolSize:5,showSymbol:data.length<40,lineStyle:{width:2.4},areaStyle:area?{opacity:.08}:undefined,emphasis:{focus:'series'}};}

  function createChart(host,option){
    if(!host||!window.echarts)return;
    try{
      const chart=window.echarts.init(host,null,{renderer:'svg'});
      chart.setOption({animationDuration:380,...option});
      charts.push(chart);
      if(typeof ResizeObserver==='function'){
        const observer=new ResizeObserver(()=>{try{chart.resize();}catch{}});
        observer.observe(host);observers.push(observer);
      }else window.addEventListener('resize',()=>chart.resize(),{once:true});
    }catch{fallback(host);}
  }

  function fallback(host){
    if(!host)return;
    host.innerHTML=`<div class="statistics-chart-fallback">${icon('bar-chart-3')}<strong>График временно недоступен</strong><span>Все числовые данные и рейтинги на странице продолжают работать.</span></div>`;
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

  function ensureCharts(){
    if(window.echarts)return Promise.resolve(true);
    if(chartLoader)return chartLoader;
    chartLoader=new Promise(resolve=>{
      const existing=document.querySelector('script[data-statistics-charts]');
      if(existing){
        existing.addEventListener('load',()=>resolve(Boolean(window.echarts)),{once:true});
        existing.addEventListener('error',()=>resolve(false),{once:true});
        setTimeout(()=>resolve(Boolean(window.echarts)),7000);
        return;
      }
      const script=document.createElement('script');
      script.src=ECHARTS_URL;
      script.async=true;
      script.dataset.statisticsCharts='1';
      script.referrerPolicy='no-referrer';
      script.addEventListener('load',()=>resolve(Boolean(window.echarts)),{once:true});
      script.addEventListener('error',()=>resolve(false),{once:true});
      document.head.append(script);
      setTimeout(()=>resolve(Boolean(window.echarts)),7000);
    });
    return chartLoader;
  }

  function fmt(value){const n=Number(value||0);return Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(n):'0';}
  function formatDate(value){if(!value)return'—';try{return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));}catch{return String(value);}}
  function shortDate(value){if(!value)return'';try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T00:00:00Z`));}catch{return String(value).slice(5);}}
  function relativeDate(value){if(!value)return'—';const time=Date.parse(value);if(!Number.isFinite(time))return String(value);const diff=Date.now()-time;if(diff<60_000)return'только что';if(diff<3_600_000)return`${Math.max(1,Math.round(diff/60_000))} мин назад`;if(diff<86_400_000)return`${Math.max(1,Math.round(diff/3_600_000))} ч назад`;return formatDate(value);}
  function formatDuration(value){if(value==null||!Number.isFinite(Number(value)))return'Недостаточно данных';const hours=Math.max(0,Number(value));if(hours<1)return`${Math.max(1,Math.round(hours*60))} мин`;if(hours<24)return`${fmt(hours)} ч`;return`${fmt(hours/24)} дн.`;}
  function word(value,one,few,many){const n=Math.abs(Number(value||0))%100,m=n%10;if(n>10&&n<20)return many;if(m>1&&m<5)return few;if(m===1)return one;return many;}

  admin.registerRoute('section:statistics',{
    mount:render,
    refresh:render,
    unmount:cleanup,
  });
  runtime.registerPatcher(installNavigation);
  document.addEventListener('dtl:adminrender',installNavigation);
  document.addEventListener('dtl:adminroutechange',installNavigation);
  installNavigation();
  if(admin.activeRoute?.()==='tools:analytics')queueMicrotask(()=>void admin.open?.('section:statistics'));
  window.DTL_ADMIN_STATISTICS=Object.freeze({render,installNavigation});
})();
