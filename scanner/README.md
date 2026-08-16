# Dollar TL ClamAV scanner

This is a separate Cloudflare Worker + Container deployment. It intentionally stays outside the main `dollartlbot` Worker so the normal production deploy does not require Docker.

## Architecture

- The main Worker stores publication assets in R2 and exposes authenticated internal scan endpoints.
- The scanner Worker wakes every 5 minutes and starts one `standard-1` Container when needed.
- The Container uses the official `clamav/clamav:stable` image, refreshes signatures with FreshClam, and runs `clamd` bound only to `127.0.0.1:3310`.
- The Go scanner streams R2 bytes from the main Worker into ClamAV with the `INSTREAM` protocol while calculating SHA-256.
- Verdicts are posted back to the main Worker. `infected` and heuristic `suspicious` files enter quarantine immediately.
- The Container sleeps after idle time instead of running continuously.

## Requirements

- Cloudflare Workers Paid plan (Containers are a paid-plan capability).
- Docker Desktop or another Docker-compatible daemon running for `wrangler deploy` when the image is built locally.
- The same `ASSET_SCANNER_TOKEN` configured in the main Worker and the scanner Worker. Use the root helper; do not copy the bot's other secrets into the scanner.

## Deploy

From the repository root:

```powershell
npm run scanner:setup
npm run release:prod
npm run scanner:deploy
```

`scanner:setup` generates the token if necessary and writes a scanner-only `scanner/.dev.vars` containing only `ASSET_SCANNER_TOKEN`.

The first Container deployment can take longer because Wrangler builds and pushes the Docker image. Check deployment state with:

```powershell
cd scanner
npx wrangler containers list
```

## Rollout

1. Deploy the main Worker and migration `0037_file_security_v2.sql`.
2. Deploy the scanner Container.
3. Open Admin → Security → ClamAV scanner and wait for a fresh healthy heartbeat.
4. Run **Backfill unscanned** if historical files remain.
5. Wait until protected pending/failed files receive a final verdict.
6. Only then enable **AV enforcement**. The server rejects attempts to enable enforcement while the scanner is unhealthy or the protected backlog is incomplete.

Quarantine is stricter than AV enforcement: `infected`, `suspicious`, or quarantine-held files are never delivered even if enforcement is switched off.
