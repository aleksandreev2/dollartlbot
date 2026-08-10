(() => {
  const SHELL_URL = '/app/index.html';
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  let baseline = '';
  let checking = false;
  let pendingReload = false;

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `body-${(hash >>> 0).toString(16)}`;
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

  function reloadWhenSafe() {
    if (hasUnsavedSuggestWork()) {
      pendingReload = true;
      return;
    }
    location.reload();
  }

  async function checkForUpdate() {
    if (checking) return;
    checking = true;
    try {
      const signature = await shellSignature();
      if (!signature) return;
      if (!baseline) {
        baseline = signature;
        return;
      }
      if (signature !== baseline) reloadWhenSafe();
    } catch {
      // Update checks are best-effort and must never interrupt the Mini App.
    } finally {
      checking = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate();
  });
  document.addEventListener('dtl:viewchange', () => {
    if (pendingReload && !hasUnsavedSuggestWork()) location.reload();
  });

  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
