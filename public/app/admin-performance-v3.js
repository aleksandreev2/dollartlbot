(() => {
  const nativeFetch = window.fetch.bind(window);
  const cache = new Map();
  const pending = new Map();
  const TTL = 8000;
  let prefetched = false;

  function adminGet(path, init) {
    const method = String(init?.method || 'GET').toUpperCase();
    return method === 'GET' && path.startsWith('/api/app/admin/');
  }

  function keyFor(path, init) {
    const auth = new Headers(init?.headers || {}).get('x-telegram-init-data') || '';
    return `${path}|${auth.slice(-24)}`;
  }

  function materialize(entry) {
    return new Response(entry.body.slice(0), {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
  }

  async function fetchAndStore(input, init, key) {
    const response = await nativeFetch(input, init);
    const body = await response.clone().arrayBuffer();
    const entry = {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      at: Date.now(),
    };
    if (response.ok) cache.set(key, entry);
    return materialize(entry);
  }

  window.fetch = function dtlAdminFastFetch(input, init = {}) {
    let path = '';
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      path = `${url.pathname}${url.search}`;
    } catch {
      return nativeFetch(input, init);
    }

    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET' && path.startsWith('/api/app/admin/')) {
      cache.clear();
      pending.clear();
      return nativeFetch(input, init);
    }
    if (!adminGet(path, init)) return nativeFetch(input, init);

    const key = keyFor(path, init);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(materialize(hit));
    if (pending.has(key)) return pending.get(key).then(materialize);

    const job = fetchAndStore(input, init, key).then(async response => {
      const body = await response.clone().arrayBuffer();
      return {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
        at: Date.now(),
      };
    }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job.then(materialize);
  };

  function prefetchAdmin() {
    if (prefetched || document.hidden) return;
    prefetched = true;
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) return;
    const init = { headers: { 'x-telegram-init-data': initData } };
    const paths = [
      '/api/app/admin/list?kind=pending',
      '/api/app/admin/publishing',
      '/api/app/admin/users?filter=all',
      '/api/app/admin/analytics?days=30',
      '/api/app/admin/publications',
    ];
    const run = () => paths.forEach(path => window.fetch(path, init).catch(() => undefined));
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 250);
  }

  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-nav="admin"]')) prefetchAdmin();
    const button = event.target.closest?.('.admin-v2 button');
    if (!button || button.disabled) return;
    button.classList.add('dtl-admin-pressed');
    setTimeout(() => button.classList.remove('dtl-admin-pressed'), 140);
  }, true);

  window.__DTL_ADMIN_CACHE__ = {
    clear() { cache.clear(); pending.clear(); },
    prefetch: prefetchAdmin,
  };
})();
