(() => {
  const patterns = {
    ko: /(?:\bkorean\b|\bkoreano\b|\bcoreano\b|\bcoréen\b|\bkoreanisch\b|корей\w*|한국어|한국말|tiếng hàn|कोरियाई|bahasa korea)/i,
    ja: /(?:\bjapanese\b|\bjaponés\b|\bjaponês\b|\bjaponais\b|\bjapanisch\b|япон\w*|日本語|tiếng nhật|जापानी|bahasa jepang|\bhapon\b)/i,
    zh: /(?:\bchinese\b|\bchino\b|\bchinês\b|\bchinois\b|\bchinesisch\b|китай\w*|中文|汉语|漢語|tiếng trung|चीनी|tionghoa|\btsino\b)/i,
    en: /(?:\benglish\b|\binglés\b|\binglês\b|\banglais\b|\benglisch\b|англ\w*|tiếng anh|अंग्रेज़ी|\bingles\b|\binggris\b)/i,
    ru: /(?:\brussian\b|\bruso\b|\brusso\b|\brusse\b|\brussisch\b|русск\w*|tiếng nga|रूसी|\brusia\b)/i,
    es: /(?:\bspanish\b|\bespañol\b|\bespanhol\b|\bespagnol\b|\bspanisch\b|испан\w*|tiếng tây ban nha|स्पेनिश|\bspanyol\b|\bespanyol\b)/i,
    pt: /(?:\bportuguese\b|\bportugués\b|\bportuguês\b|\bportugais\b|\bportugiesisch\b|португал\w*|tiếng bồ đào nha|पुर्तगाली|\bportugis\b|\bportuges\b)/i,
    id: /(?:\bindonesian\b|\bindonesio\b|\bindonésio\b|\bindonésien\b|\bindonesisch\b|индонез\w*|tiếng indonesia|इंडोनेशियाई|bahasa indonesia|\bindones\b)/i,
    vi: /(?:\bvietnamese\b|\bvietnamita\b|\bvietnamien\b|\bvietnamesisch\b|вьетнам\w*|tiếng việt|वियतनामी|\bbiyetnames\b)/i,
    fr: /(?:\bfrench\b|\bfrancés\b|\bfrancês\b|\bfrançais\b|\bfranzösisch\b|француз\w*|tiếng pháp|फ़्रेंच|\bprancis\b|\bpranses\b)/i,
    de: /(?:\bgerman\b|\balemán\b|\balemão\b|\ballemand\b|\bdeutsch\b|немец\w*|tiếng đức|जर्मन|\bjerman\b|\baleman\b)/i,
    hi: /(?:\bhindi\b|\bहिंदी\b|\bहिन्दी\b|хинди)/i,
    fil: /(?:\bfilipino\b|\bfilipina\b|\btagalog\b|филиппин\w*|फ़िलिपिनो)/i,
  };

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
    de:{ko:'Koreanisch',ja:'Japanisch',zh:'Chinesisch',en:'Englisch',ru:'Russisch',es:'Spanisch',pt:'Portugiesisch',id:'Indonesisch',vi:'Vietnamesisch',fr:'Französisch',de:'Deutsch',hi:'Hindi',fil:'Filipino'},
  };

  const regionalFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

  function detect(text = '') {
    const value = String(text).normalize('NFKC').replace(regionalFlags, ' ').trim();
    for (const [code, re] of Object.entries(patterns)) if (re.test(value)) return code;
    return null;
  }

  function locale() {
    const raw = String(window.__DTL_LOCALE__ || document.documentElement.lang || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en')
      .toLowerCase().split('-')[0];
    return labels[raw] ? raw : 'en';
  }

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function canonicalMarkup(code, lang) {
    const text = (labels[lang] || labels.en)[code] || labels.en[code] || code;
    return `<span class="localized-language canonical-language" data-language-code="${code}"><span>${esc(text)}</span></span>`;
  }

  function annotateNovelMeta(root) {
    root.querySelectorAll('.novel-meta .localized-language').forEach((el) => {
      if (el.dataset.languageCode) {
        el.classList.add('canonical-language');
        return;
      }
      const code = detect(el.textContent);
      if (!code) return;
      el.dataset.languageCode = code;
      el.classList.add('canonical-language');
    });
  }

  function normalizeListMeta(root) {
    const lang = locale();
    root.querySelectorAll('.list-meta').forEach((el) => {
      const raw = String(el.textContent || '').replace(regionalFlags, ' ').replace(/\s+/g, ' ').trim();
      const code = detect(raw);
      if (!code) return;

      const separator = raw.indexOf('·');
      const suffix = separator >= 0 ? raw.slice(separator + 1).trim() : '';
      const stamp = `${lang}:${code}:${suffix}`;
      if (el.dataset.circleLanguageStamp === stamp && el.querySelector('.canonical-language[data-language-code]')) return;

      el.dataset.circleLanguageStamp = stamp;
      el.innerHTML = `${canonicalMarkup(code, lang)}${suffix ? `<span class="language-meta-rest"> · ${esc(suffix)}</span>` : ''}`;
    });
  }

  function replaceArrows(root) {
    let changed = false;
    root.querySelectorAll('.novel-meta span').forEach((span) => {
      if (span.dataset.arrowIconReady === '1') return;
      if ((span.textContent || '').trim() !== '→') return;
      span.textContent = '';
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'circle-arrow-right');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'language-arrow-icon';
      span.appendChild(icon);
      span.dataset.arrowIconReady = '1';
      changed = true;
    });
    if (changed && window.lucide?.createIcons) {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
    }
  }

  function patch(root = document) {
    annotateNovelMeta(root);
    normalizeListMeta(root);
    replaceArrows(root);
  }

  let raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      patch(document);
    });
  }

  const patchRoot = document.getElementById('viewRoot') || document.body;
  new MutationObserver(schedule).observe(patchRoot, { childList: true, subtree: true, characterData: true });
  document.addEventListener('dtl:localechange', schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
