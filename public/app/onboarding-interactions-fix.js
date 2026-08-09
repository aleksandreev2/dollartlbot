(() => {
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

      // Some Telegram Android WebViews occasionally suppress the synthetic click
      // after touchend when several gesture/DOM layers are active. Trigger the
      // already-bound control action explicitly and suppress the duplicate click.
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

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
