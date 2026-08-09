(() => {
  const tg=window.Telegram?.WebApp;
  let account=null,locale='en',timer=0;
  const words={
    en:'LOADS',es:'UN MONTÓN',fil:'ANG DAMI',hi:'बहुत ज़्यादा',pt:'PRA CARAMBA',id:'BANYAK BANGET',vi:'RẤT NHIỀU',fr:'PLEIN',de:'JEDE MENGE',ru:'ДОХУЯ'
  };
  const captions={
    en:'no limit',es:'sin límite',fil:'walang limit',hi:'कोई सीमा नहीं',pt:'sem limite',id:'tanpa batas',vi:'không giới hạn',fr:'sans limite',de:'ohne Limit',ru:'без лимита'
  };
  function norm(v){v=String(v||'en').toLowerCase();if(v.startsWith('ru'))return'ru';if(v.startsWith('es'))return'es';if(v.startsWith('fil')||v.startsWith('tl'))return'fil';if(v.startsWith('hi'))return'hi';if(v.startsWith('pt'))return'pt';if(v.startsWith('id'))return'id';if(v.startsWith('vi'))return'vi';if(v.startsWith('fr'))return'fr';if(v.startsWith('de'))return'de';return'en';}
  async function refresh(){if(!tg?.initData)return;try{const r=await fetch('/api/app/bootstrap',{headers:{'x-telegram-init-data':tg.initData},cache:'no-store'});if(!r.ok)return;const d=await r.json();account=d.account||null;locale=norm(d.user?.locale||window.__DTL_LOCALE__||document.documentElement.lang);patch();}catch{}}
  function patch(){if(!account?.unlimited)return;
    document.querySelectorAll('.premium-card').forEach(card=>{
      card.classList.add('quota-unlimited-user');
      const values=card.querySelectorAll('.usage-value');if(values[0])values[0].textContent=`${account.used} / ∞`;if(values[1])values[1].textContent=`∞ ${words[locale]||words.en}`;
      const captionsEls=card.querySelectorAll('.usage-caption');if(captionsEls[1])captionsEls[1].textContent=captions[locale]||captions.en;
      let stamp=card.querySelector('.quota-unlimited-stamp');if(!stamp){stamp=document.createElement('div');stamp.className='quota-unlimited-stamp';card.appendChild(stamp);}stamp.textContent=`∞ ${words[locale]||words.en}`;
    });
    document.querySelectorAll('.usage-box').forEach(box=>{if(box.closest('.premium-card'))return;const values=box.querySelectorAll('.usage-value');if(values.length>=2){values[0].textContent=`${Number(account.used||0)+1} / ∞`;values[1].textContent=`∞ ${words[locale]||words.en}`;const caps=box.querySelectorAll('.usage-caption');if(caps[1])caps[1].textContent=captions[locale]||captions.en;}});
  }
  const root=document.getElementById('viewRoot');if(root)new MutationObserver(()=>requestAnimationFrame(patch)).observe(root,{childList:true,subtree:false});
  document.addEventListener('dtl:localechange',event=>{locale=norm(event.detail?.locale||window.__DTL_LOCALE__||document.documentElement.lang);requestAnimationFrame(patch);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
  timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},90000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
