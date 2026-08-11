(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.activeRoute) throw new Error('Canonical admin runtime must load before admin-requests-ux.js');

  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  let settleTimer = 0;

  function requestId(detail) {
    return Number(detail?.querySelector('[data-workflow-advanced]')?.dataset.workflowAdvanced || 0);
  }

  function compactDetails(detail, id) {
    if (!detail || !id) return;

    const disclosures = [...detail.querySelectorAll(':scope > .admin-inbox-disclosure')];
    if (disclosures.length && !detail.querySelector('[data-request-extra-details]')) {
      const wrapper = document.createElement('details');
      wrapper.className = 'request-extra-details';
      wrapper.dataset.requestExtraDetails = String(id);
      wrapper.innerHTML = `<summary><span>${ico('tags')}<b>Контент и модерация</b></span><small>Жанры, sexual / sensitive</small>${ico('chevron-down')}</summary><div class="request-extra-body"></div>`;
      const body = wrapper.querySelector('.request-extra-body');
      disclosures.forEach(section => body?.append(section));
      const anchor = detail.querySelector(':scope > .admin-inbox-notes,:scope > .admin-inbox-primary-actions,:scope > .admin-inbox-secondary-actions,:scope > .admin-inbox-meta-line');
      if (anchor) detail.insertBefore(wrapper, anchor); else detail.append(wrapper);
    }

    const notes = detail.querySelector(':scope > .admin-inbox-notes');
    if (notes && !detail.querySelector('[data-request-notes-details]')) {
      const wrapper = document.createElement('details');
      wrapper.className = 'request-notes-details';
      wrapper.dataset.requestNotesDetails = String(id);
      const hasNotes = Boolean(notes.querySelector('textarea')?.value?.trim());
      wrapper.innerHTML = `<summary><span>${ico('sticky-note')}<b>Внутренние заметки</b></span><small>${hasNotes ? 'Есть заметка' : 'Пусто'}</small>${ico('chevron-down')}</summary><div class="request-notes-body"></div>`;
      wrapper.querySelector('.request-notes-body')?.append(notes);
      const anchor = detail.querySelector(':scope > .admin-inbox-primary-actions,:scope > .admin-inbox-secondary-actions,:scope > .admin-inbox-meta-line');
      if (anchor) detail.insertBefore(wrapper, anchor); else detail.append(wrapper);
    }
  }

  function actionDock(detail, id) {
    if (!detail || !id) return;
    const primary = detail.querySelector(':scope > .admin-inbox-primary-actions');
    const secondary = detail.querySelector(':scope > .admin-inbox-secondary-actions');
    if ((!primary && !secondary) || detail.querySelector('[data-request-action-dock]')) return;

    const dock = document.createElement('section');
    dock.className = 'request-action-dock';
    dock.dataset.requestActionDock = String(id);
    dock.innerHTML = `<div class="request-action-dock-head"><span>${ico('zap')}<b>Действия</b></span><small>Заявка #${id}</small></div><div class="request-action-dock-main"></div><div class="request-action-dock-more"></div>`;
    if (primary) dock.querySelector('.request-action-dock-main')?.append(primary);
    if (secondary) dock.querySelector('.request-action-dock-more')?.append(secondary);
    const meta = detail.querySelector(':scope > .admin-inbox-meta-line');
    if (meta) detail.insertBefore(dock, meta); else detail.append(dock);
  }

  function simplifyCopy(detail) {
    const quickHeading = detail?.querySelector('.request-quick-heading span');
    if (quickHeading) quickHeading.textContent = 'Название, главы и обложка';
    const advanced = detail?.querySelector('[data-workflow-advanced] span');
    if (advanced) advanced.textContent = 'Все параметры';
  }

  function install() {
    if (admin.activeRoute?.() !== 'section:requests') return;
    const detail = document.getElementById('adminInboxDetail');
    if (!detail) return;
    const id = requestId(detail);
    if (!id) return;
    compactDetails(detail, id);
    actionDock(detail, id);
    simplifyCopy(detail);
    admin.icons?.();
  }

  function settle() {
    clearTimeout(settleTimer);
    let remaining = 9;
    const tick = () => {
      install();
      if (--remaining > 0 && admin.activeRoute?.() === 'section:requests') settleTimer = setTimeout(tick, 80);
    };
    tick();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-workflow-request],[data-workflow-filter],[data-workflow-refresh],#requestOpsBack')) return;
    setTimeout(settle, 0);
  }, true);
  document.addEventListener('dtl:adminroutechange', event => {
    if (event.detail?.id === 'section:requests') settle();
  });

  runtime.registerPatcher(install);
  window.DTL_ADMIN_REQUESTS_UX = Object.freeze({ refresh:settle });
})();
