(() => {
  const app = window.DTL_APP;
  if (!app?.state || !app?.viewRoot) throw new Error('DTL app core must load before suggest-content-api.js');

  function render() {
    document.dispatchEvent(new CustomEvent('dtl:suggest', {
      detail: {
        view: 'suggest',
        wizardStep: app.state.wizardStep,
        source: 'canonical-content-api',
      },
    }));
  }

  document.addEventListener('dtl:suggest', event => {
    if (event?.detail?.source === 'canonical-content-api') return;
    if (app.state.wizardStep !== 3) return;
    if (!app.viewRoot.querySelector('.suggest-content-page')) return;
    event.stopImmediatePropagation();
  }, { capture: true });

  window.DTL_SUGGEST_CONTENT = Object.freeze({ render });
})();
