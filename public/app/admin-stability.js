(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerFetchMiddleware || !runtime?.registerPatcher) {
    throw new Error('DTL runtime core must load before admin-stability.js');
  }

  const STORAGE_KEY = 'dtl:admin:last-section';
  const ADMIN_PREFIX = '/api/app/admin/';
  const activeReads = new Set();
  const pendingMutations = new Map();
  const nativeConfirm = window.confirm.bind(window);
  let confirmBypassDepth = 0;
  let restored = false;
  let restoring = false;
  let currentMutationButton = null;

  const riskyHealthActions = new Set([
    'run_maintenance',
    'retry_notifications',
    'retry_broadcasts',
    'retry_publications',
    'retry_admin_deliveries',
  ]);

  function isAdminPath(pathname) {
    return String(pathname || '').startsWith(ADMIN_PREFIX);
  }

  function requestMeta(input, init = {}) {
    let url;
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      url = new URL(raw, location.href);
    } catch {
      url = new URL(location.href);
    }
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    return { pathname: url.pathname, search: url.search, method };
  }

  function mergeSignals(primary, secondary) {
    if (!primary) return secondary;
    if (!secondary) return primary;
    if (typeof AbortSignal?.any === 'function') return AbortSignal.any([primary, secondary]);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (primary.aborted || secondary.aborted) controller.abort();
    else {
      primary.addEventListener('abort', abort, { once: true });
      secondary.addEventListener('abort', abort, { once: true });
    }
    return controller.signal;
  }

  function abortAdminReads() {
    for (const record of [...activeReads]) {
      record.superseded = true;
      record.controller.abort();
    }
    activeReads.clear();
  }

  function unresolvedSupersededRead() {
    return new Promise(() => {});
  }

  function stableBodyKey(body) {
    if (body === undefined || body === null) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const parts = [];
      for (const [key, value] of body.entries()) {
        parts.push(value instanceof File
          ? `${key}=file:${value.name}:${value.size}:${value.type}:${value.lastModified}`
          : `${key}=${String(value)}`);
      }
      return parts.sort().join('&');
    }
    return String(body);
  }

  function hash(value) {
    let out = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      out ^= text.charCodeAt(i);
      out = Math.imul(out, 16777619);
    }
    return (out >>> 0).toString(36);
  }

  async function snapshotResponse(response) {
    return {
      body: await response.clone().arrayBuffer(),
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    };
  }

  function materialize(snapshot) {
    return new Response(snapshot.body.slice(0), {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers,
    });
  }

  function mutationKey(meta, init) {
    return `${meta.method}:${meta.pathname}${meta.search}:${hash(stableBodyKey(init?.body))}`;
  }

  function beginButtonBusy(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.dataset.dtlAdminBusy = '1';
    button.setAttribute('aria-busy', 'true');
    button.classList.add('dtl-admin-action-busy');
    button.disabled = true;
  }

  function endButtonBusy(button) {
    if (!(button instanceof HTMLButtonElement) || !button.isConnected) return;
    delete button.dataset.dtlAdminBusy;
    button.removeAttribute('aria-busy');
    button.classList.remove('dtl-admin-action-busy');
    button.disabled = false;
  }

  runtime.registerFetchMiddleware(async (input, init = {}, next) => {
    const meta = requestMeta(input, init);
    if (!isAdminPath(meta.pathname)) return next(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));

    if (meta.method === 'GET') {
      headers.set('x-dtl-admin-no-cache', '1');
      const controller = new AbortController();
      const record = { controller, superseded: false };
      activeReads.add(record);
      const signal = mergeSignals(init?.signal || (input instanceof Request ? input.signal : null), controller.signal);
      try {
        return await next(input, { ...init, headers, cache: 'no-store', signal });
      } catch (error) {
        if (record.superseded && error?.name === 'AbortError') return unresolvedSupersededRead();
        throw error;
      } finally {
        activeReads.delete(record);
      }
    }

    const key = mutationKey(meta, init);
    const existing = pendingMutations.get(key);
    if (existing) return materialize(await existing);

    const button = currentMutationButton instanceof HTMLButtonElement ? currentMutationButton : null;
    beginButtonBusy(button);
    const job = (async () => snapshotResponse(await next(input, { ...init, headers, cache: 'no-store' })))();
    pendingMutations.set(key, job);
    try {
      return materialize(await job);
    } finally {
      if (pendingMutations.get(key) === job) pendingMutations.delete(key);
      endButtonBusy(button);
    }
  });

  function navToken(element) {
    if (!(element instanceof Element)) return null;
    if (element.matches('[data-admin-section]')) return `section:${element.getAttribute('data-admin-section')}`;
    if (element.matches('[data-admin-tools]')) return `tools:${element.getAttribute('data-admin-tools')}`;
    if (element.matches('[data-admin-health]')) return 'health:1';
    return null;
  }

  function saveNav(element) {
    const token = navToken(element);
    if (!token) return;
    try { sessionStorage.setItem(STORAGE_KEY, token); } catch {}
  }

  function selectorForToken(token) {
    const [kind, value] = String(token || '').split(':', 2);
    if (kind === 'section') return `[data-admin-section="${CSS.escape(value || '')}"]`;
    if (kind === 'tools') return `[data-admin-tools="${CSS.escape(value || '')}"]`;
    if (kind === 'health') return '[data-admin-health]';
    return '';
  }

  function restoreNav() {
    if (restored || restoring || !document.querySelector('.admin-v2')) return;
    let token = '';
    try { token = sessionStorage.getItem(STORAGE_KEY) || ''; } catch {}
    if (!token || token === 'section:overview') {
      restored = true;
      return;
    }

    const selector = selectorForToken(token);
    if (!selector) {
      restored = true;
      return;
    }
    const button = document.querySelector(selector);
    if (!(button instanceof HTMLButtonElement)) return;

    restored = true;
    restoring = true;
    queueMicrotask(() => {
      try { button.click(); }
      finally { restoring = false; }
    });
  }

  function activeNavButton() {
    const candidates = [
      ...document.querySelectorAll('[data-admin-health].active,[data-admin-tools].active,.admin-side-nav [data-admin-section].active,.admin-mobile-nav [data-admin-section].active'),
    ];
    return candidates.find((node) => node instanceof HTMLButtonElement) || null;
  }

  function refreshCurrentSection() {
    abortAdminReads();
    try { window.__DTL_ADMIN_CACHE__?.clear?.(); } catch {}
    const button = activeNavButton() || document.querySelector('[data-admin-section="overview"]');
    if (button instanceof HTMLButtonElement) button.click();
  }

  function installRefreshButton() {
    const header = document.querySelector('.admin-work-head');
    if (!header || header.querySelector('[data-admin-refresh]')) return;
    const live = header.querySelector('.admin-live');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-stability-refresh';
    button.dataset.adminRefresh = '1';
    button.innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i><span>Обновить</span>';
    button.addEventListener('click', refreshCurrentSection);
    if (live) live.before(button); else header.append(button);
    try { window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } }); } catch {}
  }

  function confirmationFor(element) {
    const action = element.getAttribute('data-action');
    if (action === 'reject') return { title: 'Отклонить заявку?', body: 'Заявка будет отклонена. Месячный слот пользователю не возвращается.', confirm: 'Отклонить', danger: true };
    if (action === 'return') return { title: 'Отклонить и вернуть слот?', body: 'Заявка будет отклонена, а использованный слот вернётся пользователю.', confirm: 'Отклонить и вернуть', danger: true };
    if (action === 'complete') return { title: 'Завершить перевод?', body: 'Прогресс станет 100%, а пользователь получит уведомление о завершении.', confirm: 'Завершить' };
    if (action === 'backqueue') return { title: 'Вернуть перевод в очередь?', body: 'Активный перевод перестанет считаться начатым и вернётся в конец очереди.', confirm: 'Вернуть' };
    if (element.id === 'requestOpsRestore') return { title: 'Восстановить заявку?', body: 'Отклонённая заявка вернётся в статус «На проверке».', confirm: 'Восстановить' };
    if (element.id === 'pubPublish') return { title: 'Опубликовать пост?', body: 'Пост будет отправлен в настроенный Telegram-канал прямо сейчас.', confirm: 'Опубликовать' };
    if (element.classList.contains('publication-delete-button')) return { title: 'Удалить пост из Telegram?', body: 'Запись, вложения и журнал останутся в Dollar TL, но сообщение исчезнет из Telegram.', confirm: 'Удалить', danger: true };
    if (element.id === 'toggleUserBlock' && !/разблок/i.test(element.textContent || '')) return { title: 'Заблокировать пользователя?', body: 'Пользователь потеряет доступ к боту и Mini App до ручной разблокировки.', confirm: 'Заблокировать', danger: true };
    const healthAction = element.getAttribute('data-health-action');
    if (healthAction && riskyHealthActions.has(healthAction)) return { title: 'Запустить обслуживание?', body: 'Операция может повторно отправить отложенные Telegram-доставки. Дубли защищены серверными ограничителями.', confirm: 'Запустить' };
    return null;
  }

  function ensureConfirmRoot() {
    let root = document.getElementById('adminConfirmRoot');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'adminConfirmRoot';
    root.className = 'admin-confirm-root';
    root.hidden = true;
    document.body.append(root);
    return root;
  }

  function confirmAction(config) {
    const root = ensureConfirmRoot();
    return new Promise((resolve) => {
      const finish = (value) => {
        root.hidden = true;
        root.replaceChildren();
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      };
      root.hidden = false;
      root.innerHTML = `<div class="admin-confirm-backdrop" data-confirm-cancel></div><section class="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="adminConfirmTitle"><div class="admin-confirm-icon ${config.danger ? 'danger' : ''}"><i data-lucide="${config.danger ? 'triangle-alert' : 'circle-help'}" aria-hidden="true"></i></div><div class="admin-confirm-copy"><h2 id="adminConfirmTitle"></h2><p></p></div><div class="admin-confirm-actions"><button type="button" data-confirm-cancel>Отмена</button><button type="button" data-confirm-ok class="${config.danger ? 'danger' : 'primary'}"></button></div></section>`;
      root.querySelector('#adminConfirmTitle').textContent = config.title;
      root.querySelector('.admin-confirm-copy p').textContent = config.body;
      root.querySelector('[data-confirm-ok]').textContent = config.confirm || 'Подтвердить';
      root.querySelectorAll('[data-confirm-cancel]').forEach((node) => node.addEventListener('click', () => finish(false), { once: true }));
      root.querySelector('[data-confirm-ok]')?.addEventListener('click', () => finish(true), { once: true });
      document.addEventListener('keydown', onKey, true);
      try { window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } }); } catch {}
      queueMicrotask(() => root.querySelector('[data-confirm-ok]')?.focus());
    });
  }

  window.confirm = function dtlAdminConfirm(message) {
    return confirmBypassDepth > 0 ? true : nativeConfirm(message);
  };

  function replayConfirmedClick(button) {
    button.dataset.dtlAdminConfirmed = '1';
    confirmBypassDepth += 1;
    try { button.click(); }
    finally {
      confirmBypassDepth = Math.max(0, confirmBypassDepth - 1);
      queueMicrotask(() => delete button.dataset.dtlAdminConfirmed);
    }
  }

  function isMutationButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.matches('[data-action],[data-progress],[data-health-action]')) return true;
    return button.matches([
      '#pubSave', '#pubTest', '#pubPublish', '#requestOpsSave', '#requestOpsMetaSave', '#requestOpsMove', '#requestOpsRestore', '#requestOpsRaw',
      '#toggleUserBlock', '#toggleUnlimited', '#applyQuota', '#sendAdminUserMessage', '#saveUserControl', '[data-quota-delta]', '[data-edit-save]', '.publication-delete-button',
    ].join(','));
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('button');
    if (!(button instanceof HTMLButtonElement)) return;

    if (navToken(button)) {
      abortAdminReads();
      saveNav(button);
      return;
    }

    if (!button.closest('.admin-v2') && !button.closest('.admin-confirm-root')) return;
    if (button.dataset.dtlAdminBusy === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const confirmation = confirmationFor(button);
    if (confirmation && button.dataset.dtlAdminConfirmed !== '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void confirmAction(confirmation).then((ok) => {
        if (ok && button.isConnected) replayConfirmedClick(button);
      });
      return;
    }

    if (isMutationButton(button)) {
      currentMutationButton = button;
      queueMicrotask(() => {
        if (currentMutationButton === button) currentMutationButton = null;
      });
    }
  }, true);

  document.addEventListener('dtl:viewchange', (event) => {
    if (event?.detail?.view !== 'admin') abortAdminReads();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.querySelector('.admin-v2')) {
      try { window.__DTL_ADMIN_CACHE__?.clear?.(); } catch {}
    }
  });

  runtime.registerPatcher(() => {
    if (!document.querySelector('.admin-v2')) return;
    installRefreshButton();
    restoreNav();
  });

  window.DTL_ADMIN_STABILITY = Object.freeze({
    abortReads: abortAdminReads,
    refresh: refreshCurrentSection,
    confirm: confirmAction,
    pendingMutations: () => pendingMutations.size,
    activeReads: () => activeReads.size,
  });
})();
