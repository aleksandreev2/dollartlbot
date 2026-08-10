(() => {
  const runtime = window.DTL_I18N;
  if (!runtime?.detectLanguage || !runtime?.languageLabel) {
    throw new Error('DTL runtime core must load before novel-presenter.js');
  }

  const FLAG_BASE = '/app/flags';
  const regionalFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;
  const countryByLanguage = {
    ko:'kr', ja:'jp', zh:'cn', en:'gb', ru:'ru', es:'es', pt:'pt', id:'id', vi:'vn', fr:'fr', de:'de', hi:'in', fil:'ph'
  };
  const chapterUnits = {en:'chapters',ru:'глав',es:'capítulos',fil:'kabanata',hi:'अध्याय',pt:'capítulos',id:'bab',vi:'chương',fr:'chapitres',de:'Kapitel'};
  const chapterWords = '(?:chapters?|глав(?:а|ы)?|capítulos?|kabanata|अध्याय|bab|chương|chapitres?|Kapitel)';
  const chapterPattern = new RegExp(`^(\\d+)\\s+${chapterWords}$`, 'iu');

  function currentLocale() {
    return runtime.locale();
  }

  function detectLanguage(text = '') {
    return runtime.detectLanguage(text);
  }

  function escapeMarkup(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function canonicalLanguageMarkup(code) {
    return `<span class="localized-language canonical-language" data-language-code="${escapeMarkup(code)}"><span class="language-label">${escapeMarkup(runtime.languageLabel(code))}</span></span>`;
  }

  function findLanguageCode(scope) {
    if (!scope) return null;
    const direct = scope.matches?.('[data-language-code]') ? scope.dataset.languageCode : null;
    if (direct) return direct;
    const nested = scope.querySelector?.('[data-language-code]')?.dataset.languageCode;
    if (nested) return nested;
    return detectLanguage(scope.textContent || '');
  }

  function annotateNovelMeta(root) {
    root.querySelectorAll('.novel-meta > span').forEach(span => {
      if (span.dataset.arrowIconReady === '1') return;
      const raw = (span.textContent || '').trim();
      if (!raw || raw === '→' || raw === '·') return;
      const code = span.dataset.languageCode || findLanguageCode(span);
      if (!code) return;
      span.dataset.languageCode = code;
      let canonical = span.querySelector(':scope > .canonical-language[data-language-code]');
      if (!canonical) {
        span.innerHTML = canonicalLanguageMarkup(code);
        canonical = span.firstElementChild;
      }
      canonical.dataset.languageCode = code;
    });
  }

  function localizedChapterSuffix(value) {
    const raw = String(value || '').replace(/^\s*[·•]\s*/, '').trim();
    const match = chapterPattern.exec(raw);
    if (!match) return raw;
    return `${match[1]} ${chapterUnits[currentLocale()] || chapterUnits.en}`;
  }

  function normalizeListMeta(root) {
    root.querySelectorAll('.list-meta').forEach(el => {
      let code = el.dataset.sourceLanguageCode || '';
      let suffix = el.dataset.metaSuffix || '';
      if (!code) {
        const raw = String(el.textContent || '').replace(regionalFlags, ' ').replace(/\s+/g, ' ').trim();
        code = findLanguageCode(el) || detectLanguage(raw) || '';
        if (!code) return;
        const separator = raw.indexOf('·');
        suffix = separator >= 0 ? raw.slice(separator + 1).trim() : '';
        el.dataset.sourceLanguageCode = code;
        el.dataset.metaSuffix = suffix;
      }
      const localizedSuffix = localizedChapterSuffix(suffix);
      const stamp = `${currentLocale()}:${code}:${localizedSuffix}`;
      if (el.dataset.semanticMetaStamp === stamp && el.querySelector('.canonical-language[data-language-code]')) return;
      el.dataset.semanticMetaStamp = stamp;
      el.innerHTML = `${canonicalLanguageMarkup(code)}${localizedSuffix ? `<span class="language-meta-rest"> · ${escapeMarkup(localizedSuffix)}</span>` : ''}`;
    });
  }

  function updateLanguageLabels(root) {
    root.querySelectorAll('.canonical-language[data-language-code]').forEach(el => {
      const code = el.dataset.languageCode;
      if (!code) return;
      const wanted = runtime.languageLabel(code);
      let label = el.querySelector('.language-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'language-label';
        el.appendChild(label);
      }
      if (label.textContent !== wanted) label.textContent = wanted;
    });
  }

  function replaceArrows(root) {
    let changed = false;
    root.querySelectorAll('.novel-meta > span').forEach(span => {
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

  function flagImg(code, className = 'circle-language-flag') {
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
    for (const node of nodes) {
      const next = String(node.nodeValue || '').replace(regionalFlags, '').replace(/^\s+/, '');
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function applyCircleFlag(container, code) {
    if (!container || !code) return;
    const host = container.matches?.('.localized-language')
      ? container
      : container.querySelector?.('.localized-language') || container;
    if (host.querySelector?.(':scope > .circle-language-flag')) return;
    const img = flagImg(code);
    if (!img) return;
    host.querySelectorAll?.(':scope > svg,:scope > .lucide,:scope > .dtl-country-flag').forEach(x => x.remove());
    stripEmojiFlags(host);
    host.classList?.add('localized-language', 'canonical-language');
    host.dataset.languageCode = code;
    host.prepend(img);
    host.dataset.circleFlagReady = '1';
  }

  function enhanceLanguagePicker(root = document) {
    root.querySelectorAll('[data-lang]').forEach(button => {
      const code = String(button.dataset.lang || '').toLowerCase();
      if (!countryByLanguage[code]) return;
      button.querySelectorAll('.language-picker-flag,.dtl-country-flag').forEach(old => old.remove());
      if (!button.querySelector(':scope > .circle-language-flag')) {
        const img = flagImg(code, 'circle-language-flag language-picker-circle-flag');
        if (img) button.prepend(img);
      }
    });
  }

  function enhanceLanguageFlags(root = document) {
    root.querySelectorAll('.canonical-language[data-language-code]').forEach(el => {
      applyCircleFlag(el, el.dataset.languageCode);
    });
    enhanceLanguagePicker(root);
  }

  function hashTitle(value = '') {
    let h = 2166136261;
    for (const ch of String(value)) {
      h ^= ch.codePointAt(0) || 0;
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  function smartInitials(title = 'DTL') {
    const value = String(title).trim();
    if (!value) return 'DTL';
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value)) {
      return [...value.replace(/[\s\p{P}\p{S}]+/gu, '')].slice(0, 2).join('') || 'DTL';
    }
    const stop = new Set(['the','a','an','of','and','in','to','for','as']);
    const words = value.split(/\s+/).map(x => x.replace(/^\W+|\W+$/g, '')).filter(Boolean);
    const useful = words.filter(x => !stop.has(x.toLowerCase()));
    const chosen = (useful.length ? useful : words).slice(0, 2);
    return chosen.map(x => [...x][0]).join('').toUpperCase().slice(0, 3) || 'DTL';
  }

  function titleForCover(cover) {
    const scope = cover.closest('.list-row,.novel-card,.request-card,.detail-hero,.admin-request-card,.admin-request') || cover.parentElement;
    return scope?.querySelector('.list-title,.novel-title,.detail-title,.card-title,h3')?.textContent?.trim() || cover.textContent.trim() || 'Dollar TL';
  }

  function languageForCover(cover) {
    const scope = cover.closest('.list-row,.novel-card,.request-card,.detail-hero,.admin-request-card,.admin-request') || cover.parentElement;
    return findLanguageCode(scope);
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

  function compactPreviewRows(root = document) {
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

  function normalizeChapterChunk(root = document) {
    root.querySelectorAll('.list-meta .language-meta-rest').forEach(el => {
      const text = localizedChapterSuffix(el.textContent);
      const wanted = text ? ` · ${text}` : '';
      if (el.textContent !== wanted) el.textContent = wanted;
    });
  }

  function patch(root = document) {
    annotateNovelMeta(root);
    normalizeListMeta(root);
    updateLanguageLabels(root);
    replaceArrows(root);
    enhanceLanguageFlags(root);
    root.querySelectorAll('.novel-cover').forEach(enhanceCover);
    compactPreviewRows(root);
    normalizeChapterChunk(root);
  }

  function patchView(){
    const root=document.getElementById('viewRoot');
    if(root)patch(root);
  }

  document.addEventListener('dtl:viewrender',patchView);
  document.addEventListener('dtl:adminrender',patchView);
  document.addEventListener('dtl:sheetopen',event=>patch(event.detail?.root || document.getElementById('sheetRoot') || document));
  document.addEventListener('dtl:localechange',()=>{patchView();const sheet=document.getElementById('sheetRoot');if(sheet?.childElementCount)patch(sheet);});
})();
