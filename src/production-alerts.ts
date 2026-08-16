import { errorText } from './db';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { recordSecurityEvent } from './security-events';
import type { TelegramClient } from './telegram';

type Finding = {
  key: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  value: string;
};

export async function runProductionSecurityAlerts(env: Env, telegram: TelegramClient): Promise<void> {
  await pruneSecurityEvents(env).catch((error) => {
    console.warn(JSON.stringify({ event: 'security_event_retention_failed', error: errorText(error) }));
  });
  if (!(await runtimeFlag(env, 'security_alerts_enabled', true))) return;
  const adminId = Number(env.ADMIN_TELEGRAM_ID || 0);
  if (!Number.isSafeInteger(adminId) || adminId <= 0) return;

  const findings = await collectSecurityFindings(env);
  const activeKeys = new Set(findings.map((finding) => finding.key));
  const cooldownMinutes = bounded(
    await getRuntimeSetting(env, 'security_alert_cooldown_minutes', '60'),
    60,
    5,
    1440,
  );

  for (const finding of findings) {
    if (!(await shouldFire(env, finding, cooldownMinutes))) continue;
    const icon = finding.severity === 'critical' ? '🔴' : '🟠';
    try {
      await telegram.sendMessage(
        adminId,
        `${icon} <b>Dollar TL Production Alert</b>\n\n<b>${escapeHtml(finding.title)}</b>\n${escapeHtml(finding.detail)}`,
      );
      await markAlert(env, finding, 'firing');
      await recordSecurityEvent(env, 'production_alert_fired', 'production_alerts', {
        severity: finding.severity,
        metadata: { key: finding.key, value: finding.value },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'production_alert_delivery_failed', key: finding.key, error: errorText(error) }));
    }
  }

  await clearRecovered(env, activeKeys);
}

export async function collectSecurityFindings(env: Env): Promise<Finding[]> {
  const findings: Finding[] = [];
  const [settings, scanner, assets, autobans] = await Promise.all([
    env.DB.prepare(`
      SELECT key,value FROM app_settings
      WHERE key IN ('regional_routing_enabled','download_gate_enabled','asset_scan_enforcement','channel_leave_autoban_enabled')
    `).all<{ key: string; value: string }>(),
    env.DB.prepare(`
      SELECT ready,last_seen_at,last_error FROM asset_scanner_health
      ORDER BY last_seen_at DESC LIMIT 1
    `).first<{ ready: number; last_seen_at: string; last_error: string | null }>().catch(() => null),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN scan_status IN ('pending','legacy_unscanned','scanning') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN scan_status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN quarantined_at IS NOT NULL THEN 1 ELSE 0 END) AS quarantined
      FROM publication_assets
    `).first<Record<string, number>>().catch(() => null),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('pending','retry') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
      FROM channel_leave_auto_bans
    `).first<Record<string, number>>().catch(() => null),
  ]);

  const config = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
  if (config.regional_routing_enabled === '1' && config.download_gate_enabled !== '1') {
    findings.push({
      key: 'regional_without_private_delivery', severity: 'critical',
      title: 'Regional routing configuration is unsafe',
      detail: 'Regional routing is enabled while private download delivery is disabled.',
      value: 'regional=1;download=0',
    });
  }

  const enforcement = config.asset_scan_enforcement === '1';
  const pending = Number(assets?.pending || 0);
  const failed = Number(assets?.failed || 0);
  const quarantined = Number(assets?.quarantined || 0);
  if (enforcement && (pending > 0 || failed > 0)) {
    findings.push({
      key: 'av_backlog', severity: failed > 0 ? 'critical' : 'warning',
      title: 'File security backlog',
      detail: `AV enforcement is active. Pending: ${pending}. Failed: ${failed}.`,
      value: `${pending}:${failed}`,
    });
  }
  if (quarantined > 0) {
    findings.push({
      key: 'quarantined_assets', severity: 'critical',
      title: 'Quarantined publication assets detected',
      detail: `${quarantined} asset(s) are quarantined and cannot be delivered. Review Admin → Security.`,
      value: String(quarantined),
    });
  }

  if (enforcement) {
    const lastSeen = scanner?.last_seen_at ? Date.parse(scanner.last_seen_at) : 0;
    const stale = !lastSeen || lastSeen < Date.now() - 20 * 60_000;
    if (!scanner || scanner.ready !== 1 || stale) {
      findings.push({
        key: 'scanner_unhealthy', severity: pending > 0 ? 'critical' : 'warning',
        title: 'ClamAV scanner is not healthy',
        detail: scanner?.last_seen_at
          ? `Last heartbeat: ${scanner.last_seen_at}. ${scanner.last_error || ''}`.trim()
          : 'No scanner heartbeat has been recorded.',
        value: scanner?.last_seen_at || 'missing',
      });
    }
  }

  const autoBanFailed = Number(autobans?.failed || 0);
  const autoBanPending = Number(autobans?.pending || 0);
  if (config.channel_leave_autoban_enabled === '1' && autoBanFailed > 0) {
    findings.push({
      key: 'autoban_failures', severity: 'warning',
      title: 'Channel auto-ban failures',
      detail: `Failed: ${autoBanFailed}. Pending/retry: ${autoBanPending}.`,
      value: `${autoBanFailed}:${autoBanPending}`,
    });
  }
  return findings;
}

async function pruneSecurityEvents(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();
  await env.DB.prepare(`
    DELETE FROM security_events
    WHERE id IN (
      SELECT id FROM security_events WHERE created_at<? ORDER BY id LIMIT 500
    )
  `).bind(cutoff).run();
}

async function shouldFire(env: Env, finding: Finding, cooldownMinutes: number): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT status,last_fired_at,last_value FROM incident_alert_state WHERE alert_key=?
  `).bind(finding.key).first<{ status: string; last_fired_at: string | null; last_value: string | null }>().catch(() => null);
  if (!row) return true;
  if (row.status !== 'firing') return true;
  if (row.last_value !== finding.value) return true;
  const last = row.last_fired_at ? Date.parse(row.last_fired_at) : 0;
  return last < Date.now() - cooldownMinutes * 60_000;
}

async function markAlert(env: Env, finding: Finding, status: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO incident_alert_state(alert_key,status,last_fired_at,last_value,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(alert_key) DO UPDATE SET
      status=excluded.status,last_fired_at=excluded.last_fired_at,last_value=excluded.last_value,updated_at=excluded.updated_at
  `).bind(finding.key, status, now, finding.value, now).run();
}

async function clearRecovered(env: Env, activeKeys: Set<string>): Promise<void> {
  const rows = await env.DB.prepare(`SELECT alert_key FROM incident_alert_state WHERE status='firing'`)
    .all<{ alert_key: string }>().catch(() => ({ results: [] as { alert_key: string }[] }));
  const now = new Date().toISOString();
  for (const row of rows.results) {
    if (activeKeys.has(row.alert_key)) continue;
    await env.DB.prepare(`UPDATE incident_alert_state SET status='clear',updated_at=? WHERE alert_key=?`)
      .bind(now, row.alert_key).run();
  }
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
