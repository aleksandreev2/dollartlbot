(() => {
  const tg = window.Telegram?.WebApp;
  const runtime = window.DTL_RUNTIME;
  if (!runtime?.registerPatcher) throw new Error('DTL runtime must load before admin-activity.js');

  let active = false;
  let filter = 'all';
  let events = [];
  let nextBefore = null;
  let summary = { total:0, unread:0, unread_problems:0, failed_alerts:0 };
  let summaryAt = 0;
  let busy = false;
  let deepLinkHandled = false;
  let focusUserId = 0;

  const headers = (extra = {}) => ({ 'x-telegram-init-data': tg?.initData || '', ...extra });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[char]));
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: headers(options.headers || {}), cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    return data;
  }

  function icons() {
    try { window.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } }); } catch {}
  }

  function toast(text, error = false) {
    const root = document.getElementById('toastRegion');
    if (!root) return;
    const item = document.createElement('div');
    item.className = `toast ${error ? 'error' : 'success'}`;
    item.textContent = text;
    root.append(item);
    setTimeout(() => item.remove(), 3200);
  }

  function adminRoot() { return document.querySelector('.admin-v2'); }

  function installNav() {
    const root = adminRoot();
    if (!root) return;
    for (const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')) {
      let button = nav.querySelector('[data-admin-activity]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.adminActivity = '1';
        button.innerHTML = `${icon('bell-dot')}<span>Активность</span><b class="admin-activity-badge" hidden></b>`;
        const firstTools = nav.querySelector('[data-admin-tools]');
        const settings = nav.querySelector('[data-admin-section="settings"]');
        nav.insertBefore(button, firstTools || settings || null);
        button.addEventListener('click', () => { void renderActivity(true); });
      }
    }
    syncNav();
    icons();
    void refreshSummary(false);
  }

  function syncNav() {
    document.querySelectorAll('[data-admin-activity]').forEach((button) => button.classList.toggle('active', active));
    if (active) {
      document.querySelectorAll('[data-admin-section],[data-admin-tools]').forEach((button) => button.classList.remove('active'));
    }
    updateBadges();
  }

  function updateBadges() {
    document.querySelectorAll('.admin-activity-badge').forEach((badge) => {
      const unread = Number(summary.unread || 0);
      badge.hidden = unread <= 0;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.setAttribute('aria-label', `${unread} непрочитанных событий`);
    });
  }

  async function refreshSummary(force = false) {
    if (!adminRoot()) return;
    if (!force && Date.now() - summaryAt < 15_000) { updateBadges(); return; }
    try {
      const data = await api('/api/app/admin/events?summary=1');
      summary = data.summary || summary;
      summaryAt = Date.now();
      updateBadges();
      if (active) updateSummaryStrip();
    } catch {
      // The badge is secondary UI; never disturb the admin workspace for it.
    }
  }

  function setHead(title, subtitle) {
    const heading = document.querySelector('.admin-work-head h1');
    const sub = document.querySelector('.admin-work-head p');
    if (heading) heading.textContent = title;
    if (sub) sub.textContent = subtitle;
  }

  function setContent(html) {
    const root = document.querySelector('.admin-content');
    if (!root) return false;
    root.innerHTML = html;
    icons();
    runtime.schedule();
    return true;
  }

  async function renderActivity(reset = true) {
    if (!adminRoot()) return;
    active = true;
    syncNav();
    setHead('Активность', 'Новые пользователи, системные события и проблемы доставки');
    if (reset) {
      events = [];
      nextBefore = null;
      setContent(`<div class="admin-loading">${icon('loader-circle')} Загружаем активность…</div>`);
    }

    try {
      const params = new URLSearchParams({ filter, limit:'30' });
      if (!reset && nextBefore) params.set('before', String(nextBefore));
      const data = await api(`/api/app/admin/events?${params}`);
      const incoming = Array.isArray(data.events) ? data.events : [];
      events = reset ? incoming : [...events, ...incoming];
      nextBefore = data.next_before || null;
      summary = data.summary || summary;
      summaryAt = Date.now();
      draw();
      focusDeepLinkedUser();
    } catch (error) {
      setContent(`<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Не удалось загрузить активность</strong><span>${esc(error.message)}</span></div>`);
    }
  }

  function draw() {
    setContent(`<section class="admin-activity-page">
      <div class="admin-activity-toolbar admin-panel">
        <div class="admin-activity-filters">
          ${filterButton('all','Все')}${filterButton('unread','Непрочитанные')}${filterButton('problems','Проблемы')}
        </div>
        <button class="admin-activity-readall" id="adminActivityReadAll" ${Number(summary.unread||0)===0?'disabled':''}>${icon('check-check')} Прочитать всё</button>
      </div>
      <div class="admin-activity-summary" id="adminActivitySummary">${summaryStrip()}</div>
      <div class="admin-activity-list">
        ${events.length ? events.map(eventCard).join('') : '<div class="admin-panel admin-empty">Событий для этого фильтра пока нет.</div>'}
      </div>
      ${nextBefore ? `<button class="admin-activity-more" id="adminActivityMore">${icon('chevron-down')} Показать более старые</button>` : ''}
    </section>`);

    document.querySelectorAll('[data-activity-filter]').forEach((button) => button.addEventListener('click', () => {
      filter = button.dataset.activityFilter || 'all';
      void renderActivity(true);
    }));
    document.getElementById('adminActivityReadAll')?.addEventListener('click', markAllRead);
    document.getElementById('adminActivityMore')?.addEventListener('click', () => void renderActivity(false));
    document.querySelectorAll('[data-activity-read]').forEach((button) => button.addEventListener('click', () => markRead(Number(button.dataset.activityRead))));
    document.querySelectorAll('[data-activity-retry]').forEach((button) => button.addEventListener('click', () => retryDelivery(Number(button.dataset.activityRetry))));
    document.querySelectorAll('[data-activity-copy]').forEach((button) => button.addEventListener('click', () => copyUserId(String(button.dataset.activityCopy || ''))));
    document.querySelectorAll('[data-activity-telegram]').forEach((button) => button.addEventListener('click', () => openTelegram(String(button.dataset.activityTelegram || ''))));
    icons();
  }

  function filterButton(id, label) {
    return `<button type="button" data-activity-filter="${id}" class="${filter===id?'active':''}">${esc(label)}</button>`;
  }

  function summaryStrip() {
    return `${summaryItem('bell-dot',summary.unread,'Непрочитано')}${summaryItem('triangle-alert',summary.unread_problems,'Проблем')}${summaryItem('send',summary.failed_alerts,'Telegram ошибок')}`;
  }

  function updateSummaryStrip() {
    const root = document.getElementById('adminActivitySummary');
    if (root) root.innerHTML = summaryStrip();
    updateBadges();
    icons();
  }

  function summaryItem(ic, value, label) {
    return `<div class="admin-activity-summary-item">${icon(ic)}<div><strong>${Number(value||0)}</strong><span>${esc(label)}</span></div></div>`;
  }

  function eventCard(event) {
    const unread = !event.read_at;
    const username = cleanUsername(event.current_username);
    const userId = Number(event.user_id || 0);
    const delivery = deliveryLabel(event.telegram_status);
    const type = typeLabel(event.type);
    return `<article class="admin-activity-event ${unread?'unread':''} severity-${esc(event.severity||'info')}" data-activity-event="${Number(event.id)}" ${userId?`data-activity-user="${userId}"`:''}>
      <div class="admin-activity-event-icon">${icon(eventIcon(event))}</div>
      <div class="admin-activity-event-main">
        <div class="admin-activity-event-head"><div><span class="admin-activity-type">${esc(type)}</span><h3>${esc(event.title)}</h3></div><time>${esc(relativeTime(event.created_at))}</time></div>
        <p>${plainBody(event.body)}</p>
        <div class="admin-activity-meta"><span>${icon(delivery.icon)} Telegram: ${esc(delivery.label)}</span>${event.telegram_attempts?`<span>${Number(event.telegram_attempts)} попыт.</span>`:''}</div>
        ${event.telegram_last_error?`<div class="admin-activity-error">${esc(shorten(event.telegram_last_error,220))}</div>`:''}
        <div class="admin-activity-actions">
          ${unread?`<button type="button" data-activity-read="${Number(event.id)}">${icon('check')} Прочитано</button>`:''}
          ${userId?`<button type="button" data-activity-copy="${userId}">${icon('copy')} ID</button>`:''}
          ${username?`<button type="button" data-activity-telegram="${esc(username)}">${icon('external-link')} @${esc(username)}</button>`:''}
          ${event.telegram_status==='failed'?`<button type="button" class="warning" data-activity-retry="${Number(event.id)}">${icon('rotate-cw')} Повторить уведомление</button>`:''}
        </div>
      </div>
      ${unread?'<span class="admin-activity-unread-dot" aria-label="Непрочитано"></span>':''}
    </article>`;
  }

  async function markRead(id) {
    if (busy || !id) return;
    busy = true;
    try {
      const data = await api('/api/app/admin/events/read', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({id}),
      });
      const event = events.find((row) => Number(row.id) === id);
      if (event) event.read_at = new Date().toISOString();
      summary = data.summary || summary;
      summaryAt = Date.now();
      draw();
    } catch (error) { toast(error.message, true); }
    finally { busy = false; }
  }

  async function markAllRead() {
    if (busy || Number(summary.unread||0)===0) return;
    busy = true;
    try {
      const data = await api('/api/app/admin/events/read', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({all:true}),
      });
      const now = new Date().toISOString();
      events.forEach((event) => { if (!event.read_at) event.read_at = now; });
      summary = data.summary || summary;
      summaryAt = Date.now();
      draw();
    } catch (error) { toast(error.message, true); }
    finally { busy = false; }
  }

  async function retryDelivery(id) {
    if (busy || !id) return;
    busy = true;
    try {
      const data = await api(`/api/app/admin/events/${id}/retry`, { method:'POST' });
      const event = events.find((row) => Number(row.id) === id);
      if (event && data.event) Object.assign(event, data.event);
      summary = data.summary || summary;
      summaryAt = Date.now();
      toast(data.ok ? 'Уведомление повторно отправлено.' : 'Не удалось повторить отправку.', !data.ok);
      draw();
    } catch (error) { toast(error.message, true); }
    finally { busy = false; }
  }

  async function copyUserId(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast(`ID ${value} скопирован.`);
    } catch {
      const input = document.createElement('textarea');
      input.value = value; input.style.position='fixed'; input.style.opacity='0'; document.body.append(input); input.select();
      try { document.execCommand('copy'); toast(`ID ${value} скопирован.`); } catch { toast(`ID: ${value}`, true); }
      input.remove();
    }
  }

  function openTelegram(username) {
    const clean = cleanUsername(username);
    if (!clean) return;
    const url = `https://t.me/${clean}`;
    try { tg?.openTelegramLink?.(url); } catch { window.open(url,'_blank','noopener'); }
  }

  function focusDeepLinkedUser() {
    if (!focusUserId) return;
    const card = document.querySelector(`[data-activity-user="${focusUserId}"]`);
    if (!card) return;
    const id = focusUserId;
    focusUserId = 0;
    card.classList.add('admin-activity-target');
    card.scrollIntoView({ block:'center', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth' });
    setTimeout(() => document.querySelector(`[data-activity-user="${id}"]`)?.classList.remove('admin-activity-target'), 2800);
  }

  function handleDeepLink() {
    if (deepLinkHandled || !adminRoot()) return;
    const url = new URL(location.href);
    if (url.searchParams.get('admin') !== 'activity') return;
    deepLinkHandled = true;
    focusUserId = Number(url.searchParams.get('user') || 0) || 0;
    void renderActivity(true);
    url.searchParams.delete('admin');
    url.searchParams.delete('user');
    try { history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`); } catch {}
  }

  function eventIcon(event) {
    if (event.type === 'new_user') return 'user-plus';
    if (event.severity === 'error') return 'circle-alert';
    if (event.severity === 'warning') return 'triangle-alert';
    return 'bell';
  }

  function typeLabel(type) {
    const labels = {
      new_user:'Новый пользователь', new_request:'Новая заявка', publication_failed:'Публикация',
      publication_delivery_failed:'Доставка', broadcast_failed:'Рассылка', access_gate_problem:'Доступ', system_warning:'Система',
    };
    return labels[type] || String(type || 'Событие').replaceAll('_',' ');
  }

  function deliveryLabel(status) {
    const map = {
      sent:{label:'отправлено',icon:'circle-check'}, queued:{label:'в очереди',icon:'clock-3'},
      sending:{label:'отправляется',icon:'loader-circle'}, retry:{label:'повтор',icon:'rotate-cw'},
      failed:{label:'ошибка',icon:'triangle-alert'}, skipped:{label:'пропущено',icon:'minus-circle'},
    };
    return map[status] || { label:String(status||'—'), icon:'circle' };
  }

  function plainBody(value) {
    return esc(value || '').replace(/\r?\n/g,'<br>');
  }

  function cleanUsername(value) {
    const raw = String(value || '').trim().replace(/^@/,'');
    return /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : '';
  }

  function shorten(value, max) {
    const text = String(value || '');
    return text.length <= max ? text : `${text.slice(0,max-1)}…`;
  }

  function relativeTime(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 45) return 'только что';
    if (seconds < 3600) return `${Math.floor(seconds/60)} мин назад`;
    if (seconds < 86400) return `${Math.floor(seconds/3600)} ч назад`;
    if (seconds < 7*86400) return `${Math.floor(seconds/86400)} дн назад`;
    return new Date(timestamp).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  document.addEventListener('click', (event) => {
    const other = event.target.closest?.('[data-admin-section],[data-admin-tools]');
    if (!other || !active) return;
    active = false;
    syncNav();
  }, true);

  document.addEventListener('dtl:adminrender', () => {
    installNav();
    handleDeepLink();
    if (!active) void refreshSummary(false);
  });
  runtime.registerPatcher(installNav);
  window.DTL_ADMIN_ACTIVITY = Object.freeze({ open:() => renderActivity(true), refresh:() => refreshSummary(true) });
})();
