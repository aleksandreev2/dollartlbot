(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !runtime?.registerFetchMiddleware || !admin?.activeRoute) {
    throw new Error('Publishing preflight guard requires canonical runtime/admin APIs.');
  }

  let editor = null;
  let timer = 0;
  let checkPromise = null;

  const isPublishing = () => admin.activeRoute?.() === 'section:publishing';

  function schedule(delay = 260) {
    if (!isPublishing()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      void checkNow();
    }, delay);
  }

  async function checkNow() {
    if (!isPublishing()) return false;
    if (checkPromise) return checkPromise;
    const center = window.DTL_PUBLISHING_CENTER;
    if (!center?.runPreflight) return false;
    checkPromise = (async () => {
      await center.runPreflight();
      return Boolean(center.state?.().lastPreflight?.ready);
    })();
    try {
      return await checkPromise;
    } finally {
      checkPromise = null;
    }
  }

  function bind() {
    if (!isPublishing()) {
      editor = null;
      clearTimeout(timer);
      timer = 0;
      return;
    }
    const current = document.querySelector('.publisher-editor');
    if (!current || current === editor) return;
    editor = current;

    for (const id of ['pubTitle', 'pubBody']) {
      const input = document.getElementById(id);
      input?.addEventListener('input', () => schedule(260));
      input?.addEventListener('blur', () => schedule(0));
    }
    for (const id of ['pubChapterStart', 'pubChapterEnd']) {
      document.getElementById(id)?.addEventListener('input', () => schedule(180));
    }
  }

  function blockedResponse(message) {
    queueMicrotask(() => {
      document.querySelector('.publishing-center-preflight')?.scrollIntoView({ behavior:'smooth', block:'center' });
    });
    return new Response(JSON.stringify({
      error:{ code:'preflight_blocked', message },
    }), {
      status:409,
      headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
    });
  }

  runtime.registerFetchMiddleware(async (input, init = {}, next, context) => {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (context.pathname !== '/api/app/admin/publications' || method !== 'POST' || !isPublishing()) {
      return next(input, init);
    }

    // Only the real Publish action must pass the final readiness gate.
    // Save/Test are intentionally allowed to create a draft even when Telegram is not ready.
    const publishingNow = Boolean(document.getElementById('pubPublish')?.classList.contains('is-busy'));
    if (!publishingNow) return next(input, init);

    const range = window.DTL_PUBLICATION_RELEASE_RANGE?.parsedRange?.();
    if (range && !range.ok) return blockedResponse(range.message || 'Проверьте диапазон глав.');

    const ready = await checkNow();
    if (!ready) return blockedResponse('Проверка перед публикацией не пройдена. Исправьте блокирующие пункты выше.');
    return next(input, init);
  });

  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(bind));
  document.addEventListener('dtl:adminrender', bind);
  runtime.registerPatcher(bind);

  window.DTL_PUBLISHING_PREFLIGHT_GUARD = Object.freeze({ checkNow, schedule });
})();
