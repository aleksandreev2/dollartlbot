import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_BATCH = 16;
const MAX_EVENT_ID = 96;
const MAX_SESSION_ID = 80;
const MAX_SURFACE = 64;
const MAX_EVENT_VALUE = 120;
const MAX_QUERY = 300;
const MAX_METADATA_BYTES = 1200;
const MAX_METADATA_KEYS = 12;
const EVENT_ID_RE = /^[A-Za-z0-9._:-]{8,96}$/;
const SESSION_ID_RE = /^[A-Za-z0-9._:-]{8,80}$/;

export const PRODUCT_EVENT_NAMES = [
  'discover_search',
  'discover_zero_result',
  'catalog_open',
  'raw_open',
  'duplicate_intercepted',
  'title_open',
  'share_title',
  'release_open',
  'boosty_click',
  'suggest_started',
  'suggest_step',
  'suggest_abandoned',
  'request_submitted',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];
const PRODUCT_EVENT_SET = new Set<string>(PRODUCT_EVENT_NAMES);
const METADATA_KEYS = new Set([
  'result_count',
  'mode',
  'origin',
  'provider',
  'position',
  'status',
  'target',
  'reason',
  'has_raw',
  'publication_status',
  'language',
]);

type ClientEvent = {
  event_id?: unknown;
  event_name?: unknown;
  session_id?: unknown;
  submission_id?: unknown;
  catalog_id?: unknown;
  surface?: unknown;
  event_value?: unknown;
  query?: unknown;
  metadata?: unknown;
};

type NormalizedEvent = {
  eventId: string | null;
  eventName: ProductEventName;
  sessionId: string | null;
  submissionId: number | null;
  catalogId: number | null;
  surface: string | null;
  eventValue: string | null;
  queryText: string | null;
  metadataJson: string | null;
};

export async function handleProductAnalyticsEventRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/app/analytics/events') return null;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return miniAppJsonError('analytics_payload_too_large', 'Analytics batch is too large.', 413);
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return miniAppJsonError('invalid_analytics_payload', 'Analytics payload must be valid JSON.', 400);
  }
  const serializedLength = JSON.stringify(body).length;
  if (serializedLength > MAX_BODY_BYTES) {
    return miniAppJsonError('analytics_payload_too_large', 'Analytics batch is too large.', 413);
  }

  const incoming = body && typeof body === 'object' && Array.isArray((body as { events?: unknown }).events)
    ? (body as { events: unknown[] }).events
    : [];
  if (!incoming.length || incoming.length > MAX_BATCH) {
    return miniAppJsonError('invalid_analytics_batch', `Send between 1 and ${MAX_BATCH} analytics events.`, 400);
  }

  const events: NormalizedEvent[] = [];
  for (const value of incoming) {
    const normalized = normalizeClientEvent(value);
    if (!normalized) continue;
    events.push(normalized);
  }
  if (!events.length) return miniAppJson({ ok: true, accepted: 0 });

  const now = new Date();
  const createdAt = now.toISOString();
  const statements = events.map((event) => env.DB.prepare(`
    INSERT OR IGNORE INTO product_events (
      event_id,event_name,user_id,session_id,submission_id,catalog_id,surface,event_value,
      query_text,metadata_json,source,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'client',?)
  `).bind(
    event.eventId,
    event.eventName,
    auth.telegramUser.id,
    event.sessionId,
    event.submissionId,
    event.catalogId,
    event.surface,
    event.eventValue,
    event.queryText,
    event.metadataJson,
    createdAt,
  ));
  const results = await env.DB.batch(statements);
  const accepted = results.reduce((sum, result) => sum + Number(result.meta.changes ?? 0), 0);

  await maybeRunAnalyticsCleanup(env, now);
  return miniAppJson({ ok: true, accepted });
}

async function maybeRunAnalyticsCleanup(env: Env, now: Date): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  const state = await env.DB.prepare(`
    SELECT state_value FROM product_analytics_state WHERE state_key='retention_day'
  `).first<{ state_value: string | null }>();
  if (state?.state_value === today) return;

  const cutoff = new Date(now.getTime() - EVENT_RETENTION_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM product_events WHERE created_at<?').bind(cutoff),
    env.DB.prepare(`
      INSERT INTO product_analytics_state (state_key,state_value,updated_at)
      VALUES ('retention_day',?,?)
      ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at
    `).bind(today, now.toISOString()),
  ]);
}

function normalizeClientEvent(value: unknown): NormalizedEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = value as ClientEvent;
  const eventName = cleanString(event.event_name, 48);
  if (!PRODUCT_EVENT_SET.has(eventName)) return null;

  const eventIdRaw = cleanString(event.event_id, MAX_EVENT_ID);
  const eventId = eventIdRaw && EVENT_ID_RE.test(eventIdRaw) ? eventIdRaw : null;
  const sessionRaw = cleanString(event.session_id, MAX_SESSION_ID);
  const sessionId = sessionRaw && SESSION_ID_RE.test(sessionRaw) ? sessionRaw : null;
  const surface = cleanString(event.surface, MAX_SURFACE) || null;
  const eventValue = cleanString(event.event_value, MAX_EVENT_VALUE) || null;
  const queryText = cleanQuery(event.query);
  const metadataJson = sanitizeMetadata(event.metadata);

  return {
    eventId,
    eventName: eventName as ProductEventName,
    sessionId,
    submissionId: positiveId(event.submission_id),
    catalogId: positiveId(event.catalog_id),
    surface,
    eventValue,
    queryText,
    metadataJson,
  };
}

function sanitizeMetadata(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(result).length >= MAX_METADATA_KEYS || !METADATA_KEYS.has(key)) continue;
    if (typeof raw === 'boolean') result[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = Math.max(-1_000_000_000, Math.min(1_000_000_000, raw));
    else if (typeof raw === 'string') {
      const text = cleanString(raw, 120);
      if (text) result[key] = text;
    }
  }
  if (!Object.keys(result).length) return null;
  const json = JSON.stringify(result);
  return json.length <= MAX_METADATA_BYTES ? json : null;
}

function cleanQuery(value: unknown): string | null {
  const text = cleanString(value, MAX_QUERY).normalize('NFKC').replace(/\s+/g, ' ').trim();
  return text ? text.toLowerCase() : null;
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
