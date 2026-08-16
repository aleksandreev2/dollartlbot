# Dollar TL Telegram Bot

Telegram bot for collecting novel translation requests, verifying Boosty access, managing a public translation queue, and publishing Dollar TL releases.

## Current rules

- **Regular status:** 1 submitted novel per UTC calendar month.
- **Regular status:** titles may contain up to **250 chapters**.
- **Boosty subscriber:** up to 5 submitted novels per UTC calendar month.
- The **250-chapter restriction does not apply to Boosty subscribers**.
- Boosty status is verified through membership in `Dollar TL — Subscriber Verification`.
- A monthly slot is consumed only after **Confirm & Submit** succeeds.
- `Reject + Return Slot` returns that slot to the requester.

The bot re-checks Boosty membership immediately before final submission. D1 also has a database guard that rejects titles over 250 chapters only when the saved plan is `free`.

## User features

- First `/start` asks for the interface language.
- Languages: English, Spanish, Filipino, Hindi, Portuguese, Indonesian, Vietnamese, French, German and Russian.
- `/language` changes language without deleting an active submission.
- Main menu shows current status, monthly usage, remaining requests and the chapter restriction.
- Regular users receive a direct Boosty subscription link in the main menu.
- `/queue` shows the public translation queue.
- `/requests` shows the user's own requests and statuses.
- `/guide` explains the workflow.
- `/limit` shows quota details and reset date.

Accepted requests enter the public queue. Requester identity, raw files, fetish/sexual-content disclosures, sensitive-content disclosures and private notes are never displayed publicly.

## Required channel access

Normal bot and Mini App use is gated by membership in the configured Telegram channel. Migration `0016_channel_access_gate.sql` seeds the public Dollar TL channel as `@dollartranslate` with `https://t.me/dollartranslate` as the join URL.

Operational requirements:

- the bot must be an administrator of the required channel so Telegram can reliably verify other users and deliver `chat_member` join/leave updates;
- the webhook must include `chat_member` in `allowed_updates` (`npm run configure-bot` already does this);
- Admin → Settings → **Доступ к боту** shows the current channel, join link, bot permission status and a live diagnostic;
- leaving the channel invalidates cached channel access immediately; normal interactions and Mini App API calls are server-gated, while an open Mini App also rechecks while visible;
- if the required channel is changed to a numeric/private channel ID, configure an HTTPS Telegram invite URL so blocked users have a working **Join channel** button.

The access channel is intentionally independent from the publication channel so changing publishing destinations cannot accidentally lock users in or out.

## Release download gate

The release gate is feature-flagged and controlled from **Admin → Безопасность**.

When `download_gate_enabled` is on for new publications with attached files:

1. the channel post is published without an inline keyboard, preserving Telegram's native comments button;
2. the linked discussion receives a Dollar TL Bot reply with title, genres, `Thank you.` and optional `Donate` buttons;
3. `Thank you.` records the exact Telegram user and opens a private bot deep-link;
4. access is rechecked before delivery;
5. the bot delivers the release privately and records successful/failed/repeat deliveries per user and per asset;
6. an existing Telegram `file_id` is reused whenever possible so repeated deliveries do not reread/reupload the R2 object.

Historical publications are migrated as `download_gate_status='legacy'` and keep the previous delivery semantics even after the new gate is enabled. This avoids retroactive bot comments on old releases.

## Anti-spam and abuse protection

Telegram webhook dedupe remains the first protection layer. A per-user SQLite Durable Object (`USER_GUARD`) then keeps hot anti-abuse state without using D1 as a per-click counter.

Modes:

- `off` — bypass the guard;
- `monitor` — collect suspicious activity without blocking (default after migration);
- `enforce` — apply cooldown/rate-limit/temporary-block decisions.

Manual admin blocks in `user_admin_controls` remain authoritative. Security telemetry stores the Telegram user ID, action, decision and reason; repeated blocked bursts are aggregated rather than turning every allowed interaction into a D1 row.

## Publication asset security

Publication assets receive a SHA-256 after upload. The hash is checked against `file_scan_cache`; a still-valid cached verdict is reused, otherwise the asset becomes `pending` for the scanner.

`asset_scan_enforcement` defaults to **off**. When enabled, private release delivery is fail-closed: every attached asset must have `scan_status='clean'`.

The Worker exposes a token-protected scanner contract:

- `GET /internal/asset-scan/assets/:id` — stream one R2 publication asset to the scanner;
- `POST /internal/asset-scan/result` — submit the verdict, engine/signature metadata and matching SHA-256.

Set `ASSET_SCANNER_TOKEN` only when a ClamAV/external scanner is connected. Do **not** enable AV enforcement until the scanner is producing `clean` verdicts.

Raw submission files are still represented primarily by Telegram `file_id`; the publication-asset security pipeline applies to files uploaded for reader distribution.

## Cover optimization

Existing cover URLs keep their legacy fallback. Manual admin cover uploads additionally generate WebP variants in the Mini App at widths **160 / 320 / 640** and store them in R2 under versioned immutable keys.

When `cover_variants_enabled` is enabled:

- catalog cards use responsive `srcset` variants;
- detail pages prefer the 640px variant;
- variant responses use `Cache-Control: public, max-age=31536000, immutable`;
- the version is part of the URL, so replacing a cover naturally invalidates the old URL without cache purges.

If a client cannot generate WebP variants, the existing original-cover path remains the fallback.

## Admin features

Use `/admin` from the Telegram account configured as `ADMIN_TELEGRAM_ID`.

The admin dashboard contains Pending requests, Translation queue, In-progress titles, Completed requests and All requests. Admin actions include Accept → Queue, Reject, Reject + Return Slot, Raw File, Message User, Start, Complete, Back to Queue and queue reordering.

Additional release/security views:

- **Publishing → Readers** on published releases shows concrete Telegram users, Thank you clicks, successful deliveries, repeats and Donate clicks;
- **Безопасность** shows anti-spam telemetry, concrete rate-limited users, asset scan states and feature controls;
- per-user reader/security APIs expose the same history for the user control center.

See `ADMIN_GUIDE.md` for the full admin workflow.

## Submission flow

1. Rules and prohibited-content confirmation
2. Novel title
3. Original language
4. Current chapter count
5. Ongoing / completed
6. Original source URL (optional)
7. Raw/original file
8. Genres and tags
9. Fetishes / kinks / sexual content
10. Sensitive / disturbing content
11. Additional notes (optional)
12. Review and confirm

Raw submission files are not stored as permanent Cloudflare copies. The bot stores Telegram's `file_id` for the request workflow.

## Stack

- Telegram Bot API webhook
- Cloudflare Workers
- Cloudflare Durable Objects
- Cloudflare D1
- Cloudflare R2
- Cloudflare Cron Trigger
- TypeScript

## Secrets

Never commit `.dev.vars`.

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Required values:

```dotenv
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_WEBHOOK_SECRET="..."
ADMIN_TELEGRAM_ID="..."
BOOSTY_GROUP_ID="..."
```

Optional while the scanner is not connected:

```dotenv
ASSET_SCANNER_TOKEN=""
```

## First deployment

```powershell
npm install
npx wrangler login
npm run release:check
npm run db:remote
npx wrangler deploy --secrets-file .dev.vars
```

Then configure the webhook if this is a new bot/URL:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev"
npm run configure-bot
```

## Updating the live bot

Normal production update:

```powershell
git pull
npm install
npm run release:prod
```

`release:prod` performs:

1. TypeScript/type-generation and architecture audits;
2. `wrangler deploy --dry-run`;
3. remote D1 migrations;
4. production `wrangler deploy --secrets-file .dev.vars`.

The new migrations are additive. Their initial rollout state is deliberately conservative:

- `anti_abuse_mode = monitor`
- `download_gate_enabled = 0`
- `asset_scan_enforcement = 0`
- `cover_variants_enabled = 0`
- `donate_tracking_enabled = 1`

After deployment, change these from **Admin → Безопасность** rather than editing D1 manually. Recommended rollout: observe anti-spam in `monitor`, enable download gate, enable cover variants after new variants exist, and enable AV enforcement only after scanner health is confirmed.

If Telegram commands themselves change in a later release, refresh them afterwards:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev"
npm run configure-bot
```

## Engagement notifications

- Users who submitted in the previous month can receive one localized notice when their monthly limit resets.
- Regular users with at least two historical submissions may occasionally receive a Boosty promo.
- Promo reminders are delayed, rate-limited, not sent to active Boosty subscribers, and include a permanent opt-out button.
