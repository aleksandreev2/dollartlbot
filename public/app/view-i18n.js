(() => {
  const app=window.DTL_APP;
  const runtime=window.DTL_I18N;
  if(!app?.state||!runtime?.copy||!runtime?.table)throw new Error('DTL app core and i18n runtime must load before view-i18n.js');

  const baseTr=app.tr.bind(app);
  const requestWords={en:'Request',ru:'Заявка',es:'Solicitud',fil:'Kahilingan',hi:'अनुरोध',pt:'Pedido',id:'Permintaan',vi:'Yêu cầu',fr:'Demande',de:'Anfrage',ur:'درخواست'};

  function tr(key){
    const candidate=baseTr(key);
    const fallback=runtime.table('uiFallback',app.state.locale)||{};
    return fallback[candidate]??candidate;
  }
  function copy(key,...args){
    const value=runtime.copy(key,...args);
    return value===undefined||value===null?key:value;
  }
  function table(name){return runtime.table(name,app.state.locale)||runtime.table(name,'en')||{};}
  function languageName(value=''){
    const code=runtime.detectLanguage(value);
    return code?runtime.languageLabel(code,app.state.locale):String(value||'');
  }
  function tagLabel(tag=''){return runtime.tagLabel(tag,app.state.locale)||String(tag||'');}
  function relativeTime(value){
    if(!value)return'—';
    const ms=Date.now()-new Date(value).getTime();
    if(ms<0)return app.formatDate(value);
    const min=Math.floor(ms/60000);
    if(min<1)return copy('justNow');
    if(min<60)return copy('minAgo',min);
    const h=Math.floor(min/60);
    if(h<24)return copy('hourAgo',h);
    const d=Math.floor(h/24);
    if(d<8)return copy('dayAgo',d);
    return app.formatDate(value);
  }
  function requestLabel(id){return`${requestWords[app.state.locale]||requestWords.en} #${id}`;}
  function patchChrome(){
    if(app.previewBanner)app.previewBanner.textContent=`${tr('previewMode')} — ${tr('openFromTelegram')}`;
    const button=document.getElementById('notificationButton');
    if(button)button.setAttribute('aria-label',copy('notifications'));
  }

  app.tr=tr;
  app.copy=copy;
  app.i18nTable=table;
  app.languageName=languageName;
  app.tagLabel=tagLabel;
  app.relativeTime=relativeTime;
  app.requestLabel=requestLabel;

  const notificationButton=document.getElementById('notificationButton');
  notificationButton?.addEventListener('click',event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    app.toast(copy('notifications'));
  },{capture:true});

  document.addEventListener('dtl:localechange',patchChrome);
  document.addEventListener('dtl:bootstrap',patchChrome);
  patchChrome();
})();
