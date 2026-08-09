(() => {
  const supported=new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const localeNames={English:'en','Español':'es',Filipino:'fil','हिन्दी':'hi','Português':'pt','Bahasa Indonesia':'id','Tiếng Việt':'vi',Français:'fr',Deutsch:'de','Русский':'ru'};
  const hints={
    ru:['Главная','Очередь','Мои заявки','Профиль'],
    es:['Inicio','Cola','Mis solicitudes','Cuenta'],
    fil:['Pila','Mga Kahilingan Ko','Magmungkahi'],
    hi:['मुख्य','कतार','मेरे अनुरोध','खाता'],
    pt:['Início','Fila','Meus pedidos','Conta'],
    id:['Beranda','Antrean','Permintaan Saya','Akun'],
    vi:['Trang chủ','Hàng đợi','Đề xuất của tôi','Tài khoản'],
    fr:['Accueil','Mes demandes','Compte','Proposer'],
    de:['Warteschlange','Meine Anfragen','Konto','Vorschlagen'],
    en:['Home','Queue','My Requests','Account']
  };
  function detect(){
    const setting=document.querySelector('#languageSetting .setting-sub')?.textContent?.trim();
    if(setting&&localeNames[setting])return localeNames[setting];
    const nav=[...document.querySelectorAll('#bottomNav .nav-item')].map(x=>x.textContent.trim()).join(' | ');
    if(nav){
      let best=null,bestScore=0;
      for(const [locale,words] of Object.entries(hints)){
        const score=words.reduce((n,word)=>n+(nav.includes(word)?1:0),0);
        if(score>bestScore){best=locale;bestScore=score;}
      }
      if(best&&bestScore>=1)return best;
    }
    const current=String(document.documentElement.lang||'').toLowerCase().split('-')[0];
    if(supported.has(current)&&current!=='en')return current;
    const tg=String(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code||'').toLowerCase().split('-')[0];
    return supported.has(tg)?tg:(supported.has(current)?current:'en');
  }
  function sync(){const locale=detect();if(document.documentElement.lang!==locale)document.documentElement.lang=locale;}
  let raf=0;const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;sync();});};
  const shell=document.getElementById('app')||document.body;
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
