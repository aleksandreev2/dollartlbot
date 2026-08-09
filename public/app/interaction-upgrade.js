(() => {
  const tg = window.Telegram?.WebApp;
  const app = document.getElementById('app');
  const viewRoot = document.getElementById('viewRoot');
  const bottomNav = document.getElementById('bottomNav');
  const sheetRoot = document.getElementById('sheetRoot');
  if (!app || !viewRoot || !bottomNav) return;

  let detailOrigin = 'queue';
  let lastMainNav = 'home';
  let nativeBackBound = false;
  let pointer = null;
  let raf = 0;

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const interactiveSelector = 'button,a,input,textarea,select,label,[role="button"],.filter-row,.segmented,.timeline,.tag-list,.quick-tags';

  function haptic() {
    try { tg?.HapticFeedback?.selectionChanged(); } catch {}
  }

  function activeMainNav() {
    return bottomNav.querySelector('.nav-item.active[data-nav]')?.dataset.nav || lastMainNav || 'home';
  }

  function clickNav(target) {
    const button = bottomNav.querySelector(`.nav-item[data-nav="${CSS.escape(target)}"]`);
    if (!button) return false;
    lastMainNav = target;
    button.click();
    return true;
  }

  function closeVisibleSheet() {
    const backdrop = document.getElementById('sheetBackdrop');
    if (!backdrop) return false;
    const close = backdrop.querySelector('[data-close-sheet]');
    if (close) close.click();
    else backdrop.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    return true;
  }

  function wizardBack() {
    const button = document.getElementById('reviewBack') || document.getElementById('contentBack') || document.getElementById('detailsBack');
    if (!button) return false;
    button.click();
    return true;
  }

  function smartBack() {
    if (closeVisibleSheet()) { haptic(); return true; }
    if (document.getElementById('detailBack')) {
      const target = detailOrigin || lastMainNav || 'queue';
      if (clickNav(target)) { haptic(); return true; }
    }
    if (wizardBack()) { haptic(); return true; }
    return false;
  }

  function canGoBack() {
    return Boolean(document.getElementById('sheetBackdrop') || document.getElementById('detailBack') || document.getElementById('reviewBack') || document.getElementById('contentBack') || document.getElementById('detailsBack'));
  }

  function syncNativeBack() {
    const back = tg?.BackButton;
    if (!back) return;
    if (!nativeBackBound && typeof back.onClick === 'function') {
      back.onClick(smartBack);
      nativeBackBound = true;
    }
    try {
      if (canGoBack()) back.show();
      else back.hide();
    } catch {}
  }

  function decorateBackButton() {
    const button = document.getElementById('detailBack');
    if (!button) return;
    button.setAttribute('aria-label', 'Back');
    button.setAttribute('title', 'Back');
    button.classList.add('detail-back-fixed');
  }

  function timelineIconNames(timeline) {
    const card = timeline.closest('.request-card');
    const rejected = Boolean(card?.querySelector('.status-pill.red'));
    return rejected
      ? ['circle-x', 'list-ordered', 'languages', 'badge-check']
      : ['clipboard-check', 'list-ordered', 'languages', 'badge-check'];
  }

  function upgradeTimelines(root=document) {
    root.querySelectorAll('.timeline').forEach(timeline => {
      const names = timelineIconNames(timeline);
      timeline.querySelectorAll('.timeline-step').forEach((step, index) => {
        const dot = step.querySelector('.timeline-dot');
        if (!dot) return;
        const name = names[index] || 'circle';
        const existing = dot.querySelector('svg,[data-lucide]');
        if (existing?.getAttribute('data-lucide') === name || existing?.classList?.contains(`lucide-${name}`)) return;
        dot.textContent = '';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', name);
        icon.setAttribute('aria-hidden', 'true');
        dot.appendChild(icon);
        if (index === 0 && name === 'circle-x') step.classList.add('rejected-step');
      });
    });
    try {
      window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } });
    } catch {}
  }

  function patch() {
    decorateBackButton();
    upgradeTimelines(document);
    syncNativeBack();
  }

  function schedulePatch() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      patch();
    });
  }

  // Track the page that opened a novel detail view before app.js changes its internal state.
  document.addEventListener('click', event => {
    const nav = event.target.closest?.('.nav-item[data-nav]');
    if (nav) lastMainNav = nav.dataset.nav || lastMainNav;
    const novel = event.target.closest?.('[data-novel]');
    if (novel) detailOrigin = activeMainNav();
  }, true);

  // Make the custom back button deterministic instead of relying on the module-local previousView.
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#detailBack')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    smartBack();
  }, true);

  // Pointer gesture layer: native-feeling edge-back, tab swipes on non-interactive space,
  // and a downward swipe on the bottom-sheet handle/header.
  app.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    pointer = {
      id:event.pointerId,
      x:event.clientX,
      y:event.clientY,
      t:performance.now(),
      target:event.target,
      edgeLeft:event.clientX <= 30,
      edgeRight:event.clientX >= window.innerWidth - 30,
      sheetHandle:Boolean(event.target.closest?.('.sheet-handle,.sheet-title')),
    };
  }, { passive:true });

  app.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId || prefersReducedMotion()) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (pointer.edgeLeft && canGoBack() && dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      viewRoot.classList.add('edge-swipe-active');
      viewRoot.style.setProperty('--edge-swipe-x', `${Math.min(24, dx * .18)}px`);
    }
    if (pointer.sheetHandle && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      const sheet = document.querySelector('.bottom-sheet');
      if (sheet) sheet.style.setProperty('--sheet-drag-y', `${Math.min(36, dy * .25)}px`);
    }
  }, { passive:true });

  function clearGestureVisuals() {
    viewRoot.classList.remove('edge-swipe-active');
    viewRoot.style.removeProperty('--edge-swipe-x');
    document.querySelector('.bottom-sheet')?.style.removeProperty('--sheet-drag-y');
  }

  app.addEventListener('pointercancel', () => { pointer = null; clearGestureVisuals(); }, { passive:true });
  app.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const start = pointer;
    pointer = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const dt = Math.max(1, performance.now() - start.t);
    const velocity = Math.abs(dx) / dt;
    clearGestureVisuals();

    if (start.sheetHandle && dy > 72 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      closeVisibleSheet(); haptic(); return;
    }

    if (start.edgeLeft && dx > 68 && Math.abs(dx) > Math.abs(dy) * 1.2 && (velocity > .18 || dx > 110)) {
      if (smartBack()) return;
    }

    const startedInteractive = Boolean(start.target.closest?.(interactiveSelector));
    if (startedInteractive || Math.abs(dx) < 92 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (canGoBack()) return;

    const items = [...bottomNav.querySelectorAll('.nav-item[data-nav]')];
    const current = items.findIndex(x => x.classList.contains('active'));
    if (current < 0) return;
    const next = dx < 0 ? current + 1 : current - 1;
    if (next < 0 || next >= items.length) return;
    items[next].click();
    haptic();
  }, { passive:true });

  // Android/WebView browser-back fallback where popstate is delivered to the page.
  window.addEventListener('popstate', () => { if (canGoBack()) smartBack(); });

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedulePatch, { once:true });
  else schedulePatch();
})();
