(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime core must load before icons.js');

  const navIcons = {
    home: 'house',
    queue: 'layers-3',
    suggest: 'circle-plus',
    requests: 'file-text',
    account: 'user-round',
    admin: 'shield-cog',
  };

  const roundIcons = {
    '▣': 'calendar-days',
    '✦': 'sparkles',
    '!': 'triangle-alert',
    '▱': 'book-open',
    '▤': 'file-text',
    '#': 'list-ordered',
    '◷': 'clock-3',
    '⇧': 'upload',
    '✓': 'check',
    '🌐': 'globe-2',
    'T': 'type',
    '◇': 'bookmark',
    '💡': 'lightbulb',
    '♢': 'heart',
  };

  const emptyIcons = {
    '⚡': 'zap',
    '◷': 'clock-3',
    '▤': 'file-text',
    '!': 'triangle-alert',
    '◇': 'sparkles',
  };

  const leadingIcons = {
    '⚡': 'zap',
    '◷': 'clock-3',
    '◇': 'shield-check',
    '▱': 'book-open',
    '⇧': 'upload',
    '↗': 'external-link',
    '✦': 'sparkles',
    '✓': 'check',
  };

  const adminActionIcons = {
    accept: 'circle-check',
    reject: 'circle-x',
    return: 'rotate-ccw',
    start: 'play',
    complete: 'circle-check-big',
    backqueue: 'undo-2',
    up: 'arrow-up',
    down: 'arrow-down',
    progress: 'refresh-cw',
  };

  function makePlaceholder(name, className = '') {
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', name);
    icon.setAttribute('aria-hidden', 'true');
    if (className) icon.className = className;
    return icon;
  }

  function replaceExact(selector, map) {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.querySelector('svg,[data-lucide]')) return;
      const value = el.textContent.trim();
      const name = map[value];
      if (!name) return;
      el.textContent = '';
      el.append(makePlaceholder(name));
    });
  }

  function replaceExactWithName(el, name) {
    if (!el || el.querySelector('svg,[data-lucide]')) return;
    el.textContent = '';
    el.append(makePlaceholder(name));
  }

  function replaceLeadingGlyph(el, glyph, name) {
    if (!el || el.querySelector(`.inline-lucide[data-lucide="${name}"]`)) return;
    for (const node of [...el.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const source = node.nodeValue || '';
      const trimmed = source.trimStart();
      if (!trimmed.startsWith(glyph)) continue;
      const prefixLength = source.length - trimmed.length;
      const rest = trimmed.slice(glyph.length).replace(/^\s+/, '');
      const fragment = document.createDocumentFragment();
      if (prefixLength) fragment.append(document.createTextNode(source.slice(0, prefixLength)));
      fragment.append(makePlaceholder(name, 'inline-lucide'));
      if (rest) fragment.append(document.createTextNode(` ${rest}`));
      node.replaceWith(fragment);
      return;
    }
  }

  function replaceTrailingGlyph(el, glyph, name) {
    if (!el || el.querySelector(`.inline-lucide.trailing[data-lucide="${name}"]`)) return;
    const nodes = [...el.childNodes].reverse();
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const source = node.nodeValue || '';
      const trimmed = source.trimEnd();
      if (!trimmed.endsWith(glyph)) continue;
      const suffixLength = source.length - trimmed.length;
      const rest = trimmed.slice(0, -glyph.length).replace(/\s+$/, '');
      const fragment = document.createDocumentFragment();
      if (rest) fragment.append(document.createTextNode(`${rest} `));
      fragment.append(makePlaceholder(name, 'inline-lucide trailing'));
      if (suffixLength) fragment.append(document.createTextNode(source.slice(source.length - suffixLength)));
      node.replaceWith(fragment);
      return;
    }
  }

  function upgradeNav() {
    document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
      const holder = item.querySelector('.nav-icon');
      replaceExactWithName(holder, navIcons[item.dataset.nav] || 'circle');
    });
  }

  function upgradePremium() {
    document.querySelectorAll('.premium-emblem').forEach((el) => {
      if (el.querySelector('svg,[data-lucide]')) return;
      const current = el.textContent.trim();
      replaceExactWithName(el, current === '♛' ? 'crown' : 'gem');
    });
    document.querySelectorAll('.plan-check').forEach((el) => replaceExactWithName(el, 'check'));
  }

  function upgradeButtonsAndLabels() {
    document.querySelectorAll('.primary-button,.secondary-button,.link-button,.form-label,.small.muted,h2,.section-title').forEach((el) => {
      for (const [glyph, name] of Object.entries(leadingIcons)) replaceLeadingGlyph(el, glyph, name);
      replaceTrailingGlyph(el, '›', 'chevron-right');
    });

    document.querySelectorAll('.quick-tag').forEach((el) => replaceTrailingGlyph(el, '＋', 'plus'));
    document.querySelectorAll('.edit-link').forEach((el) => {
      if (!el.querySelector('.inline-lucide')) el.prepend(makePlaceholder('pencil', 'inline-lucide'));
    });
  }

  function upgradeAdminActions() {
    document.querySelectorAll('[data-admin-action],[data-action]').forEach((button) => {
      const action = button.dataset.adminAction || button.dataset.action;
      const name = adminActionIcons[action];
      if (!name || button.querySelector('.inline-lucide')) return;
      button.prepend(makePlaceholder(name, 'inline-lucide'));
    });
  }

  function upgradeIcons() {
    if (!window.lucide?.createIcons) return;
    upgradeNav();
    upgradePremium();
    replaceExact('.round-icon', roundIcons);
    replaceExact('.empty-icon', emptyIcons);
    replaceExact('.upload-illustration', { '⇧': 'upload' });
    replaceExact('.analysis-icon', { '✦': 'sparkles', '✓': 'circle-check' });
    replaceExact('.back-button', { '‹': 'chevron-left' });
    replaceExact('.chevron', { '›': 'chevron-right' });
    replaceExact('.step-circle', { '✓': 'check' });
    document.querySelectorAll('.status-pill').forEach((el) => {
      if (el.textContent.trim() === '✓' && !el.querySelector('svg,[data-lucide]')) {
        el.classList.add('icon-only');
        replaceExactWithName(el, 'check');
      }
    });

    document.querySelectorAll('.segmented button').forEach((el) => {
      replaceLeadingGlyph(el, '⚡', 'zap');
      replaceLeadingGlyph(el, '◷', 'clock-3');
    });

    upgradeButtonsAndLabels();
    upgradeAdminActions();
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
  }

  runtime.registerPatcher(upgradeIcons);
})();
