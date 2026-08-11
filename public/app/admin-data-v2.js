(() => {
  const runtime = window.DTL_RUNTIME;
  const adminRuntime = window.DTL_ADMIN;
  if (!runtime?.registerFetchMiddleware || !runtime?.registerPatcher || !adminRuntime) {
    throw new Error('Admin 4.2 data adapter requires DTL runtime and canonical admin runtime.');
  }

  const PAGE_SIZE = 30;
  let queryKey = '';
  let nextCursor = null;
  let hasMore = false;
  let total = 0;
  let rows = [];
  let loadMoreRequested = false;
  let loadingMore = false;

  function requestMeta(input, init = {}) {
    const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
    const url = new URL(raw, location.href);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    return { url, method };
  }

  function workflowState() {
    return window.DTL_ADMIN_WORKFLOW?.state?.() || {};
  }

  function currentKey() {
    const state = workflowState();
    return `${state.requestFilter || 'pending'}\u0000${String(state.requestQuery || '').trim().toLowerCase()}`;
  }

  function reset(key = currentKey()) {
    queryKey = key;
    nextCursor = null;
    hasMore = false;
    total = 0;
    rows = [];
    loadMoreRequested = false;
    loadingMore = false;
  }

  runtime.registerFetchMiddleware(async (input, init = {}, next) => {
    const { url, method } = requestMeta(input, init);
    if (method !== 'GET' || url.pathname !== '/api/app/admin/list') return next(input, init);
    if (adminRuntime.activeRoute?.() !== 'section:requests') return next(input, init);

    const state = workflowState();
    const key = currentKey();
    const append = loadMoreRequested && key === queryKey && Boolean(nextCursor);
    if (!append || key !== queryKey) reset(key);

    const params = new URLSearchParams();
    params.set('kind', state.requestFilter || 'pending');
    params.set('limit', String(PAGE_SIZE));
    const q = String(state.requestQuery || '').trim();
    if (q) params.set('q', q);
    if (append && nextCursor) params.set('cursor', String(nextCursor));
    url.search = params.toString();

    loadingMore = append;
    loadMoreRequested = false;
    try {
      const response = await next(url.toString(), init);
      if (!response.ok) return response;
      const data = await response.clone().json().catch(() => null);
      if (!data || !Array.isArray(data.requests)) return response;

      const page = data.page || {};
      const incoming = data.requests;
      if (append) {
        const known = new Set(rows.map(row => Number(row?.id)));
        rows = rows.concat(incoming.filter(row => !known.has(Number(row?.id))));
      } else {
        rows = incoming.slice();
      }
      total = Number(page.total ?? rows.length);
      nextCursor = page.next_cursor ? Number(page.next_cursor) : null;
      hasMore = Boolean(page.has_more && nextCursor);

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({ ...data, requests: rows }), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } finally {
      loadingMore = false;
      queueMicrotask(decorate);
    }
  });

  function decorate() {
    if (adminRuntime.activeRoute?.() !== 'section:requests') return;
    const list = document.querySelector('.admin-inbox-list');
    const body = list?.querySelector('.admin-inbox-list-body');
    if (!list || !body) return;

    const count = document.querySelector('.admin-workflow-count');
    if (count) count.textContent = `${rows.length} из ${total}`;

    list.querySelector('[data-admin-data-more]')?.remove();
    if (!hasMore) return;

    const footer = document.createElement('div');
    footer.className = 'admin-data-page-footer';
    footer.dataset.adminDataMore = '1';
    footer.innerHTML = `<button type="button" data-admin-data-load-more>${loadingMore ? 'Загружаем…' : `Показать ещё · ${Math.max(0, total - rows.length)}`}</button>`;
    footer.querySelector('button')?.addEventListener('click', () => {
      if (loadingMore || !hasMore || !nextCursor) return;
      loadMoreRequested = true;
      void adminRuntime.refresh();
    });
    body.after(footer);
  }

  document.addEventListener('dtl:adminroutechange', event => {
    if (event.detail?.id === 'section:requests') {
      reset();
      queueMicrotask(decorate);
    } else {
      loadMoreRequested = false;
      loadingMore = false;
    }
  });
  runtime.registerPatcher(decorate);

  window.DTL_ADMIN_DATA_V2 = Object.freeze({
    reset,
    state: () => ({ queryKey, nextCursor, hasMore, total, loaded: rows.length, loadingMore }),
  });
})();
