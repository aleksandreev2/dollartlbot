(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime must load before admin-navigation.js');

  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const primarySelectors = [
    '[data-admin-section="overview"]',
    '[data-admin-section="requests"]',
    '[data-admin-section="queue"]',
    '[data-admin-section="publishing"]',
    '[data-admin-tools="users"]',
    '[data-admin-health]',
  ];
  const secondarySelectors = [
    '[data-admin-tools="publications"]',
    '[data-admin-section="broadcasts"]',
    '[data-admin-tools="analytics"]',
    '[data-admin-section="settings"]',
  ];

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
    label('[data-admin-section="publishing"]', 'Публикации');
    label('[data-admin-tools="publications"]', 'Управление постами');
    label('[data-admin-health]', 'Система');
    label('[data-admin-tools="analytics"]', 'Аналитика');
    label('[data-admin-section="broadcasts"]', 'Рассылки');
    label('[data-admin-section="settings"]', 'Настройки');
  }

  function desktopNav(nav) {
    let details = nav.querySelector('.admin-nav-more');
    if (!details) {
      details = document.createElement('details');
      details.className = 'admin-nav-more';
      details.innerHTML = `<summary>${ico('ellipsis')}<span>Ещё</span>${ico('chevron-down')}</summary><div class="admin-nav-more-items"></div>`;
      nav.append(details);
    }
    const body = details.querySelector('.admin-nav-more-items');
    for (const selector of secondarySelectors) {
      const button = nav.querySelector(selector) || document.querySelector(`.admin-side-nav ${selector}`);
      if (button && button.parentElement !== body) body.append(button);
    }
    const hasActive = Boolean(body?.querySelector('.active'));
    if (hasActive) details.open = true;
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
        nav.classList.toggle('admin-mobile-more-open');
        more.classList.toggle('active', nav.classList.contains('admin-mobile-more-open'));
      });
    }
    for (const selector of secondarySelectors) {
      const button = nav.querySelector(selector);
      if (button) button.classList.add('admin-mobile-secondary');
    }
    if (nav.querySelector('.admin-mobile-secondary.active')) nav.classList.add('admin-mobile-more-open');
  }

  function publishingShortcuts() {
    const editor = document.querySelector('.publisher-editor');
    if (editor && !editor.querySelector('.admin-publishing-shortcuts')) {
      const box = document.createElement('div');
      box.className = 'admin-publishing-shortcuts';
      box.innerHTML = `<button type="button" data-publishing-manage>${ico('files')}<span><b>Управление постами</b><small>Проверка, редактирование и удаление</small></span></button><button type="button" data-publishing-broadcasts>${ico('megaphone')}<span><b>Рассылки</b><small>История release-уведомлений</small></span></button>`;
      editor.querySelector('.admin-panel-head')?.after(box);
      box.querySelector('[data-publishing-manage]')?.addEventListener('click', () => document.querySelector('[data-admin-tools="publications"]')?.click());
      box.querySelector('[data-publishing-broadcasts]')?.addEventListener('click', () => document.querySelector('[data-admin-section="broadcasts"]')?.click());
    }

    const management = document.querySelector('.admin-publications-v3 .admin-v3-toolbar');
    if (management && !management.querySelector('[data-publishing-create]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.publishingCreate = '1';
      button.innerHTML = `${ico('plus')} Новая публикация`;
      button.addEventListener('click', () => document.querySelector('[data-admin-section="publishing"]')?.click());
      management.append(button);
    }
  }

  function install() {
    const root = document.querySelector('.admin-v2');
    if (!root) return;
    rename();
    const side = root.querySelector('.admin-side-nav');
    const mobile = root.querySelector('.admin-mobile-nav');
    if (side) desktopNav(side);
    if (mobile) mobileNav(mobile);
    publishingShortcuts();
    icons();
  }

  document.addEventListener('click', event => {
    const navigated = event.target.closest?.('[data-admin-section],[data-admin-tools],[data-admin-health]');
    if (!navigated) return;
    queueMicrotask(() => runtime.schedule());
  }, true);

  document.addEventListener('dtl:adminrender', () => runtime.schedule());
  runtime.registerPatcher(install);
  window.DTL_ADMIN_NAVIGATION = Object.freeze({ refresh: install });
})();
