(() => {
  const runtime=window.DTL_RUNTIME;
  const app=window.DTL_APP;
  if(!runtime?.registerResponseHandler||!runtime?.registerPatcher||!app?.state)return;

  const ENDPOINT='/api/app/analytics/events';
  const MAX_QUEUE=48;
  const FLUSH_BATCH=12;
  const FLUSH_DELAY=2200;
  const STEP_NAMES={1:'upload',2:'details',3:'content',4:'review'};
  const ALLOWED=new Set([
    'discover_search','discover_zero_result','catalog_open','raw_open','duplicate_intercepted',
    'title_open','share_title','release_open','boosty_click','suggest_started','suggest_step',
    'suggest_abandoned','request_submitted',
  ]);
  const queue=[];
  const seen=new Map();
  let flushTimer=0;
  let sequence=0;
  let suggestActive=false;
  let suggestResolved=false;
  let lastSuggestStep='';

  const sessionId=getSessionId();

  function getSessionId(){
    const key='dtl_product_session_v1';
    try{
      const current=sessionStorage.getItem(key);
      if(current&&/^[A-Za-z0-9._:-]{8,80}$/.test(current))return current;
      const random=globalThis.crypto?.randomUUID?.().replace(/-/g,'')||Math.random().toString(36).slice(2)+Date.now().toString(36);
      const next=`pa_${String(random).slice(0,60)}`;
      sessionStorage.setItem(key,next);
      return next;
    }catch{return `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,12)}`;}
  }

  function eventId(name){
    sequence=(sequence+1)%1000000;
    return `pa:${sessionId}:${name}:${Date.now().toString(36)}:${sequence.toString(36)}`.slice(0,96);
  }

  function track(eventName,payload={}){
    if(!ALLOWED.has(eventName)||app.state?.preview)return;
    const item={
      event_id:eventId(eventName),
      event_name:eventName,
      session_id:sessionId,
      surface:clean(payload.surface,64)||currentSurface(),
    };
    const submissionId=positive(payload.submission_id);
    const catalogId=positive(payload.catalog_id);
    if(submissionId)item.submission_id=submissionId;
    if(catalogId)item.catalog_id=catalogId;
    const eventValue=clean(payload.event_value,120);
    if(eventValue)item.event_value=eventValue;
    const query=clean(payload.query,300);
    if(query)item.query=query;
    const metadata=sanitizeMetadata(payload.metadata);
    if(metadata)item.metadata=metadata;
    queue.push(item);
    if(queue.length>MAX_QUEUE)queue.splice(0,queue.length-MAX_QUEUE);
    scheduleFlush(queue.length>=FLUSH_BATCH?0:FLUSH_DELAY);
  }

  function currentSurface(){return clean(app.state?.view||'app',40)||'app';}

  function sanitizeMetadata(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const allowed=new Set(['result_count','mode','origin','provider','position','status','target','reason','has_raw','publication_status','language']);
    const out={};
    for(const [key,raw] of Object.entries(value)){
      if(Object.keys(out).length>=12||!allowed.has(key))continue;
      if(typeof raw==='boolean')out[key]=raw;
      else if(typeof raw==='number'&&Number.isFinite(raw))out[key]=raw;
      else if(typeof raw==='string'){const text=clean(raw,120);if(text)out[key]=text;}
    }
    return Object.keys(out).length?out:null;
  }

  function scheduleFlush(delay){
    if(flushTimer)return;
    flushTimer=setTimeout(()=>{flushTimer=0;void flush();},delay);
  }

  async function flush(){
    if(!queue.length||app.state?.preview)return;
    const events=queue.splice(0,FLUSH_BATCH);
    try{
      const response=await fetch(ENDPOINT,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-telegram-init-data':window.Telegram?.WebApp?.initData||'',
        },
        body:JSON.stringify({events}),
        keepalive:true,
      });
      if(!response.ok&&response.status>=500)queue.unshift(...events);
    }catch{
      queue.unshift(...events);
    }
    if(queue.length){
      if(queue.length>MAX_QUEUE)queue.splice(0,queue.length-MAX_QUEUE);
      scheduleFlush(FLUSH_DELAY);
    }
  }

  function dedupe(key,ttl=5000){
    const now=Date.now();
    const previous=seen.get(key)||0;
    if(now-previous<ttl)return false;
    seen.set(key,now);
    if(seen.size>120){for(const [item,time] of seen){if(now-time>600000)seen.delete(item);}}
    return true;
  }

  runtime.registerResponseHandler(async(response,context)=>{
    const path=context.pathname||'';
    if(path===ENDPOINT)return response;

    if(response.ok&&path==='/api/app/discovery/search'){
      try{
        const data=await response.clone().json();
        const query=clean(data?.query||queryFromInput(context.input),300);
        if(query.length>=2){
          const local=Array.isArray(data?.local)?data.local.length:0;
          const external=Array.isArray(data?.external)?data.external.length:0;
          const total=local+external;
          const key=`search:${query.toLowerCase()}:${total}`;
          if(dedupe(key,1200)){
            track('discover_search',{surface:'discover',query,metadata:{result_count:total,provider:data?.provider_source||data?.provider_status||''}});
            if(total===0)track('discover_zero_result',{surface:'discover',query,metadata:{result_count:0,provider:data?.provider_status||''}});
          }
        }
      }catch{}
    }

    if(response.ok&&/^\/api\/app\/novel\/\d+$/.test(path)){
      const id=positive(path.split('/').pop());
      if(id&&dedupe(`title:${id}`,120000))track('title_open',{surface:'detail',submission_id:id});
    }

    if(response.ok&&path==='/api/app/submission/preflight'){
      try{
        const data=await response.clone().json();
        const duplicate=data?.duplicate;
        if(duplicate){
          const id=positive(duplicate.submission_id||duplicate.id);
          if(dedupe(`duplicate:${id||data?.identity||'unknown'}`,30000)){
            track('duplicate_intercepted',{surface:'suggest',submission_id:id,event_value:clean(data?.identity,120),metadata:{status:duplicate.status||''}});
          }
          suggestResolved=true;
        }
      }catch{}
    }

    if(response.ok&&path==='/api/app/submit'){
      try{
        const data=await response.clone().json();
        const id=positive(data?.submission_id||data?.id||data?.request?.id);
        if(dedupe(`submitted:${id||sessionId}`,120000))track('request_submitted',{surface:'suggest',submission_id:id});
        suggestResolved=true;
      }catch{}
    }
    return response;
  });

  function inspectSuggest(){
    const active=app.state?.view==='suggest'&&Boolean(document.querySelector('.suggest-wizard-page'));
    if(!active)return;
    if(!suggestActive){
      suggestActive=true;
      suggestResolved=false;
      lastSuggestStep='';
      track('suggest_started',{surface:'suggest'});
    }
    const step=STEP_NAMES[Number(app.state?.wizardStep)]||'';
    if(step&&step!==lastSuggestStep){
      lastSuggestStep=step;
      track('suggest_step',{surface:'suggest',event_value:step});
    }
  }

  function leaveSuggest(nextView){
    if(!suggestActive||nextView==='suggest')return;
    if(!suggestResolved)track('suggest_abandoned',{surface:'suggest',event_value:lastSuggestStep||'unknown'});
    suggestActive=false;
    suggestResolved=false;
    lastSuggestStep='';
  }

  runtime.registerPatcher(inspectSuggest);
  document.addEventListener('dtl:viewchange',event=>{
    const next=String(event.detail?.view||'');
    leaveSuggest(next);
    if(next==='suggest')queueMicrotask(inspectSuggest);
  });

  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('a,button');
    if(!target)return;
    const novel=app.state?.detailNovel;
    const submissionId=positive(novel?.id);

    if(target.matches('.public-title-share')){
      track('share_title',{surface:'detail',submission_id:submissionId,event_value:novel?.queue_status==='in_progress'||novel?.queue_status==='completed'?'progress':'demand'});
      return;
    }
    if(target.matches('.title-release-open')){
      track('release_open',{surface:'detail',submission_id:submissionId});
      return;
    }
    if(target instanceof HTMLAnchorElement){
      try{
        const url=new URL(target.href,location.href);
        const host=url.hostname.toLowerCase().replace(/^www\./,'');
        if(host==='raw-fucknovelpia.com')track('raw_open',{surface:currentSurface(),submission_id:submissionId,metadata:{provider:'raw_fucknovelpia'}});
        else if(host==='boosty.to')track('boosty_click',{surface:currentSurface()});
        else if(host==='novelpia.com'&&app.state?.view==='discover')track('catalog_open',{surface:'discover'});
      }catch{}
    }
  },true);

  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flush();});
  window.addEventListener('pagehide',()=>{void flush();});

  function queryFromInput(input){
    try{const raw=typeof input==='string'?input:input instanceof Request?input.url:String(input||'');return new URL(raw,location.href).searchParams.get('q')||'';}catch{return'';}
  }
  function clean(value,max){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
  function positive(value){const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:null;}

  window.DTL_PRODUCT_ANALYTICS=Object.freeze({track,flush,sessionId});
})();
