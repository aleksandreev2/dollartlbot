(() => {
  const ALLOWED_VIEWS=new Set(['home','queue','suggest','requests','account','admin']);
  let pendingRequestId=0;
  let initialHandled=false;

  function app(){return window.DTL_APP;}

  function parse(raw){
    try{return new URL(raw||location.href,location.href);}catch{return null;}
  }

  function internalTarget(url){
    if(!url||url.origin!==location.origin)return null;
    if(!url.pathname.startsWith('/app'))return null;
    const requestedView=url.searchParams.get('view')||'';
    const requestId=Number(url.searchParams.get('request')||0);
    const view=ALLOWED_VIEWS.has(requestedView)?requestedView:(Number.isSafeInteger(requestId)&&requestId>0?'requests':'home');
    return {view,requestId:Number.isSafeInteger(requestId)&&requestId>0?requestId:0};
  }

  function open(raw){
    const url=parse(raw);
    const target=internalTarget(url);
    const instance=app();
    if(target&&instance?.navigate){
      if(target.requestId){
        pendingRequestId=target.requestId;
        instance.state.requestFilter='all';
      }
      instance.navigate(target.view);
      return true;
    }
    if(url){
      try{instance?.tg?.openLink?.(url.toString());return true;}catch{}
      try{window.open(url.toString(),'_blank','noopener');return true;}catch{}
    }
    return false;
  }

  function focusRequest(){
    if(!pendingRequestId)return;
    const target=document.querySelector(`[data-novel="${pendingRequestId}"]`);
    if(!target)return;
    const id=pendingRequestId;
    pendingRequestId=0;
    target.classList.add('notification-target');
    target.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    setTimeout(()=>{
      const current=document.querySelector(`[data-novel="${id}"]`);
      current?.classList.remove('notification-target');
    },2600);
  }

  function handleInitialLink(){
    if(initialHandled)return;
    const url=parse(location.href);
    const target=internalTarget(url);
    if(!target)return;
    const hasExplicitTarget=url.searchParams.has('view')||url.searchParams.has('request');
    if(!hasExplicitTarget)return;
    initialHandled=true;
    open(url.toString());
    url.searchParams.delete('view');
    url.searchParams.delete('request');
    try{history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);}catch{}
  }

  document.addEventListener('dtl:home',handleInitialLink);
  document.addEventListener('dtl:requests',focusRequest);
  window.DTL_NOTIFICATION_LINK=Object.freeze({open});
})();
