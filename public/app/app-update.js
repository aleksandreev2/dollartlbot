(() => {
  const BUILD_URL = '/app/build.json';
  const SHELL_URL = '/app/index.html';
  const CHECK_INTERVAL_MS = 30 * 1000;
  const DATA_REFRESH_INTERVAL_MS = 60 * 1000;
  const RESUME_REFRESH_DEBOUNCE_MS = 4 * 1000;
  const embeddedBuild = document.querySelector('meta[name="dtl-build"]')?.getAttribute('content') || '';
  let baselineBuild = embeddedBuild && embeddedBuild !== 'dev' ? embeddedBuild : '';
  let baselineShell = '';
  let checking = false;
  let pendingReload = '';
  let lastDataRefreshAt = 0;
  let lastResumeRefreshAt = 0;

  if (embeddedBuild) window.DTL_BUILD_ID = embeddedBuild;

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `body-${(hash >>> 0).toString(16)}`;
  }

  async function buildId() {
    try {
      const response = await fetch(`${BUILD_URL}?dtl_fresh=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return '';
      const payload = await response.json().catch(() => null);
      return String(payload?.build_id || '').trim();
    } catch {
      return '';
    }
  }

  async function shellSignature() {
    const response = await fetch(`${SHELL_URL}?dtl_fresh=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return '';
    const etag = response.headers.get('etag');
    if (etag) return `etag-${etag}`;
    return hashText(await response.text());
  }

  function hasUnsavedSuggestWork() {
    const state = window.DTL_APP?.state;
    if (!state || state.view !== 'suggest') return false;
    if (state.file || Number(state.wizardStep || 1) > 1) return true;
    const draft = state.draft || {};
    return Boolean(
      String(draft.title || '').trim() ||
      String(draft.source_url || '').trim() ||
      String(draft.genres_tags || '').trim() ||
      String(draft.notes || '').trim()
    );
  }

  function reloadNow(nextBuild = '') {
    const url = new URL(location.href);
    url.searchParams.set('dtl_build', nextBuild || String(Date.now()));
    location.replace(url.toString());
  }

  function reloadWhenSafe(nextBuild = '') {
    if (hasUnsavedSuggestWork()) {
      pendingReload = nextBuild || 'pending';
      return;
    }
    reloadNow(nextBuild);
  }

  async function checkForUpdate() {
    if (checking) return false;
    checking = true;
    try {
      const currentBuild = await buildId();
      if (currentBuild) {
        window.DTL_BUILD_ID = currentBuild;
        if (!baselineBuild) {
          baselineBuild = currentBuild;
          return false;
        }
        if (currentBuild !== baselineBuild) {
          reloadWhenSafe(currentBuild);
          return true;
        }
        return false;
      }

      const signature = await shellSignature();
      if (!signature) return false;
      if (!baselineShell) {
        baselineShell = signature;
        return false;
      }
      if (signature !== baselineShell) {
        reloadWhenSafe('');
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      checking = false;
    }
  }

  async function refreshVisibleData(reason, force = false) {
    if (document.hidden || hasUnsavedSuggestWork() || pendingReload) return;
    const now = Date.now();
    if (!force && now - lastDataRefreshAt < DATA_REFRESH_INTERVAL_MS) return;
    lastDataRefreshAt = now;
    try {
      await window.DTL_APP?.refreshBootstrap?.(false);
    } catch {
      // A stale bootstrap should never break the current screen.
    }
    document.dispatchEvent(new CustomEvent('dtl:datarefresh', {
      detail: { reason, at: new Date(now).toISOString() },
    }));
  }

  async function resume(reason) {
    const now = Date.now();
    if (now - lastResumeRefreshAt < RESUME_REFRESH_DEBOUNCE_MS) return;
    lastResumeRefreshAt = now;
    const updating = await checkForUpdate();
    if (!updating) await refreshVisibleData(reason, true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void resume('visible');
  });
  window.addEventListener('focus', () => { void resume('focus'); });
  window.addEventListener('pageshow', () => { void resume('pageshow'); });
  document.addEventListener('dtl:viewchange', () => {
    if (pendingReload && !hasUnsavedSuggestWork()) reloadNow(pendingReload === 'pending' ? '' : pendingReload);
  });

  void checkForUpdate();
  setInterval(() => {
    void checkForUpdate().then(updating => {
      if (!updating) void refreshVisibleData('interval');
    });
  }, CHECK_INTERVAL_MS);
})();
