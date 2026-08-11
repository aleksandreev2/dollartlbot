(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.open) throw new Error('Admin home request actions require canonical runtime.');
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function install() {
    if (admin.activeRoute?.() !== 'section:overview') return;
    document.querySelectorAll('.admin-home-row[data-home-request]').forEach(row => {
      if (row.dataset.homeEditReady === '1') return;
      row.dataset.homeEditReady = '1';
      const id = Number(row.dataset.homeRequest);
      if (!id) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'admin-home-request-item';
      row.parentNode?.insertBefore(wrapper, row);
      wrapper.append(row);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'admin-home-request-edit';
      edit.dataset.homeEditRequest = String(id);
      edit.innerHTML = `${ico('pencil')}<span>Редактировать</span>`;
      wrapper.append(edit);
      edit.addEventListener('click', () => void openEditor(id));
    });
    admin.icons?.();
  }

  async function openEditor(id) {
    await admin.open('section:requests');
    setTimeout(() => {
      if (window.DTL_ADMIN_REQUEST_OPS?.open) { void window.DTL_ADMIN_REQUEST_OPS.open(id); return; }
      document.querySelector(`[data-workflow-request="${id}"]`)?.click();
    }, 40);
  }

  document.addEventListener('dtl:adminrender', install);
  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(install));
  runtime.registerPatcher(install);
})();