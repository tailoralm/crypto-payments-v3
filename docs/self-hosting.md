# Self-hosting guide

See [merchant integrations and operations](merchant-workflow.md) for publication, callbacks, Cloudflare, alerts and audited recovery (added 2026-10-30).

## Fresh installation

Requires Docker with Compose and Node.js for secret generation. The application containers use Node.js 22, PostgreSQL 16, and Nginx.

```sh
node scripts/setup.mjs
docker compose up --build -d --wait
```

The setup script creates a mode-0600 `.env` with unique secrets and refuses to overwrite an existing file. Open **http://localhost:8080**, use SETUP_TOKEN from `.env`, and create the owner account (password at least 12 characters). There is no second public registration. In Settings, provide explorer credentials, enable the desired chains, optionally configure SMTP/public URL, and register receiving wallets.

Database/API ports are not published. The frontend binds to 127.0.0.1 by default. Persistent data is in the Compose `db_data` volume. Startup applies transactional migrations and inserts missing curated tokens. Check `docker compose ps` and `docker compose logs backend` if startup fails; logs do not print request credentials.

## Environment

| Variable | Meaning |
| --- | --- |
| DB_NAME / DB_USER / DB_PASSWORD | PostgreSQL identity and credential |
| JWT_SECRET | At least 32 unique characters for access-token signing |
| ENCRYPTION_KEY | At least 32 characters; preserve across upgrades/restores to decrypt credentials |
| SETUP_TOKEN | At least 32 characters; required for first-owner registration |
| WEB_PORT / BIND_ADDRESS | Default 8080 / 127.0.0.1 |
| COOKIE_SECURE | false for local HTTP; true for public HTTPS |
| DISABLE_POLLER | false normally; true for isolated restoration/testing |

Native backend also supports DATABASE_URL, DB_HOST/DB_PORT, DB_SSL=true (verified TLS), PORT, CORS_ORIGIN and TRUST_PROXY_HOPS. Compose uses its internal PostgreSQL host and a single trusted web proxy. JWT_REFRESH_SECRET and API_BASE_URL are no longer used; refresh tokens are opaque stored sessions and the browser uses same-origin `/api`.

Provider keys, chain switches, SMTP and polling interval belong to Settings. Secrets omitted on updates stay unchanged; explicit clear removes them. Interval defaults to 15 minutes and accepts 1–1440 whole minutes; changes are observed within a minute. Manual “Check payments now” is on Wallets. Scan results and sanitized errors appear on each wallet.

## Public or private billing

**Local/private:** leave public base URL blank. Generate and distribute PDFs manually or via SMTP. QR payloads prepare on-chain transfers and work without public hosting; live status needs network access to your server.

**Public:** put the frontend behind your HTTPS reverse proxy. Keep localhost binding if that proxy runs on the host, or deliberately configure BIND_ADDRESS/network routing for your topology. Set COOKIE_SECURE=true and a reachable public origin in Settings (for example `https://pay.example.com`). Preserve `/api` routing and cookies. Test an anonymous `/bill/<token>` page and PDF from another network. Never expose the database directly.

SMTP supports TLS (typically 465), mandatory STARTTLS (typically 587), or unencrypted local relays. Configure sender/credentials according to your provider. Payment detail sends the PDF to an entered email only on an explicit action. A successful result means the relay accepted it; it is not inbox confirmation.

## Native development

Generate `.env` at repository root, export its values in your shell, and supply a reachable PostgreSQL database. Then:

```sh
cd backend
npm ci
npm run dev
```

The backend defaults to localhost:3000 and applies migrations. In a second configured shell:

```sh
cd frontend
npm ci
npm start
```

Frontend development uses localhost:4200 with `/api` proxied to localhost:3000. Node.js 22 is supported; Angular 21 avoids requiring a newer runtime than this implementation environment. The checked-in frontend `.npmrc` bypasses an npm 10 optional-peer resolution crash. Both lockfiles are committed.

## Backups, upgrades, and recovery

Back up database and `.env` securely together. Example database dump:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > cryptopay-backup.sql
```

Do not regenerate ENCRYPTION_KEY on upgrades. Back up before pulling/updating code and running `docker compose up --build -d --wait`. Migrations preserve existing payment IDs, snapshots, values and history. They refuse multiple users or active custom-asset intentions until explicit operator resolution. Old integrations need the [breaking API changes](api-surface.md). Old browser sessions require login again.

For rollback, restore the prior software version, its pre-upgrade database and original `.env`; the history-preserving migration intentionally has no destructive down operation. Test restoration in an isolated installation with DISABLE_POLLER=true, no public access and SMTP sending unused. Restore the SQL only into an empty target database, then check historical requests, snapshots and credential decryption before reconnecting services. Keep a verified backup until the upgraded installation is accepted.

## Troubleshooting

- **CHAIN_UNAVAILABLE:** enable the chain/provider and save its key; a saved key alone does not prove plan entitlement.
- **Scan error / denied access / quota:** inspect Wallets and the [provider guide](providers.md). No successful checkpoint advances on scan failure. Full active-window replay can require multiple API pages.
- **Solscan missing instruction identity:** the adapter refuses an ambiguous multi-transfer response. Do not assume the request was paid; inspect chain evidence and resolve operationally. There is no manual mark-paid override.
- **Expired despite receiving funds:** expiry is final, including provider outages/indexing lag. Inspect the transfer in the explorer; the application never reverses a transfer. Use owner Payment recovery to scan verified unassigned evidence and explicitly record any acceptance.
- **Cannot login on public HTTPS:** verify COOKIE_SECURE, browser origin, proxy path and refresh cookies. Do not mix a different browser API origin into the production same-origin configuration.
- **Migration refusal:** keep the backup intact and resolve the reported ownership/custom-history problem explicitly; do not drop tables or bypass checks.
- **Lost owner password:** no public reset-by-email exists. A server operator can generate a bcrypt hash with the installed bcryptjs package and replace only the owner's password hash through PostgreSQL, then delete that owner's sessions. Back up first; never disclose hashes/credentials in issue reports.

See [validation](acceptance.md) for tests and the external checks still required before real funds.
