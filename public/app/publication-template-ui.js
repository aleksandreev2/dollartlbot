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

  function updatePreview() {
    const preview = document.querySelector('.publisher-preview .tg-preview');
    if (!preview) return;
    let box = preview.querySelector('.publication-template-preview');
    const lines = templateLines();
    if (!lines.length) {
      box?.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'publication-template-preview';
      const footer = preview.querySelector('.tg-preview-footer');
      if (footer) footer.before(box); else preview.append(box);
    }
    box.innerHTML = lines.map((line) => `<div>${esc(line)}</div>`).join('');
  }

  function updateRequestHelp(field) {
    const request = selectedRequest();
    const help = field.querySelector('.publication-request-help');
    if (!help) return;
    help.textContent = request
      ? (request.requester_username
        ? `Сейчас: «Requested by: @${String(request.requester_username).replace(/^@/, '')}». Username будет перепроверен перед отправкой.`
        : `У заявки нет @username. Будет добавлено: «Requested by: request #${request.id}».`)
      : 'В пост автоматически добавится «Requested by: @username». Перед публикацией username перепроверяется через Telegram.';
  }

  function applyPendingRequestSelection(select, field) {
    let pending = 0;
    try { pending = Number(sessionStorage.getItem(PENDING_LINK_KEY) || 0); } catch {}
    if (!Number.isSafeInteger(pending) || pending <= 0) return;
    const option = [...select.options].find((item) => Number(item.value) === pending);
    if (!option) return;
    select.value = String(pending);
    updateRequestHelp(field);
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
    field.innerHTML = `<span>Связать с заявкой <small>необязательно</small></span>
      <div class="publication-request-select-wrap">${icon('link-2')}
        <select id="pubSubmissionId"><option value="">Без связи с заявкой</option></select>
      </div>
      <small class="publication-request-help">В пост автоматически добавится «Requested by: @username». Перед публикацией username перепроверяется через Telegram.</small>`;
    host.after(field);

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
        updatePreview();
      });
      applyPendingRequestSelection(select, field);
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
  }

  runtime.registerFetchMiddleware(async (input, init, next, context) => {
    if (context.pathname !== '/api/app/admin/publications' || String(init?.method || 'GET').toUpperCase() !== 'POST') {
      return next(input, init);
    }
    if (!(init?.body instanceof FormData)) return next(input, init);

    const request = selectedRequest();
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
