(() => {
  const runtime = window.DTL_RUNTIME;
  const tg = window.Telegram?.WebApp;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime must load before access-admin-ui.js');

  let installedFor = null;
  let busy = false;

  const headers = (extra = {}) => ({ 'x-telegram-init-data': tg?.initData || '', ...extra });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons = () => { try { window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } }); } catch {} };

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: headers(options.headers || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    return data;
  }

  function install() {
    const grid = document.querySelector('.settings-admin-grid');
    const publicationChannel = document.getElementById('setChannel');
    if (!grid || !publicationChannel) { installedFor = null; return; }
    if (installedFor === grid && document.getElementById('accessAdminPanel')) return;
    installedFor = grid;

    const panel = document.createElement('section');
    panel.id = 'accessAdminPanel';
    panel.className = 'admin-panel access-admin-panel';
    panel.innerHTML = `<div class="admin-panel-head"><div><h2>Доступ к боту</h2><p>Обязательная подписка на Telegram-канал</p></div>${icon('shield-check')}</div>
      <div id="accessAdminBody"><div class="admin-loading">${icon('loader-circle')} Проверяем настройки…</div></div>`;
    grid.append(panel);
    refreshIcons();
    void load();
  }

  async function load() {
    const body = document.getElementById('accessAdminBody');
    if (!body) return;
    try {
      const data = await api('/api/app/admin/access');
      draw(data);
    } catch (error) {
      body.innerHTML = status(false, 'Не удалось загрузить настройки доступа', error.message);
      refreshIcons();
    }
  }

  function draw(data) {
    const body = document.getElementById('accessAdminBody');
    if (!body) return;
    const settings = data.settings || {};
    const diagnostics = data.diagnostics || {};
    const inherited = Boolean(settings.inherited_from_publishing);
    body.innerHTML = `<label class="admin-field"><span>Канал обязательного доступа</span>
        <input id="accessChannelId" value="${esc(settings.access_channel_id || '')}" placeholder="Оставьте пустым, чтобы использовать канал публикации">
        <small>${inherited && settings.effective_channel_id ? `Сейчас используется канал публикации: ${esc(settings.effective_channel_id)}` : 'Можно указать @username или числовой chat ID.'}</small>
      </label>
      <label class="admin-field"><span>Ссылка для вступления</span>
        <input id="accessChannelUrl" value="${esc(settings.access_channel_url || '')}" placeholder="https://t.me/channel или invite-ссылка">
        <small>Для публичного @username ссылка определяется автоматически. Для числового/private ID укажите invite-ссылку вручную.</small>
      </label>
      ${status(Boolean(diagnostics.ok), diagnostics.ok ? 'Проверка пройдена' : 'Нужно проверить настройку', diagnostics.message || 'Нет данных')}
      <div class="access-admin-actions">
        <button type="button" id="accessAdminCheck">${icon('refresh-cw')} Проверить</button>
        <button type="button" class="primary" id="accessAdminSave">${icon('save')} Сохранить доступ</button>
      </div>`;
    document.getElementById('accessAdminCheck')?.addEventListener('click', load);
    document.getElementById('accessAdminSave')?.addEventListener('click', save);
    refreshIcons();
  }

  function status(ok, title, message) {
    return `<div class="access-admin-status ${ok ? 'ok' : 'bad'}">${icon(ok ? 'circle-check' : 'triangle-alert')}<div><strong>${esc(title)}</strong><span>${esc(message)}</span></div></div>`;
  }

  async function save() {
    if (busy) return;
    busy = true;
    const save = document.getElementById('accessAdminSave');
    const check = document.getElementById('accessAdminCheck');
    if (save) save.disabled = true;
    if (check) check.disabled = true;
    try {
      const channel_id = document.getElementById('accessChannelId')?.value.trim() || '';
      const join_url = document.getElementById('accessChannelUrl')?.value.trim() || '';
      const data = await api('/api/app/admin/access', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ channel_id, join_url }),
      });
      draw(data);
      toast(data.diagnostics?.ok ? 'Доступ сохранён и проверен.' : 'Настройки сохранены. Проверьте предупреждение ниже.', !data.diagnostics?.ok);
    } catch (error) {
      toast(error.message, true);
    } finally {
      busy = false;
      document.getElementById('accessAdminSave')?.removeAttribute('disabled');
      document.getElementById('accessAdminCheck')?.removeAttribute('disabled');
    }
  }

  function toast(text, error = false) {
    const root = document.getElementById('toastRegion');
    if (!root) return;
    const item = document.createElement('div');
    item.className = `toast ${error ? 'error' : 'success'}`;
    item.textContent = text;
    root.append(item);
    setTimeout(() => item.remove(), 3600);
  }

  runtime.registerPatcher(install);
  document.addEventListener('dtl:adminrender', (event) => {
    if (event.detail?.section === 'settings') runtime.schedule();
  });
})();
