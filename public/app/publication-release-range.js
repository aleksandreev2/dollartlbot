(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !runtime?.registerFetchMiddleware || !admin?.api) {
    throw new Error('Publication release range UI requires canonical runtime/admin APIs.');
  }

  const DRAFT_PATH = '/api/app/admin/publication-release-range/draft';
  const MAX_CHAPTER = 1_000_000;
  let loaded = false;
  let loading = null;
  let saveTimer = 0;
  let suppress = false;
  let chapterStart = '';
  let chapterEnd = '';

  const isPublishing = () => admin.activeRoute?.() === 'section:publishing';
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function install() {
    if (!isPublishing()) return;
    const title = document.getElementById('pubTitle');
    const host = title?.closest('.admin-field');
    if (!host) return;
    let range = document.querySelector('.publication-release-range');
    if (!range) {
      range = document.createElement('div');
      range.className = 'publication-release-range';
      range.innerHTML = `
        <div class="publication-release-range-head">
          <div>${icon('list-tree')}<span><strong>Главы релиза</strong><small>Для истории на странице тайтла · необязательно</small></span></div>
          <span class="publication-release-range-status" id="pubRangeStatus">Не указан</span>
        </div>
        <div class="publication-release-range-fields">
          <label><span>С главы</span><input id="pubChapterStart" type="number" min="1" max="${MAX_CHAPTER}" step="1" inputmode="numeric" placeholder="78"></label>
          <span class="publication-release-range-separator">—</span>
          <label><span>По главу</span><input id="pubChapterEnd" type="number" min="1" max="${MAX_CHAPTER}" step="1" inputmode="numeric" placeholder="85"></label>
        </div>
        <small class="publication-release-range-help">Если заполнить диапазон, Mini App покажет, какие главы уже опубликованы. Для одиночной главы укажите одинаковый номер в обоих полях.</small>`;
      host.after(range);
      for (const id of ['pubChapterStart','pubChapterEnd']) {
        document.getElementById(id)?.addEventListener('input', onInput);
      }
      applyValues();
      admin.icons?.();
    }
    if (!loaded && !loading) void loadDraft();
    syncStatus();
  }

  async function loadDraft() {
    loading = (async () => {
      try {
        const data = await admin.api(DRAFT_PATH);
        const draft = data?.draft || null;
        chapterStart = draft?.chapter_start ? String(draft.chapter_start) : '';
        chapterEnd = draft?.chapter_end ? String(draft.chapter_end) : '';
        loaded = true;
        applyValues();
        syncStatus();
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('Не удалось восстановить', 'error');
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function applyValues() {
    suppress = true;
    try {
      const start = document.getElementById('pubChapterStart');
      const end = document.getElementById('pubChapterEnd');
      if (start && start.value !== chapterStart) start.value = chapterStart;
      if (end && end.value !== chapterEnd) end.value = chapterEnd;
    } finally {
      suppress = false;
    }
  }

  function onInput() {
    if (suppress) return;
    chapterStart = document.getElementById('pubChapterStart')?.value.trim() || '';
    chapterEnd = document.getElementById('pubChapterEnd')?.value.trim() || '';
    syncStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; void saveDraft(); }, 450);
  }

  function parsedRange() {
    if (!chapterStart && !chapterEnd) return { ok:true, empty:true, chapter_start:null, chapter_end:null };
    if (!chapterStart || !chapterEnd) return { ok:false, message:'Заполните обе границы диапазона.' };
    const start = Number(chapterStart);
    const end = Number(chapterEnd);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > MAX_CHAPTER || end > MAX_CHAPTER) {
      return { ok:false, message:`Номер главы должен быть от 1 до ${MAX_CHAPTER}.` };
    }
    if (end < start) return { ok:false, message:'Последняя глава не может быть меньше первой.' };
    return { ok:true, empty:false, chapter_start:start, chapter_end:end };
  }

  function syncStatus() {
    const parsed = parsedRange();
    for (const id of ['pubChapterStart','pubChapterEnd']) {
      const input = document.getElementById(id);
      if (input) input.setAttribute('aria-invalid', parsed.ok ? 'false' : 'true');
    }
    if (!parsed.ok) return setStatus(parsed.message, 'error');
    if (parsed.empty) return setStatus('Не указан', 'muted');
    const label = parsed.chapter_start === parsed.chapter_end
      ? `Глава ${parsed.chapter_start}`
      : `Главы ${parsed.chapter_start}–${parsed.chapter_end}`;
    setStatus(label, 'ready');
  }

  function setStatus(text, tone = '') {
    const node = document.getElementById('pubRangeStatus');
    if (!node) return;
    node.textContent = text;
    node.className = `publication-release-range-status ${tone}`.trim();
  }

  async function saveDraft() {
    const parsed = parsedRange();
    if (!parsed.ok) return;
    try {
      if (parsed.empty) {
        await admin.api(DRAFT_PATH, { method:'DELETE' });
      } else {
        await admin.api(DRAFT_PATH, {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ chapter_start:parsed.chapter_start, chapter_end:parsed.chapter_end }),
        });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus('Не сохранено', 'error');
    }
  }

  function errorResponse(message, status = 400) {
    return new Response(JSON.stringify({ error:{ code:'invalid_chapter_range', message } }), {
      status,
      headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
    });
  }

  async function clearDraftState() {
    chapterStart = '';
    chapterEnd = '';
    loaded = true;
    applyValues();
    syncStatus();
    await admin.api(DRAFT_PATH, { method:'DELETE' }).catch(() => undefined);
  }

  runtime.registerFetchMiddleware(async (input, init = {}, next, context) => {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (context.pathname !== '/api/app/admin/publications' || method !== 'POST') return next(input, init);

    const parsed = parsedRange();
    if (!parsed.ok) return errorResponse(parsed.message);
    const response = await next(input, init);
    if (!response.ok) return response;

    const payload = await response.clone().json().catch(() => ({}));
    const publicationId = Number(payload?.publication?.publication?.id || 0);
    if (!Number.isSafeInteger(publicationId) || publicationId <= 0) return response;

    if (parsed.empty) {
      void clearDraftState();
      return response;
    }

    try {
      await admin.api(`/api/app/admin/publications/${publicationId}/release-range`, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ chapter_start:parsed.chapter_start, chapter_end:parsed.chapter_end }),
      });
      await clearDraftState();
      return response;
    } catch (error) {
      await admin.api(`/api/app/admin/publications/${publicationId}`, { method:'DELETE' }).catch(() => undefined);
      return errorResponse(error?.message || 'Не удалось сохранить диапазон глав. Черновик публикации отменён.', 409);
    }
  });

  document.addEventListener('dtl:adminrender', install);
  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(install));
  runtime.registerPatcher(install);

  window.DTL_PUBLICATION_RELEASE_RANGE = Object.freeze({ install, parsedRange });
})();
