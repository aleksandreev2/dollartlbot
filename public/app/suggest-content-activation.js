(() => {
  const app = window.DTL_APP;
  if (!app?.state || !app?.viewRoot) return;

  let scheduled = false;
  function ensureEnhancedSuggest() {
    scheduled = false;
    if (app.state.view !== 'suggest' || app.state.wizardStep !== 3) return;
    if (app.viewRoot.querySelector('.suggest-content-page')) return;
    document.dispatchEvent(new CustomEvent('dtl:suggest', {
      detail: { view: 'suggest', wizardStep: 3, source: 'activation-fallback' },
    }));
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(ensureEnhancedSuggest);
  }

  document.addEventListener('dtl:viewrender', schedule);
  document.addEventListener('dtl:suggest', event => {
    if (event?.detail?.source === 'activation-fallback') return;
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
  window.addEventListener('pageshow', schedule);
  setTimeout(schedule, 0);
})();
