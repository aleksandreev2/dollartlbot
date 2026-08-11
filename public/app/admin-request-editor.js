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

  function improveLauncher() {
    document.querySelectorAll('[data-workflow-advanced]').forEach(button => {
      button.classList.add('request-editor-launch');
      button.innerHTML = `${ico('square-pen')}<span>Редактировать заявку</span>`;
      const parent = button.parentElement;
      if (parent && parent.firstElementChild !== button) parent.prepend(button);
    });
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
      <div class="request-cover-preview" data-request-cover-preview>
        <img alt="Обложка заявки #${id}" loading="eager" decoding="async">
        <div class="request-cover-placeholder">${ico('image')}<span>Нет обложки</span></div>
      </div>
      <div class="request-cover-copy">
        <div><span class="request-cover-kicker">ОБЛОЖКА</span><h3>Обложка заявки</h3><p>JPEG, PNG, WebP или AVIF · до 8 МБ</p></div>
        <div class="request-cover-actions">
          <button type="button" data-request-cover-replace>${ico('image-up')}<span>Заменить</span></button>
          <button type="button" data-request-cover-remove>${ico('trash-2')}<span>Удалить</span></button>
        </div>
      </div>`;
    grid.before(cover);

    cover.querySelector('[data-request-cover-replace]')?.addEventListener('click', () => chooseCover(id, cover));
    cover.querySelector('[data-request-cover-remove]')?.addEventListener('click', () => removeCover(id, cover));
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
    img.onload = () => {
      if (!img.isConnected) return;
      preview.classList.add('has-cover');
      if (remove) remove.disabled = false;
    };
    img.onerror = () => {
      if (!img.isConnected) return;
      preview.classList.remove('has-cover');
      if (remove) remove.disabled = true;
    };
    img.src = `/media/covers/${id}?admin_edit=${Date.now()}`;
  }

  function chooseCover(id, root) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/avif';
    input.hidden = true;
    document.body.append(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { input.remove(); return; }
      if (file.size > 8 * 1024 * 1024) {
        admin.toast?.('Обложка должна быть не больше 8 МБ.', true);
        input.remove();
        return;
      }
      const replace = root.querySelector('[data-request-cover-replace]');
      if (replace) replace.disabled = true;
      try {
        const form = new FormData();
        form.set('cover', file, file.name);
        await admin.api(`/api/app/admin/cover/${id}`, { method:'POST', body:form });
        refreshCover(id, root);
        admin.toast?.('Обложка заявки обновлена.');
      } catch (error) {
        admin.toast?.(error?.message || 'Не удалось обновить обложку.', true);
      } finally {
        if (replace) replace.disabled = false;
        input.remove();
      }
    }, { once:true });
    input.click();
  }

  async function removeCover(id, root) {
    const remove = root.querySelector('[data-request-cover-remove]');
    if (!remove || remove.disabled) return;
    const confirm = window.DTL_ADMIN_STABILITY?.confirm
      ? await window.DTL_ADMIN_STABILITY.confirm({ title:'Удалить обложку?', body:'У заявки останется стандартная обложка-заглушка.', confirm:'Удалить', danger:true })
      : window.confirm('Удалить обложку заявки?');
    if (!confirm) return;
    remove.disabled = true;
    try {
      await admin.api(`/api/app/admin/cover/${id}`, { method:'DELETE' });
      refreshCover(id, root);
      admin.toast?.('Обложка удалена.');
    } catch (error) {
      admin.toast?.(error?.message || 'Не удалось удалить обложку.', true);
      remove.disabled = false;
    }
  }

  function install() {
    if (admin.activeRoute?.() !== 'section:requests') return;
    improveLauncher();
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
  document.addEventListener('dtl:adminroutechange', event => {
    if (event.detail?.id === 'section:requests') settle();
  });

  runtime.registerPatcher(install);
  window.DTL_ADMIN_REQUEST_EDITOR = Object.freeze({ refresh:settle });
})();
