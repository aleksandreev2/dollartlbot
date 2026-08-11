import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const CLAIM_TTL_MS = 35 * 60 * 1000;
const NOVELPIA_ID_RE = /^\d{2,9}$/;

type CanonicalIdentity = {
  type: 'novelpia';
  value: string;
  provider: 'novelpia' | 'raw_fucknovelpia' | 'source_url';
};

export type SubmissionIdentityInput = {
  provider: string;
  externalId: string;
  sourceUrl: string;
};

export type SubmissionIdentityGuard = {
  identity: CanonicalIdentity;
  userId: number;
  claimRequestId: string;
};

type DuplicateRow = {
  id: number;
  title: string;
  status: string;
  queue_status: string | null;
  queue_position: number | null;
  chapter_count: number;
  current_chapter: number | null;
};

type IdentityRow = {
  submission_id: number | null;
  claim_user_id: number | null;
  claim_request_id: string | null;
  claim_expires_at: string | null;
};

export async function handleSubmissionIdentityPreflight(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/app/submission/preflight') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  const body = await readJson<Record<string, unknown>>(request);
  const input: SubmissionIdentityInput = {
    provider: String(body.provider ?? ''),
    externalId: String(body.external_id ?? ''),
    sourceUrl: String(body.source_url ?? ''),
  };
  const identity = canonicalIdentity(input);
  if (!identity) return miniAppJson({ ok: true, identity: null });

  const duplicate = await activeDuplicate(env, identity);
  if (duplicate) return duplicateResponse(duplicate, identity);
  return miniAppJson({ ok: true, identity: identityKey(identity) });
}

/**
 * Exact duplicate check for the real submit route. The caller invokes this
 * after ordinary payload validation but before Boosty / quota work so direct API
 * calls receive the same quota-safe behavior as the Mini App preflight.
 */
export async function checkSubmissionIdentityDuplicate(
  env: Env,
  input: SubmissionIdentityInput,
): Promise<Response | null> {
  const identity = canonicalIdentity(input);
  if (!identity) return null;
  const duplicate = await activeDuplicate(env, identity);
  return duplicate ? duplicateResponse(duplicate, identity) : null;
}

/**
 * Claims one exact external title identity after the normal submit payload has
 * already been parsed and a quota reservation exists, but before Telegram file
 * upload begins. This deliberately accepts parsed values rather than Request so
 * a large multipart body is never cloned / parsed twice inside the Worker.
 */
export async function claimSubmissionIdentity(
  env: Env,
  userId: number,
  requestId: string,
  input: SubmissionIdentityInput,
): Promise<SubmissionIdentityGuard | Response | null> {
  const identity = canonicalIdentity(input);
  if (!identity) return null;

  const duplicate = await activeDuplicate(env, identity);
  if (duplicate) return duplicateResponse(duplicate, identity);

  const claimed = await claimIdentity(env, userId, requestId, identity);
  if (claimed instanceof Response) return claimed;
  return { identity, userId, claimRequestId: requestId };
}

/**
 * Binds a successfully committed submission to the claim it held while its raw
 * file was being transferred. A failure is intentionally surfaced: the same
 * request ID can be retried without uploading the file again and reconciled.
 */
export async function bindSubmissionIdentity(
  env: Env,
  guard: SubmissionIdentityGuard | null,
  submissionId: number,
): Promise<Response | null> {
  if (!guard) return null;
  const now = new Date().toISOString();
  const bound = await env.DB.prepare(`
    UPDATE title_identities
    SET submission_id=?, claim_user_id=NULL, claim_request_id=NULL, claim_expires_at=NULL,
        source_provider=?, updated_at=?
    WHERE identity_type=? AND identity_value=?
      AND (
        submission_id=?
        OR (
          submission_id IS NULL
          AND claim_user_id=?
          AND claim_request_id=?
        )
      )
  `).bind(
    submissionId,
    guard.identity.provider,
    now,
    guard.identity.type,
    guard.identity.value,
    submissionId,
    guard.userId,
    guard.claimRequestId,
  ).run();

  if (Number(bound.meta.changes ?? 0) >= 1) return null;
  const row = await identityRow(env, guard.identity);
  if (Number(row?.submission_id) === submissionId) return null;
  return identityBindingError(submissionId, guard.identity, row?.submission_id ?? null);
}

/**
 * Handles idempotent retries where the submission was already committed before
 * the caller received a success response. It never creates a second request;
 * it only makes sure the exact identity points at that already committed row.
 */
export async function reconcileCommittedSubmissionIdentity(
  env: Env,
  submissionId: number,
  input: SubmissionIdentityInput,
): Promise<Response | null> {
  const identity = canonicalIdentity(input);
  if (!identity) return null;

  const duplicate = await activeDuplicate(env, identity);
  if (duplicate && duplicate.id !== submissionId) {
    console.error(JSON.stringify({
      event: 'submission_identity_reconcile_conflict',
      submission_id: submissionId,
      identity: identityKey(identity),
      canonical_submission_id: duplicate.id,
    }));
    return miniAppJsonError(
      'submission_identity_conflict',
      'This request already exists, but its exact title identity belongs to a different Dollar TL request. No new upload was performed; contact support so the duplicate can be reconciled safely.',
      503,
      {
        submission_id: submissionId,
        canonical_submission_id: duplicate.id,
        identity: identityKey(identity),
        retry_same_request: true,
      },
    );
  }

  const now = new Date().toISOString();
  await clearRejectedOwner(env, identity, now);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO title_identities (
      identity_type,identity_value,submission_id,claim_user_id,claim_request_id,claim_expires_at,
      source_provider,created_at,updated_at
    ) VALUES (?,?,?,NULL,NULL,NULL,?,?,?)
  `).bind(
    identity.type,
    identity.value,
    submissionId,
    identity.provider,
    now,
    now,
  ).run();
  await env.DB.prepare(`
    UPDATE title_identities
    SET submission_id=?, claim_user_id=NULL, claim_request_id=NULL, claim_expires_at=NULL,
        source_provider=?, updated_at=?
    WHERE identity_type=? AND identity_value=?
      AND (submission_id IS NULL OR submission_id=?)
  `).bind(
    submissionId,
    identity.provider,
    now,
    identity.type,
    identity.value,
    submissionId,
  ).run();

  const row = await identityRow(env, identity);
  if (Number(row?.submission_id) === submissionId) return null;
  return identityBindingError(submissionId, identity, row?.submission_id ?? null);
}

export async function releaseSubmissionIdentityGuard(
  env: Env,
  guard: SubmissionIdentityGuard | null,
): Promise<void> {
  if (!guard) return;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE title_identities
    SET claim_user_id=NULL,claim_request_id=NULL,claim_expires_at=NULL,updated_at=?
    WHERE identity_type=? AND identity_value=? AND submission_id IS NULL
      AND claim_user_id=? AND claim_request_id=?
  `).bind(
    now,
    guard.identity.type,
    guard.identity.value,
    guard.userId,
    guard.claimRequestId,
  ).run();
}

export async function canonicalIdentityKeysForSubmission(env: Env, submissionId: number): Promise<string[]> {
  const rows = await env.DB.prepare(`
    SELECT identity_type, identity_value
    FROM title_identities
    WHERE submission_id=?
    ORDER BY CASE WHEN identity_type='novelpia' THEN 0 ELSE 1 END, identity_type, identity_value
  `).bind(submissionId).all<{ identity_type: string; identity_value: string }>();
  const keys = rows.results
    .map((row) => `${row.identity_type}:${row.identity_value}`)
    .filter((key) => /^[a-z0-9_]+:[A-Za-z0-9._-]+$/.test(key));
  keys.push(`submission:${submissionId}`);
  return [...new Set(keys)];
}

export function novelpiaFollowKey(externalId: string): string | null {
  const id = cleanNovelpiaId(externalId);
  return id ? `novelpia:${id}` : null;
}

function canonicalIdentity(input: SubmissionIdentityInput): CanonicalIdentity | null {
  const provider = input.provider.trim().toLowerCase();
  const externalId = cleanNovelpiaId(input.externalId);
  if (externalId && ['novelpia', 'raw_fucknovelpia'].includes(provider)) {
    return {
      type: 'novelpia',
      value: externalId,
      provider: provider === 'raw_fucknovelpia' ? 'raw_fucknovelpia' : 'novelpia',
    };
  }

  const fromUrl = extractNovelpiaId(input.sourceUrl);
  if (fromUrl) return { type: 'novelpia', value: fromUrl, provider: 'source_url' };
  return null;
}

function extractNovelpiaId(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'novelpia.com') {
      const match = /^\/novel\/(\d{2,9})(?:\/|$)/.exec(url.pathname);
      return match ? cleanNovelpiaId(match[1]) : null;
    }
    if (host === 'raw-fucknovelpia.com') {
      const match = /^\/novel\/(\d{2,9})(?:\/|$)/.exec(url.pathname);
      return match ? cleanNovelpiaId(match[1]) : null;
    }
  } catch {
    return null;
  }
  return null;
}

function cleanNovelpiaId(value: string): string | null {
  const clean = value.trim();
  return NOVELPIA_ID_RE.test(clean) ? clean : null;
}

async function activeDuplicate(env: Env, identity: CanonicalIdentity): Promise<DuplicateRow | null> {
  const canonical = await env.DB.prepare(`
    SELECT s.id,s.title,s.status,s.queue_status,s.queue_position,s.chapter_count,s.current_chapter
    FROM title_identities ti
    JOIN submissions s ON s.id=ti.submission_id
    WHERE ti.identity_type=? AND ti.identity_value=? AND s.status<>'rejected'
    LIMIT 1
  `).bind(identity.type, identity.value).first<DuplicateRow>();
  if (canonical) return canonical;

  // Compatibility fallback for rows created before the identity registry existed.
  return env.DB.prepare(`
    SELECT s.id,s.title,s.status,s.queue_status,s.queue_position,s.chapter_count,s.current_chapter
    FROM submission_external_sources es
    JOIN submissions s ON s.id=es.submission_id
    WHERE es.provider IN ('novelpia','raw_fucknovelpia')
      AND es.external_id=?
      AND s.status<>'rejected'
    ORDER BY CASE WHEN s.status='accepted' THEN 0 ELSE 1 END,s.id ASC
    LIMIT 1
  `).bind(identity.value).first<DuplicateRow>();
}

async function claimIdentity(
  env: Env,
  userId: number,
  claimRequestId: string,
  identity: CanonicalIdentity,
): Promise<true | Response> {
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + CLAIM_TTL_MS).toISOString();

  await clearRejectedOwner(env, identity, nowIso);
  await env.DB.prepare(`
    UPDATE title_identities
    SET claim_user_id=NULL, claim_request_id=NULL, claim_expires_at=NULL, updated_at=?
    WHERE identity_type=? AND identity_value=? AND submission_id IS NULL
      AND claim_expires_at IS NOT NULL AND claim_expires_at<=?
  `).bind(nowIso, identity.type, identity.value, nowIso).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO title_identities (
      identity_type,identity_value,submission_id,claim_user_id,claim_request_id,claim_expires_at,
      source_provider,created_at,updated_at
    ) VALUES (?,?,NULL,?,?,?,?,?,?)
  `).bind(
    identity.type,
    identity.value,
    userId,
    claimRequestId,
    expires,
    identity.provider,
    nowIso,
    nowIso,
  ).run();

  await env.DB.prepare(`
    UPDATE title_identities
    SET claim_user_id=?,claim_request_id=?,claim_expires_at=?,source_provider=?,updated_at=?
    WHERE identity_type=? AND identity_value=? AND submission_id IS NULL
      AND (
        claim_user_id IS NULL
        OR claim_expires_at IS NULL
        OR claim_expires_at<=?
        OR (claim_user_id=? AND claim_request_id=?)
      )
  `).bind(
    userId,
    claimRequestId,
    expires,
    identity.provider,
    nowIso,
    identity.type,
    identity.value,
    nowIso,
    userId,
    claimRequestId,
  ).run();

  const row = await identityRow(env, identity);
  if (row?.submission_id) {
    const duplicate = await activeDuplicate(env, identity);
    if (duplicate) return duplicateResponse(duplicate, identity);
  }
  if (row?.claim_user_id === userId && row.claim_request_id === claimRequestId) return true;

  return miniAppJsonError(
    'duplicate_in_progress',
    'Another request for this exact NovelPia title is being submitted right now. Wait a moment and open the title again instead of using another quota slot.',
    409,
    { identity: identityKey(identity), retry_after_seconds: 20, quota_used: false },
  );
}

async function clearRejectedOwner(env: Env, identity: CanonicalIdentity, now: string): Promise<void> {
  // Rejected submissions no longer own a canonical identity and may be resubmitted.
  await env.DB.prepare(`
    UPDATE title_identities
    SET submission_id=NULL, claim_user_id=NULL, claim_request_id=NULL, claim_expires_at=NULL, updated_at=?
    WHERE identity_type=? AND identity_value=?
      AND submission_id IN (SELECT id FROM submissions WHERE status='rejected')
  `).bind(now, identity.type, identity.value).run();
}

async function identityRow(env: Env, identity: CanonicalIdentity): Promise<IdentityRow | null> {
  return env.DB.prepare(`
    SELECT submission_id,claim_user_id,claim_request_id,claim_expires_at
    FROM title_identities
    WHERE identity_type=? AND identity_value=?
  `).bind(identity.type, identity.value).first<IdentityRow>();
}

function identityBindingError(
  submissionId: number,
  identity: CanonicalIdentity,
  currentSubmissionId: number | null,
): Response {
  console.error(JSON.stringify({
    event: 'submission_identity_bind_failed',
    submission_id: submissionId,
    identity: identityKey(identity),
    current_submission_id: currentSubmissionId,
  }));
  return miniAppJsonError(
    'submission_identity_unconfirmed',
    'Your request was created, but Dollar TL could not confirm the title identity. Retry the same submission so it can be reconciled safely.',
    503,
    {
      submission_id: submissionId,
      current_submission_id: currentSubmissionId,
      identity: identityKey(identity),
      retry_same_request: true,
    },
  );
}

function duplicateResponse(row: DuplicateRow, identity: CanonicalIdentity): Response {
  const state = row.status === 'pending'
    ? 'under review'
    : row.queue_status === 'in_progress'
      ? 'being translated'
      : row.queue_status === 'completed'
        ? 'completed'
        : row.queue_status === 'queued'
          ? `in queue${row.queue_position ? ` #${row.queue_position}` : ''}`
          : 'already requested';
  return miniAppJsonError(
    'duplicate_title',
    `This exact NovelPia title is already in Dollar TL as request #${row.id} (${state}). Your quota was not used.`,
    409,
    {
      submission_id: row.id,
      title: row.title,
      request_status: row.status,
      queue_status: row.queue_status,
      queue_position: row.queue_position,
      chapter_count: row.chapter_count,
      current_chapter: row.current_chapter,
      identity: identityKey(identity),
      quota_used: false,
    },
  );
}

function identityKey(identity: CanonicalIdentity): string {
  return `${identity.type}:${identity.value}`;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}
