# Dollar TL Bot — Admin Guide

## Open the admin panel

Send:

```text
/admin
```

The command is registered only for the Telegram account configured as `ADMIN_TELEGRAM_ID`.

The dashboard shows live counts for:

- Pending requests
- Queued titles
- Titles currently in progress
- Completed titles
- Total requests

## Pending Requests

Open **📨 Pending** to browse new submissions. The list is paginated and each request opens a full private detail view containing:

- requester username / Telegram ID
- plan at submission time
- title, original language, chapter count and publication status
- source URL
- genres/tags
- fetish/sexual-content disclosure
- sensitive-content disclosure
- notes

Available actions:

### ✅ Accept → Queue

Accepts the request and places it at the end of the public translation queue. The requester is notified automatically.

### ❌ Reject

Rejects the request. The request still counts against that user's monthly allowance.

### ♻️ Reject + Return Slot

Rejects the request and returns that monthly request slot to the requester.

### 📎 Raw File

Re-sends the original Telegram file to the admin chat. Cloudflare never stores the file bytes; the existing Telegram `file_id` is reused.

### 💬 Message User

After pressing this button, send one normal text message to the bot. The bot forwards that message privately to the requester. `/cancel` aborts the draft.

## Translation Queue

Open **📚 Queue** from `/admin`.

Accepted requests are visible to users in the public queue, but only the title, basic novel information and queue state are shown publicly. Private disclosures and requester information are never exposed.

For a queued title:

- **▶️ Start** — marks it `In progress` and notifies the requester.
- **✅ Complete** — marks it completed and removes it from the active public queue.
- **⬆️ Move Up / ⬇️ Move Down** — changes the order of queued titles.
- **📎 Raw File** — re-sends the raw file.
- **💬 Message User** — sends a private admin message.

For a title already in progress:

- **✅ Complete** — finish it.
- **↩️ Back to Queue** — return it to queued state.

Queue reordering uses a D1 transactional batch, so the two swapped positions update together.

## User-facing views

Users can use:

- `/queue` — public active translation queue
- `/requests` — their own submissions and statuses
- `/limit` — current monthly allowance
- `/guide` — explanation of the process
- `/language` — change interface language

## Monthly reset notifications

The bot checks engagement maintenance once per day using the existing Cloudflare Cron Trigger. During the first three days of a new UTC calendar month, users who submitted at least one request in the previous month receive one localized message that their allowance has reset.

A per-user database field prevents duplicate reset notices for the same month.

## Occasional Boosty reminder

A non-subscriber becomes eligible only when:

1. they have submitted at least two novel requests;
2. at least 14 days have passed since their second submission;
3. they have not received a promo reminder in the previous 60 days;
4. they have not opted out;
5. they are not currently recognized as an active Boosty subscriber.

The promo points to:

`https://boosty.to/domnekromanta/subscription-level/4041120/promo/183608?linkId=86c8c34bd6f4a5629aefdd41a21b62eb`

Every promo includes **🔕 Don’t show these reminders**. Opting out is stored permanently in D1.

Marketing delivery is intentionally non-critical: failed promo messages are not aggressively retried.

## Updating this deployed bot when migrations exist

When a new migration has been added, use this order:

```powershell
git pull
npm install
npm run db:remote
npm run typecheck
npx wrangler deploy --secrets-file .dev.vars
```

Applying an additive migration before deploying the code is safe for the currently running older Worker and prevents the new Worker from querying columns that have not been created yet.

After commands change, refresh Telegram's command menu:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.sashahumortele2.workers.dev"
npm run configure-bot
```
