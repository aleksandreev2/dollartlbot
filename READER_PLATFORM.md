# Dollar TL Reader Platform v1

This document describes the reader-library, download-policy and anti-leak rollout introduced by migrations `0042`–`0045`.

## Product model

- `submission_id` = canonical novel/title.
- `publication_id` = one release/update of that title.
- `asset_id` = one downloadable file of a release.
- The free daily quota is counted by unique `submission_id`, not by release or file.
- EPUB + PDF + retries for the same novel on the same UTC day still consume one title slot.
- A title slot is committed only after the first successful file delivery.
- Boosty subscribers have unlimited title slots, but still require the Thank You flow and all normal access/security checks.

## Reader flow

1. User opens a title from the Mini App library.
2. Reader detail shows rating, latest release, quota/Boosty state and redistribution notice.
3. User accepts the current terms version when required.
4. User taps **Thank you & download**.
5. Backend creates a short-lived grant bound to the exact Telegram user and publication.
6. Private bot flow re-checks channel/admin/security access and the user-bound grant.
7. Free readers reserve a daily title slot; Boosty skips the quota limit.
8. Files are delivered.
9. The title slot is committed only after a successful delivery.

A forwarded `dl_<token>` alone is not sufficient for linked title releases because the receiving Telegram user must also own an active Thank You grant.

## Rollout settings

Safe defaults after migration:

| Setting | Default | Purpose |
| --- | --- | --- |
| `reader_library_enabled` | `1` | title library/API |
| `reader_ratings_enabled` | `1` | 1–5 title ratings after successful delivery |
| `reader_terms_enabled` | `1` | localized redistribution notice/versioned acceptance |
| `reader_terms_version` | `1` | bump to require a new acceptance |
| `reader_thank_you_enforcement` | `1` | require a user-bound Thank You grant |
| `reader_download_grant_minutes` | `15` | grant lifetime |
| `reader_daily_quota_mode` | `monitor` | `off`, `monitor`, or `enforce` |
| `reader_daily_quota_limit` | `5` | free unique titles per UTC day |
| `reader_personalized_epub_enabled` | `0` | automatic per-reader EPUB generation |
| `reader_personalized_pdf_enabled` | `0` | reserved for a later PDF implementation |
| `reader_fingerprint_fail_closed` | `0` | while `0`, personalization failure falls back to clean master delivery |
| `reader_fingerprint_version` | `1` | fingerprint format version |
| `reader_leak_checker_enabled` | `0` | admin EPUB leak evidence endpoint |
| `reader_leak_monitor_enabled` | `0` | reserved for future external web monitoring |

## Recommended production rollout

### 1. Deploy code and migrations

```bash
npm install
npm run release:prod
```

This keeps quota in `monitor` and EPUB personalization disabled.

### 2. Observe quota monitor data

Keep:

```text
reader_daily_quota_mode=monitor
```

Reader events will record `reader_quota_would_block` without denying downloads. Validate that repeated files/releases for one novel do not inflate the distinct-title count.

### 3. Enforce the free limit

After monitor data looks correct:

```text
reader_daily_quota_mode=enforce
reader_daily_quota_limit=5
```

Boosty subscribers remain unlimited.

### 4. Validate personalized EPUBs before enabling

The release check includes a generated EPUB runtime test that verifies:

- fingerprint can be extracted after generation;
- the chapter payload is unchanged;
- OPF and `META-INF/dollartl.xml` contain the marker;
- a visible notice page exists;
- unsafe ZIP traversal is rejected.

Before production enablement, also manually test representative real EPUB2 and EPUB3 assets used by Dollar TL in multiple readers.

Then enable:

```text
reader_personalized_epub_enabled=1
```

Keep:

```text
reader_fingerprint_fail_closed=0
```

until production generation is proven stable. Only then consider fail-closed behavior.

## EPUB fingerprint model

The master R2 asset is never modified. On first delivery after personalization is enabled:

1. Master EPUB is read from R2.
2. A stable opaque Distribution ID is allocated, e.g. `DTL1-ABCD-EFGH-JKLM`.
3. EPUB ZIP/path/size/compression checks run before extraction.
4. The package file is found through `META-INF/container.xml`.
5. Distribution metadata is added to OPF.
6. `META-INF/dollartl.xml` is added as a machine-readable marker.
7. A localized personal-use notice page is added to the manifest/spine.
8. Personalized SHA-256 is stored.
9. File is uploaded to Telegram.
10. The resulting Telegram `file_id` is cached only in `reader_personalized_assets` for that `(asset_id,user_id)`.

Raw Telegram IDs and usernames are never embedded in the EPUB.

## Leak checker

Admin endpoint:

```text
GET  /api/app/admin/security/leak-checker
POST /api/app/admin/security/leak-checker
```

`GET` returns recent leak incidents and whether the checker is enabled.

`POST` requires admin Mini App authentication and `reader_leak_checker_enabled=1`. Submit `multipart/form-data`:

- `file`: EPUB evidence, max 50 MB;
- `source_url`: optional URL where the copy was found;
- `record=1`: optional; records a `leak_incidents` row only if a match exists.

The checker first looks for the embedded Distribution ID and falls back to the known personalized SHA-256. A Distribution ID match is reported with `very_high` confidence. It does **not** automatically block the matched user.

## Incident handling

Recommended procedure:

1. Preserve the original leaked file and source URL.
2. Run Leak Checker without `record=1` first.
3. Verify title, recipient, delivery time and evidence hash.
4. Re-run with `record=1` when the evidence is credible.
5. Review manually before using existing administrative user-block controls.

A behavioral risk score or a web search hit must never be treated as proof by itself.

## Rollback

Reader capabilities are feature-flagged. Emergency rollback can disable new behavior without reverting migrations:

```text
reader_library_enabled=0
reader_ratings_enabled=0
reader_daily_quota_mode=off
reader_personalized_epub_enabled=0
reader_leak_checker_enabled=0
```

Do not delete reader/fingerprint tables during an incident; they contain evidence and are covered by the existing D1 disaster-recovery pipeline.
