(() => {
  const app=window.DTL_APP;
  if(!app?.state)throw new Error('DTL app core must load before public-title-deeplink.js');
  let handled=false;
  let attempts=0;

  function targetId(){
    const start=String(window.Telegram?.WebApp?.initDataUnsafe?.start_param||'').trim();
    const startMatch=/^title_(\d+)$/.exec(start);
    if(startMatch)return Number(startMatch[1]);
    const query=new URLSearchParams(location.search).get('title');
    return /^\d+$/.test(String(query||''))?Number(query):0;
  }

  function openTarget(){
    if(handled)return;
    const id=targetId();
    if(!id){handled=true;return;}
    if(typeof app.openNovel==='function'&&app.state.bootstrap){
      handled=true;
      try{app.openNovel(id);}catch(error){handled=false;console.warn('public_title_deeplink_failed',error);}
      return;
    }
    if(++attempts<=12)setTimeout(openTarget,80);
  }

  document.addEventListener('dtl:bootstrap',()=>queueMicrotask(openTarget));
  document.addEventListener('dtl:viewrender',()=>{if(!handled&&attempts<12)queueMicrotask(openTarget);});
  queueMicrotask(openTarget);
})();
