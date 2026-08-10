(() => {
  const runtime=window.DTL_RUNTIME;
  if(!runtime?.registerPatcher)throw new Error('DTL runtime core must load before quota-unlimited-ui.js');
  let account=null,locale=runtime.locale();
  const words={
    en:'LOADS',es:'UN MONTÓN',fil:'ANG DAMI',hi:'बहुत ज़्यादा',pt:'PRA CARAMBA',id:'BANYAK BANGET',vi:'RẤT NHIỀU',fr:'PLEIN',de:'JEDE MENGE',ru:'ДОХУЯ'
  };
  const captions={
    en:'no limit',es:'sin límite',fil:'walang limit',hi:'कोई सीमा नहीं',pt:'sem limite',id:'tanpa batas',vi:'không giới hạn',fr:'sans limite',de:'ohne Limit',ru:'без лимита'
  };
  function norm(v){return runtime.normalize(v)||'en';}
  function absorbBootstrap(payload){
    account=payload?.account||null;
    locale=norm(payload?.user?.locale||runtime.locale());
    runtime.schedule();
  }
  function patch(){
    if(!account?.unlimited)return;
    document.querySelectorAll('.premium-card').forEach(card=>{
      card.classList.add('quota-unlimited-user');
      const values=card.querySelectorAll('.usage-value');if(values[0])values[0].textContent=`${account.used} / ∞`;if(values[1])values[1].textContent=`∞ ${words[locale]||words.en}`;
      const captionsEls=card.querySelectorAll('.usage-caption');if(captionsEls[1])captionsEls[1].textContent=captions[locale]||captions.en;
      let stamp=card.querySelector('.quota-unlimited-stamp');if(!stamp){stamp=document.createElement('div');stamp.className='quota-unlimited-stamp';card.appendChild(stamp);}stamp.textContent=`∞ ${words[locale]||words.en}`;
    });
    document.querySelectorAll('.usage-box').forEach(box=>{if(box.closest('.premium-card'))return;const values=box.querySelectorAll('.usage-value');if(values.length>=2){values[0].textContent=`${Number(account.used||0)+1} / ∞`;values[1].textContent=`∞ ${words[locale]||words.en}`;const caps=box.querySelectorAll('.usage-caption');if(caps[1])caps[1].textContent=captions[locale]||captions.en;}});
  }
  document.addEventListener('dtl:bootstrap',event=>absorbBootstrap(event.detail?.payload));
  document.addEventListener('dtl:localechange',event=>{locale=norm(event.detail?.locale||runtime.locale());runtime.schedule();});
  runtime.registerPatcher(patch);
})();
