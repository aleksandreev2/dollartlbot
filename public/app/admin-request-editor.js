(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.api) throw new Error('Canonical admin runtime must load before admin-request-editor.js');

  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  let settleTimer = 0;

  function requestIdFromOps() {
    const text = document.querySelector('.request-ops-topbar > div:nth-child(2) > span')?.textContent || '';
    const match = /#(\d+)/.exec(text);
    return match ? Number(match[1]) : 0;
  }

  function requestIdFromDetail() {
    return Number(document.querySelector('#adminInboxDetail [data-workflow-advanced]')?.dataset.workflowAdvanced || 0);
  }

  function improveLauncher() {
    document.querySelectorAll('[data-workflow-advanced]').forEach(button => {
      button.classList.add('request-editor-launch');
      button.innerHTML = `${ico('sliders-horizontal')}<span>Все параметры</span>`;
    });
  }

  function installQuickEditor() {
    const detail = document.getElementById('adminInboxDetail');
    if (!detail) return;
    const id = requestIdFromDetail();
    if (!id) return;

    const existing = detail.querySelector('[data-request-quick-editor]');
    if (existing?.dataset.requestQuickEditor === String(id)) return;
    existing?.remove();

    const head = detail.querySelector('.admin-inbox-detail-head');
    const facts = detail.querySelector('.admin-inbox-facts');
    if (!head || !facts) return;
    const title = head.querySelector('h2')?.textContent?.trim() || '';
    const chapters = Number(facts.querySelector(':scope > div:nth-child(2) strong')?.textContent || 0);

    const quick = document.createElement('section');
    quick.className = 'request-quick-editor';
    quick.dataset.requestQuickEditor = String(id);
    quick.dataset.baselineTitle = title;
    quick.dataset.baselineChapters = String(chapters);
    quick.innerHTML = `
      <div class="request-quick-cover" data-quick-cover>
        <div class="request-quick-cover-preview"><img alt="Обложка заявки #${id}" decoding="async"><span>${ico('image')}</span></div>
        <div class="request-quick-cover-actions">
          <button type="button" data-quick-cover-replace title="Заменить обложку">${ico('image-up')}</button>
          <button type="button" data-quick-cover-remove title="Удалить обложку">${ico('trash-2')}</button>
        </div>
      </div>
      <div class="request-quick-fields">
        <div class="request-quick-heading"><div><strong>Быстрое редактирование</strong><span>Основные данные без ухода со списка</span></div><span class="request-quick-save-state" data-quick-save-state>Без изменений</span></div>
        <label><span>Название</span><input data-quick-title maxlength="300" value="${escapeAttr(title)}"></label>
        <div class="request-quick-row"><label><span>Количество глав</span><input data-quick-chapters type="number" min="1" max="10000000" value="${chapters}"></label><button type="button" class="request-quick-save" data-quick-save disabled>${ico('save')}<span>Сохранить</span></button></div>
      </div>`;
    head.after(quick);

    const titleInput = quick.querySelector('[data-quick-title]');
    const chapterInput = quick.querySelector('[data-quick-chapters]');
    titleInput?.addEventListener('input', () => syncQuickDirty(quick));
    chapterInput?.addEventListener('input', () => syncQuickDirty(quick));
    quick.querySelector('[data-quick-save]')?.addEventListener('click', () => void saveQuick(id, quick));
    quick.querySelector('[data-quick-cover-replace]')?.addEventListener('click', () => chooseCover(id, quick, true));
    quick.querySelector('[data-quick-cover-remove]')?.addEventListener('click', () => removeCover(id, quick, true));
    quick.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
        event.preventDefault();
        if (!quick.querySelector('[data-quick-save]')?.disabled) void saveQuick(id, quick);
      }
    });
    refreshQuickCover(id, quick);
    admin.icons?.();
  }

  function escapeAttr(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function syncQuickDirty(root) {
    const title = root.querySelector('[data-quick-title]')?.value.trim() || '';
    const chapters = Number(root.querySelector('[data-quick-chapters]')?.value || 0);
    const dirty = title !== root.dataset.baselineTitle || chapters !== Number(root.dataset.baselineChapters || 0);
    const button = root.querySelector('[data-quick-save]');
    const status = root.querySelector('[data-quick-save-state]');
    if (button && root.dataset.saving !== '1') button.disabled = !dirty;
    if (status && root.dataset.saving !== '1') {
      status.textContent = dirty ? 'Есть изменения' : 'Без изменений';
      status.className = `request-quick-save-state ${dirty ? 'dirty' : ''}`.trim();
    }
  }

  async function saveQuick(id, root) {
    if (root.dataset.saving === '1') return;
    const title = root.querySelector('[data-quick-title]')?.value.trim() || '';
    const chapterCount = Number(root.querySelector('[data-quick-chapters]')?.value || 0);
    if (!title) return setQuickStatus(root, 'Введите название.', 'error');
    if (!Number.isInteger(chapterCount) || chapterCount < 1) return setQuickStatus(root, 'Некорректное число глав.', 'error');

    root.dataset.saving = '1';
    const button = root.querySelector('[data-quick-save]');
    if (button) button.disabled = true;
    setQuickStatus(root, 'Сохраняем…', 'saving');
    try {
      const data = await admin.api(`/api/app/admin/requests/${id}/edit`, {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ title, chapter_count:chapterCount }),
      });
      if (!root.isConnected || Number(requestIdFromDetail()) !== Number(id)) return;
      const request = data.request || {};
      root.dataset.baselineTitle = String(request.title || title);
      root.dataset.baselineChapters = String(Number(request.chapter_count || chapterCount));
      const titleInput = root.querySelector('[data-quick-title]');
      const chapterInput = root.querySelector('[data-quick-chapters]');
      if (titleInput) titleInput.value = root.dataset.baselineTitle;
      if (chapterInput) chapterInput.value = root.dataset.baselineChapters;
      patchVisibleRequest(request);
      setQuickStatus(root, `Сохранено · ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`, 'saved');
      admin.toast?.('Заявка сохранена.');
    } catch (error) {
      setQuickStatus(root, error?.message || 'Не удалось сохранить.', 'error');
    } finally {
      delete root.dataset.saving;
      syncQuickDirty(root);
    }
  }

  function setQuickStatus(root, text, tone = '') {
    const status = root.querySelector('[data-quick-save-state]');
    if (!status) return;
    status.textContent = text;
    status.className = `request-quick-save-state ${tone}`.trim();
  }

  function patchVisibleRequest(request) {
    const id = Number(request.id || requestIdFromDetail());
    const detail = document.getElementById('adminInboxDetail');
    const heading = detail?.querySelector('.admin-inbox-detail-head h2');
    if (heading) heading.textContent = request.title || heading.textContent;
    const chapterFact = detail?.querySelector('.admin-inbox-facts > div:nth-child(2) strong');
    if (chapterFact) chapterFact.textContent = String(Number(request.chapter_count || 0));
    const progress = detail?.querySelector('.admin-inbox-progress');
    if (progress) {
      const strong = progress.querySelector('strong');
      if (strong) strong.textContent = `${Number(request.current_chapter || 0)} / ${Number(request.chapter_count || 0)}`;
      const input = progress.querySelector('input');
      if (input) input.max = String(Number(request.chapter_count || 0));
    }
    const row = document.querySelector(`[data-workflow-request="${id}"]`);
    const rowTitle = row?.querySelector('.admin-inbox-row-top strong');
    if (rowTitle) rowTitle.textContent = `#${id} · ${request.title || ''}`;
    const rowMeta = row?.querySelector('.admin-inbox-copy > span:nth-of-type(2)');
    if (rowMeta) rowMeta.textContent = `${request.original_language || '—'} · ${Number(request.chapter_count || 0)} глав${request.username ? ` · @${request.username}` : ''}`;
  }

  function refreshQuickCover(id, root) {
    const preview = root.querySelector('.request-quick-cover-preview');
    const img = preview?.querySelector('img');
    const remove = root.querySelector('[data-quick-cover-remove]');
    if (!preview || !img) return;
    preview.classList.remove('has-cover');
    if (remove) remove.disabled = true;
    img.onload = () => { if (img.isConnected) { preview.classList.add('has-cover'); if (remove) remove.disabled = false; } };
    img.onerror = () => { if (img.isConnected) { preview.classList.remove('has-cover'); if (remove) remove.disabled = true; } };
    img.src = `/media/covers/${id}?quick_edit=${Date.now()}`;
  }

  function installCoverEditor() {
    const editor = document.querySelector('.request-ops-editor');
    if (!editor || editor.querySelector('[data-request-cover-editor]')) return;
    const id = requestIdFromOps();
    if (!id) return;
    const grid = editor.querySelector('.request-edit-grid');
    if (!grid) return;

    const cover = document.createElement('section');
    cover.className = 'request-cover-editor';
    cover.dataset.requestCoverEditor = String(id);
    cover.innerHTML = `
      <div class="request-cover-preview" data-request-cover-preview><img alt="Обложка заявки #${id}" loading="eager" decoding="async"><div class="request-cover-placeholder">${ico('image')}<span>Нет обложки</span></div></div>
      <div class="request-cover-copy"><div><span class="request-cover-kicker">ОБЛОЖКА</span><h3>Обложка заявки</h3><p>JPEG, PNG, WebP или AVIF · до 8 МБ</p></div><div class="request-cover-actions"><button type="button" data-request-cover-replace>${ico('image-up')}<span>Заменить</span></button><button type="button" data-request-cover-remove>${ico('trash-2')}<span>Удалить</span></button></div></div>`;
    grid.before(cover);
    cover.querySelector('[data-request-cover-replace]')?.addEventListener('click', () => chooseCover(id, cover, false));
    cover.querySelector('[data-request-cover-remove]')?.addEventListener('click', () => removeCover(id, cover, false));
    refreshCover(id, cover);
    admin.icons?.();
  }

  function refreshCover(id, root) {
    const preview = root.querySelector('[data-request-cover-preview]');
    const img = preview?.querySelector('img');
    const remove = root.querySelector('[data-request-cover-remove]');
    if (!preview || !img) return;
    preview.classList.remove('has-cover');
    if (remove) remove.disabled = true;
    img.onload = () => { if (img.isConnected) { preview.classList.add('has-cover'); if (remove) remove.disabled = false; } };
    img.onerror = () => { if (img.isConnected) { preview.classList.remove('has-cover'); if (remove) remove.disabled = true; } };
    img.src = `/media/covers/${id}?admin_edit=${Date.now()}`;
  }

  function chooseCover(id, root, quick) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp,image/avif'; input.hidden = true;
    document.body.append(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { input.remove(); return; }
      if (file.size > 8 * 1024 * 1024) { admin.toast?.('Обложка должна быть не больше 8 МБ.', true); input.remove(); return; }
      const replace = root.querySelector(quick ? '[data-quick-cover-replace]' : '[data-request-cover-replace]');
      if (replace) replace.disabled = true;
      try {
        const form = new FormData(); form.set('cover', file, file.name);
        await admin.api(`/api/app/admin/cover/${id}`, { method:'POST', body:form });
        if (quick) refreshQuickCover(id, root); else refreshCover(id, root);
        admin.toast?.('Обложка заявки обновлена.');
      } catch (error) { admin.toast?.(error?.message || 'Не удалось обновить обложку.', true); }
      finally { if (replace) replace.disabled = false; input.remove(); }
    }, { once:true });
    input.click();
  }

  async function removeCover(id, root, quick) {
    const selector = quick ? '[data-quick-cover-remove]' : '[data-request-cover-remove]';
    const remove = root.querySelector(selector);
    if (!remove || remove.disabled) return;
    const confirmed = window.DTL_ADMIN_STABILITY?.confirm
      ? await window.DTL_ADMIN_STABILITY.confirm({ title:'Удалить обложку?', body:'У заявки останется стандартная обложка-заглушка.', confirm:'Удалить', danger:true })
      : window.confirm('Удалить обложку заявки?');
    if (!confirmed) return;
    remove.disabled = true;
    try {
      await admin.api(`/api/app/admin/cover/${id}`, { method:'DELETE' });
      if (quick) refreshQuickCover(id, root); else refreshCover(id, root);
      admin.toast?.('Обложка удалена.');
    } catch (error) { admin.toast?.(error?.message || 'Не удалось удалить обложку.', true); remove.disabled = false; }
  }

  function install() {
    if (admin.activeRoute?.() !== 'section:requests') return;
    improveLauncher();
    installQuickEditor();
    installCoverEditor();
    admin.icons?.();
  }

  function settle() {
    clearTimeout(settleTimer);
    let remaining = 10;
    const tick = () => {
      install();
      if (--remaining > 0 && admin.activeRoute?.() === 'section:requests') settleTimer = setTimeout(tick, 90);
    };
    tick();
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-workflow-request],[data-workflow-advanced],#requestOpsBack')) return;
    setTimeout(settle, 0);
  }, true);
  document.addEventListener('dtl:adminroutechange', event => { if (event.detail?.id === 'section:requests') settle(); });

  runtime.registerPatcher(install);
  window.DTL_ADMIN_REQUEST_EDITOR = Object.freeze({ refresh:settle });
})();
