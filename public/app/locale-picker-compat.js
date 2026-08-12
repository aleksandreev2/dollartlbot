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

  function patchPicker() {
    for (const [code, meta] of Object.entries(localeMeta)) {
      if (!runtime.supported?.includes(code)) continue;
      document.querySelectorAll(`[data-lang="${CSS.escape(code)}"]`).forEach(button => {
        if (button.querySelector(':scope > .circle-language-flag')) return;
        const img = document.createElement('img');
        img.className = 'circle-language-flag language-picker-circle-flag';
        img.src = `/app/flags/${meta.country}.svg`;
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';
        img.fetchPriority = 'low';
        img.addEventListener('error', () => img.remove(), { once: true });
        button.prepend(img);
      });
    }
  }

  runtime.registerPatcher(patchPicker);
})();
