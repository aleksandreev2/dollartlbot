(() => {
  let observer=null;

  function patchNavIcon(){
    const holder=window.DTL_APP?.bottomNav?.querySelector('.nav-item[data-nav="discover"] .nav-icon');
    if(!holder)return;
    if(holder.dataset.discoverIcon==='compass'&&holder.querySelector('svg,[data-lucide="compass"]'))return;
    holder.dataset.discoverIcon='compass';
    holder.innerHTML='<i data-lucide="compass" aria-hidden="true"></i>';
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }

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

  const nav=window.DTL_APP?.bottomNav;
  if(nav){
    const navObserver=new MutationObserver(()=>queueMicrotask(patchNavIcon));
    navObserver.observe(nav,{childList:true});
  }

  document.addEventListener('dtl:discover',()=>{attach();queueMicrotask(patchNavIcon);});
  document.addEventListener('dtl:viewchange',()=>queueMicrotask(()=>{attach();patchNavIcon();}));
  document.addEventListener('dtl:viewrender',()=>queueMicrotask(patchNavIcon));
  queueMicrotask(patchNavIcon);
})();
