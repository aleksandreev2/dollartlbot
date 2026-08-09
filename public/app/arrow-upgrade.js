(() => {
  function replaceArrows(root = document) {
    let changed = false;
    root.querySelectorAll('.novel-meta span').forEach((span) => {
      if (span.dataset.arrowIconReady === '1') return;
      if ((span.textContent || '').trim() !== '→') return;
      span.textContent = '';
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'arrow-right');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'language-arrow-icon';
      span.appendChild(icon);
      span.dataset.arrowIconReady = '1';
      changed = true;
    });
    if (changed && window.lucide?.createIcons) {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } });
    }
  }

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      replaceArrows(document);
    });
  };

  const patchRoot = document.getElementById('viewRoot') || document.body;
  new MutationObserver(schedule).observe(patchRoot, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
