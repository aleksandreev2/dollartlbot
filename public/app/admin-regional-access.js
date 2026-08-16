(() => {
  const admin = window.DTL_ADMIN;
  if (!admin?.api) return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function ensureUsersNavigation() {
    const root = document.querySelector('.admin-v2');
    if (!root) return;
    for (const nav of root.querySelectorAll('.admin-side-nav,.admin-mobile-nav')) {
      let button = nav.querySelector('[data-admin-tools="users"]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.adminTools = 'users';
        button.innerHTML = '<i data-lucide="users" aria-hidden="true"></i><span>Пользователи</span>';
      }
      const security = nav.querySelector('[data-admin-section="security"]');
      if (security && button.nextElementSibling !== security) nav.insertBefore(button, security);
      else if (!button.isConnected) nav.append(button);
      button.classList.toggle('active', admin.activeRoute?.() === 'tools:users');
    }
    admin.icons?.();
  }

  async function renderRegional() {
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

      document.getElementById('saveRegionalSecurity')?.addEventListener('click', saveRegional);
    } catch (error) {
      if (panel.isConnected) panel.innerHTML = `<div class="admin-empty">Regional routing: ${esc(error?.message || error)}</div>`;
    }
  }

  async function renderScanner() {
    if (document.getElementById('scannerSecurityPanel')) return;
    const host = document.querySelector('.admin-content');
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'scannerSecurityPanel';
    panel.className = 'admin-panel';
    panel.innerHTML = '<div class="admin-loading">Загружаем ClamAV scanner…</div>';
    host.prepend(panel);

    try {
      const payload = await admin.api('/api/app/admin/security/scanner');
      if (!panel.isConnected) return;
      const health = payload.health || {};
      const scanner = health.scanner || {};
      const queue = payload.queue || {};
      const recent = (payload.recent || []).slice(0, 12);
      const badge = health.ready ? 'good' : 'bad';
      panel.innerHTML = `
        <div class="admin-panel-head"><div><h2>ClamAV scanner</h2><p>Стриминговая проверка файлов, quarantine и CLEAN-only delivery</p></div><span class="admin-badge ${badge}">${health.ready ? 'HEALTHY' : health.stale ? 'STALE' : 'NOT READY'}</span></div>
        <div class="admin-stat-grid">
          <div class="admin-stat"><strong>${Number(queue.clean || 0)}</strong><span>Clean</span></div>
          <div class="admin-stat"><strong>${Number(queue.pending || 0)}</strong><span>Pending</span></div>
          <div class="admin-stat"><strong>${Number(queue.failed || 0)}</strong><span>Failed</span></div>
          <div class="admin-stat"><strong>${Number(queue.quarantined || 0)}</strong><span>Quarantine</span></div>
        </div>
        <div class="admin-compact-row"><div class="admin-compact-copy"><strong>${esc(scanner.engine || 'ClamAV')} ${esc(scanner.engine_version || '')}</strong><span>Signatures: ${esc(scanner.signatures_version || '—')} · Last heartbeat: ${fmt(scanner.last_seen_at)} · Last scan: ${fmt(scanner.last_scan_at)}</span>${scanner.last_error ? `<small>${esc(scanner.last_error)}</small>` : ''}</div></div>
        <div class="admin-user-commandbar"><button id="scannerBackfill">Backfill unscanned</button><button id="scannerRetryFailed">Retry failed</button></div>
        ${recent.length ? `<div class="admin-panel-head"><div><h3>Последние файлы</h3><p>Можно вручную отправить файл на повторную проверку; quarantine hold останется до CLEAN.</p></div></div>${recent.map(scannerRow).join('')}` : '<div class="admin-empty">Файлов для отображения нет.</div>'}`;
      document.getElementById('scannerBackfill')?.addEventListener('click', () => scannerAction('backfill'));
      document.getElementById('scannerRetryFailed')?.addEventListener('click', () => scannerAction('retry_failed'));
      panel.querySelectorAll('[data-rescan-asset]').forEach(button => button.addEventListener('click', () => scannerAction('rescan_asset', Number(button.dataset.rescanAsset))));
      admin.icons?.();
    } catch (error) {
      if (panel.isConnected) panel.innerHTML = `<div class="admin-empty">ClamAV scanner: ${esc(error?.message || error)}</div>`;
    }
  }

  function scannerRow(asset) {
    const blocked = asset.quarantined_at || asset.quarantine_reason || ['infected','suspicious'].includes(asset.scan_status);
    const tone = asset.scan_status === 'clean' ? 'good' : blocked ? 'bad' : 'pending';
    return `<div class="admin-compact-row"><div class="admin-compact-copy"><strong>#${Number(asset.id)} · ${esc(asset.file_name || 'file')}</strong><span>${esc(asset.publication_title || '')} · ${esc(asset.scan_status || 'unknown')} · attempts ${Number(asset.scan_attempts || 0)}</span>${asset.scan_threat_name || asset.scan_error ? `<small>${esc(asset.scan_threat_name || asset.scan_error)}</small>` : ''}</div><span class="admin-badge ${tone}">${blocked ? 'QUARANTINE' : esc(asset.scan_status || 'unknown')}</span><button data-rescan-asset="${Number(asset.id)}">Rescan</button></div>`;
  }

  async function scannerAction(action, assetId = 0) {
    try {
      const body = { action, ...(assetId ? { asset_id: assetId } : {}) };
      const result = await admin.api('/api/app/admin/security/scanner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      admin.toast?.(result.changed !== undefined ? `Scanner queue updated: ${result.changed}` : 'Файл отправлен на повторную проверку.');
      document.getElementById('scannerSecurityPanel')?.remove();
      await renderScanner();
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    }
  }

  async function saveRegional() {
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
      await renderRegional();
    } catch (error) {
      admin.toast?.(error?.message || String(error), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function fmt(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
    catch { return String(value); }
  }

  document.addEventListener('dtl:adminrender', event => {
    ensureUsersNavigation();
    if (event.detail?.section === 'security') {
      void renderRegional();
      void renderScanner();
    }
  });
  document.addEventListener('dtl:adminroutechange', ensureUsersNavigation);
  queueMicrotask(ensureUsersNavigation);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(ensureUsersNavigation);
})();
