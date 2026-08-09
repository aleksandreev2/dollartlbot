(() => {
  const supported = new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const storageKey = 'dtl_locale';

  const units = {ru:'глав',es:'capítulos',fil:'kabanata',hi:'अध्याय',pt:'capítulos',id:'bab',vi:'chương',fr:'chapitres',de:'Kapitel'};
  const requestWords = {ru:'Заявка',es:'Solicitud',fil:'Kahilingan',hi:'अनुरोध',pt:'Pedido',id:'Permintaan',vi:'Yêu cầu',fr:'Demande',de:'Anfrage'};
  const positionWords = {ru:'Позиция',es:'Posición',fil:'Puwesto',hi:'स्थान',pt:'Posição',id:'Posisi',vi:'Vị trí',fr:'Position',de:'Position'};
  const repostTitles = {ru:'Правила переводов и репостов',es:'Reglas de traducción y republicación',fil:'Mga tuntunin sa pagsasalin at muling paglalathala',hi:'अनुवाद और पुनर्प्रकाशन के नियम',pt:'Regras de tradução e republicação',id:'Aturan terjemahan dan publikasi ulang',vi:'Quy định dịch và đăng lại',fr:'Règles de traduction et de republication',de:'Regeln für Übersetzungen und Wiederveröffentlichung'};

  function normalize(value) {
    const raw = String(value || '').toLowerCase().replace('_', '-').split('-')[0];
    if (raw === 'tl') return 'fil';
    return supported.has(raw) ? raw : null;
  }

  function locale() {
    return normalize(window.__DTL_LOCALE__ || document.documentElement.lang) || 'en';
  }

  function scheduleInlineCopy() {
    if (scheduleInlineCopy.raf) return;
    scheduleInlineCopy.raf = requestAnimationFrame(() => {
      scheduleInlineCopy.raf = 0;
      patchInlineCopy();
    });
  }
  scheduleInlineCopy.raf = 0;

  function apply(localeValue, source = 'unknown') {
    const next = normalize(localeValue);
    if (!next) return false;
    const previous = normalize(document.documentElement.lang) || 'en';
    window.__DTL_LOCALE__ = next;
    document.documentElement.lang = next;
    try { localStorage.setItem(storageKey, next); } catch {}
    if (previous !== next) {
      document.dispatchEvent(new CustomEvent('dtl:localechange', { detail: { locale: next, previous, source } }));
      scheduleInlineCopy();
    }
    return true;
  }

  function fromTelegram() {
    return normalize(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code);
  }

  function fromStorage() {
    try { return normalize(localStorage.getItem(storageKey)); } catch { return null; }
  }

  function patchInlineCopy() {
    const l = locale();
    if (!units[l]) return;
    for (const root of [document.getElementById('viewRoot'), document.getElementById('bottomNav'), document.getElementById('sheetRoot')]) {
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue || '';
        const next = text
          .replace(/\b(\d+)\s+chapters\b/gi, (_, n) => `${n} ${units[l]}`)
          .replace(/\bRequest\s+#(\d+)\b/gi, (_, n) => `${requestWords[l]} #${n}`)
          .replace(/\bPosition\s+#(\d+)\b/gi, (_, n) => `${positionWords[l]} #${n}`);
        if (next !== text) node.nodeValue = next;
      }
    }
    const title = document.querySelector('.sheet-copy.rich-sheet .rule-note strong');
    if (title && repostTitles[l] && title.textContent !== repostTitles[l]) title.textContent = repostTitles[l];
  }

  // The last saved client-side locale is only a first-paint hint. The
  // authenticated /bootstrap response remains the source of truth.
  apply(fromStorage() || fromTelegram() || 'en', 'initial');

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function dtlLocaleAwareFetch(input, init) {
    const response = await nativeFetch(input, init);
    let pathname = '';
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      pathname = new URL(raw, location.href).pathname;
    } catch {}

    if (pathname === '/api/app/bootstrap' && response.ok) {
      try {
        const payload = await response.clone().json();
        apply(payload?.user?.locale, 'bootstrap');
      } catch {}
    }

    if (pathname === '/api/app/language') {
      if (response.ok) {
        try {
          const payload = await response.clone().json();
          if (apply(payload?.locale, 'language-api')) {
            document.dispatchEvent(new CustomEvent('dtl:languagesaved', { detail: { locale: normalize(payload?.locale) } }));
          }
        } catch {}
      } else {
        document.dispatchEvent(new CustomEvent('dtl:languageerror', { detail: { status: response.status } }));
      }
    }
    return response;
  };

  // Preview mode does not call the language API, so switch immediately on click.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-lang]');
    if (!button) return;
    if (!window.Telegram?.WebApp?.initData) apply(button.dataset.lang, 'preview-picker');
  }, true);

  const observer = new MutationObserver(scheduleInlineCopy);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('dtl:localechange', scheduleInlineCopy);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInlineCopy, { once: true });
  else scheduleInlineCopy();
})();
