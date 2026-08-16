(() => {
  const admin = window.DTL_ADMIN;
  if (!admin?.api) return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function render() {
    if (document.getElementById('regionalSecurityPanel')) return;
    const host = document.querySelector('.admin-content');
    if (!host) return;

    const panel = document.createElement('section');
    panel.id = 'regionalSecurityPanel';
    panel.className = 'admin-panel';
    panel.innerHTML = '<div class="admin-loading">Загружаем regional routing…</div>';
    host.prepend(panel);

    try {
      const payload = await admin.api('/api/app/admin/security/regional');
      if (!panel.isConnected) return;
      const cfg = payload.config || {};
      const summary = payload.summary || {};
      panel.innerHTML = `
        <div class="admin-panel-head"><div><h2>Regional routing</h2><p>Проверка страны перед выдачей файлов; Boosty и админы обходят ограничение</p></div><span class="admin-badge ${cfg.enabled ? 'good' : 'muted'}">${cfg.enabled ? 'ON' : 'OFF'}</span></div>
        <div class="admin-stat-grid">
          <div class="admin-stat"><strong>${Number(summary.verified || 0)}</strong><span>Verified region</span></div>
          <div class="admin-stat"><strong>${Number(summary.restricted || 0)}</strong><span>Restricted</span></div>
          <div class="admin-stat"><strong>${Number(summary.unknown || 0)}</strong><span>Unknown</span></div>
        </div>
        <div class="settings-admin-grid">
          <div>
            <label class="admin-field"><span>Restricted countries</span><input id="regionalCountries" value="${esc((cfg.restricted_countries || []).join(','))}"><small>ISO country codes, через запятую.</small></label>
            <label class="admin-field"><span>Russian translations channel</span><input id="regionalChannel" value="${esc(cfg.russian_channel_url || 'https://t.me/domnekromanta')}"></label>
          </div>
          <div>
            <label class="admin-field"><span>Country verification TTL, days</span><input id="regionalCountryTtl" type="number" min="1" max="365" value="${Number(cfg.country_ttl_days || 30)}"></label>
            <label class="admin-field"><span>Challenge TTL, minutes</span><input id="regionalChallengeTtl" type="number" min="2" max="60" value="${Number(cfg.challenge_ttl_minutes || 10)}"></label>
            <label class="admin-field"><span>Regional routing</span><input id="regionalEnabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}></label>
          </div>
        </div>
        <button class="admin-save-settings" id="saveRegionalSecurity">Сохранить regional routing</button>`;

      document.getElementById('saveRegionalSecurity')?.addEventListener('click', save);
    } catch (error) {
      if (panel.isConnected) panel.innerHTML = `<div class="admin-empty">Regional routing: ${esc(error?.message || error)}</div>`;
    }
  }

  async function save() {
    const button = document.getElementById('saveRegionalSecurity');
    if (button) button.disabled = true;
    try {
      const body = {
        enabled: Boolean(document.getElementById('regionalEnabled')?.checked),
        restricted_countries: document.getElementById('regionalCountries')?.value || '',
        russian_channel_url: document.getElementById('regionalChannel')?.value || '',
        country_ttl_days: Number(document.getElementById('regionalCountryTtl')?.value || 30),
        challenge_ttl_minutes: Number(document.getElementById('regionalChallengeTtl')?.value || 10),
      };
      await admin.api('/api/app/admin/security/regional', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      admin.toast?.('Regional routing сохранён.');
      document.getElementById('regionalSecurityPanel')?.remove();
      await render();
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener('dtl:adminrender', event => {
    if (event.detail?.section === 'security') void render();
  });
})();
