(() => {
  const runtime = window.DTL_RUNTIME;
  const tg = window.Telegram?.WebApp;
  if (!runtime?.registerPatcher || !runtime?.registerFetchMiddleware) {
    throw new Error('DTL runtime must load before publication-template-ui.js');
  }

  const FILES_LINE = '📎 Files are in the comments.';
  const PENDING_LINK_KEY = 'dtl:publicationSubmissionId';
  let rows = [];
  let loading = null;
  let loadedAt = 0;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const headers = () => ({ 'x-telegram-init-data': tg?.initData || '' });

  async function loadRequests(force = false) {
    if (!force && rows.length && Date.now() - loadedAt < 30_000) return rows;
    if (loading) return loading;
    loading = fetch('/api/app/admin/publication-links', { headers: headers(), cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
        rows = Array.isArray(data.requests) ? data.requests : [];
        loadedAt = Date.now();
        return rows;
      })
      .finally(() => { loading = null; });
    return loading;
  }

  function selectedRequest() {
    const select = document.getElementById('pubSubmissionId');
    const id = Number(select?.value || 0);
    return rows.find((row) => Number(row.id) === id) || null;
  }

  function requestLine(row) {
    if (!row) return '';
    const username = String(row.requester_username || '').trim().replace(/^@/, '');
    return username ? `Requested by: @${username}` : `Requested by: request #${Number(row.id)}`;
  }

  function templateLines(form) {
    const lines = [];
    const files = form
      ? form.getAll('files').filter((item) => item instanceof File && item.size > 0)
      : [...(document.getElementById('pubFiles')?.files || [])].slice(0, 8);
    if (files.length) lines.push(FILES_LINE);
    const request = selectedRequest();
    if (request) lines.push(requestLine(request));
    return lines;
  }

  function applyRequestDefaults(row) {
    const title = document.getElementById('pubTitle');
    if (title && row) {
      const previous = title.dataset.requestAutofillValue || '';
      if (!title.value.trim() || title.value === previous) {
        title.value = String(row.title || '');
        title.dataset.requestAutofillValue = title.value;
        title.dispatchEvent(new Event('input', { bubbles:true }));
      }
    }
    renderRequestCover(row);
    updateRequestSummary(row);
  }

  function renderRequestCover(row) {
    const input = document.getElementById('pubImage');
    const box = document.getElementById('tgPreviewImage');
    if (!box || input?.files?.length) return;
    if (row && Number(row.has_cover || 0) === 1) {
      const id = Number(row.id);
      box.className = 'tg-preview-image request-cover';
      box.dataset.requestCover = String(id);
      const version = encodeURIComponent(String(row.cover_updated_at || '1'));
      box.innerHTML = `<img src="/media/covers/${id}?v=${version}" alt=""><span class="publication-request-cover-badge">${icon('image')} Обложка заявки</span>`;
    } else if (box.dataset.requestCover) {
      delete box.dataset.requestCover;
      box.className = 'tg-preview-image empty';
      box.innerHTML = icon('image');
    }
    try { window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } }); } catch {}
  }

  function updateRequestSummary(row) {
    let summary = document.querySelector('.publication-request-summary');
    const field = document.querySelector('.publication-request-link');
    if (!field) return;
    if (!row) {
      summary?.remove();
      return;
    }
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'publication-request-summary';
      field.append(summary);
    }
    const state = row.queue_status === 'completed' ? 'Перевод завершён' : row.queue_status === 'in_progress' ? 'Сейчас переводится' : 'В очереди';
    summary.innerHTML = `<span>${icon('book-open')} #${Number(row.id)}</span><span>${esc(row.original_language || '—')}</span><span>${Number(row.chapter_count || 0)} глав</span><span>${esc(state)}</span>${Number(row.has_cover || 0) === 1 ? `<span>${icon('image')} Есть обложка</span>` : ''}`;
  }

  function updatePreview() {
    const preview = document.querySelector('.publisher-preview .tg-preview');
    if (!preview) return;
    let box = preview.querySelector('.publication-template-preview');
    const lines = templateLines();
    if (!lines.length) {
      box?.remove();
    } else {
      if (!box) {
        box = document.createElement('div');
        box.className = 'publication-template-preview';
        const footer = preview.querySelector('.tg-preview-footer');
        if (footer) footer.before(box); else preview.append(box);
      }
      box.innerHTML = lines.map((line) => `<div>${esc(line)}</div>`).join('');
    }
    applyRequestDefaults(selectedRequest());
  }

  function updateRequestHelp(field) {
    const request = selectedRequest();
    const help = field.querySelector('.publication-request-help');
    if (!help) return;
    help.textContent = request
      ? (request.requester_username
        ? `В пост добавится «Requested by: @${String(request.requester_username).replace(/^@/, '')}». Название и обложка заявки подставлены автоматически.`
        : `У заявки нет @username. Будет добавлено «Requested by: request #${request.id}». Название и обложка подставлены автоматически.`)
      : 'Выберите заявку — её название, параметры и обложка подставятся автоматически.';
  }

  function applyPendingRequestSelection(select, field) {
    let pending = 0;
    try { pending = Number(sessionStorage.getItem(PENDING_LINK_KEY) || 0); } catch {}
    if (!Number.isSafeInteger(pending) || pending <= 0) return;
    const option = [...select.options].find((item) => Number(item.value) === pending);
    if (!option) return;
    select.value = String(pending);
    updateRequestHelp(field);
    applyRequestDefaults(selectedRequest());
    updatePreview();
    try {
      sessionStorage.removeItem(PENDING_LINK_KEY);
      sessionStorage.removeItem('dtl:publicationSubmissionTitle');
    } catch {}
  }

  async function installSelector() {
    const title = document.getElementById('pubTitle');
    if (!title) return;
    const host = title.closest('.admin-field');
    if (!host || document.getElementById('pubSubmissionId')) {
      bindTemplateInputs();
      updatePreview();
      return;
    }

    const field = document.createElement('label');
    field.className = 'admin-field publication-request-link';
    field.innerHTML = `<span>Заявка <small>необязательно</small></span>
      <div class="publication-request-select-wrap">${icon('link-2')}
        <select id="pubSubmissionId"><option value="">Без связи с заявкой</option></select>
      </div>
      <small class="publication-request-help">Выберите заявку — её название, параметры и обложка подставятся автоматически.</small>`;
    host.before(field);

    try {
      const requests = await loadRequests();
      const select = field.querySelector('#pubSubmissionId');
      for (const row of requests) {
        const option = document.createElement('option');
        option.value = String(row.id);
        const username = row.requester_username ? ` · @${String(row.requester_username).replace(/^@/, '')}` : ' · без @username';
        const state = row.queue_status === 'in_progress' ? 'в работе' : row.queue_status === 'completed' ? 'готово' : 'в очереди';
        option.textContent = `#${row.id} · ${row.title}${username} · ${state}`;
        select.append(option);
      }
      select.addEventListener('change', () => {
        updateRequestHelp(field);
        applyRequestDefaults(selectedRequest());
        updatePreview();
      });
      applyPendingRequestSelection(select, field);
      applyRequestDefaults(selectedRequest());
    } catch (error) {
      const select = field.querySelector('#pubSubmissionId');
      if (select) {
        select.disabled = true;
        select.innerHTML = '<option>Не удалось загрузить заявки</option>';
      }
      const help = field.querySelector('.publication-request-help');
      if (help) help.textContent = error instanceof Error ? error.message : String(error);
    }
    bindTemplateInputs();
    updatePreview();
    try { window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } }); } catch {}
  }

  function bindTemplateInputs() {
    const files = document.getElementById('pubFiles');
    if (files && files.dataset.publicationTemplateBound !== '1') {
      files.dataset.publicationTemplateBound = '1';
      files.addEventListener('change', updatePreview);
    }
    const image = document.getElementById('pubImage');
    if (image && image.dataset.publicationRequestCoverBound !== '1') {
      image.dataset.publicationRequestCoverBound = '1';
      image.addEventListener('change', () => {
        if (!image.files?.length) renderRequestCover(selectedRequest());
      });
    }
  }

  async function attachRequestCover(form, request) {
    if (!request || Number(request.has_cover || 0) !== 1) return;
    const current = form.get('image');
    if (current instanceof File && current.size > 0) return;
    const response = await fetch(`/media/covers/${Number(request.id)}`, { cache:'no-store' });
    if (!response.ok) return;
    const blob = await response.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) return;
    const type = blob.type || 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/avif' ? 'avif' : 'jpg';
    form.set('image', new File([blob], `request-${Number(request.id)}-cover.${ext}`, { type }));
  }

  runtime.registerFetchMiddleware(async (input, init, next, context) => {
    if (context.pathname !== '/api/app/admin/publications' || String(init?.method || 'GET').toUpperCase() !== 'POST') {
      return next(input, init);
    }
    if (!(init?.body instanceof FormData)) return next(input, init);

    const request = selectedRequest();
    if (request) await attachRequestCover(init.body, request);
    const response = await next(input, init);
    if (!response.ok || !request) return response;

    const payload = await response.clone().json().catch(() => ({}));
    const publicationId = Number(payload?.publication?.publication?.id);
    if (!Number.isSafeInteger(publicationId) || publicationId <= 0) return response;

    const linkResponse = await fetch(`/api/app/admin/publications/${publicationId}/link-request`, {
      method: 'POST',
      headers: { ...headers(), 'content-type':'application/json' },
      body: JSON.stringify({ submission_id:Number(request.id) }),
    });
    if (linkResponse.ok) {
      const linked = await linkResponse.clone().json().catch(() => ({}));
      if (linked?.requester_username) {
        request.requester_username = linked.requester_username;
        updateRequestHelp(document.querySelector('.publication-request-link'));
        updatePreview();
      }
      return response;
    }

    const failure = await linkResponse.json().catch(() => ({}));
    await fetch(`/api/app/admin/publications/${publicationId}`, {
      method:'DELETE',
      headers:headers(),
    }).catch(() => undefined);
    return new Response(JSON.stringify({
      error: {
        code: failure?.error?.code || 'publication_link_failed',
        message: failure?.error?.message || 'Не удалось связать публикацию с заявкой.',
      },
    }), { status:linkResponse.status || 409, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } });
  });

  runtime.registerPatcher(() => { void installSelector(); });
  document.addEventListener('dtl:adminrender', (event) => {
    if (event.detail?.section === 'publishing') runtime.schedule();
  });
})();
