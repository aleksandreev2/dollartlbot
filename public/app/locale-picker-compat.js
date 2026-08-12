(() => {
  const runtime = window.DTL_RUNTIME;
  const app = window.DTL_APP;
  if (!runtime?.registerPatcher || !app?.LANGUAGE_NAMES) {
    throw new Error('Locale picker compatibility requires DTL runtime and app core.');
  }

  const localeMeta = {
    ur: { label: 'اردو', country: 'pk' },
  };

  for (const [code, meta] of Object.entries(localeMeta)) {
    if (runtime.supported?.includes(code)) app.LANGUAGE_NAMES[code] = meta.label;
  }

  function patchPicker(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    for (const [code, meta] of Object.entries(localeMeta)) {
      if (!runtime.supported?.includes(code)) continue;
      scope.querySelectorAll(`[data-lang="${code}"]`).forEach(button => {
        if (button.querySelector(':scope > .circle-language-flag')) return;
        const img = document.createElement('img');
        img.className = 'circle-language-flag language-picker-circle-flag';
        img.src = `/app/flags/${meta.country}.svg?v=20260812a`;
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';
        img.fetchPriority = 'low';
        img.addEventListener('error', () => img.remove(), { once: true });
        button.prepend(img);
      });
    }
  }

  document.addEventListener('dtl:sheetopen', event => patchPicker(event.detail?.root || document));
  runtime.registerPatcher(() => patchPicker(document));
})();
