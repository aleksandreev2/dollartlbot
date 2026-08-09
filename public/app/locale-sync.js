(() => {
  const supported=new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
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

  // The last saved client-side locale is only a first-paint hint. The
  // authenticated /bootstrap response below is the source of truth.
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
})();
