(() => {
  const runtime = window.DTL_RUNTIME;
  const adminRuntime = window.DTL_ADMIN;
  if (!runtime?.schedule || !adminRuntime?.registerRoute) {
    throw new Error('Canonical admin runtime must load before admin-console.js');
  }

  const state = { section: 'overview', publishing: null };
  const NAV = {
    overview: ['layout-dashboard', 'Обзор'],
    requests: ['inbox', 'Заявки'],
    queue: ['list-ordered', 'Очередь'],
    publishing: ['send', 'Публикация'],
    settings: ['settings-2', 'Настройки'],
  };

  const api = (path, options = {}) => adminRuntime.api(path, options);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const routeId = section => `section:${section}`;
  const isActive = section => adminRuntime.activeRoute?.() === routeId(section);
  const stale = (section, error) => error?.name === 'AbortError' || !isActive(section);

  function refreshIcons() { adminRuntime.icons?.(); }
  function toast(text, error = false) { adminRuntime.toast?.(text, error); }
  function activateAdminClass(on = true) {
    document.documentElement.classList.toggle('admin-console-active', on);
    document.body.classList.toggle('admin-console-active', on);
  }

  function syncSection(section) {
    state.section = section;
    document.querySelectorAll('[data-admin-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.adminSection === section);
    });
    if (section) {
      document.querySelectorAll('[data-admin-tools],[data-admin-health]').forEach(button => button.classList.remove('active'));
    }
  }

  function shell(content, subtitle = 'Рабочая панель Dollar TL') {
    const root = document.getElementById('viewRoot');
    if (!root) return null;
    activateAdminClass(true);
    let admin = root.querySelector('.admin-v2');
    if (!admin) {
      root.innerHTML = `<section class="admin-v2">
        <aside class="admin-side">
          <div class="admin-side-brand"><img src="/app/logo.png" alt=""><div><strong>Dollar TL</strong><span>ADMIN</span></div></div>
          <nav class="admin-side-nav">${Object.entries(NAV).map(([id, [ic, label]]) => `<button type="button" data-admin-section="${id}" class="${state.section === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</nav>
        </aside>
        <div class="admin-workspace">
          <header class="admin-work-head"><div><div class="admin-kicker">АДМИН-ПАНЕЛЬ</div><h1>${NAV[state.section]?.[1] || 'Админ'}</h1><p>${esc(subtitle)}</p></div><div class="admin-live"><span></span> Система активна</div></header>
          <div class="admin-mobile-nav">${Object.entries(NAV).map(([id, [ic, label]]) => `<button type="button" data-admin-section="${id}" class="${state.section === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
          <main class="admin-content">${content}</main>
        </div>
      </section>`;
      admin = root.querySelector('.admin-v2');
    } else {
      const heading = admin.querySelector('.admin-work-head h1');
      const sub = admin.querySelector('.admin-work-head p');
      const area = admin.querySelector('.admin-content');
      if (heading) heading.textContent = NAV[state.section]?.[1] || 'Админ';
      if (sub) sub.textContent = subtitle;
      if (area) area.innerHTML = content;
      syncSection(state.section);
    }
    document.querySelector('[data-nav="admin"] span:last-child')?.replaceChildren(document.createTextNode('Админ'));
    refreshIcons();
    runtime.schedule();
    return admin;
  }

  async function renderSection(section) {
    state.section = section;
    if (section === 'overview') return renderOverview();
    if (section === 'settings') return renderSettings();
    return false;
  }

  async function renderOverview() {
    syncSection('overview');
    shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем данные…</div>`, 'Заявки, очередь и публикации в одном месте');
    try {
      const [req, pub] = await Promise.all([
        api('/api/app/admin/list?kind=pending'),
        api('/api/app/admin/publishing'),
      ]);
      if (!isActive('overview')) return false;
      state.publishing = pub;
      const counts = req.counts || {};
      const recent = (req.requests || []).slice(0, 4);
      const publications = (pub.publications || []).slice(0, 4);
      shell(`<div class="admin-stat-grid">
        ${stat('clock-3', counts.pending || 0, 'На проверке', 'orange')}
        ${stat('layers-3', counts.queued || 0, 'В очереди', 'blue')}
        ${stat('languages', counts.in_progress || 0, 'В работе', 'green')}
        ${stat('circle-check-big', counts.completed || 0, 'Завершено', 'gold')}
      </div>
      <div class="admin-dashboard-grid">
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Требуют внимания</h2><p>Новые заявки пользователей</p></div><button data-jump="requests">Все заявки ${icon('arrow-right')}</button></div>${recent.length ? recent.map(requestCompact).join('') : '<div class="admin-empty">Новых заявок нет.</div>'}</section>
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Последние публикации</h2><p>Черновики и опубликованные посты</p></div><button data-jump="publishing">Публикация ${icon('arrow-right')}</button></div>${publications.length ? publications.map(publicationCompact).join('') : '<div class="admin-empty">Публикаций пока нет.</div>'}</section>
      </div>`, `Сегодня: ${counts.pending || 0} заявок ждут решения`);
      return true;
    } catch (error) {
      if (!stale('overview', error)) shell(errorBox(error.message), 'Не удалось загрузить админ-панель');
      return false;
    }
  }

  function stat(ic, number, label, tone) {
    return `<div class="admin-stat ${tone}"><div class="admin-stat-icon">${icon(ic)}</div><div><strong>${number}</strong><span>${label}</span></div></div>`;
  }

  function requestCompact(request) {
    return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon('book-open')}</div><div class="admin-compact-copy"><strong>${esc(request.title)}</strong><span>${esc(request.original_language)} · ${request.chapter_count} глав${request.username ? ` · @${esc(request.username)}` : ''}</span></div><span class="admin-badge pending">На проверке</span></div>`;
  }

  function publicationCompact(publication) {
    return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon(publication.image_key ? 'image' : 'file-text')}</div><div class="admin-compact-copy"><strong>${esc(publication.internal_title)}</strong><span>${date(publication.created_at)} · ${Number(publication.file_count || 0)} файл(ов)</span></div>${pubBadge(publication.status)}</div>`;
  }

  function pubBadge(status) {
    const map = {
      draft: ['draft', 'Черновик'],
      publishing: ['queued', 'Отправляется'],
      published: ['done', 'Опубликовано'],
      failed: ['bad', 'Ошибка'],
    };
    const [className, label] = map[status] || ['draft', status || '—'];
    return `<span class="admin-badge ${className}">${esc(label)}</span>`;
  }

  async function loadPublishing(force = false) {
    if (state.publishing && !force) return state.publishing;
    state.publishing = await api('/api/app/admin/publishing');
    return state.publishing;
  }

  async function renderSettings() {
    syncSection('settings');
    shell(`<div class="admin-loading">${icon('loader-circle')} Загружаем настройки…</div>`, 'Канал публикации и автоматические комментарии');
    try {
      const data = await loadPublishing(true);
      if (!isActive('settings')) return false;
      const settings = data.settings || {};
      shell(`<div class="settings-admin-grid">
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Telegram</h2><p>Куда публиковать посты и комментарии</p></div></div>
          <label class="admin-field"><span>Канал публикации</span><input id="setChannel" value="${esc(settings.publish_channel_id || '')}" placeholder="@channel или -100…"><small>Бот должен быть администратором канала.</small></label>
          <label class="admin-field"><span>Discussion group</span><input id="setDiscussion" value="${esc(settings.discussion_chat_id || '')}" placeholder="-100…"><small>Связанная группа комментариев. Файлы будут отправлены ответом под постом.</small></label>
          <label class="admin-field"><span>Username бота</span><input id="setBot" value="${esc(settings.bot_username || 'dollartlbot')}" placeholder="dollartlbot"></label>
        </section>
        <section class="admin-panel"><div class="admin-panel-head"><div><h2>Шаблон публикации</h2><p>Постоянные ссылки</p></div></div>
          <label class="admin-field"><span>Donate URL</span><input id="setDonate" value="${esc(settings.donation_url || '')}" placeholder="https://boosty.to/…"></label>
          <div class="settings-preview"><b>Need a translation?</b><p>Open Dollar TL Bot and suggest a novel for translation.</p><div><span>Suggest a Novel</span><span>Donate</span></div></div>
        </section>
      </div>
      <button class="admin-save-settings" id="saveAdminSettings">${icon('save')} Сохранить настройки</button>`, 'Настройки используются для всех будущих публикаций');
      document.getElementById('saveAdminSettings')?.addEventListener('click', () => void saveSettings());
      refreshIcons();
      return true;
    } catch (error) {
      if (!stale('settings', error)) shell(errorBox(error.message));
      return false;
    }
  }

  async function saveSettings() {
    try {
      const body = {
        publish_channel_id: document.getElementById('setChannel')?.value || '',
        discussion_chat_id: document.getElementById('setDiscussion')?.value || '',
        bot_username: document.getElementById('setBot')?.value || '',
        donation_url: document.getElementById('setDonate')?.value || '',
      };
      await api('/api/app/admin/publishing/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      state.publishing = null;
      toast('Настройки сохранены.');
    } catch (error) {
      toast(error.message, true);
    }
  }

  function errorBox(text) {
    return `<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось выполнить действие</strong><span>${esc(text)}</span></div>`;
  }

  function date(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  }

  for (const section of ['overview', 'settings']) {
    adminRuntime.registerRoute(routeId(section), {
      mount: () => renderSection(section),
      refresh: () => renderSection(section),
    });
  }

  document.addEventListener('dtl:viewchange', event => {
    if (event.detail?.view !== 'admin') activateAdminClass(false);
  });

  window.DTL_ADMIN_CONSOLE = Object.freeze({
    open: () => renderSection('overview'),
    section: () => state.section,
    markSection: syncSection,
  });
})();