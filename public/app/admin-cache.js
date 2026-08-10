(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerFetchMiddleware) throw new Error('DTL runtime core must load before admin-cache.js');

  const cache = new Map();
  const pending = new Map();
  const TTL = 8000;
  let prefetched = false;

  function requestMeta(input, init = {}) {
    let path = '';
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.href);
      path = `${url.pathname}${url.search}`;
    } catch {}
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
    return { path, method, headers };
  }

  function keyFor(path, headers) {
    const auth = headers.get('x-telegram-init-data') || '';
    return `${path}|${auth.slice(-24)}`;
  }

  function materialize(entry) {
    return new Response(entry.body.slice(0), { status: entry.status, statusText: entry.statusText, headers: entry.headers });
  }

  async function snapshot(response) {
    return { body: await response.clone().arrayBuffer(), status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], at: Date.now() };
  }

  runtime.registerFetchMiddleware(async (input, init = {}, next) => {
    const { path, method, headers } = requestMeta(input, init);
    const isAdmin = path.startsWith('/api/app/admin/');
    if (!isAdmin) return next(input, init);
    if (method !== 'GET') {
      cache.clear(); pending.clear();
      return next(input, init);
    }
    const key = keyFor(path, headers);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return materialize(hit);
    if (pending.has(key)) return pending.get(key).then(materialize);
    const job = (async () => {
      const response = await next(input, init);
      const entry = await snapshot(response);
      if (response.ok) cache.set(key, entry);
      return entry;
    })().finally(() => pending.delete(key));
    pending.set(key, job);
    return job.then(materialize);
  });

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

  window.__DTL_ADMIN_CACHE__ = Object.freeze({ clear() { cache.clear(); pending.clear(); }, prefetch: prefetchAdmin });
})();
