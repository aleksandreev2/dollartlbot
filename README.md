# Dollar TL Telegram Bot

Telegram bot for collecting novel translation requests, verifying Boosty access, and managing a public translation queue.

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

## Admin features

Use `/admin` from the Telegram account configured as `ADMIN_TELEGRAM_ID`.

The admin dashboard contains:

- Pending requests
- Translation queue
- In-progress titles
- Completed requests
- All requests

Admin actions include Accept → Queue, Reject, Reject + Return Slot, Raw File, Message User, Start, Complete, Back to Queue and queue reordering.

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

Raw files are not downloaded or stored by Cloudflare. The bot stores Telegram's `file_id` and re-sends the existing Telegram file to the owner.

## Stack

- Telegram Bot API webhook
- Cloudflare Workers
- Cloudflare D1
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

## First deployment

```powershell
npm install
npx wrangler login
npm run typecheck
npx wrangler deploy --secrets-file .dev.vars
npm run db:remote
```

Then configure the webhook:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev"
npm run configure-bot
```

## Updating the live bot

When new migrations exist, use this order:

```powershell
git pull
npm install
npm run db:remote
npm run typecheck
npx wrangler deploy --secrets-file .dev.vars
```

If Telegram commands changed, refresh them afterwards:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev"
npm run configure-bot
```

## Engagement notifications

- Users who submitted in the previous month can receive one localized notice when their monthly limit resets.
- Regular users with at least two historical submissions may occasionally receive a Boosty promo.
- Promo reminders are delayed, rate-limited, not sent to active Boosty subscribers, and include a permanent opt-out button.
