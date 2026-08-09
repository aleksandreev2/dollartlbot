(() => {
  const root = document.documentElement;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const saveData = Boolean(navigator.connection?.saveData);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const lowPower = reducedMotion || saveData || (memory > 0 && memory <= 2) || (cores > 0 && cores <= 4);

  if (lowPower) root.classList.add('dtl-low-power');
  window.__DTL_LOW_POWER__ = lowPower;

  const syncVisibility = () => {
    root.classList.toggle('dtl-background', document.hidden);
    window.dispatchEvent(new CustomEvent('dtl:visibility', { detail: { hidden: document.hidden } }));
  };

  document.addEventListener('visibilitychange', syncVisibility, { passive: true });
  syncVisibility();
})();
