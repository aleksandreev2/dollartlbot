(() => {
  const root = document.documentElement;
  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const saveData = Boolean(navigator.connection?.saveData);
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const lowPower = reducedMotion || saveData || (memory > 0 && memory <= 2) || (cores > 0 && cores <= 4);

  if (lowPower) root.classList.add('dtl-low-power');
  window.__DTL_LOW_POWER__ = lowPower;

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

  // Admin, notifications and desktop assets are now declared directly in
  // index.html. Older builds dynamically injected the same scripts here,
  // which could execute Admin 2.0 twice and register duplicate observers and
  // click handlers. Keep this file focused on runtime performance only.

  // Labels already activate their nested file input natively. Admin 2.0 also
  // has an explicit handler for WebViews, so stop that handler from recursively
  // re-triggering when the click originated from the input itself.
  document.addEventListener('click', (event) => {
    const input = event.target instanceof Element ? event.target.closest('#pubImage,#pubFiles') : null;
    if (input) event.stopImmediatePropagation();
  }, true);

  const syncVisibility = () => {
    root.classList.toggle('dtl-background', document.hidden);
    window.dispatchEvent(new CustomEvent('dtl:visibility', { detail: { hidden: document.hidden } }));
  };

  document.addEventListener('visibilitychange', syncVisibility, { passive: true });
  syncVisibility();
})();
