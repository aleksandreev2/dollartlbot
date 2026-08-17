(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.activeRoute) throw new Error('DTL runtime must load before admin-navigation.js');

  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const secondarySelectors = [
    '[data-admin-section="settings"]',
  ];
  const publishingRoutes = new Set(['section:publishing', 'tools:publications', 'section:broadcasts']);

  function icons() {
    try { window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } }); } catch {}
  }

  function label(selector, text) {
    document.querySelectorAll(selector).forEach(button => {
      const span = button.querySelector('span');
      if (span) span.textContent = text;
    });
  }

  function rename() {
    label('[data-admin-section="publishing"]', 'Публикация');
    label('[data-admin-health]', 'Система');
    label('[data-admin-tools="analytics"]', 'Статистика');
    label('[data-admin-section="settings"]', 'Настройки');
  }

  function ensureStatisticsAssets() {
    if (!document.querySelector('link[data-admin-statistics-style]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/app/admin-statistics.css?v=20260817-stats1';
      link.dataset.adminStatisticsStyle = '1';
      document.head.append(link);
    }
    if (!document.querySelector('script[data-admin-statistics-script]')) {
      const script = document.createElement('script');
      script.src = '/app/admin-statistics.js?v=20260817-stats1';
      script.async = true;
      script.dataset.adminStatisticsScript = '1';
      document.head.append(script);
    }
  }

  function activityPageVisible() {
    return Boolean(document.querySelector('.admin-content > .admin-activity-page'));
  }

  function visibleRouteSelector() {
    const heading = document.querySelector('.admin-work-head h1')?.textContent?.trim();
    if (heading === 'Активность' && activityPageVisible()) return '[data-admin-activity]';

    const route = admin.activeRoute?.();
    if (!route) return '';
    if (publishingRoutes.has(route)) return '[data-admin-section="publishing"]';
    return admin.selectorForRoute?.(route) || '';
  }

  function syncActive(root) {
    const selector = visibleRouteSelector();
    for (const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')) {
      nav.querySelectorAll('[data-admin-section],[data-admin-tools],[data-admin-health],[data-admin-activity]').forEach(button => {
        button.classList.remove('active');
      });
      if (!selector) continue;
      nav.querySelectorAll(selector).forEach(button => button.classList.add('active'));
    }
  }

  function desktopNav(nav) {
    let details = nav.querySelector('.admin-nav-more');
    if (!details) {
      details = document.createElement('details');
      details.className = 'admin-nav-more';
      details.innerHTML = `<summary>${ico('ellipsis')}<span>Ещё</span>${ico('chevron-down')}</summary><div class="admin-nav-more-items"></div>`;
      nav.append(details);
    }

    if (details.dataset.dtlToggleBound !== '1') {
      details.dataset.dtlToggleBound = '1';
      details.querySelector('summary')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        details.open = !details.open;
      });
    }

    const body = details.querySelector('.admin-nav-more-items');
    for (const selector of secondarySelectors) {
      const button = nav.querySelector(selector) || document.querySelector(`.admin-side-nav ${selector}`);
      if (button && button.parentElement !== body) body.append(button);
    }

    if (body?.querySelector('.active')) details.open = true;
  }

  function mobileNav(nav) {
    let more = nav.querySelector('[data-admin-mobile-more]');
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.dataset.adminMobileMore = '1';
      more.innerHTML = `${ico('ellipsis')}<span>Ещё</span>`;
      nav.append(more);
      more.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const open = nav.classList.toggle('admin-mobile-more-open');
        more.classList.toggle('active', open);
      });
    }
    for (const selector of secondarySelectors) {
      const button = nav.querySelector(selector);
      if (button) button.classList.add('admin-mobile-secondary');
    }

    if (nav.querySelector('.admin-mobile-secondary.active')) {
      nav.classList.add('admin-mobile-more-open');
      more.classList.add('active');
    }
  }

  function install() {
    const root = document.querySelector('.admin-v2');
    if (!root) return;
    ensureStatisticsAssets();
    rename();
    syncActive(root);
    const side = root.querySelector('.admin-side-nav');
    const mobile = root.querySelector('.admin-mobile-nav');
    if (side) desktopNav(side);
    if (mobile) mobileNav(mobile);
    icons();
  }

  function settle() {
    queueMicrotask(install);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => install());
    else setTimeout(install, 0);
  }

  document.addEventListener('click', event => {
    const navigated = event.target.closest?.('[data-admin-section],[data-admin-tools],[data-admin-health],[data-admin-activity]');
    if (!navigated) return;
    settle();
  }, true);

  document.addEventListener('dtl:adminroutechange', event => {
    if (event.detail?.id) document.querySelectorAll('[data-admin-activity]').forEach(button => button.classList.remove('active'));
    settle();
  });
  document.addEventListener('dtl:adminrender', settle);

  runtime.registerPatcher(install);
  window.DTL_ADMIN_NAVIGATION = Object.freeze({ refresh: install });
})();