(() => {
  const admin = window.DTL_ADMIN;
  if (!admin?.registerRoute || !admin?.api || !admin?.open) throw new Error('Queue workspace requires canonical admin runtime.');

  const state = { rows: [], dragId: 0, completed: null, progressSeq: 0 };
  const ROUTE = 'section:queue';
  const active = () => admin.activeRoute?.() === ROUTE;
  const api = (path, options = {}) => admin.api(path, options);
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)); }
    catch { return String(value); }
  };

  function root() { return document.querySelector('.admin-content'); }
  function icons() { admin.icons?.(); }
  function toast(text, error = false) { admin.toast?.(text, error); }

  async function render() {
    if (!active()) return false;
    admin.setHead?.('Очередь', 'Текущий перевод, прогресс и следующий тайтл — без лишних переходов');
    const host = root();
    if (!host) return false;
    host.innerHTML = `<div class="admin-queue-workspace-loading">${ico('loader-circle')} Загружаем рабочую очередь…</div>`;
    icons();

    try {
      const data = await api('/api/app/admin/list?kind=queue');
      if (!active() || !host.isConnected) return false;
      state.rows = Array.isArray(data.requests) ? data.requests : [];
      const working = state.rows.filter(row => row.queue_status === 'in_progress');
      const queued = state.rows.filter(row => row.queue_status === 'queued').sort((a,b) => Number(a.queue_position || 0) - Number(b.queue_position || 0));

      host.innerHTML = `<section class="admin-queue-workspace">
        ${state.completed ? completedBanner(state.completed) : ''}
        <div class="admin-queue-workspace-summary">
          <div class="admin-panel"><span>${ico('languages')}</span><div><strong>${working.length}</strong><small>Сейчас переводим</small></div></div>
          <div class="admin-panel"><span>${ico('list-ordered')}</span><div><strong>${queued.length}</strong><small>Ждут в очереди</small></div></div>
          <button type="button" class="admin-panel admin-queue-workspace-refresh" data-qw-refresh>${ico('refresh-cw')}<div><strong>Обновить</strong><small>Получить живое состояние</small></div></button>
        </div>

        <section class="admin-queue-workspace-section">
          <div class="admin-queue-workspace-head"><div><span class="admin-queue-workspace-kicker">В РАБОТЕ</span><h2>Сейчас переводим</h2><p>Прогресс сохраняется прямо здесь. Название открывает карточку заявки.</p></div></div>
          <div class="admin-queue-working-list">${working.length ? working.map(activeCard).join('') : `<div class="admin-panel admin-queue-workspace-empty">${ico('circle-dashed')}<div><strong>Активного перевода нет</strong><span>Запусти следующий тайтл из очереди ниже.</span></div></div>`}</div>
        </section>

        <section class="admin-panel admin-queue-workspace-list-panel">
          <div class="admin-queue-workspace-head"><div><span class="admin-queue-workspace-kicker">ДАЛЬШЕ</span><h2>Очередь переводов</h2><p>Перетаскивай на desktop или используй понятные кнопки порядка на мобильном.</p></div><b>${queued.length}</b></div>
          <div class="admin-queue-workspace-list">${queued.length ? queued.map(queueRow).join('') : `<div class="admin-queue-workspace-empty compact">${ico('circle-check')}<div><strong>Очередь пуста</strong><span>Новых принятых заявок пока нет.</span></div></div>`}</div>
        </section>
      </section>`;
      bind();
      icons();
      queueMicrotask(() => window.DTL_ADMIN_NAVIGATION?.refresh?.());
      return true;
    } catch (error) {
      if (!active() || error?.name === 'AbortError') return false;
      host.innerHTML = `<div class="admin-panel admin-queue-workspace-error">${ico('triangle-alert')}<div><strong>Не удалось загрузить очередь</strong><span>${esc(error?.message || error)}</span></div><button type="button" data-qw-refresh>${ico('refresh-cw')} Повторить</button></div>`;
      host.querySelector('[data-qw-refresh]')?.addEventListener('click', () => void render());
      icons();
      return false;
    }
  }

  function completedBanner(item) {
    return `<section class="admin-queue-completed-banner">
      <span>${ico('circle-check-big')}</span>
      <div><strong>Перевод завершён: ${esc(item.title)}</strong><small>Следующий логичный шаг — подготовить публикацию.</small></div>
      <div><button type="button" class="primary" data-qw-publish="${Number(item.id)}" data-title="${esc(item.title)}">${ico('send')} Создать публикацию</button><button type="button" data-qw-dismiss>${ico('x')} Скрыть</button></div>
    </section>`;
  }

  function activeCard(row) {
    const id = Number(row.id);
    const total = Number(row.chapter_count || 0);
    const current = Number(row.current_chapter || 0);
    const percent = progressPercent(current, total);
    return `<article class="admin-panel admin-queue-working-card" data-qw-working="${id}" data-total="${total}">
      <div class="admin-queue-working-top">
        <div class="admin-queue-working-title"><span class="admin-card-id">ЗАЯВКА #${id}</span><button type="button" data-qw-request="${id}">${esc(row.title)} ${ico('arrow-up-right')}</button><small>${esc(row.original_language || '—')} · ${total} глав${row.username ? ` · @${esc(row.username)}` : ''}</small></div>
        <span class="admin-badge working">В работе</span>
      </div>
      <div class="admin-queue-working-progress"><div><span data-qw-progress-bar style="width:${percent}%"></span></div><strong data-qw-progress-percent>${percent}%</strong></div>
      <div class="admin-queue-working-controls">
        <label><span>Текущая глава</span><div><input data-qw-progress-input="${id}" type="number" inputmode="numeric" min="0" max="${total}" value="${current}"><b>/ ${total}</b></div><small data-qw-progress-status>${row.progress_updated_at ? `Сохранено ${fmt(row.progress_updated_at)}` : 'Прогресс ещё не сохранялся'}</small></label>
        <div class="admin-queue-working-actions">
          <button type="button" class="primary" data-qw-action="progress" data-id="${id}">${ico('save')} Сохранить</button>
          <button type="button" data-qw-edit="${id}">${ico('pencil')} Редактировать заявку</button>
          <button type="button" class="success" data-qw-action="complete" data-id="${id}">${ico('circle-check')} Завершить</button>
          <button type="button" data-qw-action="backqueue" data-id="${id}">${ico('undo-2')} Вернуть в очередь</button>
        </div>
      </div>
    </article>`;
  }

  function queueRow(row) {
    const id = Number(row.id);
    return `<article class="admin-queue-workspace-row" draggable="true" data-qw-row="${id}">
      <button type="button" class="admin-queue-workspace-handle" tabindex="-1" aria-label="Перетащить заявку #${id}">${ico('grip-vertical')}</button>
      <span class="admin-queue-workspace-position">${Number(row.queue_position || 0)}</span>
      <button type="button" class="admin-queue-workspace-title" data-qw-request="${id}"><strong>${esc(row.title)}</strong><small>${esc(row.original_language || '—')} · ${Number(row.chapter_count || 0)} глав${row.username ? ` · @${esc(row.username)}` : ''}</small></button>
      <div class="admin-queue-workspace-row-actions">
        <button type="button" class="start" data-qw-action="start" data-id="${id}">${ico('play')} <span>Начать</span></button>
        <button type="button" class="edit" data-qw-edit="${id}">${ico('pencil')} <span>Редактировать</span></button>
        <button type="button" data-qw-action="up" data-id="${id}" aria-label="Поднять выше">${ico('arrow-up')} <span>Выше</span></button>
        <button type="button" data-qw-action="down" data-id="${id}" aria-label="Опустить ниже">${ico('arrow-down')} <span>Ниже</span></button>
      </div>
    </article>`;
  }

  function bind() {
    document.querySelectorAll('[data-qw-refresh]').forEach(button => button.addEventListener('click', () => { if (active()) void render(); }));
    document.querySelector('[data-qw-dismiss]')?.addEventListener('click', () => { state.completed = null; document.querySelector('.admin-queue-completed-banner')?.remove(); });
    document.querySelector('[data-qw-publish]')?.addEventListener('click', event => createPublication(Number(event.currentTarget.dataset.qwPublish), event.currentTarget.dataset.title || ''));

    document.querySelectorAll('[data-qw-request]').forEach(button => button.addEventListener('click', () => void openRequest(Number(button.dataset.qwRequest), false)));
    document.querySelectorAll('[data-qw-edit]').forEach(button => button.addEventListener('click', () => void openRequest(Number(button.dataset.qwEdit), true)));
    document.querySelectorAll('[data-qw-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.qwAction;
      const id = Number(button.dataset.id);
      if (action === 'progress') void saveProgress(id, button);
      else void runAction(action, id, button);
    }));
    document.querySelectorAll('[data-qw-progress-input]').forEach(input => input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const id = Number(input.dataset.qwProgressInput);
      const button = document.querySelector(`[data-qw-action="progress"][data-id="${id}"]`);
      if (button) void saveProgress(id, button);
    }));

    document.querySelectorAll('[data-qw-row]').forEach(row => {
      row.addEventListener('dragstart', event => {
        if (!active()) return;
        state.dragId = Number(row.dataset.qwRow);
        row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', String(state.dragId)); } catch {}
      });
      row.addEventListener('dragover', event => {
        if (!active()) return;
        event.preventDefault();
        const dragging = document.querySelector('.admin-queue-workspace-row.dragging');
        if (!dragging || dragging === row) return;
        const rect = row.getBoundingClientRect();
        row.parentElement?.insertBefore(dragging, event.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
        renumberDom();
      });
      row.addEventListener('drop', event => { if (active()) event.preventDefault(); });
      row.addEventListener('dragend', () => void finishDrag(row));
    });
  }

  async function saveProgress(id, button) {
    const card = document.querySelector(`[data-qw-working="${id}"]`);
    const input = card?.querySelector(`[data-qw-progress-input="${id}"]`);
    const status = card?.querySelector('[data-qw-progress-status]');
    const total = Number(card?.dataset.total || 0);
    const current = Number(input?.value);
    if (!Number.isInteger(current) || current < 0 || current > total) {
      if (status) { status.textContent = `Введите целое число от 0 до ${total}.`; status.classList.add('error'); }
      input?.focus();
      return;
    }
    const seq = ++state.progressSeq;
    button.disabled = true;
    if (status) { status.textContent = 'Сохраняем…'; status.classList.remove('error','saved'); }
    try {
      const result = await api('/api/app/admin/action', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ id, action:'progress', current_chapter:current }) });
      if (!active() || seq !== state.progressSeq || !card?.isConnected) return;
      const saved = Number(result.novel?.current_chapter ?? current);
      const percent = progressPercent(saved, total);
      if (input) input.value = String(saved);
      const bar = card.querySelector('[data-qw-progress-bar]');
      const pct = card.querySelector('[data-qw-progress-percent]');
      if (bar) bar.style.width = `${percent}%`;
      if (pct) pct.textContent = `${percent}%`;
      if (status) { status.textContent = `Сохранено ${fmt(result.novel?.progress_updated_at || new Date().toISOString())}`; status.classList.add('saved'); }
      const local = state.rows.find(row => Number(row.id) === id);
      if (local) { local.current_chapter = saved; local.progress_updated_at = result.novel?.progress_updated_at || new Date().toISOString(); }
    } catch (error) {
      if (status) { status.textContent = `Ошибка: ${error?.message || error}`; status.classList.add('error'); }
      toast(error?.message || String(error), true);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function runAction(action, id, button) {
    if (!id || !action) return;
    if (action === 'complete') {
      const row = state.rows.find(item => Number(item.id) === id);
      const ok = window.DTL_ADMIN_STABILITY?.confirm ? await window.DTL_ADMIN_STABILITY.confirm({ title:'Завершить перевод?', body:`${row?.title || `Заявка #${id}`} будет отмечена как завершённая.`, confirm:'Завершить' }) : true;
      if (!ok) return;
    }
    button.disabled = true;
    try {
      const result = await api('/api/app/admin/action', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ id, action }) });
      const row = state.rows.find(item => Number(item.id) === id);
      if (action === 'complete') state.completed = { id, title: result.novel?.title || row?.title || `Заявка #${id}` };
      toast(action === 'start' ? 'Перевод начат.' : action === 'complete' ? 'Перевод завершён.' : action === 'backqueue' ? 'Заявка возвращена в очередь.' : 'Очередь обновлена.');
      if (active()) await render();
    } catch (error) {
      toast(error?.message || String(error), true);
      if (button.isConnected) button.disabled = false;
    }
  }

  function progressPercent(current, total) {
    return total > 0 ? Math.max(0, Math.min(100, Math.round(Number(current || 0) / total * 100))) : 0;
  }

  function renumberDom() {
    document.querySelectorAll('.admin-queue-workspace-row').forEach((row, index) => {
      const position = row.querySelector('.admin-queue-workspace-position');
      if (position) position.textContent = String(index + 1);
    });
  }

  async function finishDrag(row) {
    row.classList.remove('dragging');
    const id = state.dragId;
    state.dragId = 0;
    if (!id || !active()) return;
    const rows = [...document.querySelectorAll('.admin-queue-workspace-row')];
    const position = rows.findIndex(item => Number(item.dataset.qwRow) === id) + 1;
    const original = state.rows.find(item => Number(item.id) === id);
    if (!position || Number(original?.queue_position) === position) return;
    try {
      await api(`/api/app/admin/requests/${id}/queue-position`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ position }) });
      toast(`Позиция #${position} сохранена.`);
      if (active()) await render();
    } catch (error) {
      toast(error?.message || String(error), true);
      if (active()) await render();
    }
  }

  async function openRequest(id, edit) {
    if (!id) return;
    await admin.open('section:requests');
    setTimeout(() => {
      if (edit && window.DTL_ADMIN_REQUEST_OPS?.open) { void window.DTL_ADMIN_REQUEST_OPS.open(id); return; }
      const row = document.querySelector(`[data-workflow-request="${id}"]`);
      if (row) row.click();
      else if (window.DTL_ADMIN_REQUEST_OPS?.open) void window.DTL_ADMIN_REQUEST_OPS.open(id);
    }, 40);
  }

  function createPublication(id, title) {
    try {
      sessionStorage.setItem('dtl:publicationSubmissionId', String(id));
      sessionStorage.setItem('dtl:publicationSubmissionTitle', String(title || ''));
    } catch {}
    void admin.open('section:publishing');
  }

  admin.registerRoute(ROUTE, { mount:render, refresh:render, unmount:() => { state.dragId = 0; } });
  window.DTL_ADMIN_QUEUE_WORKSPACE = Object.freeze({ refresh:render, openRequest });
})();