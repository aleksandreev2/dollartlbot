(() => {
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime core must load before onboarding-interactions-fix.js');

  let startX = 0;
  let startY = 0;
  let startTarget = null;
  let installedOn = null;

  const TAP_SELECTOR = '#onboardNext,#onboardBack,[data-onboard-dot],#underageButton,#onboardingRetry,.adult-confirm';

  function install() {
    const overlay = document.getElementById('dtlOnboarding');
    if (!overlay || overlay === installedOn) return;
    installedOn = overlay;

    overlay.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startTarget = event.target;
    }, { passive: true, capture: true });

    overlay.addEventListener('touchend', (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.hypot(dx, dy) > 18) return;

      const rawTarget = startTarget instanceof Element ? startTarget : event.target;
      const control = rawTarget?.closest?.(TAP_SELECTOR);
      if (!control || control.hasAttribute?.('disabled')) return;

      event.preventDefault();
      event.stopPropagation();

      if (control.classList.contains('adult-confirm')) {
        const checkbox = control.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.click();
        return;
      }

      if (typeof control.click === 'function') control.click();
    }, { passive: false, capture: true });
  }

  runtime.registerPatcher(install);
})();
