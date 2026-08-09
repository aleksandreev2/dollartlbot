(() => {
  const root = document.documentElement;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const saveData = Boolean(navigator.connection?.saveData);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const lowPower = reducedMotion || saveData || (memory > 0 && memory <= 2) || (cores > 0 && cores <= 4);

  if (lowPower) root.classList.add('dtl-low-power');
  window.__DTL_LOW_POWER__ = lowPower;

  // Several UI layers request Lucide refreshes after the same DOM render.
  // Collapse them into a single scan per animation frame instead of scanning repeatedly.
  const lucide = window.lucide;
  if (lucide?.createIcons && !lucide.__dtlCreateIconsThrottled) {
    const originalCreateIcons = lucide.createIcons.bind(lucide);
    let iconRaf = 0;
    let latestArgs = undefined;
    lucide.createIcons = (args) => {
      latestArgs = args;
      if (iconRaf) return;
      iconRaf = requestAnimationFrame(() => {
        iconRaf = 0;
        originalCreateIcons(latestArgs);
      });
    };
    lucide.__dtlCreateIconsThrottled = true;
  }

  const syncVisibility = () => {
    root.classList.toggle('dtl-background', document.hidden);
    window.dispatchEvent(new CustomEvent('dtl:visibility', { detail: { hidden: document.hidden } }));
  };

  document.addEventListener('visibilitychange', syncVisibility, { passive: true });
  syncVisibility();
})();
