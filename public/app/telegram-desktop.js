(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const root = document.documentElement;
  const desktopPlatforms = new Set(['tdesktop', 'macos', 'unigram']);
  const platform = String(tg.platform || '').toLowerCase();
  const pointerDesktop = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
  const isTelegramDesktop = desktopPlatforms.has(platform) || (pointerDesktop && Boolean(tg.initData));
  if (!isTelegramDesktop) return;

  root.classList.add('dtl-telegram-desktop');

  let fullscreenAttempted = false;
  let resizeRaf = 0;

  const syncViewport = () => {
    const stable = Number(tg.viewportStableHeight || 0);
    const height = stable > 0 ? stable : window.innerHeight;
    root.style.setProperty('--dtl-tg-stable-height', `${Math.max(320, Math.round(height))}px`);

    const compact = window.innerWidth < 700 && !tg.isFullscreen;
    root.classList.toggle('dtl-compact-desktop', compact);
    root.classList.toggle('dtl-fullscreen-desktop', Boolean(tg.isFullscreen));
  };

  const scheduleSync = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncViewport();
    });
  };

  const tryFullscreen = () => {
    if (fullscreenAttempted || tg.isFullscreen || window.innerWidth >= 700) return;
    fullscreenAttempted = true;
    try { tg.expand(); } catch {}
    if (typeof tg.requestFullscreen === 'function') {
      try { tg.requestFullscreen(); } catch {}
    }
  };

  syncViewport();
  try { tg.expand(); } catch {}

  // Give Telegram one frame to settle the initial modal before requesting fullscreen.
  requestAnimationFrame(() => setTimeout(tryFullscreen, 120));

  try { tg.onEvent?.('viewportChanged', scheduleSync); } catch {}
  try { tg.onEvent?.('fullscreenChanged', scheduleSync); } catch {}
  try { tg.onEvent?.('fullscreenFailed', scheduleSync); } catch {}
  window.addEventListener('resize', scheduleSync, { passive: true });
})();
