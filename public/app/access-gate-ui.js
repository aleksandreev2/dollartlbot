(() => {
  const app = window.DTL_APP;
  const runtime = window.DTL_RUNTIME;
  const tg = window.Telegram?.WebApp;
  if (!app?.init || !runtime?.registerResponseHandler) throw new Error('Dollar TL app/runtime must load before access-gate-ui.js');

  const ACCESS_CODES = new Set([
    'membership_required',
    'access_check_unavailable',
    'access_restricted',
    'regional_restricted',
    'regional_verification_required',
  ]);
  const originalInit = app.init.bind(app);
  let initialized = false;
  let heartbeat = 0;
  let checking = false;

  function isAccessPayload(data) {
    return ACCESS_CODES.has(data?.error?.code);
  }

  async function requestAccess(force = false) {
    if (app.state.preview) return { ok: true };
    const headers = new Headers({ 'x-telegram-init-data': tg?.initData || '' });
    if (force) headers.set('x-access-recheck', '1');
    const response = await fetch('/api/app/access', { headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, data } : { ok: false, status: response.status, data };
  }

  function icon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    try { window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } }); } catch {}
  }

  function emitAccessLifecycle(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function setChromeLocked(locked) {
    app.root.classList.toggle('access-locked', locked);
    app.bottomNav.hidden = locked;
    const bell = document.getElementById('notificationButton');
    if (bell) bell.disabled = locked;
    if (locked) {
      app.sheetRoot.innerHTML = '';
      try { document.activeElement?.blur?.(); } catch {}
    }
  }

  function openExternal(url) {
    if (!url) return;
    try {
      if (/^https:\/\/(?:t\.me|telegram\.me|telegram\.dog)\//i.test(url) && tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        return;
      }
      if (/^https:\/\//i.test(url) && tg?.openLink) {
        tg.openLink(url);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      location.href = url;
    }
  }

  function renderLocked(payload) {
    if (!isAccessPayload(payload)) return;
    const wasLocked = Boolean(app.state.accessLocked);
    const error = payload.error || {};
    const details = error.details || {};
    const unavailable = error.code === 'access_check_unavailable';
    const accountRestricted = error.code === 'access_restricted';
    const regionalRestricted = error.code === 'regional_restricted';
    const regionalVerification = error.code === 'regional_verification_required';
    const hardRestricted = accountRestricted || regionalRestricted || regionalVerification;

    app.state.accessLocked = true;
    app.root.setAttribute('aria-busy', 'false');
    setChromeLocked(true);

    const title = details.title || (regionalRestricted
      ? 'Русские переводы для вашего региона'
      : regionalVerification
        ? 'Нужно подтвердить регион'
        : accountRestricted
          ? 'Dollar TL access is unavailable'
          : unavailable
            ? 'Access check is temporarily unavailable'
            : 'Join the Dollar TL channel');
    const message = error.message || (hardRestricted
      ? 'Access to Dollar TL Mini App is currently unavailable for this account.'
      : 'Join our Telegram channel and check again.');
    const joinLabel = details.join_label || 'Join channel';
    const retryLabel = details.retry_label || 'Check again';
    const joinUrl = typeof details.join_url === 'string' ? details.join_url : '';
    const primaryLabel = typeof details.primary_label === 'string' ? details.primary_label : '';
    const primaryUrl = typeof details.primary_url === 'string' ? details.primary_url : '';
    const secondaryLabel = typeof details.secondary_label === 'string' ? details.secondary_label : '';
    const secondaryUrl = typeof details.secondary_url === 'string' ? details.secondary_url : '';

    app.viewRoot.innerHTML = `<section class="page access-gate-page"><div class="surface-card access-gate-card">
      <div class="access-gate-icon">${icon(regionalRestricted ? 'languages' : regionalVerification ? 'map-pin-check' : accountRestricted ? 'shield-x' : unavailable ? 'refresh-cw' : 'radio-tower')}</div>
      <h1>${app.escapeHtml(title)}</h1>
      <p>${app.escapeHtml(message)}</p>
      <div class="access-gate-actions">
        ${primaryUrl && primaryLabel ? `<button class="primary-button wide-button" id="accessGatePrimary" type="button">${app.escapeHtml(primaryLabel)}</button>` : ''}
        ${secondaryUrl && secondaryLabel ? `<button class="secondary-button wide-button" id="accessGateSecondary" type="button">${app.escapeHtml(secondaryLabel)}</button>` : ''}
        ${!hardRestricted && joinUrl ? `<button class="primary-button wide-button" id="accessGateJoin" type="button">${icon('send')} ${app.escapeHtml(joinLabel)}</button>` : ''}
        <button class="secondary-button wide-button" id="accessGateRetry" type="button">${icon('refresh-cw')} ${app.escapeHtml(retryLabel)}</button>
      </div>
      <div class="access-gate-note" id="accessGateNote" aria-live="polite"></div>
    </div></section>`;

    document.getElementById('accessGatePrimary')?.addEventListener('click', () => openExternal(primaryUrl));
    document.getElementById('accessGateSecondary')?.addEventListener('click', () => openExternal(secondaryUrl));
    document.getElementById('accessGateJoin')?.addEventListener('click', () => openExternal(joinUrl));
    document.getElementById('accessGateRetry')?.addEventListener('click', retryAccess);
    refreshIcons();

    if (!wasLocked) {
      emitAccessLifecycle('dtl:accesslocked', { code: error.code || 'membership_required' });
    }
  }

  async function retryAccess() {
    if (checking) return;
    checking = true;
    const button = document.getElementById('accessGateRetry');
    const note = document.getElementById('accessGateNote');
    button?.classList.add('is-checking');
    if (note) note.textContent = '…';
    try {
      const result = await requestAccess(true);
      if (!result.ok) {
        if (isAccessPayload(result.data)) renderLocked(result.data);
        else if (note) note.textContent = result.data?.error?.message || 'Try again in a moment.';
        return;
      }

      const restored = Boolean(app.state.accessLocked);
      app.state.accessLocked = false;
      setChromeLocked(false);
      if (!initialized) {
        initialized = true;
        await originalInit();
        startHeartbeat();
      } else {
        await app.refreshBootstrap(false);
        app.renderNav();
        app.render();
      }
      emitAccessLifecycle('dtl:accessready', { restored });
    } catch {
      if (note) note.textContent = 'Try again in a moment.';
    } finally {
      checking = false;
      document.getElementById('accessGateRetry')?.classList.remove('is-checking');
    }
  }

  async function verifyAccess(force = false) {
    if (checking || app.state.preview || !initialized || app.state.accessLocked || document.visibilityState !== 'visible') return;
    checking = true;
    try {
      const result = await requestAccess(force);
      if (!result.ok && isAccessPayload(result.data)) renderLocked(result.data);
    } catch {
      // A transient client/network failure is not evidence that access was lost.
    } finally {
      checking = false;
    }
  }

  function startHeartbeat() {
    if (heartbeat || app.state.preview) return;
    heartbeat = window.setInterval(() => void verifyAccess(false), 60_000);
  }

  app.init = async function accessAwareInit() {
    if (app.state.preview) {
      initialized = true;
      await originalInit();
      emitAccessLifecycle('dtl:accessready', { preview: true, restored: false });
      return;
    }
    try {
      // Opening the Mini App must reflect current membership, regional policy,
      // and admin restrictions rather than a previous positive cache entry.
      const result = await requestAccess(true);
      if (!result.ok && isAccessPayload(result.data)) {
        renderLocked(result.data);
        return;
      }
    } catch {
      // Let the canonical app bootstrap render its normal authorization/network error.
    }
    initialized = true;
    await originalInit();
    startHeartbeat();
    emitAccessLifecycle('dtl:accessready', { restored: false });
  };

  runtime.registerResponseHandler(async (response, context) => {
    if (!context?.pathname?.startsWith('/api/app/') || response.ok || app.state.preview) return response;
    try {
      const data = await response.clone().json();
      if (isAccessPayload(data)) queueMicrotask(() => renderLocked(data));
    } catch {}
    return response;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void verifyAccess(true);
  });
  window.addEventListener('pageshow', () => void verifyAccess(true));
})();
