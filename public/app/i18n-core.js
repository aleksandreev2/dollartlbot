(() => {
  const supported = new Set(['en','es','fil','hi','pt','id','vi','fr','de','ru']);
  const storageKey = 'dtl_locale';
  const patchers = new Set();
  const responseHandlers = new Set();
  const requestWords = {en:'Request',ru:'Заявка',es:'Solicitud',fil:'Kahilingan',hi:'अनुरोध',pt:'Pedido',id:'Permintaan',vi:'Yêu cầu',fr:'Demande',de:'Anfrage'};
  const requestPattern = /(?:Request|Заявка|Solicitud|Kahilingan|अनुरोध|Pedido|Permintaan|Yêu cầu|Demande|Anfrage)\s+#(\d+)/giu;
  const positionPattern = /(?:Position|Позиция|Posición|Puwesto|स्थान|Posição|Posisi|Vị trí|Anfrageposition)\s+#(\d+)/giu;
  const chapterPattern = /(\d+)\s+(?:chapters?|глав(?:а|ы)?|capítulos?|kabanata|अध्याय|bab|chương|chapitres?|Kapitel)/giu;
  let catalog = null;
  let raf = 0;

  function normalize(value) {
    const raw = String(value || '').toLowerCase().replace('_', '-').split('-')[0];
    if (raw === 'tl') return 'fil';
    return supported.has(raw) ? raw : null;
  }

  function locale() {
    return normalize(window.__DTL_LOCALE__ || document.documentElement.lang) || 'en';
  }

  function setCatalog(next) {
    catalog = next && typeof next === 'object' ? next : null;
    schedule();
  }

  function table(name, localeValue = locale()) {
    const source = catalog?.[name];
    if (!source || typeof source !== 'object') return null;
    return source[normalize(localeValue) || 'en'] || source.en || null;
  }

  function copy(key, ...args) {
    const value = table('copy')?.[key] ?? catalog?.copy?.en?.[key];
    return typeof value === 'function' ? value(...args) : value;
  }

  function languageLabel(code, localeValue = locale()) {
    const labels = table('languageLabels', localeValue) || catalog?.languageLabels?.en || {};
    return labels?.[code] || catalog?.languageLabels?.en?.[code] || code;
  }

  function tagLabel(tag, localeValue = locale()) {
    const labels = table('tags', localeValue) || catalog?.tags?.en || {};
    return labels?.[tag] || catalog?.tags?.en?.[tag] || tag;
  }

  function detectLanguage(value) {
    const raw = String(value || '').normalize('NFKC').replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, ' ').trim();
    if (!raw) return null;
    const patterns = catalog?.languagePatterns || {};
    for (const [code, pattern] of Object.entries(patterns)) {
      try {
        pattern.lastIndex = 0;
        if (pattern.test(raw)) return code;
      } catch {}
    }
    const short = raw.toLowerCase().replace(/[^a-z]/g, '');
    const aliases = {ko:'ko',kr:'ko',ja:'ja',jp:'ja',zh:'zh',cn:'zh',en:'en',gb:'en',ru:'ru',es:'es',pt:'pt',id:'id',vi:'vi',fr:'fr',de:'de',hi:'hi',fil:'fil',tl:'fil'};
    return aliases[short] || null;
  }

  function patchInlineCopy() {
    if (!catalog) return;
    const l = locale();
    const fallback = catalog.uiFallback?.[l] || {};
    const chapterWord = fallback.chapters || 'chapters';
    const positionWord = fallback.Position || 'Position';
    const requestWord = requestWords[l] || requestWords.en;
    const root = document.getElementById('app');
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,textarea,input')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const raw=node.nodeValue||'';
      const next=raw
        .replace(requestPattern,(_,n)=>`${requestWord} #${n}`)
        .replace(positionPattern,(_,n)=>`${positionWord} #${n}`)
        .replace(chapterPattern,(_,n)=>`${n} ${chapterWord}`);
      if(next!==raw)node.nodeValue=next;
    }
  }

  function runPatchers() {
    try { patchInlineCopy(); }
    catch (error) { console.error('[DTL runtime] inline copy patch failed', error); }
    for (const patcher of [...patchers]) {
      try { patcher(); }
      catch (error) { console.error('[DTL runtime] patcher failed', error); }
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      runPatchers();
    });
  }

  function registerPatcher(patcher) {
    if (typeof patcher !== 'function') return () => {};
    patchers.add(patcher);
    schedule();
    return () => patchers.delete(patcher);
  }

  function registerResponseHandler(handler) {
    if (typeof handler !== 'function') return () => {};
    responseHandlers.add(handler);
    return () => responseHandlers.delete(handler);
  }

  function apply(localeValue, source = 'unknown') {
    const next = normalize(localeValue);
    if (!next) return false;
    const previous = locale();
    window.__DTL_LOCALE__ = next;
    document.documentElement.lang = next;
    try { localStorage.setItem(storageKey, next); } catch {}
    if (previous !== next) {
      document.dispatchEvent(new CustomEvent('dtl:localechange', { detail: { locale: next, previous, source } }));
      schedule();
    }
    return true;
  }

  function fromTelegram() {
    return normalize(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code);
  }

  function fromStorage() {
    try { return normalize(localStorage.getItem(storageKey)); }
    catch { return null; }
  }

  const runtimeApi = Object.freeze({
    supported: Object.freeze([...supported]),
    normalize,
    locale,
    apply,
    setCatalog,
    table,
    copy,
    languageLabel,
    tagLabel,
    detectLanguage,
    schedule,
    registerPatcher,
    registerResponseHandler,
  });
  window.DTL_RUNTIME = runtimeApi;
  window.DTL_I18N = runtimeApi;

  // Local storage is only a first-paint hint. Authenticated bootstrap remains authoritative.
  apply(fromStorage() || fromTelegram() || 'en', 'initial');

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function dtlRuntimeFetch(input, init) {
    let response = await nativeFetch(input, init);
    let pathname = '';
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      pathname = new URL(raw, location.href).pathname;
    } catch {}

    if (pathname === '/api/app/bootstrap' && response.ok) {
      try {
        const payload = await response.clone().json();
        apply(payload?.user?.locale, 'bootstrap');
        document.dispatchEvent(new CustomEvent('dtl:bootstrap', { detail: { payload } }));
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

    for (const handler of [...responseHandlers]) {
      try {
        const next = await handler(response, { pathname, input, init });
        if (next instanceof Response) response = next;
      } catch (error) {
        console.error('[DTL runtime] response handler failed', error);
      }
    }
    return response;
  };

  // Preview mode does not call the language API, so switch immediately on click.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-lang]');
    if (!button || window.Telegram?.WebApp?.initData) return;
    apply(button.dataset.lang, 'preview-picker');
  }, true);

  const observedRoot = document.getElementById('app') || document.body || document.documentElement;
  const observer = new MutationObserver(schedule);
  observer.observe(observedRoot, { childList: true, subtree: true, characterData: true });
  document.addEventListener('dtl:localechange', schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
