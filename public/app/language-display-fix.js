(() => {
  const supported = new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const localeNames = {English:'en','Español':'es',Filipino:'fil','हिन्दी':'hi','Português':'pt','Bahasa Indonesia':'id','Tiếng Việt':'vi','Français':'fr','Deutsch':'de','Русский':'ru'};
  const labels = {
    en:{ko:'Korean',ja:'Japanese',zh:'Chinese',en:'English',ru:'Russian',es:'Spanish',pt:'Portuguese',id:'Indonesian',vi:'Vietnamese',fr:'French',de:'German',hi:'Hindi',fil:'Filipino'},
    ru:{ko:'Корейский',ja:'Японский',zh:'Китайский',en:'Английский',ru:'Русский',es:'Испанский',pt:'Португальский',id:'Индонезийский',vi:'Вьетнамский',fr:'Французский',de:'Немецкий',hi:'Хинди',fil:'Филиппинский'},
    es:{ko:'Coreano',ja:'Japonés',zh:'Chino',en:'Inglés',ru:'Ruso',es:'Español',pt:'Portugués',id:'Indonesio',vi:'Vietnamita',fr:'Francés',de:'Alemán',hi:'Hindi',fil:'Filipino'},
    fil:{ko:'Koreano',ja:'Hapon',zh:'Tsino',en:'Ingles',ru:'Ruso',es:'Espanyol',pt:'Portuges',id:'Indones',vi:'Biyetnames',fr:'Pranses',de:'Aleman',hi:'Hindi',fil:'Filipino'},
    hi:{ko:'कोरियाई',ja:'जापानी',zh:'चीनी',en:'अंग्रेज़ी',ru:'रूसी',es:'स्पेनिश',pt:'पुर्तगाली',id:'इंडोनेशियाई',vi:'वियतनामी',fr:'फ़्रेंच',de:'जर्मन',hi:'हिंदी',fil:'फ़िलिपिनो'},
    pt:{ko:'Coreano',ja:'Japonês',zh:'Chinês',en:'Inglês',ru:'Russo',es:'Espanhol',pt:'Português',id:'Indonésio',vi:'Vietnamita',fr:'Francês',de:'Alemão',hi:'Hindi',fil:'Filipino'},
    id:{ko:'Korea',ja:'Jepang',zh:'Tionghoa',en:'Inggris',ru:'Rusia',es:'Spanyol',pt:'Portugis',id:'Indonesia',vi:'Vietnam',fr:'Prancis',de:'Jerman',hi:'Hindi',fil:'Filipino'},
    vi:{ko:'Tiếng Hàn',ja:'Tiếng Nhật',zh:'Tiếng Trung',en:'Tiếng Anh',ru:'Tiếng Nga',es:'Tiếng Tây Ban Nha',pt:'Tiếng Bồ Đào Nha',id:'Tiếng Indonesia',vi:'Tiếng Việt',fr:'Tiếng Pháp',de:'Tiếng Đức',hi:'Tiếng Hindi',fil:'Tiếng Filipino'},
    fr:{ko:'Coréen',ja:'Japonais',zh:'Chinois',en:'Anglais',ru:'Russe',es:'Espagnol',pt:'Portugais',id:'Indonésien',vi:'Vietnamien',fr:'Français',de:'Allemand',hi:'Hindi',fil:'Filipino'},
    de:{ko:'Koreanisch',ja:'Japanisch',zh:'Chinesisch',en:'Englisch',ru:'Russisch',es:'Spanisch',pt:'Portugiesisch',id:'Indonesisch',vi:'Vietnamesisch',fr:'Französisch',de:'Deutsch',hi:'Hindi',fil:'Filipino'}
  };
  const patterns = {
    ko:/(?:\bkorean\b|\bkoreano\b|\bcoreano\b|\bcoréen\b|\bkoreanisch\b|корей\w*|한국어|한국말|tiếng hàn|कोरियाई|bahasa korea)/i,
    ja:/(?:\bjapanese\b|\bjaponés\b|\bjaponês\b|\bjaponais\b|\bjapanisch\b|япон\w*|日本語|tiếng nhật|जापानी|bahasa jepang|\bhapon\b)/i,
    zh:/(?:\bchinese\b|\bchino\b|\bchinês\b|\bchinois\b|\bchinesisch\b|китай\w*|中文|汉语|漢語|tiếng trung|चीनी|tionghoa|\btsino\b)/i,
    en:/(?:\benglish\b|\binglés\b|\binglês\b|\banglais\b|\benglisch\b|англ\w*|tiếng anh|अंग्रेज़ी|\bingles\b|\binggris\b)/i,
    ru:/(?:\brussian\b|\bruso\b|\brusso\b|\brusse\b|\brussisch\b|русск\w*|tiếng nga|रूसी|\brusia\b)/i,
    es:/(?:\bspanish\b|\bespañol\b|\bespanhol\b|\bespagnol\b|\bspanisch\b|испан\w*|tiếng tây ban nha|स्पेनिश|\bspanyol\b|\bespanyol\b)/i,
    pt:/(?:\bportuguese\b|\bportugués\b|\bportuguês\b|\bportugais\b|\bportugiesisch\b|португал\w*|tiếng bồ đào nha|पुर्तगाली|\bportugis\b|\bportuges\b)/i,
    id:/(?:\bindonesian\b|\bindonesio\b|\bindonésio\b|\bindonésien\b|\bindonesisch\b|индонез\w*|tiếng indonesia|इंडोनेशियाई|bahasa indonesia|\bindones\b)/i,
    vi:/(?:\bvietnamese\b|\bvietnamita\b|\bvietnamien\b|\bvietnamesisch\b|вьетнам\w*|tiếng việt|वियतनामी|\bbiyetnames\b)/i,
    fr:/(?:\bfrench\b|\bfrancés\b|\bfrancês\b|\bfrançais\b|\bfranzösisch\b|француз\w*|tiếng pháp|फ़्रेंच|\bprancis\b|\bpranses\b)/i,
    de:/(?:\bgerman\b|\balemán\b|\balemão\b|\ballemand\b|\bdeutsch\b|немец\w*|tiếng đức|जर्मन|\bjerman\b|\baleman\b)/i,
    hi:/(?:\bhindi\b|\bहिंदी\b|\bहिन्दी\b|хинди)/i,
    fil:/(?:\bfilipino\b|\bfilipina\b|\btagalog\b|филиппин\w*|फ़िलिपिनो)/i
  };
  const shortCodes = {ko:'ko',kr:'ko',ja:'ja',jp:'ja',zh:'zh',cn:'zh',en:'en',gb:'en',us:'en',ru:'ru',es:'es',pt:'pt',id:'id',vi:'vi',fr:'fr',de:'de',hi:'hi',fil:'fil',ph:'fil'};

  function locale(){
    const setting=document.querySelector('#languageSetting .setting-sub')?.textContent?.trim();
    if(setting&&localeNames[setting])return localeNames[setting];
    const html=String(document.documentElement.lang||'').toLowerCase().split('-')[0];
    if(supported.has(html)&&html!=='en')return html;
    const tg=String(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code||'').toLowerCase().split('-')[0];
    return supported.has(tg)?tg:(supported.has(html)?html:'en');
  }
  function codeOf(raw){
    const text=String(raw||'').normalize('NFKC').replace(/[\u{1F1E6}-\u{1F1FF}]/gu,' ').trim();
    for(const [code,re] of Object.entries(patterns)){if(re.test(text))return code;}
    const short=text.toLowerCase().replace(/[^a-z]/g,'');
    return shortCodes[short]||null;
  }
  function label(code,l){return (labels[l]||labels.en)[code]||labels.en[code]||code;}
  function iconAndLabel(code,l){return `<span class="localized-language canonical-language" data-language-code="${code}"><i data-lucide="globe-2" aria-hidden="true"></i><span>${label(code,l)}</span></span>`;}
  function normalizeLanguageSpan(span,l){
    const code=codeOf(span.textContent);if(!code)return;
    if(span.dataset.canonicalLanguage===`${l}:${code}`)return;
    span.dataset.canonicalLanguage=`${l}:${code}`;
    span.innerHTML=iconAndLabel(code,l);
  }
  function normalizeLeadingMeta(el,l){
    const text=(el.textContent||'').trim();if(!text)return;
    const firstLine=text.split(/\n/)[0];
    const separatorIndex=firstLine.indexOf('·');
    const languagePart=(separatorIndex>=0?firstLine.slice(0,separatorIndex):firstLine).trim();
    const code=codeOf(languagePart);if(!code)return;
    const restFirst=separatorIndex>=0?firstLine.slice(separatorIndex+1).trim():'';
    const laterLines=text.split(/\n/).slice(1).map(x=>x.trim()).filter(Boolean);
    const stamp=`${l}:${code}:${restFirst}:${laterLines.join('|')}`;
    if(el.dataset.canonicalLanguage===stamp)return;
    el.dataset.canonicalLanguage=stamp;
    const suffix=restFirst?`<span class="language-meta-rest"> · ${restFirst}</span>`:'';
    const lines=laterLines.length?`<br>${laterLines.join('<br>')}`:'';
    el.innerHTML=`${iconAndLabel(code,l)}${suffix}${lines}`;
  }
  function patch(){
    const l=locale();
    document.documentElement.lang=l;
    document.querySelectorAll('.novel-meta').forEach(meta=>{
      [...meta.querySelectorAll(':scope > span')].forEach(span=>normalizeLanguageSpan(span,l));
    });
    document.querySelectorAll('.list-meta,.review-sub').forEach(el=>normalizeLeadingMeta(el,l));
    document.querySelectorAll('.admin-meta').forEach(el=>normalizeLeadingMeta(el,l));
    document.querySelectorAll('.info-row').forEach(row=>{
      const labelEl=row.querySelector('.info-label');
      const value=row.querySelector('.info-value');
      if(!value)return;
      const code=codeOf(value.textContent);
      if(!code)return;
      const key=(labelEl?.textContent||'').toLowerCase();
      if(!/(language|язык|idioma|wika|भाषा|bahasa|langue|sprache|ngôn ngữ|língua)/i.test(key))return;
      normalizeLanguageSpan(value,l);
    });
    const input=document.getElementById('draftLanguage');
    if(input&&document.activeElement!==input){const code=codeOf(input.value);if(code)input.value=label(code,l);}
    try{window.lucide?.createIcons?.({attrs:{'stroke-width':1.8,'aria-hidden':'true'}});}catch{}
  }
  let raf=0;const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;patch();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
