(() => {
  const admin = window.DTL_ADMIN;
  if (!admin?.api) return;
  let renderToken = 0;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

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

  document.addEventListener('dtl:adminrender', event => {
    if (event?.detail?.section === 'security') void render();
  });
})();
