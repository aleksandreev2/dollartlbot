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

## Cloudflare configuration

`wrangler.jsonc` declares these required secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ADMIN_TELEGRAM_ID`
- `BOOSTY_GROUP_ID`

`BOOSTY_SUBSCRIPTION_URL` is a non-secret config variable.

## Setup

```bash
npm install
npx wrangler login
```

Copy `.dev.vars.example` to `.dev.vars` and fill in the values. For an initial deployment, `ADMIN_TELEGRAM_ID` and `BOOSTY_GROUP_ID` can temporarily be `0`.

Generate types and deploy:

```bash
npm run cf-typegen
npx wrangler deploy --secrets-file .dev.vars
npm run db:remote
```

After the webhook is active:

- send `/id` to the bot in private chat to obtain your numeric Telegram user ID;
- add `@dollartlbot` as an administrator of `Dollar TL — Subscriber Verification` and send `/chatid` in that group to obtain its numeric chat ID;
- replace both values and update the deployed secrets.

To configure Telegram, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `WEBHOOK_URL` in your shell and run:

```bash
npm run configure-bot
```

The script registers bot commands and sets the webhook to `${WEBHOOK_URL}/webhook` using Telegram's secret-token header.

## Required Telegram setup

`Dollar TL — Subscriber Verification` should contain the owner as admin, `@boosty_to_bot` as required by Boosty, and `@dollartlbot` as an administrator. The group can stay read-only and otherwise empty.

Set `ADMIN_TELEGRAM_ID` to the numeric Telegram ID of the account that should receive requests. No request group/channel is used.

## Useful commands

- `/start` — main menu; asks for language on first use
- `/rules` — submission rules
- `/limit` — current monthly usage and Boosty status
- `/language` — change language
- `/cancel` — cancel the active form (or an admin message draft)
- `/id` — show your numeric Telegram user ID
- `/chatid` — show the current chat ID

## Limits

The bot counts submitted requests from the current UTC calendar month. Usage is derived from D1 submissions rather than a separate mutable counter. `Reject + Return Slot` marks a request as returned so it no longer counts against the monthly allowance.

Final submission uses one conditional SQL insert so concurrent confirmations cannot exceed the user's current 1/5 request limit.
