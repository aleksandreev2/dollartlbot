(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !runtime?.registerFetchMiddleware || !admin?.activeRoute) {
    throw new Error('Publishing preflight guard requires canonical runtime/admin APIs.');
  }

  let editor = null;
  let timer = 0;
  let checkPromise = null;
  let observedButton = null;
  let buttonObserver = null;

  const isPublishing = () => admin.activeRoute?.() === 'section:publishing';

  function publishButtonBusy(button) {
    return Boolean(
      button?.dataset?.dtlAdminBusy === '1'
      || button?.getAttribute?.('aria-busy') === 'true'
      || button?.classList?.contains('is-busy')
    );
  }

  function releasePublishButton() {
    if (!isPublishing()) return;
    const button = document.getElementById('pubPublish');
    if (!(button instanceof HTMLButtonElement) || publishButtonBusy(button)) return;
    if (button.disabled) button.disabled = false;
    button.removeAttribute('aria-disabled');
  }

  function disconnectButtonObserver() {
    buttonObserver?.disconnect();
    buttonObserver = null;
    observedButton = null;
  }

  function observePublishButton() {
    const button = document.getElementById('pubPublish');
    if (!(button instanceof HTMLButtonElement)) {
      disconnectButtonObserver();
      return;
    }
    if (observedButton === button && buttonObserver) {
      releasePublishButton();
      return;
    }
    disconnectButtonObserver();
    observedButton = button;
    buttonObserver = new MutationObserver(() => queueMicrotask(releasePublishButton));
    buttonObserver.observe(button, {
      attributes: true,
      attributeFilter: ['disabled', 'class', 'data-dtl-admin-busy', 'aria-busy'],
    });
    queueMicrotask(releasePublishButton);
  }

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
      const resultReady = Boolean(center.state?.().lastPreflight?.ready);
      const stateNode = document.getElementById('pcPreflightState');
      const uiReady = stateNode ? stateNode.classList.contains('ready') : resultReady;
      return resultReady && uiReady;
    })();
    try {
      return await checkPromise;
    } finally {
      checkPromise = null;
      queueMicrotask(releasePublishButton);
    }
  }

  function latestBlockingMessage() {
    const result = window.DTL_PUBLISHING_CENTER?.state?.().lastPreflight;
    const blocking = Array.isArray(result?.checks)
      ? result.checks.find(check => check?.status === 'error')
      : null;
    return String(blocking?.message || 'Проверка перед публикацией не пройдена. Проверьте блокирующие пункты.');
  }

  function bind() {
    if (!isPublishing()) {
      editor = null;
      clearTimeout(timer);
      timer = 0;
      disconnectButtonObserver();
      return;
    }
    const current = document.querySelector('.publisher-editor');
    if (!current) {
      editor = null;
      disconnectButtonObserver();
      return;
    }

    observePublishButton();
    if (current === editor) return;
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
      releasePublishButton();
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

    // Save/Test remain non-destructive. A real Publish is always clickable, then this
    // final gate either allows it or returns the exact blocking reason to the UI.
    const publishingNow = Boolean(document.getElementById('pubPublish')?.classList.contains('is-busy'));
    if (!publishingNow) return next(input, init);

    const range = window.DTL_PUBLICATION_RELEASE_RANGE?.parsedRange?.();
    if (range && !range.ok) return blockedResponse(range.message || 'Проверьте диапазон глав.');

    const ready = await checkNow();
    if (!ready) return blockedResponse(latestBlockingMessage());
    return next(input, init);
  });

  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(bind));
  document.addEventListener('dtl:adminrender', bind);
  runtime.registerPatcher(bind);

  window.DTL_PUBLISHING_PREFLIGHT_GUARD = Object.freeze({
    checkNow,
    schedule,
    releasePublishButton,
  });
})();
