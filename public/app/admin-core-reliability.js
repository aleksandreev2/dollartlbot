(() => {
  const admin = window.DTL_ADMIN;
  if (!admin?.api) return;
  let renderToken = 0;
  let userToken = 0;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const fmt = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function render() {
    const root = document.querySelector('.admin-content');
    if (!root || root.querySelector('[data-core-reliability]')) return;
    const token = ++renderToken;
    try {
      const data = await admin.api('/api/app/admin/security/core-reliability');
      if (token !== renderToken) return;
      const current = document.querySelector('.admin-content');
      if (!current || current.querySelector('[data-core-reliability]')) return;
      const findings = Array.isArray(data.findings) ? data.findings : [];
      const cache = data.entitlement_cache || {};
      const status = data.status || 'healthy';
      const section = document.createElement('section');
      section.className = 'admin-panel';
      section.dataset.coreReliability = '1';
      section.innerHTML = `
        <div class="admin-panel-head">
          <div><h2>Core Reliability</h2><p>Единая политика доступа, entitlement cache и production health</p></div>
          <span class="admin-badge ${status === 'healthy' ? 'ok' : status === 'critical' ? 'bad' : 'warn'}">${Number(data.score || 0)}/100</span>
        </div>
        <div class="admin-stat-grid">
          <div class="admin-stat"><strong>${Number(cache.cached || 0)}</strong><span>Boosty cache</span></div>
          <div class="admin-stat"><strong>${Number(cache.positive || 0)}</strong><span>Entitled</span></div>
          <div class="admin-stat"><strong>${Number(cache.fresh || 0)}</strong><span>Fresh</span></div>
          <div class="admin-stat"><strong>${findings.length}</strong><span>Findings</span></div>
        </div>
        <div class="admin-core-findings">
          ${findings.length ? findings.map(item => `
            <div class="admin-compact-row">
              <div class="admin-compact-copy"><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></div>
              <span class="admin-badge ${item.severity === 'critical' ? 'bad' : 'warn'}">${esc(item.severity)}</span>
            </div>`).join('') : '<div class="admin-empty">Все ключевые security-инварианты в норме.</div>'}
        </div>`;
      current.prepend(section);
      admin.icons?.();
    } catch (error) {
      console.warn('Core reliability panel failed:', error);
    }
  }

  async function waitForUserProfile(userId, token) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (token !== userToken) return null;
      const selected = document.querySelector(`[data-user-id="${userId}"].selected`);
      const box = document.getElementById('adminUserDetail');
      if (!selected || !box) return null;
      if (box.querySelector('.admin-profile-head')) return box;
      await sleep(100);
    }
    return null;
  }

  async function renderUserSecurity(userId) {
    const token = ++userToken;
    try {
      const box = await waitForUserProfile(userId, token);
      if (!box || token !== userToken || box.querySelector('[data-user-security]')) return;
      const data = await admin.api(`/api/app/admin/users/${userId}/security-timeline`);
      if (token !== userToken || !box.isConnected || box.querySelector('[data-user-security]')) return;
      const selected = document.querySelector(`[data-user-id="${userId}"].selected`);
      if (!selected) return;
      const p = data.policy || {};
      const c = p.capabilities || {};
      const country = data.user?.country_code || 'UNKNOWN';
      const leaves = data.channel_leave || [];
      const events = data.security_events || [];
      const latestLeave = leaves[0] || null;
      const section = document.createElement('section');
      section.className = 'admin-profile-section';
      section.dataset.userSecurity = '1';
      section.innerHTML = `
        <div class="admin-panel-head"><div><h3>Security snapshot</h3><p>Канонический access policy и последние security-события</p></div><span class="admin-badge ${p.reason === 'allowed' || p.reason === 'admin' ? 'ok' : 'warn'}">${esc(p.reason || 'unknown')}</span></div>
        <div class="admin-profile-stats admin-profile-stats-four">
          <div><span>Country</span><strong>${esc(country)}</strong></div>
          <div><span>Mini App</span><strong>${c.miniapp ? 'ALLOW' : 'DENY'}</strong></div>
          <div><span>Suggest</span><strong>${c.suggest_title ? 'ALLOW' : 'DENY'}</strong></div>
          <div><span>Download</span><strong>${c.download ? 'ALLOW' : 'DENY'}</strong></div>
        </div>
        ${latestLeave ? `<div class="admin-compact-row"><div class="admin-compact-copy"><strong>Channel leave: ${esc(latestLeave.status)}</strong><span>${fmt(latestLeave.left_at)} · leave count ${Number(latestLeave.leave_count || 0)}</span></div></div>` : ''}
        <div class="admin-user-timeline">${events.length ? events.slice(0, 12).map(event => `<div class="admin-profile-line"><div><strong>${esc(event.event_type)}</strong><span>${esc(event.source)} · ${fmt(event.created_at)}</span></div><span>${esc(event.severity || 'info')}</span></div>`).join('') : '<div class="admin-empty">Отдельных security events пока нет.</div>'}</div>`;
      const timeline = box.querySelector('.admin-user-timeline');
      timeline?.parentElement?.before(section);
      if (!section.isConnected) box.append(section);
      admin.icons?.();
    } catch (error) {
      console.warn('User security snapshot failed:', error);
    }
  }

  document.addEventListener('dtl:adminrender', event => {
    if (event?.detail?.section === 'security') void render();
  });

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-user-id]');
    if (!target) return;
    const userId = Number(target.dataset.userId || 0);
    if (Number.isSafeInteger(userId) && userId > 0) void renderUserSecurity(userId);
  });
})();
