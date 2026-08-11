(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.api || !admin?.open) throw new Error('Canonical admin runtime must load before admin-home-v2.js');

  let timer = 0;
  let sequence = 0;
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isHome = () => admin.activeRoute?.() === 'section:overview';

  function renameHome() {
    document.querySelectorAll('[data-admin-section="overview"] span').forEach(span => { span.textContent = 'Главная'; });
  }

  function scheduleHome(delay = 80) {
    renameHome();
    if (!isHome()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void renderHome(), delay);
  }

  async function renderHome() {
    if (!isHome()) return;
    const seq = ++sequence;
    admin.setHead?.('Главная', 'Что требует внимания и куда идти дальше');
    const host = document.querySelector('.admin-content');
    if (!host) return;
    host.innerHTML = `<div class="admin-home-loading">${ico('loader-circle')} Собираем рабочую сводку…</div>`;
    admin.icons?.();

    try {
      const pendingPromise = admin.api('/api/app/admin/list?kind=pending');
      const publishingPromise = admin.api('/api/app/admin/publishing');
      const activePromise = admin.api('/api/app/admin/list?kind=active').catch(() => ({requests:[]}));
      const eventsPromise = admin.api('/api/app/admin/events?summary=1').catch(() => ({summary:{}}));
      const healthPromise = admin.api('/api/app/admin/health').catch(() => null);
      const [pending, publishing, active, events, health] = await Promise.all([pendingPromise, publishingPromise, activePromise, eventsPromise, healthPromise]);
      if (!isHome() || seq !== sequence || !host.isConnected) return;

      const counts = pending.counts || {};
      const pendingRows = Array.isArray(pending.requests) ? pending.requests.slice(0, 5) : [];
      const activeRows = Array.isArray(active.requests) ? active.requests.filter(row => row.queue_status === 'in_progress').slice(0, 3) : [];
      const publications = Array.isArray(publishing.publications) ? publishing.publications : [];
      const failedPublications = publications.filter(row => row.status === 'failed');
      const summary = events.summary || {};
      const problemCount = Number(summary.unread_problems || 0) + Number(summary.failed_alerts || 0);
      const systemBad = Boolean(health && health.status && health.status !== 'healthy');
      const urgentCount = Number(counts.pending || 0) + failedPublications.length + problemCount + (systemBad ? 1 : 0);

      const tasks = [];
      if (Number(counts.pending || 0) > 0) tasks.push(task('inbox', `${counts.pending} заявок ждут решения`, 'Разобрать новые заявки', 'section:requests', 'orange'));
      if (activeRows.length) tasks.push(task('languages', `${activeRows.length} переводов сейчас в работе`, 'Проверить прогресс', 'section:queue', 'green'));
      if (failedPublications.length) tasks.push(task('triangle-alert', `${failedPublications.length} публикаций с ошибкой`, 'Открыть публикации', 'tools:publications', 'red'));
      if (problemCount || systemBad) tasks.push(task('heart-pulse', `${Math.max(problemCount, systemBad ? 1 : 0)} системных проблем`, 'Открыть систему', 'health:1', 'red'));

      host.innerHTML = `
        <section class="admin-home-hero">
          <div><span class="admin-home-kicker">СЕЙЧАС</span><h2>${urgentCount ? `${urgentCount} задач требуют внимания` : 'Срочных задач нет'}</h2><p>${urgentCount ? 'Начни сверху — здесь только то, что влияет на текущую работу.' : 'Можно спокойно заниматься очередью или подготовкой публикаций.'}</p></div>
          <div class="admin-home-actions"><button type="button" data-home-route="section:requests">${ico('inbox')} Заявки</button><button type="button" data-home-route="section:queue">${ico('list-ordered')} Очередь</button><button type="button" class="primary" data-home-route="section:publishing">${ico('plus')} Публикация</button></div>
        </section>

        <div class="admin-home-metrics">
          ${metric('clock-3', counts.pending || 0, 'На проверке')}
          ${metric('list-ordered', counts.queued || 0, 'В очереди')}
          ${metric('languages', counts.in_progress || 0, 'В работе')}
          ${metric('circle-check', counts.completed || 0, 'Завершено')}
        </div>

        <section class="admin-home-section">
          <div class="admin-home-section-head"><div><h3>Что сделать дальше</h3><p>Только реальные действия, без декоративной аналитики.</p></div>${problemCount ? `<button type="button" data-home-activity>${ico('bell-dot')} ${problemCount} проблем</button>` : ''}</div>
          <div class="admin-home-task-list">${tasks.length ? tasks.join('') : `<div class="admin-home-clear">${ico('circle-check-big')}<div><strong>Всё спокойно</strong><span>Новых заявок и критичных ошибок сейчас нет.</span></div></div>`}</div>
        </section>

        <div class="admin-home-columns">
          <section class="admin-home-section">
            <div class="admin-home-section-head"><div><h3>Новые заявки</h3><p>Последние заявки, ожидающие решения.</p></div><button type="button" data-home-route="section:requests">Все ${ico('arrow-right')}</button></div>
            <div class="admin-home-list">${pendingRows.length ? pendingRows.map(requestRow).join('') : '<div class="admin-home-empty">Новых заявок нет.</div>'}</div>
          </section>
          <section class="admin-home-section">
            <div class="admin-home-section-head"><div><h3>Работа сейчас</h3><p>Активные переводы и состояние публикаций.</p></div><button type="button" data-home-route="section:queue">Очередь ${ico('arrow-right')}</button></div>
            <div class="admin-home-list">${activeRows.length ? activeRows.map(activeRow).join('') : '<div class="admin-home-empty">Активных переводов сейчас нет.</div>'}</div>
            ${failedPublications.length ? `<button type="button" class="admin-home-warning" data-home-route="tools:publications">${ico('triangle-alert')} ${failedPublications.length} публикаций требуют исправления ${ico('arrow-right')}</button>` : ''}
          </section>
        </div>`;
      bindHome(host);
      admin.icons?.();
    } catch (error) {
      if (!isHome() || seq !== sequence) return;
      host.innerHTML = `<div class="admin-home-error">${ico('triangle-alert')}<div><strong>Не удалось загрузить Главную</strong><span>${esc(error?.message || error)}</span></div><button type="button" data-home-retry>${ico('refresh-cw')} Повторить</button></div>`;
      host.querySelector('[data-home-retry]')?.addEventListener('click', () => void renderHome());
      admin.icons?.();
    }
  }

  function metric(icon, value, label) {
    return `<div class="admin-home-metric"><span>${ico(icon)}</span><div><strong>${Number(value || 0)}</strong><small>${esc(label)}</small></div></div>`;
  }

  function task(icon, title, action, route, tone) {
    return `<button type="button" class="admin-home-task ${tone}" data-home-route="${route}"><span>${ico(icon)}</span><div><strong>${esc(title)}</strong><small>${esc(action)}</small></div>${ico('chevron-right')}</button>`;
  }

  function requestRow(row) {
    return `<button type="button" class="admin-home-row" data-home-request="${Number(row.id)}"><span class="admin-home-row-icon">${ico('book-open')}</span><span><strong>#${Number(row.id)} · ${esc(row.title)}</strong><small>${esc(row.original_language || '—')} · ${Number(row.chapter_count || 0)} глав${row.username ? ` · @${esc(row.username)}` : ''}</small></span>${ico('chevron-right')}</button>`;
  }

  function activeRow(row) {
    const current = Number(row.current_chapter || 0), total = Number(row.chapter_count || 0);
    return `<button type="button" class="admin-home-row" data-home-route="section:queue"><span class="admin-home-row-icon working">${ico('languages')}</span><span><strong>${esc(row.title)}</strong><small>${current} / ${total} глав · в работе</small></span>${ico('chevron-right')}</button>`;
  }

  function bindHome(host) {
    host.querySelectorAll('[data-home-route]').forEach(button => button.addEventListener('click', () => void admin.open(button.dataset.homeRoute)));
    host.querySelector('[data-home-activity]')?.addEventListener('click', () => void window.DTL_ADMIN_ACTIVITY?.open?.());
    host.querySelectorAll('[data-home-request]').forEach(button => button.addEventListener('click', async () => {
      const id = Number(button.dataset.homeRequest);
      await admin.open('section:requests');
      setTimeout(() => document.querySelector(`[data-workflow-request="${id}"]`)?.click(), 30);
    }));
  }

  document.addEventListener('dtl:adminrender', event => { if (event.detail?.section === 'overview') scheduleHome(100); });
  document.addEventListener('dtl:adminroutechange', event => { if (event.detail?.id === 'section:overview') scheduleHome(0); else sequence += 1; });
  runtime.registerPatcher(renameHome);
  window.DTL_ADMIN_HOME = Object.freeze({ refresh: () => renderHome() });
})();
