(() => {
  let observer=null;

  function attach(){
    observer?.disconnect();
    observer=null;
    const app=window.DTL_APP;
    if(app?.state?.view!=='discover')return;
    const host=document.getElementById('discoverContent');
    if(!host)return;
    observer=new MutationObserver(()=>{
      if(window.DTL_APP?.state?.view!=='discover')return;
      document.dispatchEvent(new CustomEvent('dtl:viewrender',{detail:{view:'discover',source:'discover-content'}}));
    });
    observer.observe(host,{childList:true});
  }

  document.addEventListener('dtl:discover',attach);
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(attach));
})();
