(() => {
  const admin = window.DTL_ADMIN;
  const runtime = window.DTL_RUNTIME;
  if (!admin?.registerRoute || !runtime?.registerPatcher) throw new Error('Canonical admin runtime must load before admin-disaster-recovery.js');

  let active = false;
  let busy = false;
  let last = null;
  const routeId = 'tools:recovery';
  const api = (path, options = {}) => admin.api(path, options);
  const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const fmt = value => { try { return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—'; } catch { return value || '—'; } };
  const bytes = value => { const n = Number(value || 0); if (!n) return '0 B'; const units = ['B','KB','MB','GB','TB']; const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024))); return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`; };
  const toast = (text, error = false) => admin.toast?.(text, error);

  function installNav() {
    for (const nav of document.querySelectorAll('.admin-side-nav,.admin-mobile-nav')) {
      if (nav.querySelector('[data-admin-tools="recovery"]')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.adminTools = 'recovery';
      button.innerHTML = `${icon('hard-drive-download')}<span>Recovery</span>`;
      const health = nav.querySelector('[data-admin-health]');
      const settings = nav.querySelector('[data-admin-section="settings"]');
      if (health) health.after(button); else if (settings) settings.before(button); else nav.append(button);
    }
    markActive();
    admin.icons?.();
  }

  function markActive() {
    document.querySelectorAll('[data-admin-tools="recovery"]').forEach(button => button.classList.toggle('active', active));
    if (active) document.querySelectorAll('[data-admin-section],[data-admin-health],[data-admin-tools]:not([data-admin-tools="recovery"])').forEach(button => button.classList.remove('active'));
  }

  async function render() {
    active = true;
    markActive();
    admin.setHead?.('Disaster Recovery', 'Portable D1 backups, R2 inventory, incidents и legacy cleanup');
    admin.content?.(`<div class="admin-loading">${icon('loader-circle')} Загружаем recovery state…</div>`);
    try {
      last = await api('/api/app/admin/disaster-recovery');
      if (active) paint(last);
    } catch (error) {
      if (!active || error?.name === 'AbortError') return false;
      admin.content?.(`<div class="admin-panel admin-error">${icon('triangle-alert')}<strong>Recovery state недоступен</strong><span>${esc(error.message)}</span></div>`);
      return false;
    }
    return true;
  }

  function paint(data) {
    if (!active) return;
    const backups = Array.isArray(data.backups) ? data.backups : [];
    const incidents = Array.isArray(data.incidents) ? data.incidents : [];
    const legacy = data.legacy || {};
    const legacySummary = legacy.summary || {};
    const legacyRows = Array.isArray(legacy.publications) ? legacy.publications : [];
    const cfg = data.config || {};
    const latest = backups[0] || null;
    const latestCompleted = backups.find(item => item.status === 'completed') || null;
    const latestVerified = backups.find(item => item.verify_status === 'verified') || null;
    const openIncidents = incidents.filter(item => item.status === 'open');

    admin.content?.(`<section class="admin-recovery-workspace">
      <div class="admin-stat-grid">
        ${statCard('database-backup', latestCompleted ? fmt(latestCompleted.completed_at) : 'НЕТ', 'Последний backup', latestCompleted ? 'green' : 'orange')}
        ${statCard('badge-check', latestVerified ? fmt(latestVerified.verified_at) : 'НЕТ', 'Последняя verify', latestVerified ? 'green' : 'orange')}
        ${statCard('archive', latestCompleted ? Number(latestCompleted.r2_object_count || 0) : 0, 'R2 objects inventoried', 'blue')}
        ${statCard('shield-alert', openIncidents.length, 'Open incidents', openIncidents.some(x => x.severity === 'critical') ? 'orange' : 'green')}
      </div>

      <section class="admin-panel">
        <div class="admin-panel-head"><div><h2>Recovery policy</h2><p>Portable logical backup в private R2 + SHA-256 verification. Для точного point-in-time rollback используйте Cloudflare D1 Time Travel.</p></div><span class="admin-badge ${String(cfg.dr_backup_enabled) !== '0' ? 'ok' : 'warn'}">${String(cfg.dr_backup_enabled) !== '0' ? 'AUTO ON' : 'AUTO OFF'}</span></div>
        <div class="settings-admin-grid">
          <div>
            <label class="admin-field"><span>Automatic backups</span><select id="drBackupEnabled"><option value="1" ${String(cfg.dr_backup_enabled) !== '0' ? 'selected' : ''}>Enabled</option><option value="0" ${String(cfg.dr_backup_enabled) === '0' ? 'selected' : ''}>Disabled</option></select></label>
            <label class="admin-field"><span>Backup interval, hours</span><input id="drBackupInterval" type="number" min="1" max="168" value="${Number(cfg.dr_backup_interval_hours || 24)}"></label>
            <label class="admin-field"><span>Retry after failure, hours</span><input id="drBackupRetry" type="number" min="1" max="48" value="${Number(cfg.dr_backup_retry_hours || 6)}"></label>
          </div>
          <div>
            <label class="admin-field"><span>Retention, days</span><input id="drBackupRetention" type="number" min="3" max="365" value="${Number(cfg.dr_backup_retention_days || 30)}"></label>
            <label class="admin-field"><span>D1 rows per chunk</span><input id="drBackupChunkRows" type="number" min="50" max="2000" value="${Number(cfg.dr_backup_chunk_rows || 500)}"></label>
            <small>Backup chunks не дублируют сами R2-файлы: inventory фиксирует key/size/etag, а оригинальные assets остаются в private bucket.</small>
          </div>
        </div>
        <div class="admin-user-commandbar">
          <button id="saveDrConfig">${icon('save')} Сохранить</button>
          <button id="createDrBackup">${icon('database-backup')} Создать backup сейчас</button>
          ${latestCompleted ? `<button data-verify-backup="${esc(latestCompleted.id)}">${icon('scan-search')} Verify latest</button>` : ''}
          <button id="pruneDrBackups">${icon('trash-2')} Retention cleanup</button>
        </div>
      </section>

      <div class="admin-dashboard-grid">
        <section class="admin-panel">
          <div class="admin-panel-head"><div><h2>Backup history</h2><p>D1 table chunks + R2 inventory manifest</p></div><span class="admin-count">${backups.length}</span></div>
          ${backups.length ? backups.map(backupRow).join('') : '<div class="admin-empty">Backups ещё не создавались.</div>'}
        </section>
        <section class="admin-panel">
          <div class="admin-panel-head"><div><h2>Incident history</h2><p>Проблема остаётся одной incident-записью до recovery</p></div><span class="admin-count">${incidents.length}</span></div>
          ${incidents.length ? incidents.slice(0, 30).map(incidentRow).join('') : '<div class="admin-empty">Production incidents пока не зафиксированы.</div>'}
        </section>
      </div>

      <section class="admin-panel">
        <div class="admin-panel-head"><div><h2>Legacy publications cleanup</h2><p>Gate создаётся первым. Только после его подтверждения бот пытается удалить старые публичные file messages.</p></div><span class="admin-badge ${Number(legacySummary.legacy_releases || 0) ? 'warn' : 'ok'}">${Number(legacySummary.legacy_releases || 0)} LEGACY</span></div>
        <div class="admin-stat-grid">
          ${miniStat(legacySummary.legacy_releases, 'Legacy releases')}
          ${miniStat(legacySummary.recent_auto_candidates, 'Можно auto-clean')}
          ${miniStat(legacySummary.old_manual_candidates, 'Старые / manual')}
          ${miniStat(legacySummary.needs_manual_cleanup, 'Manual cleanup')}
        </div>
        <div class="admin-user-commandbar">
          <button id="convertSafeLegacy" ${Number(legacySummary.recent_auto_candidates || 0) ? '' : 'disabled'}>${icon('shield-check')} Protect safe batch</button>
        </div>
        <p class="admin-note">Telegram Bot API имеет ограниченное окно для удаления сообщений. Старые сообщения не считаются автоматически очищенными: они остаются в <b>needs_manual_cleanup</b> с сохранёнными message ID.</p>
        ${legacyRows.length ? `<div class="admin-user-timeline">${legacyRows.map(legacyRow).join('')}</div>` : '<div class="admin-empty">Legacy хвоста нет.</div>'}
      </section>
    </section>`);
    bind();
    admin.icons?.();
  }

  function statCard(ic, value, label, tone) { return `<div class="admin-stat ${esc(tone)}"><div class="admin-stat-icon">${icon(ic)}</div><div><strong class="admin-stat-small">${esc(value)}</strong><span>${esc(label)}</span></div></div>`; }
  function miniStat(value, label) { return `<div class="admin-stat"><strong>${Number(value || 0)}</strong><span>${esc(label)}</span></div>`; }

  function backupRow(item) {
    const verify = item.verify_status === 'verified' ? '<span class="admin-badge ok">VERIFIED</span>' : item.verify_status === 'failed' ? '<span class="admin-badge bad">VERIFY FAILED</span>' : '<span class="admin-badge warn">NOT VERIFIED</span>';
    const status = item.status === 'completed' ? '<span class="admin-badge ok">COMPLETED</span>' : item.status === 'failed' ? '<span class="admin-badge bad">FAILED</span>' : '<span class="admin-badge warn">RUNNING</span>';
    return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon(item.status === 'completed' ? 'database-backup' : 'triangle-alert')}</div><div class="admin-compact-copy"><strong>${esc(item.id)}</strong><span>${Number(item.table_count || 0)} tables · ${Number(item.row_count || 0)} rows · ${Number(item.chunk_count || 0)} chunks · ${bytes(item.byte_count)}</span><small>${fmt(item.started_at)}${item.error_text ? ` · ${esc(item.error_text)}` : ''}</small></div><div>${status}${verify}${item.status === 'completed' ? `<button class="admin-linklike" data-verify-backup="${esc(item.id)}">Verify</button>` : ''}</div></div>`;
  }

  function incidentRow(item) {
    const duration = item.resolved_at ? `${Math.max(0, Math.round((new Date(item.resolved_at) - new Date(item.opened_at)) / 60000))}m` : 'open';
    return `<div class="admin-compact-row"><div class="admin-compact-icon">${icon(item.status === 'open' ? 'siren' : 'circle-check')}</div><div class="admin-compact-copy"><strong>${esc(item.title || item.incident_key)}</strong><span>${esc(item.incident_key)} · ${Number(item.occurrences || 1)} checks · ${duration}</span><small>${fmt(item.opened_at)}${item.resolved_at ? ` → ${fmt(item.resolved_at)}` : ''}</small></div><span class="admin-badge ${item.status === 'open' ? item.severity === 'critical' ? 'bad' : 'warn' : 'ok'}">${esc(item.status)}</span></div>`;
  }

  function legacyRow(item) {
    const manual = item.cleanup_status === 'needs_manual_cleanup';
    let details = null;
    try { details = item.details_json ? JSON.parse(item.details_json) : null; } catch {}
    const remaining = Array.isArray(details?.remaining_messages) ? details.remaining_messages.map(x => x.message_id).filter(Boolean) : [];
    const missing = Number(item.missing_message_ids || 0);
    const label = manual ? 'MANUAL' : item.cleanup_status === 'failed' ? 'FAILED' : item.download_gate_status === 'legacy' ? 'LEGACY' : 'PROTECTED';
    return `<div class="admin-profile-line"><div><strong>#${Number(item.id)} · ${esc(item.internal_title || 'Без названия')}</strong><span>${Number(item.asset_count || 0)} files · public IDs ${Number(item.public_message_ids || 0)} · missing IDs ${missing} · published ${fmt(item.published_at)}</span>${remaining.length ? `<small>Удалить вручную message ID: ${remaining.map(esc).join(', ')}</small>` : ''}${item.last_error ? `<small>${esc(item.last_error)}</small>` : ''}</div><div><span class="admin-badge ${manual || item.cleanup_status === 'failed' ? 'warn' : 'draft'}">${label}</span>${item.download_gate_status === 'legacy' ? `<button class="admin-linklike" data-convert-legacy="${Number(item.id)}">Protect</button>` : ''}</div></div>`;
  }

  function bind() {
    document.getElementById('saveDrConfig')?.addEventListener('click', () => void saveConfig());
    document.getElementById('createDrBackup')?.addEventListener('click', () => void action('create_backup', {}, 'Создаём portable backup…'));
    document.getElementById('pruneDrBackups')?.addEventListener('click', () => { if (confirm('Удалить backup-объекты старше retention периода?')) void action('prune_backups', {}, 'Чистим старые backups…'); });
    document.getElementById('convertSafeLegacy')?.addEventListener('click', () => { if (confirm('Защитить до 5 свежих legacy-релизов? Gate создаётся первым, затем бот удалит только сообщения в безопасном окне.')) void action('convert_safe_legacy', { limit: 5 }, 'Конвертируем legacy batch…'); });
    document.querySelectorAll('[data-verify-backup]').forEach(button => button.addEventListener('click', () => void action('verify_backup', { backup_id: button.dataset.verifyBackup }, 'Проверяем каждый backup chunk…')));
    document.querySelectorAll('[data-convert-legacy]').forEach(button => button.addEventListener('click', () => { if (confirm(`Защитить publication #${button.dataset.convertLegacy}? Старые сообщения могут потребовать ручного удаления.`)) void action('convert_legacy', { publication_id: Number(button.dataset.convertLegacy) }, 'Создаём gate и очищаем legacy…'); }));
  }

  async function saveConfig() {
    await action('save_config', {
      enabled: document.getElementById('drBackupEnabled')?.value !== '0',
      interval_hours: Number(document.getElementById('drBackupInterval')?.value || 24),
      retry_hours: Number(document.getElementById('drBackupRetry')?.value || 6),
      retention_days: Number(document.getElementById('drBackupRetention')?.value || 30),
      chunk_rows: Number(document.getElementById('drBackupChunkRows')?.value || 500),
    }, 'Сохраняем recovery policy…');
  }

  async function action(name, payload, progress) {
    if (busy) return;
    busy = true;
    admin.content?.(`<div class="admin-loading">${icon('loader-circle')} ${esc(progress)}</div>`);
    try {
      last = await api('/api/app/admin/disaster-recovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: name, ...payload }) });
      toast('Recovery operation completed.');
      if (active) paint(last);
    } catch (error) {
      toast(error.message, true);
      if (active) await render();
    } finally {
      busy = false;
    }
  }

  function deactivate() { active = false; document.querySelectorAll('[data-admin-tools="recovery"]').forEach(button => button.classList.remove('active')); }

  document.addEventListener('dtl:adminrender', installNav);
  runtime.registerPatcher(() => { if (document.querySelector('.admin-v2')) installNav(); });
  admin.registerRoute(routeId, { mount: () => render(), refresh: () => render(), unmount: () => deactivate() });
  window.DTL_ADMIN_RECOVERY = Object.freeze({ render, refresh: render, isActive: () => active });
})();
