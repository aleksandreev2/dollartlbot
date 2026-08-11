import {
  propagateCatalogRawSourceToSubmission,
  type RawFuckNovelpiaResult,
} from './raw-fucknovelpia';

const PROVIDER = 'raw_fucknovelpia';
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

export async function cacheRawResultForCatalog(
  env: Env,
  item: RawFuckNovelpiaResult,
  checkedAt = new Date(),
): Promise<number | null> {
  if (!item.external_id) return null;
  const catalog = await env.DB.prepare(`
    SELECT id, linked_submission_id
    FROM discovery_catalog
    WHERE provider = 'novelpia' AND external_id = ?
    LIMIT 1
  `).bind(item.external_id).first<{ id: number; linked_submission_id: number | null }>();
  if (!catalog) return null;

  const now = checkedAt.toISOString();
  const nextCheckAt = new Date(
    checkedAt.getTime() + (item.raw_available ? VERIFIED_TTL_MS : PENDING_TTL_MS),
  ).toISOString();
  const metadata = {
    title: item.title,
    original_title: item.original_title,
    author: item.author,
    genres_tags: item.genres_tags,
    synopsis: item.synopsis,
    raw_format: item.raw_format,
    password_required: item.password_required,
    cover_url: item.cover_url,
  };

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO discovery_catalog_sources (
        catalog_id, provider, external_id, page_url, original_url, available,
        verification_status, metadata_json, last_checked_at, next_check_at,
        failure_count, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, 0, NULL, ?, ?)
      ON CONFLICT(catalog_id, provider) DO UPDATE SET
        external_id = excluded.external_id,
        page_url = excluded.page_url,
        original_url = excluded.original_url,
        available = excluded.available,
        verification_status = 'verified',
        metadata_json = excluded.metadata_json,
        last_checked_at = excluded.last_checked_at,
        next_check_at = excluded.next_check_at,
        failure_count = 0,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).bind(
      Number(catalog.id),
      PROVIDER,
      item.external_id,
      item.page_url,
      item.source_url,
      Number(item.raw_available),
      JSON.stringify(metadata).slice(0, 8000),
      now,
      nextCheckAt,
      now,
      now,
    ),
    env.DB.prepare(`
      UPDATE discovery_catalog
      SET raw_available = ?, updated_at = ?
      WHERE id = ?
    `).bind(Number(item.raw_available), now, Number(catalog.id)),
  ]);

  if (catalog.linked_submission_id) {
    await propagateCatalogRawSourceToSubmission(
      env,
      Number(catalog.id),
      Number(catalog.linked_submission_id),
      now,
    ).catch(() => false);
  }
  return Number(catalog.id);
}
