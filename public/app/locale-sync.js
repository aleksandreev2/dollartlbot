(() => {
  const supported=new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const localeNames={English:'en','Español':'es',Filipino:'fil','हिन्दी':'hi','Português':'pt','Bahasa Indonesia':'id','Tiếng Việt':'vi',Français:'fr',Deutsch:'de','Русский':'ru'};
  const storageKey='dtl_locale';

  function normalize(value){
    const raw=String(value||'').toLowerCase().replace('_','-').split('-')[0];
    if(raw==='tl')return'fil';
    return supported.has(raw)?raw:null;
  }

  function apply(locale,source='unknown'){
    const next=normalize(locale);if(!next)return false;
    const previous=normalize(document.documentElement.lang)||'en';
    window.__DTL_LOCALE__=next;
    document.documentElement.lang=next;
    try{localStorage.setItem(storageKey,next);}catch{}
    if(previous!==next){
      document.dispatchEvent(new CustomEvent('dtl:localechange',{detail:{locale:next,previous,source}}));
    }
    return true;
  }

  function fromTelegram(){
    return normalize(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code);
  }

  function fromStorage(){
    try{return normalize(localStorage.getItem(storageKey));}catch{return null;}
  }

  function fromAccount(){
    const value=document.querySelector('#languageSetting .setting-sub')?.textContent?.trim();
    return value&&localeNames[value]?localeNames[value]:null;
  }

  // Use the last saved client-side value for the first paint. The authenticated
  // bootstrap response below always wins as soon as it arrives.
  apply(fromStorage()||fromTelegram()||'en','initial');

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function dtlLocaleAwareFetch(input,init){
    const response=await nativeFetch(input,init);
    let pathname='';
    try{
      const raw=typeof input==='string'?input:input instanceof Request?input.url:String(input||'');
      pathname=new URL(raw,location.href).pathname;
    }catch{}

    if(pathname==='/api/app/bootstrap'&&response.ok){
      try{
        const payload=await response.clone().json();
        apply(payload?.user?.locale,'bootstrap');
      }catch{}
    }

    if(pathname==='/api/app/language'){
      if(response.ok){
        try{
          const payload=await response.clone().json();
          if(apply(payload?.locale,'language-api')){
            document.dispatchEvent(new CustomEvent('dtl:languagesaved',{detail:{locale:normalize(payload?.locale)}}));
          }
        }catch{}
      }else{
        document.dispatchEvent(new CustomEvent('dtl:languageerror',{detail:{status:response.status}}));
      }
    }
    return response;
  };

  // Preview mode does not call the language API, so switch immediately on click.
  document.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-lang]');
    if(!button)return;
    if(!window.Telegram?.WebApp?.initData)apply(button.dataset.lang,'preview-picker');
  },true);

  // Fallback for old/cached app.js builds and for DOM restored by Telegram.
  let raf=0;
  const schedule=()=>{
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      const locale=fromAccount();
      if(locale&&locale!==window.__DTL_LOCALE__)apply(locale,'account-fallback');
    });
  };
  const shell=document.getElementById('app')||document.body;
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});
})();
