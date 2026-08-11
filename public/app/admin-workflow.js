(() => {
  const runtime = window.DTL_RUNTIME;
  const adminRuntime = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !adminRuntime?.registerRoute) throw new Error('Canonical admin runtime must load before admin-workflow.js');

  const state = {
    active: '',
    requestFilter: 'pending',
    requestQuery: '',
    requestRows: [],
    selectedRequestId: null,
    queueRows: [],
    dragRequestId: null,
  };
  let requestSearchTimer = 0;

  const api = (path, options = {}) => adminRuntime.api(path, options);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const fmt = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  };
  const routeId = section => `section:${section}`;
  const isActive = section => state.active === section && adminRuntime.activeRoute?.() === routeId(section);
  const stale = (section, error) => error?.name === 'AbortError' || !isActive(section);

  function icons() { adminRuntime.icons?.(); }
  function toast(text, error = false) { adminRuntime.toast?.(text, error); }
  function area() { return document.querySelector('.admin-content'); }
  function setHead(title, subtitle) { adminRuntime.setHead?.(title, subtitle); }

  function markActive(section) {
    document.querySelectorAll('[data-admin-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.adminSection === section);
    });
    document.querySelectorAll('[data-admin-tools],[data-admin-health]').forEach(button => button.classList.remove('active'));
  }

  function deactivate(section) {
    if (state.active !== section) return;
    state.active = '';
    state.dragRequestId = null;
    clearTimeout(requestSearchTimer);
  }

  function loading(label) {
    const root = area();
    if (!root) return;
    root.innerHTML = `<div class="admin-loading">${ico('loader-circle')} ${esc(label)}</div>`;
    icons();
  }

  function errorBox(message, retry) {
    const root = area();
    if (!root) return;
    root.innerHTML = `<section class="admin-panel admin-workflow-error">${ico('triangle-alert')}<div><strong>Не удалось загрузить данные</strong><span>${esc(message)}</span></div><button type="button" data-workflow-retry>${ico('refresh-cw')} Повторить</button></section>`;
    root.querySelector('[data-workflow-retry]')?.addEventListener('click', retry);
    icons();
  }

  function statusKey(r) {
    if (r.status === 'pending') return 'pending';
    if (r.status === 'rejected') return 'rejected';
    if (r.queue_status === 'completed') return 'completed';
    if (r.queue_status === 'in_progress') return 'working';
    if (r.queue_status === 'queued') return 'queued';
    return 'draft';
  }

  function statusLabel(r) {
    if (r.status === 'pending') return 'На проверке';
    if (r.status === 'rejected') return r.slot_returned ? 'Отклонена · слот возвращён' : 'Отклонена';
    if (r.queue_status === 'completed') return 'Завершена';
    if (r.queue_status === 'in_progress') return 'В работе';
    if (r.queue_status === 'queued') return `В очереди${r.queue_position ? ` #${r.queue_position}` : ''}`;
    return String(r.status || '—');
  }

  function filterRequests(rows) {
    let next = rows;
    if (state.requestFilter === 'active') next = rows.filter(r => r.status === 'accepted' && r.queue_status !== 'completed');
    else if (state.requestFilter === 'rejected') next = rows.filter(r => r.status === 'rejected');
    else if (state.requestFilter === 'completed') next = rows.filter(r => r.status === 'accepted' && r.queue_status === 'completed');
    const q = state.requestQuery.trim().toLowerCase();
    if (!q) return next;
    return next.filter(r => [r.id, r.title, r.username, r.first_name, r.original_language, r.user_id]
      .filter(value => value !== null && value !== undefined)
      .some(value => String(value).toLowerCase().includes(q)));
  }

  function requestRow(r) {
    const selected = Number(state.selectedRequestId) === Number(r.id);
    return `<button type="button" class="admin-inbox-row ${selected ? 'selected' : ''}" data-workflow-request="${r.id}">
      <span class="admin-inbox-state ${statusKey(r)}"></span>
      <span class="admin-inbox-copy">
        <span class="admin-inbox-row-top"><strong>#${r.id} · ${esc(r.title)}</strong><em>${r.plan === 'subscriber' ? 'Boosty' : 'Обычный'}</em></span>
        <span>${esc(r.original_language)} · ${Number(r.chapter_count || 0)} глав${r.username ? ` · @${esc(r.username)}` : ''}</span>
        <small>${statusLabel(r)} · ${fmt(r.updated_at || r.created_at)}</small>
      </span>
      ${ico('chevron-right')}
    </button>`;
  }

  async function renderRequests(options = {}) {
    if (adminRuntime.activeRoute?.() !== routeId('requests')) return false;
    state.active = 'requests';
    markActive('requests');
    setHead('Заявки', 'Быстрая проверка: список слева, полная заявка справа');
    loading('Загружаем заявки…');
    try {
      const backendKind = state.requestFilter === 'pending' ? 'pending' : 'all';
      const data = await api(`/api/app/admin/list?kind=${backendKind}`);
      if (!isActive('requests')) return false;
      state.requestRows = data.requests || [];
      const rows = filterRequests(state.requestRows);

      if (options.selectFirst || !rows.some(r => Number(r.id) === Number(state.selectedRequestId))) {
        state.selectedRequestId = rows[0]?.id ?? null;
      }

      const root = area();
      if (!root || !isActive('requests')) return false;
      root.innerHTML = `<section class="admin-workflow admin-inbox">
        <div class="admin-inbox-toolbar admin-panel">
          <div class="admin-workflow-search">${ico('search')}<input id="adminWorkflowSearch" value="${esc(state.requestQuery)}" placeholder="Название, @username, ID, язык"></div>
          <div class="admin-workflow-filters">
            ${[['pending','Новые'],['active','Активные'],['completed','Завершённые'],['rejected','Отклонённые'],['all','Все']].map(([id,label]) => `<button type="button" data-workflow-filter="${id}" class="${state.requestFilter === id ? 'active' : ''}">${label}</button>`).join('')}
          </div>
          <span class="admin-workflow-count">${rows.length} из ${state.requestRows.length}</span>
        </div>
        <div class="admin-inbox-layout">
          <section class="admin-panel admin-inbox-list">
            <div class="admin-inbox-list-head"><div><strong>Заявки</strong><span>${state.requestFilter === 'pending' ? 'Сначала разберите новые' : 'Фильтр текущего списка'}</span></div><button type="button" data-workflow-refresh>${ico('refresh-cw')}</button></div>
            <div class="admin-inbox-list-body">${rows.length ? rows.map(requestRow).join('') : '<div class="admin-empty">По этому фильтру заявок нет.</div>'}</div>
          </section>
          <section class="admin-panel admin-inbox-detail" id="adminInboxDetail"><div class="admin-inbox-detail-placeholder">${ico('panel-right-open')}<strong>Выберите заявку</strong><span>Данные, контент и действия появятся здесь.</span></div></section>
        </div>
      </section>`;

      bindRequestList();
      icons();
      if (state.selectedRequestId) void openRequest(state.selectedRequestId);
      return true;
    } catch (error) {
      if (!stale('requests', error)) errorBox(error.message, () => void renderRequests());
      return false;
    }
  }

  function bindRequestList() {
    const input = document.getElementById('adminWorkflowSearch');
    input?.addEventListener('input', event => {
      clearTimeout(requestSearchTimer);
      const value = event.currentTarget.value.trim();
      requestSearchTimer = setTimeout(() => {
        if (!isActive('requests')) return;
        state.requestQuery = value;
        void renderRequests();
      }, 260);
    });
    input?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || !isActive('requests')) return;
      clearTimeout(requestSearchTimer);
      state.requestQuery = event.currentTarget.value.trim();
      void renderRequests();
    });
    document.querySelectorAll('[data-workflow-filter]').forEach(button => button.addEventListener('click', () => {
      if (!isActive('requests')) return;
      state.requestFilter = button.dataset.workflowFilter;
      state.selectedRequestId = null;
      void renderRequests({ selectFirst: true });
    }));
    document.querySelectorAll('[data-workflow-request]').forEach(button => button.addEventListener('click', () => {
      if (!isActive('requests')) return;
      state.selectedRequestId = Number(button.dataset.workflowRequest);
      document.querySelectorAll('[data-workflow-request]').forEach(row => row.classList.toggle('selected', Number(row.dataset.workflowRequest) === state.selectedRequestId));
      void openRequest(state.selectedRequestId);
    }));
    document.querySelector('[data-workflow-refresh]')?.addEventListener('click', () => { if (isActive('requests')) void renderRequests(); });
  }

  async function openRequest(id) {
    const box = document.getElementById('adminInboxDetail');
    if (!box || !isActive('requests')) return;
    box.innerHTML = `<div class="admin-loading">${ico('loader-circle')} Открываем #${id}…</div>`;
    icons();
    try {
      const data = await api(`/api/app/admin/requests/${id}`);
      if (!isActive('requests') || Number(state.selectedRequestId) !== Number(id) || !box.isConnected) return;
      paintRequestDetail(box, data);
    } catch (error) {
      if (stale('requests', error) || Number(state.selectedRequestId) !== Number(id) || !box.isConnected) return;
      box.innerHTML = `<div class="admin-workflow-inline-error">${ico('triangle-alert')}<strong>Не удалось открыть заявку</strong><span>${esc(error.message)}</span><button type="button" data-request-retry>Повторить</button></div>`;
      box.querySelector('[data-request-retry]')?.addEventListener('click', () => void openRequest(id));
      icons();
    }
  }

  function paintRequestDetail(box, data) {
    const r = data.request || {};
    const meta = data.admin_meta || {};
    const pubs = data.publications || [];
    const audit = data.audit || [];
    const pending = r.status === 'pending';
    const queued = r.status === 'accepted' && r.queue_status === 'queued';
    const working = r.status === 'accepted' && r.queue_status === 'in_progress';
    const completed = r.status === 'accepted' && r.queue_status === 'completed';
    const safeSource = /^https?:\/\//i.test(String(r.source_url || '')) ? esc(r.source_url) : '';

    box.innerHTML = `<div class="admin-inbox-detail-head">
      <div><span class="admin-card-id">ЗАЯВКА #${r.id}</span><h2>${esc(r.title)}</h2><p>${r.username ? `@${esc(r.username)} · ` : ''}${r.user_id} · ${r.plan === 'subscriber' ? 'Boosty' : 'Обычный'}</p></div>
      <span class="admin-badge ${statusKey(r)}">${statusLabel(r)}</span>
    </div>
    <div class="admin-inbox-facts">
      <div><span>Язык</span><strong>${esc(r.original_language || '—')}</strong></div>
      <div><span>Глав</span><strong>${Number(r.chapter_count || 0)}</strong></div>
      <div><span>Оригинал</span><strong>${r.publication_status === 'completed' ? 'Завершён' : 'Продолжается'}</strong></div>
      <div><span>Обновлено</span><strong>${fmt(r.updated_at)}</strong></div>
    </div>
    ${safeSource ? `<a class="admin-source-link" href="${safeSource}" target="_blank" rel="noopener noreferrer">${ico('external-link')} Открыть оригинал</a>` : ''}
    ${queued ? `<div class="admin-inbox-queue-position"><span>Позиция в очереди</span><strong>#${r.queue_position ?? '—'}</strong></div>` : ''}
    ${working ? `<div class="admin-inbox-progress"><div><span>Прогресс</span><strong>${Number(r.current_chapter || 0)} / ${Number(r.chapter_count || 0)}</strong></div><div><input id="workflowProgress" type="number" min="0" max="${Number(r.chapter_count || 0)}" value="${Number(r.current_chapter || 0)}"><button type="button" data-workflow-action="progress" data-id="${r.id}">${ico('save')} Сохранить</button></div><small>${r.progress_updated_at ? `Сохранено ${fmt(r.progress_updated_at)}` : 'Прогресс ещё не сохранялся'}</small></div>` : ''}
    <section class="admin-inbox-disclosure"><h3>Жанры и теги</h3><p>${esc(r.genres_tags || '—')}</p></section>
    <section class="admin-inbox-disclosure"><h3>Sexual content</h3><p>${esc(r.sexual_content || '—')}</p></section>
    <section class="admin-inbox-disclosure"><h3>Sensitive content</h3><p>${esc(r.sensitive_content || '—')}</p></section>
    <section class="admin-inbox-notes"><div><h3>Внутренние заметки</h3><span>Пользователь их не видит</span></div><textarea id="workflowAdminNotes" rows="4" maxlength="4000" placeholder="Контекст, договорённости, проблемы…">${esc(meta.notes || '')}</textarea><button type="button" data-workflow-save-notes="${r.id}">${ico('save')} Сохранить заметку</button></section>
    <div class="admin-inbox-primary-actions">
      ${pending ? `<button type="button" class="ok" data-workflow-action="accept" data-action="accept" data-id="${r.id}">${ico('check')} Принять</button><button type="button" class="bad" data-workflow-action="reject" data-action="reject" data-id="${r.id}">${ico('x')} Отклонить</button><button type="button" data-workflow-action="return" data-action="return" data-id="${r.id}">${ico('rotate-ccw')} Отклонить + вернуть слот</button>` : ''}
      ${queued ? `<button type="button" class="ok" data-workflow-action="start" data-action="start" data-id="${r.id}">${ico('play')} Начать перевод</button>` : ''}
      ${working ? `<button type="button" class="ok" data-workflow-action="complete" data-action="complete" data-id="${r.id}">${ico('circle-check')} Завершить</button><button type="button" data-workflow-action="backqueue" data-action="backqueue" data-id="${r.id}">${ico('undo-2')} Вернуть в очередь</button>` : ''}
      ${completed ? `<button type="button" data-workflow-action="reopen" data-action="reopen" data-id="${r.id}">${ico('rotate-ccw')} Вернуть в работу</button>` : ''}
    </div>
    <div class="admin-inbox-secondary-actions"><button type="button" data-workflow-raw="${r.id}">${ico('paperclip')} Raw-файл</button><button type="button" data-workflow-publication="${r.id}" data-title="${esc(r.title)}">${ico('send')} Создать публикацию</button><button type="button" data-workflow-advanced="${r.id}">${ico('sliders-horizontal')} Расширенное управление</button></div>
    <div class="admin-inbox-meta-line"><span>${pubs.length} связанных публикаций</span><span>${audit.length} событий в истории</span></div>`;

    box.querySelectorAll('[data-workflow-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.workflowAction;
      const extra = action === 'progress' ? { current_chapter: Number(document.getElementById('workflowProgress')?.value) } : {};
      void runRequestAction(action, Number(button.dataset.id), extra);
    }));
    box.querySelector('[data-workflow-save-notes]')?.addEventListener('click', event => void saveNotes(Number(event.currentTarget.dataset.workflowSaveNotes)));
    box.querySelector('[data-workflow-raw]')?.addEventListener('click', event => void sendRaw(Number(event.currentTarget.dataset.workflowRaw)));
    box.querySelector('[data-workflow-publication]')?.addEventListener('click', event => createPublication(Number(event.currentTarget.dataset.workflowPublication), event.currentTarget.dataset.title || ''));
    box.querySelector('[data-workflow-advanced]')?.addEventListener('click', event => {
      clearTimeout(requestSearchTimer);
      const id = Number(event.currentTarget.dataset.workflowAdvanced);
      const ops = window.DTL_ADMIN_REQUEST_OPS;
      if (!ops?.open) { toast('Расширенное управление временно недоступно.', true); return; }
      void ops.open(id);
    });
    icons();
  }

  async function saveNotes(id) {
    try {
      const notes = document.getElementById('workflowAdminNotes')?.value || '';
      await api(`/api/app/admin/requests/${id}/meta`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes }),
      });
      toast('Заметка сохранена.');
    } catch (error) { toast(error.message, true); }
  }

  async function sendRaw(id) {
    try {
      await api(`/api/app/admin/requests/${id}/raw`, { method: 'POST' });
      toast('Raw-файл отправлен вам в Telegram.');
    } catch (error) { toast(error.message, true); }
  }

  function createPublication(id, title) {
    try {
      sessionStorage.setItem('dtl:publicationSubmissionId', String(id));
      sessionStorage.setItem('dtl:publicationSubmissionTitle', String(title || ''));
    } catch {}
    void adminRuntime.open('section:publishing');
  }

  async function runRequestAction(action, id, extra = {}) {
    try {
      await api('/api/app/admin/action', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }),
      });
      toast(action === 'progress' ? 'Прогресс сохранён.' : 'Готово.');
      if (!isActive('requests')) return;
      const autoNext = state.requestFilter === 'pending' && ['accept','reject','return'].includes(action);
      if (autoNext) state.selectedRequestId = null;
      await renderRequests({ selectFirst: autoNext });
    } catch (error) { toast(error.message, true); }
  }

  async function renderQueue() {
    if (adminRuntime.activeRoute?.() !== routeId('queue')) return false;
    state.active = 'queue';
    markActive('queue');
    setHead('Очередь', 'Порядок переводов, активная работа и прогресс в одном экране');
    loading('Загружаем очередь…');
    try {
      const data = await api('/api/app/admin/list?kind=queue');
      if (!isActive('queue')) return false;
      state.queueRows = data.requests || [];
      const working = state.queueRows.filter(r => r.queue_status === 'in_progress');
      const queued = state.queueRows.filter(r => r.queue_status === 'queued');
      const root = area();
      if (!root || !isActive('queue')) return false;
      root.innerHTML = `<section class="admin-workflow admin-queue-workflow">
        <div class="admin-queue-summary">
          <div class="admin-panel"><span>В работе</span><strong>${working.length}</strong><small>Активные переводы</small></div>
          <div class="admin-panel"><span>В очереди</span><strong>${queued.length}</strong><small>Ожидают начала</small></div>
          <button type="button" class="admin-panel admin-queue-refresh" data-queue-refresh>${ico('refresh-cw')}<span><strong>Обновить</strong><small>Получить живое состояние</small></span></button>
        </div>
        ${working.length ? `<section class="admin-queue-active"><div class="admin-workflow-section-head"><div><h2>Сейчас в работе</h2><p>Прогресс сохраняется сразу и показывает время последнего обновления.</p></div></div>${working.map(activeQueueCard).join('')}</section>` : ''}
        <section class="admin-panel admin-queue-list-panel"><div class="admin-workflow-section-head"><div><h2>Дальше в очереди</h2><p>На desktop можно перетаскивать строки. На мобильном используйте стрелки.</p></div><span>${queued.length}</span></div><div class="admin-queue-list">${queued.length ? queued.map(queueRow).join('') : '<div class="admin-empty">Очередь пуста.</div>'}</div></section>
      </section>`;
      bindQueue();
      icons();
      return true;
    } catch (error) {
      if (!stale('queue', error)) errorBox(error.message, () => void renderQueue());
      return false;
    }
  }

  function activeQueueCard(r) {
    const total = Number(r.chapter_count || 0);
    const current = Number(r.current_chapter || 0);
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : 0;
    return `<article class="admin-panel admin-active-translation">
      <div class="admin-active-head"><div><span class="admin-card-id">ЗАЯВКА #${r.id}</span><h3>${esc(r.title)}</h3><p>${esc(r.original_language)} · ${total} глав${r.username ? ` · @${esc(r.username)}` : ''}</p></div><span class="admin-badge working">В работе</span></div>
      <div class="admin-active-progress"><div><span style="width:${percent}%"></span></div><strong>${percent}%</strong></div>
      <div class="admin-active-controls"><label><span>Текущая глава</span><div><input id="queue-progress-${r.id}" type="number" min="0" max="${total}" value="${current}"><span>/ ${total}</span></div><small>${r.progress_updated_at ? `Сохранено ${fmt(r.progress_updated_at)}` : 'Ещё не сохранялось'}</small></label><div><button type="button" class="primary" data-queue-action="progress" data-id="${r.id}">${ico('save')} Сохранить прогресс</button><button type="button" data-queue-action="complete" data-action="complete" data-id="${r.id}">${ico('circle-check')} Завершить</button><button type="button" data-queue-action="backqueue" data-action="backqueue" data-id="${r.id}">${ico('undo-2')} В очередь</button></div></div>
    </article>`;
  }

  function queueRow(r) {
    return `<article class="admin-queue-row" draggable="true" data-queue-row="${r.id}">
      <button type="button" class="admin-queue-handle" tabindex="-1" aria-label="Перетащить">${ico('grip-vertical')}</button>
      <span class="admin-queue-position">${Number(r.queue_position || 0)}</span>
      <div class="admin-queue-copy"><strong>${esc(r.title)}</strong><span>${esc(r.original_language)} · ${Number(r.chapter_count || 0)} глав${r.username ? ` · @${esc(r.username)}` : ''}</span></div>
      <div class="admin-queue-row-actions"><button type="button" class="start" data-queue-action="start" data-action="start" data-id="${r.id}">${ico('play')}<span>Начать</span></button><button type="button" data-queue-action="up" data-id="${r.id}" aria-label="Выше">${ico('arrow-up')}</button><button type="button" data-queue-action="down" data-id="${r.id}" aria-label="Ниже">${ico('arrow-down')}</button></div>
    </article>`;
  }

  function bindQueue() {
    document.querySelector('[data-queue-refresh]')?.addEventListener('click', () => { if (isActive('queue')) void renderQueue(); });
    document.querySelectorAll('[data-queue-action]').forEach(button => button.addEventListener('click', () => {
      if (!isActive('queue')) return;
      const action = button.dataset.queueAction;
      const id = Number(button.dataset.id);
      const extra = action === 'progress' ? { current_chapter: Number(document.getElementById(`queue-progress-${id}`)?.value) } : {};
      void queueAction(action, id, extra);
    }));

    document.querySelectorAll('[data-queue-row]').forEach(row => {
      row.addEventListener('dragstart', event => {
        if (!isActive('queue')) return;
        state.dragRequestId = Number(row.dataset.queueRow);
        row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(state.dragRequestId)); } catch {}
      });
      row.addEventListener('dragover', event => {
        if (!isActive('queue')) return;
        event.preventDefault();
        const dragging = document.querySelector('.admin-queue-row.dragging');
        if (!dragging || dragging === row) return;
        const rect = row.getBoundingClientRect();
        row.parentElement?.insertBefore(dragging, event.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
        renumberQueueDom();
      });
      row.addEventListener('drop', event => { if (isActive('queue')) event.preventDefault(); });
      row.addEventListener('dragend', () => void finishQueueDrag(row));
    });
  }

  function renumberQueueDom() {
    document.querySelectorAll('.admin-queue-row').forEach((row, index) => {
      const pos = row.querySelector('.admin-queue-position');
      if (pos) pos.textContent = String(index + 1);
    });
  }

  async function finishQueueDrag(row) {
    row.classList.remove('dragging');
    const id = state.dragRequestId;
    state.dragRequestId = null;
    if (!id || !isActive('queue')) return;
    const rows = [...document.querySelectorAll('.admin-queue-row')];
    const position = rows.findIndex(item => Number(item.dataset.queueRow) === Number(id)) + 1;
    const original = state.queueRows.find(item => Number(item.id) === Number(id));
    if (!position || Number(original?.queue_position) === position) return;
    try {
      await api(`/api/app/admin/requests/${id}/queue-position`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ position }),
      });
      toast(`Позиция #${position} сохранена.`);
      if (isActive('queue')) await renderQueue();
    } catch (error) {
      toast(error.message, true);
      if (isActive('queue')) await renderQueue();
    }
  }

  async function queueAction(action, id, extra = {}) {
    try {
      await api('/api/app/admin/action', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }),
      });
      toast(action === 'progress' ? 'Прогресс сохранён.' : 'Очередь обновлена.');
      if (isActive('queue')) await renderQueue();
    } catch (error) { toast(error.message, true); }
  }

  function decorateNavigation() {
    const admin = document.querySelector('.admin-v2');
    if (!admin) return;
    for (const nav of admin.querySelectorAll('.admin-side-nav,.admin-mobile-nav')) {
      const publishing = nav.querySelector('[data-admin-section="publishing"] span');
      if (publishing) publishing.textContent = 'Публикации';
      const requests = nav.querySelector('[data-admin-section="requests"]');
      const queue = nav.querySelector('[data-admin-section="queue"]');
      if (requests) requests.title = 'Проверка и управление заявками';
      if (queue) queue.title = 'Порядок переводов и прогресс';
    }
  }

  adminRuntime.registerRoute('section:requests', {
    mount: () => renderRequests(),
    refresh: () => renderRequests(),
    unmount: () => deactivate('requests'),
  });
  adminRuntime.registerRoute('section:queue', {
    mount: () => renderQueue(),
    refresh: () => renderQueue(),
    unmount: () => deactivate('queue'),
  });

  document.addEventListener('dtl:adminrender', decorateNavigation);
  runtime.registerPatcher(decorateNavigation);

  window.DTL_ADMIN_WORKFLOW = Object.freeze({
    openRequests: () => adminRuntime.open('section:requests'),
    openQueue: () => adminRuntime.open('section:queue'),
    refresh: () => adminRuntime.refresh(),
    deactivate,
    state: () => ({ ...state, requestRows: undefined, queueRows: undefined }),
  });
})();
