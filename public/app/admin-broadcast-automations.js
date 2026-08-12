(() => {
  const runtime = window.DTL_RUNTIME;
  const admin = window.DTL_ADMIN;
  if (!runtime?.registerPatcher || !admin?.api || !admin?.activeRoute) {
    throw new Error('Broadcast automations require canonical admin runtime.');
  }

  let root = null;
  let data = null;
  let loading = false;
  let seq = 0;

  const isActive = () => admin.activeRoute?.() === 'section:broadcasts';
  const ico = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

  function dateTime(value) {
    if (!value) return 'ещё не запускалась';
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        dateStyle:'medium', timeStyle:'short', timeZone:'UTC',
      }).format(new Date(value)) + ' UTC';
    } catch {
      return String(value);
    }
  }

  function automation() {
    return data?.automations?.[0] || null;
  }

  function panelHtml(item) {
    if (!item) {
      return `<div class="broadcast-automation-empty">${ico('circle-alert')} Автоматические кампании пока недоступны.</div>`;
    }
    const enabled = Boolean(item.enabled);
    return `
      <div class="broadcast-automation-copy">
        <div class="broadcast-automation-title-row">
          <span class="broadcast-automation-icon">${ico('calendar-clock')}</span>
          <div>
            <div class="broadcast-automation-kicker">LIFECYCLE</div>
            <h2>${esc(item.label)}</h2>
          </div>
          <span class="admin-badge ${enabled ? 'done' : 'draft'}">${enabled ? 'Включено' : 'Выключено'}</span>
        </div>
        <p>${esc(item.description)}</p>
        <div class="broadcast-automation-safety">${ico('shield-check')} Перед каждой отправкой аудитория проверяется заново: использовавшие request, opt-out и заблокированные пользователи автоматически исключаются.</div>
      </div>
      <div class="broadcast-automation-metrics">
        <div><span>Подходят сейчас</span><strong>${Number(item.eligible_now || 0).toLocaleString('ru-RU')}</strong></div>
        <div><span>Расписание</span><strong>${esc(item.schedule || '—')}</strong></div>
        <div><span>Следующий запуск</span><strong>${dateTime(item.next_due_at)}</strong></div>
        <div><span>Последняя очередь</span><strong>${dateTime(item.last_enqueued_at)}</strong></div>
      </div>
      <div class="broadcast-automation-control">
        <label class="broadcast-automation-switch">
          <input type="checkbox" data-broadcast-automation-toggle ${enabled ? 'checked' : ''}>
          <span aria-hidden="true"></span>
          <b>${enabled ? 'Автоматизация активна' : 'Автоматизация остановлена'}</b>
        </label>
        <small>Два разных сообщения в месяц. Повторный cron не создаёт дубль.</small>
      </div>`;
  }

  function mount() {
    if (!isActive()) {
      root = null;
      return;
    }
    const center = document.querySelector('.broadcast-center');
    if (!center) return;
    if (center !== root) root = center;

    let panel = center.querySelector('[data-broadcast-automations]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'admin-panel broadcast-automation-panel';
      panel.dataset.broadcastAutomations = '';
      center.prepend(panel);
    }

    if (loading && !data) {
      panel.innerHTML = `<div class="broadcast-automation-loading">${ico('loader-circle')} Загружаем автоматические кампании…</div>`;
      admin.icons?.();
      return;
    }

    panel.innerHTML = panelHtml(automation());
    const toggle = panel.querySelector('[data-broadcast-automation-toggle]');
    toggle?.addEventListener('change', () => void setEnabled(Boolean(toggle.checked), toggle));
    admin.icons?.();
  }

  async function load(force = false) {
    if (!isActive() || loading) return;
    if (data && !force) {
      mount();
      return;
    }
    const requestSeq = ++seq;
    loading = true;
    mount();
    try {
      const response = await admin.api('/api/app/admin/broadcast-automations');
      if (requestSeq !== seq || !isActive()) return;
      data = response;
    } catch (error) {
      if (error?.name !== 'AbortError' && isActive()) {
        admin.toast?.(`Не удалось загрузить автоматические рассылки: ${error.message}`, true);
      }
    } finally {
      if (requestSeq === seq) loading = false;
      if (isActive()) mount();
    }
  }

  async function setEnabled(enabled, control) {
    const item = automation();
    if (!item || loading) return;
    control.disabled = true;
    try {
      const response = await admin.api(`/api/app/admin/broadcast-automations/${encodeURIComponent(item.key)}`, {
        method:'PATCH',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ enabled }),
      });
      data = { ...(data || {}), automations:[response.automation] };
      admin.toast?.(enabled ? 'Автоматическая рассылка включена.' : 'Автоматическая рассылка выключена.');
    } catch (error) {
      admin.toast?.(error.message, true);
    } finally {
      mount();
    }
  }

  function patch() {
    if (!isActive()) {
      root = null;
      data = null;
      seq += 1;
      return;
    }
    const center = document.querySelector('.broadcast-center');
    if (!center) return;
    if (center !== root) {
      root = center;
      data = null;
      void load(true);
      return;
    }
    mount();
  }

  document.addEventListener('dtl:adminroutechange', () => queueMicrotask(patch));
  document.addEventListener('dtl:adminrender', patch);
  runtime.registerPatcher(patch);

  window.DTL_ADMIN_BROADCAST_AUTOMATIONS = Object.freeze({ load });
})();
