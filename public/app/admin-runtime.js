(() => {
  const runtime = window.DTL_RUNTIME;
  const tg = window.Telegram?.WebApp;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime must load before admin-runtime.js');

  const STORAGE_KEY = 'dtl:admin:last-section';
  const routes = new Map();
  let current = null;
  let controller = null;
  let generation = 0;
  let replayDepth = 0;
  let transitionDepth = 0;
  let bootstrapping = false;
  let navigationSequence = 0;

  const esc = value => {
    try { return CSS.escape(String(value || '')); }
    catch { return String(value || '').replace(/["\\]/g, '\\$&'); }
  };

  function routeIdFromElement(element) {
    if (!(element instanceof Element)) return null;
    if (element.matches('[data-admin-section]')) return `section:${element.getAttribute('data-admin-section')}`;
    if (element.matches('[data-admin-tools]')) return `tools:${element.getAttribute('data-admin-tools')}`;
    if (element.matches('[data-admin-health]')) return 'health:1';
    if (element.matches('[data-jump]')) return `section:${element.getAttribute('data-jump')}`;
    return null;
  }

  function selectorForRoute(id) {
    const [kind, value = ''] = String(id || '').split(':', 2);
    if (kind === 'section') return `[data-admin-section="${esc(value)}"]`;
    if (kind === 'tools') return `[data-admin-tools="${esc(value)}"]`;
    if (kind === 'health') return '[data-admin-health]';
    return '';
  }

  function navElementForRoute(id, preferred = null) {
    if (preferred instanceof HTMLButtonElement && preferred.isConnected) return preferred;
    const selector = selectorForRoute(id);
    if (!selector) return null;
    const candidates = [...document.querySelectorAll(selector)].filter(node => node instanceof HTMLButtonElement);
    return candidates.find(node => node.offsetParent !== null) || candidates[0] || null;
  }

  function persist(id) {
    try { sessionStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  function icons() {
    try { window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } }); } catch {}
  }

  function toast(text, error = false) {
    const host = document.getElementById('toastRegion');
    if (!host) return;
    const node = document.createElement('div');
    node.className = `toast ${error ? 'error' : 'success'}`;
    node.textContent = String(text || '');
    host.append(node);
    setTimeout(() => node.remove(), 3400);
  }

  function content(html) {
    const root = document.querySelector('.admin-content');
    if (!root) return null;
    root.innerHTML = String(html || '');
    icons();
    runtime.schedule();
    return root;
  }

  function setHead(title, subtitle = '') {
    const heading = document.querySelector('.admin-work-head h1');
    const sub = document.querySelector('.admin-work-head p');
    if (heading && title !== undefined) heading.textContent = String(title);
    if (sub && subtitle !== undefined) sub.textContent = String(subtitle);
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('x-telegram-init-data', tg?.initData || '');
    const response = await fetch(path, {
      ...options,
      headers,
      signal: options.signal || controller?.signal,
      cache: options.cache || 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
    return data;
  }

  function registerRoute(id, config = {}) {
    const key = String(id || '').trim();
    if (!key) throw new Error('Admin route id is required.');
    const record = Object.freeze({ ...config, id: key });
    routes.set(key, record);
    return () => {
      if (routes.get(key) === record) routes.delete(key);
    };
  }

  function contextFor(id, sourceElement) {
    const localGeneration = generation;
    const localController = controller;
    const cleanups = new Set();
    const context = {
      id,
      signal: localController?.signal,
      generation: localGeneration,
      sourceElement,
      api: (path, options = {}) => api(path, { ...options, signal: options.signal || localController?.signal }),
      content,
      setHead,
      toast,
      icons,
      isCurrent: () => current?.id === id && generation === localGeneration && !localController?.signal?.aborted,
      onCleanup(fn) {
        if (typeof fn === 'function') cleanups.add(fn);
        return () => cleanups.delete(fn);
      },
    };
    return { context: Object.freeze(context), cleanups };
  }

  async function unmountCurrent(reason = 'route-change') {
    const previous = current;
    current = null;
    const previousController = controller;
    controller = null;
    if (previousController && !previousController.signal.aborted) previousController.abort(reason);
    if (!previous) return;
    for (const cleanup of [...previous.cleanups]) {
      try { await cleanup(); } catch (error) { console.error('[DTL admin] cleanup failed', error); }
    }
    if (typeof previous.route?.unmount === 'function') {
      try { await previous.route.unmount(previous.context, reason); }
      catch (error) { console.error('[DTL admin] route unmount failed', error); }
    }
  }

  function markRoute(id) {
    document.documentElement.dataset.dtlAdminRoute = id;
    document.body.dataset.dtlAdminRoute = id;
  }

  function clearRouteMarker() {
    delete document.documentElement.dataset.dtlAdminRoute;
    delete document.body.dataset.dtlAdminRoute;
  }

  function replayLegacyNavigation(id, sourceElement) {
    const button = navElementForRoute(id, sourceElement);
    if (!(button instanceof HTMLButtonElement)) return false;
    replayDepth += 1;
    try { button.click(); }
    finally { replayDepth = Math.max(0, replayDepth - 1); }
    return true;
  }

  function ensureShell() {
    if (document.querySelector('.admin-v2')) return { ready: true, bootstrapped: false };
    if (!window.DTL_ADMIN_CONSOLE?.open || bootstrapping) return { ready: false, bootstrapped: false };
    bootstrapping = true;
    try {
      const pending = window.DTL_ADMIN_CONSOLE.open();
      if (pending && typeof pending.catch === 'function') {
        pending.catch(error => console.error('[DTL admin] bootstrap render failed', error));
      }
    } finally {
      bootstrapping = false;
    }
    return { ready: Boolean(document.querySelector('.admin-v2')), bootstrapped: true };
  }

  async function open(id, options = {}) {
    const routeId = String(id || 'section:overview');
    const sequence = ++navigationSequence;
    const sameRoute = current?.id === routeId;
    const route = routes.get(routeId) || Object.freeze({ id: routeId, legacy: true });
    const shell = ensureShell();
    if (!shell.ready || sequence !== navigationSequence) return false;
    const adoptBootstrapOverview = shell.bootstrapped && routeId === 'section:overview' && !options.sourceElement;

    if (sameRoute && !options.force && typeof route.refresh === 'function') {
      await route.refresh(current.context);
      return true;
    }

    transitionDepth += 1;
    try {
      await unmountCurrent(sameRoute ? 'refresh' : 'route-change');
      if (sequence !== navigationSequence) return false;
      if (!adoptBootstrapOverview) {
        try { window.DTL_ADMIN_STABILITY?.abortReads?.(); } catch {}
        try { window.__DTL_ADMIN_CACHE__?.clear?.(); } catch {}
      }

      generation += 1;
      const localGeneration = generation;
      controller = new AbortController();
      const built = contextFor(routeId, options.sourceElement || null);
      current = { id: routeId, route, context: built.context, cleanups: built.cleanups };
      markRoute(routeId);
      if (!adoptBootstrapOverview) persist(routeId);

      let mounted = adoptBootstrapOverview;
      if (!mounted && typeof route.mount === 'function') {
        await route.mount(built.context);
        mounted = built.context.isCurrent();
      } else if (!mounted) {
        mounted = replayLegacyNavigation(routeId, options.sourceElement || null);
      }

      if (generation === localGeneration && current?.id === routeId) {
        document.dispatchEvent(new CustomEvent('dtl:adminroutechange', {
          detail: { id: routeId, generation: localGeneration, legacy: typeof route.mount !== 'function', mounted },
        }));
      }
      return mounted;
    } finally {
      transitionDepth = Math.max(0, transitionDepth - 1);
    }
  }

  async function refresh() {
    if (!current?.id) return open('section:overview', { force: true });
    const route = routes.get(current.id);
    if (route?.refresh) return route.refresh(current.context);
    return open(current.id, { force: true });
  }

  async function restore() {
    let id = 'section:overview';
    try { id = sessionStorage.getItem(STORAGE_KEY) || id; } catch {}
    return open(id);
  }

  function state() {
    return Object.freeze({
      route: current?.id || null,
      generation,
      transitioning: transitionDepth > 0,
      replaying: replayDepth > 0,
      registeredRoutes: [...routes.keys()],
    });
  }

  document.addEventListener('click', event => {
    if (replayDepth > 0) return;
    const target = event.target instanceof Element
      ? event.target.closest('[data-admin-section],[data-admin-tools],[data-admin-health],[data-jump]')
      : null;
    const id = routeIdFromElement(target);
    if (!id || !target?.closest('.admin-v2')) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void open(id, { sourceElement: target });
  }, true);

  document.addEventListener('click', event => {
    if (replayDepth > 0 || !current) return;
    const nav = event.target instanceof Element ? event.target.closest('[data-nav]') : null;
    if (!nav || nav.getAttribute('data-nav') === 'admin') return;
    navigationSequence += 1;
    void unmountCurrent('leave-admin');
    clearRouteMarker();
  }, true);

  document.addEventListener('dtl:adminrender', event => {
    if (transitionDepth || bootstrapping || current) return;
    const section = event.detail?.section;
    if (!section) return;
    const id = `section:${section}`;
    generation += 1;
    controller = new AbortController();
    const route = routes.get(id) || Object.freeze({ id, legacy: true });
    const built = contextFor(id, null);
    current = { id, route, context: built.context, cleanups: built.cleanups };
    markRoute(id);
    persist(id);
  });

  document.addEventListener('dtl:viewchange', event => {
    if (event.detail?.view === 'admin') return;
    navigationSequence += 1;
    if (current) void unmountCurrent('leave-admin');
    clearRouteMarker();
  });

  window.DTL_ADMIN = Object.freeze({
    open,
    restore,
    refresh,
    registerRoute,
    api,
    content,
    setHead,
    toast,
    icons,
    activeRoute: () => current?.id || null,
    state,
    routeIdFromElement,
    selectorForRoute,
  });
})();
