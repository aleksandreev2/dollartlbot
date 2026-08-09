# Dollar TL Telegram Bot

A small Telegram bot for collecting novel translation requests directly into the owner's private Telegram chat.

## What it does

- First `/start` asks the user to choose a UI language.
- Language can be changed later with `/language` without losing an active form.
- Supported UI languages: English (primary), Spanish, Filipino, Hindi, Portuguese, Indonesian, Vietnamese, French, German, and Russian.
- Free users: **1 submitted novel per calendar month**, maximum **200 chapters**.
- Active Boosty subscribers: **5 submitted novels per calendar month**, including novels over 300 chapters.
- Boosty status is checked through membership in the private `Dollar TL — Subscriber Verification` Telegram group.
- Completed requests are sent **only to the owner's private Telegram account**.
- Raw files are not downloaded or stored on Cloudflare. The bot stores the Telegram `file_id` and re-sends the existing Telegram file to the owner.
- Rejected requests can optionally have their monthly slot returned.
- The owner can accept, reject, reject + return slot, or send a message to the requester from inline buttons.

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

A monthly slot is consumed only after **Confirm & Submit** succeeds.

## Stack

- Telegram Bot API webhook
- Cloudflare Workers
- Cloudflare D1
- TypeScript
- No runtime npm dependencies

## Secrets

Never commit real secret values. `.dev.vars` is ignored by Git.

Copy the example file:

```bash
cp .dev.vars.example .dev.vars
```

On Windows PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Fill in:

```dotenv
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_WEBHOOK_SECRET="a_long_random_secret"
ADMIN_TELEGRAM_ID="0"
BOOSTY_GROUP_ID="0"
```

`BOOSTY_SUBSCRIPTION_URL` is public configuration and already lives in `wrangler.jsonc`.

## First setup

### 1. Install tools

```bash
npm install
npx wrangler login
```

### 2. Prepare the Telegram verification group

`Dollar TL — Subscriber Verification` should contain:

- your Telegram account as an administrator;
- `@boosty_to_bot` with the permissions Boosty requires;
- `@dollartlbot` as an administrator so it can verify members with `getChatMember`.

The group can stay read-only and otherwise empty. Translation requests are **not** sent to this group.

### 3. Discover your Telegram IDs before enabling the webhook

Put the real `TELEGRAM_BOT_TOKEN` in `.dev.vars` first.

Then:

1. Send any message (for example `/id`) to `@dollartlbot` in private chat.
2. Send `/chatid` in `Dollar TL — Subscriber Verification`.
3. Run:

```bash
npm run discover-ids
```

The script reads pending Telegram updates and prints values similar to:

```text
ADMIN_TELEGRAM_ID=123456789
BOOSTY_GROUP_ID=-1001234567890
```

Copy both values into `.dev.vars`.

### 4. Type-check and deploy

```bash
npm run typecheck
npx wrangler deploy --secrets-file .dev.vars
```

The D1 binding in `wrangler.jsonc` is intentionally declared without an account-specific database ID. Current Wrangler can provision the D1 resource during deployment and keep the local binding linked without committing your Cloudflare resource ID to this public repository.

Apply the schema after the first deployment:

```bash
npm run db:remote
```

### 5. Enable the Telegram webhook

Copy the deployed Worker URL printed by Wrangler, for example:

```text
https://dollartlbot.<your-subdomain>.workers.dev
```

Bash/zsh:

```bash
WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev" npm run configure-bot
```

PowerShell:

```powershell
$env:WEBHOOK_URL="https://dollartlbot.<your-subdomain>.workers.dev"
npm run configure-bot
```

`configure-bot` reads the bot token and webhook secret from `.dev.vars`, registers Telegram commands, and configures `${WEBHOOK_URL}/webhook` with Telegram's secret-token header.

Now open `@dollartlbot` and send `/start`.

## Useful commands

- `/start` — open the main menu; first use starts with language selection
- `/rules` — view submission rules
- `/limit` — view current monthly usage and Boosty status
- `/language` — change interface language
- `/cancel` — cancel the active form or admin message draft
- `/id` — show the sender's numeric Telegram ID
- `/chatid` — show the current chat ID

## Limits and subscriber verification

The bot counts submitted requests from the current UTC calendar month. Usage is derived from actual D1 submissions rather than a separate mutable counter.

- Free: 1 request/month, up to 200 chapters.
- Boosty subscriber: 5 requests/month; longer novels are allowed.
- `Reject + Return Slot` marks a request as returned, so it no longer consumes the monthly allowance.
- Boosty status is checked when starting a submission and again before final submission.
- Final submission uses one conditional SQL insert so concurrent confirmations cannot exceed the user's current 1/5 request limit.

## Request delivery

Completed requests are sent only to `ADMIN_TELEGRAM_ID` in private Telegram messages. The summary contains the submitter, plan, title, language, chapter count, source, tags, sexual/fetish disclosures, sensitive-content disclosures, and notes. The raw file is re-sent using its Telegram `file_id`; the Worker does not download or store the novel file itself.
