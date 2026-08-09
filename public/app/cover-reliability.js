(() => {
  const tg=window.Telegram?.WebApp;
  const assigned=new Map();
  let loaded=false,raf=0;
  async function loadManifest(){if(!tg?.initData)return;try{const r=await fetch('/api/app/cover-manifest',{headers:{'x-telegram-init-data':tg.initData},cache:'no-store'});if(!r.ok)return;const d=await r.json();assigned.clear();for(const x of d.covers||[])assigned.set(Number(x.id),String(x.cover_updated_at||''));loaded=true;schedule();}catch{}}
  function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;patch();});}
  function patch(){if(!loaded)return;document.querySelectorAll('[data-novel] .novel-cover').forEach(box=>{const id=Number(box.closest('[data-novel]')?.dataset.novel);if(!id||!assigned.has(id)||box.classList.contains('has-real-cover')||box.dataset.coverReliability==='done')return;const failed=box.dataset.realCoverChecked!==undefined&&!box.querySelector('.real-cover-image');if(!failed)return;retry(box,id,assigned.get(id));});}
  function retry(box,id,rev){box.dataset.coverReliability='done';setTimeout(()=>{if(!document.contains(box)||box.classList.contains('has-real-cover'))return;const img=document.createElement('img');img.className='real-cover-image cover-retry-image';img.alt='';img.decoding='async';img.loading='lazy';const token=rev?encodeURIComponent(rev):'1';img.src=`/media/covers/${id}?cover=${token}`;img.addEventListener('load',()=>{box.querySelectorAll('.real-cover-image').forEach(x=>{if(x!==img)x.remove();});box.classList.add('has-real-cover');},{once:true});img.addEventListener('error',()=>img.remove(),{once:true});box.appendChild(img);},700);}
  const root=document.getElementById('viewRoot');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){document.querySelectorAll('[data-cover-reliability="done"]:not(.has-real-cover)').forEach(x=>delete x.dataset.coverReliability);loadManifest();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadManifest,{once:true});else loadManifest();
})();
