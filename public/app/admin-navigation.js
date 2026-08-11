(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime must load before admin-navigation.js');

  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const secondarySelectors = [
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
    label('[data-admin-section="publishing"]', 'Publishing');
    label('[data-admin-health]', 'Система');
    label('[data-admin-tools="analytics"]', 'Аналитика');
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
    details.open = Boolean(body?.querySelector('.active'));
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
    nav.classList.toggle('admin-mobile-more-open', Boolean(nav.querySelector('.admin-mobile-secondary.active')));
  }

  function install() {
    const root = document.querySelector('.admin-v2');
    if (!root) return;
    rename();
    const side = root.querySelector('.admin-side-nav');
    const mobile = root.querySelector('.admin-mobile-nav');
    if (side) desktopNav(side);
    if (mobile) mobileNav(mobile);
    icons();
  }

  document.addEventListener('click', event => {
    const navigated = event.target.closest?.('[data-admin-section],[data-admin-tools],[data-admin-health]');
    if (!navigated) return;
    queueMicrotask(() => runtime.schedule());
  }, true);

  runtime.registerPatcher(install);
  window.DTL_ADMIN_NAVIGATION = Object.freeze({ refresh: install });
})();