(() => {
  const FLAG_BASE = '/app/flags';
  const regionalFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

  const countryByLanguage = {
    ko:'kr', ja:'jp', zh:'cn', en:'gb', ru:'ru', es:'es', pt:'pt', id:'id', vi:'vn', fr:'fr', de:'de', hi:'in', fil:'ph'
  };

  const languagePatterns = {
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

  const languageLabels = {
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

  function detectLanguage(text = '') {
    const value = String(text).normalize('NFKC').replace(regionalFlags, ' ').trim();
    for (const [code, re] of Object.entries(languagePatterns)) if (re.test(value)) return code;
    return null;
  }

  function currentLocale() {
    const raw = String(window.__DTL_LOCALE__ || document.documentElement.lang || window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en')
      .toLowerCase().split('-')[0];
    return languageLabels[raw] ? raw : 'en';
  }

  function escapeMarkup(value = '') {
    return String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function canonicalLanguageMarkup(code, locale) {
    const text = (languageLabels[locale] || languageLabels.en)[code] || languageLabels.en[code] || code;
    return `<span class="localized-language canonical-language" data-language-code="${code}"><span>${escapeMarkup(text)}</span></span>`;
  }

  function annotateNovelMeta(root) {
    root.querySelectorAll('.novel-meta .localized-language').forEach((el) => {
      if (el.dataset.languageCode) {
        el.classList.add('canonical-language');
        return;
      }
      const code = detectLanguage(el.textContent);
      if (!code) return;
      el.dataset.languageCode = code;
      el.classList.add('canonical-language');
    });
  }

  function normalizeListMeta(root) {
    const locale = currentLocale();
    root.querySelectorAll('.list-meta').forEach((el) => {
      const raw = String(el.textContent || '').replace(regionalFlags, ' ').replace(/\s+/g, ' ').trim();
      const code = detectLanguage(raw);
      if (!code) return;

      const separator = raw.indexOf('·');
      const suffix = separator >= 0 ? raw.slice(separator + 1).trim() : '';
      const stamp = `${locale}:${code}:${suffix}`;
      if (el.dataset.circleLanguageStamp === stamp && el.querySelector('.canonical-language[data-language-code]')) return;

      el.dataset.circleLanguageStamp = stamp;
      el.innerHTML = `${canonicalLanguageMarkup(code, locale)}${suffix ? `<span class="language-meta-rest"> · ${escapeMarkup(suffix)}</span>` : ''}`;
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

  function codeFromNode(scope) {
    const canonical = scope?.matches?.('.canonical-language[data-language-code]')
      ? scope
      : scope?.querySelector?.('.canonical-language[data-language-code]');
    if (canonical?.dataset.languageCode) return canonical.dataset.languageCode;
    return detectLanguage(scope?.textContent || '');
  }

  function flagImg(code, className='circle-language-flag') {
    const country = countryByLanguage[code];
    if (!country) return null;
    const img = document.createElement('img');
    img.className = className;
    img.src = `${FLAG_BASE}/${country}.svg`;
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.fetchPriority = 'low';
    img.addEventListener('error', () => img.remove(), { once:true });
    return img;
  }

  function stripEmojiFlags(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) node.nodeValue = String(node.nodeValue || '').replace(regionalFlags, '').replace(/^\s+/, '');
  }

  function applyCircleFlag(container, code) {
    if (!container || !code) return;
    const host = container.matches?.('.localized-language')
      ? container
      : container.querySelector?.('.localized-language') || container;
    if (host.querySelector?.('.circle-language-flag')) return;
    const img = flagImg(code);
    if (!img) return;
    host.querySelectorAll?.('svg,.lucide,.dtl-country-flag').forEach(x => x.remove());
    stripEmojiFlags(host);
    host.classList?.add('localized-language', 'canonical-language');
    host.dataset.languageCode = code;
    host.prepend(img);
    host.dataset.circleFlagReady = '1';
  }

  function enhanceLanguagePicker(root=document) {
    root.querySelectorAll('[data-lang]').forEach(button => {
      const code = String(button.dataset.lang || '').toLowerCase();
      if (!countryByLanguage[code]) return;
      if (button.querySelector('.circle-language-flag')) return;
      stripEmojiFlags(button);
      const old = button.querySelector('.language-picker-flag,.dtl-country-flag');
      if (old) old.remove();
      const img = flagImg(code, 'circle-language-flag language-picker-circle-flag');
      if (img) button.prepend(img);
    });
  }

  function enhanceLanguageFlags(root=document) {
    root.querySelectorAll('.canonical-language[data-language-code]').forEach(el => {
      applyCircleFlag(el, el.dataset.languageCode);
    });

    root.querySelectorAll('.novel-meta > span').forEach(span => {
      const code = span.dataset.languageCode
        || span.querySelector?.('[data-language-code]')?.dataset.languageCode
        || codeFromNode(span);
      if (!code) return;
      applyCircleFlag(span, code);
    });

    enhanceLanguagePicker(root);
  }

  function hashTitle(value='') {
    let h = 2166136261;
    for (const ch of String(value)) {
      h ^= ch.codePointAt(0) || 0;
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  function smartInitials(title='DTL') {
    const value = String(title).trim();
    if (!value) return 'DTL';
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value)) {
      return [...value.replace(/[\s\p{P}\p{S}]+/gu,'')].slice(0,2).join('') || 'DTL';
    }
    const stop = new Set(['the','a','an','of','and','in','to','for','as']);
    const words = value.split(/\s+/).map(x=>x.replace(/^\W+|\W+$/g,'')).filter(Boolean);
    const useful = words.filter(x=>!stop.has(x.toLowerCase()));
    const chosen = (useful.length ? useful : words).slice(0,2);
    return chosen.map(x=>[...x][0]).join('').toUpperCase().slice(0,3) || 'DTL';
  }

  function titleForCover(cover) {
    const scope = cover.closest('.list-row,.novel-card,.request-card,.detail-hero,.admin-request') || cover.parentElement;
    return scope?.querySelector('.list-title,.novel-title,.detail-title,.card-title')?.textContent?.trim() || cover.textContent.trim() || 'Dollar TL';
  }

  function languageForCover(cover) {
    const scope = cover.closest('.list-row,.novel-card,.request-card,.detail-hero,.admin-request') || cover.parentElement;
    return codeFromNode(scope);
  }

  function enhanceCover(cover) {
    if (cover.dataset.richCoverReady === '1') return;
    const title = titleForCover(cover);
    const code = languageForCover(cover);
    const variant = hashTitle(title) % 6;
    cover.classList.add('rich-fallback-cover', `cover-v${variant}`);
    cover.dataset.richCoverReady = '1';
    cover.textContent = '';

    const top = document.createElement('span');
    top.className = 'cover-topline';
    const brand = document.createElement('span');
    brand.className = 'cover-brand-mini';
    brand.textContent = 'DTL';
    top.appendChild(brand);
    const flag = flagImg(code);
    if (flag) top.appendChild(flag);

    const monogram = document.createElement('span');
    monogram.className = 'cover-monogram';
    monogram.textContent = smartInitials(title);

    const footer = document.createElement('span');
    footer.className = 'cover-footer';
    const mark = document.createElement('span');
    mark.className = 'cover-footer-mark';
    const spark = document.createElement('span');
    spark.className = 'cover-spark';
    footer.append(mark, spark);

    cover.append(top, monogram, footer);
  }

  function compactPreviewRows(root=document) {
    root.querySelectorAll('.list-row:not(.queue-row)').forEach(row => {
      if (row.dataset.compactPreviewReady === '1') return;
      const copy = row.querySelector(':scope > .list-copy');
      const pill = row.querySelector(':scope > .status-pill');
      if (!copy || !pill) return;
      const line = document.createElement('span');
      line.className = 'list-status-line';
      line.appendChild(pill.cloneNode(true));
      copy.appendChild(line);
      row.dataset.compactPreviewReady = '1';
    });
  }

  function normalizeChapterChunk(root=document) {
    root.querySelectorAll('.list-meta .language-meta-rest').forEach(el => {
      const text = (el.textContent || '').replace(/^\s*[·•]\s*/, '').trim();
      if (!text) return;
      el.textContent = ` · ${text}`;
    });
  }

  function patch(root=document) {
    annotateNovelMeta(root);
    normalizeListMeta(root);
    replaceArrows(root);
    enhanceLanguageFlags(root);
    root.querySelectorAll('.novel-cover').forEach(enhanceCover);
    compactPreviewRows(root);
    normalizeChapterChunk(root);
  }

  let raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      patch(document);
    });
  }

  const viewRoot = document.getElementById('viewRoot');
  const sheetRoot = document.getElementById('sheetRoot');
  if (viewRoot) new MutationObserver(schedule).observe(viewRoot, { childList:true, subtree:true, characterData:true });
  if (sheetRoot) new MutationObserver(schedule).observe(sheetRoot, { childList:true, subtree:true, characterData:true });
  document.addEventListener('dtl:localechange', schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true });
  else schedule();
})();
