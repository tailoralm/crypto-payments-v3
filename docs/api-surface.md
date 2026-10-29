# API reference

The web proxy exposes backend routes under `/api`; direct native backend calls omit that prefix. Example: browser `/api/payments`, direct backend `http://localhost:3000/payments`. Integration clients through the web origin use `/api/api/v1/payments`.

## Authentication

`GET /auth/setup` returns `{ "setup_required": true }` before bootstrap. `POST /auth/register` accepts email/password plus `X-Setup-Token` matching the environment's SETUP_TOKEN; only the first owner can register. Password minimum is 12 characters, maximum 72 UTF-8 bytes. `POST /auth/login` accepts email/password.

Login/bootstrap return `{ "access_token": "...", "expires_in": 900 }` and an httpOnly same-site refresh cookie. Owner endpoints require `Authorization: Bearer <access_token>`. `POST /auth/refresh` atomically consumes the old session and issues a replacement; `POST /auth/logout` revokes the cookie's session. Access tokens are checked against the stored session, so rotation/logout revokes the corresponding old access token. COOKIE_SECURE must be true for public HTTPS.

API clients use `X-API-Key`; keys are shown once, hashed at rest, and share an installation-owner request budget persisted in PostgreSQL. Anonymous billing uses an independent token and has no integration privileges.

## Routes

| Authentication | Method/path | Purpose |
| --- | --- | --- |
| None | `GET /health` | Database connectivity and process health |
| None / refresh cookie | `GET /auth/setup`, `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Setup and sessions |
| Owner | `GET/POST /wallets`, `PATCH/DELETE /wallets/:id` | Register/list/edit/archive receiving wallets |
| Owner | `GET /tokens` | Curated chain-specific asset metadata |
| Owner | `GET/POST /payments`, `GET /payments/:id` | Payment creation, history, detail |
| Owner | `POST /payments/:id/cancel` | Cancel an active request |
| Owner | `GET /payments/:id/billing`, `GET /payments/:id/pdf` | QR billing view and downloadable PDF |
| Owner | `POST /payments/:id/email` | Send PDF; body `{ "to": "customer@example.com" }` |
| Owner | `GET/PATCH /configs` | Installation settings, masked credential state |
| Owner | `GET /reports/dashboard` | UTC metrics and ordered lists |
| Owner | `POST /monitoring/scan` | Run a serialized scan; inspect wallet health for individual failures |
| Owner | `GET/POST /api-tokens`, `DELETE /api-tokens/:id` | Manage integration tokens; creation body `{ "label": "My store" }` |
| API key | `GET/POST /api/v1/payments`, `GET /api/v1/payments/:id` | Integration create/list/detail |
| Anonymous billing token | `GET /billing/:token`, `GET /billing/:token/pdf` | One restricted billing projection/PDF |

DELETE wallet archives it; history and active monitoring remain. PATCH wallet accepts description/default only, never receiving identity. New custom-token creation routes are removed. Invalid billing tokens return 404. Public billing is rate limited and never exposes recipient email, account configuration, or write actions.

## Payment creation

Owner and integration routes share the contract:

```json
{
  "wallet_id": "00000000-0000-4000-8000-000000000001",
  "description": "Website design",
  "value": "145.123456",
  "expiration_hours": 24,
  "expected_from_address": null
}
```

`value` is a positive plain decimal string with at most 14 whole digits and the chain asset's decimal precision; scientific notation, numeric JSON input, and excess precision are rejected. Expiry is a positive whole hour count up to 8760, default 24. Description is required (maximum 500 characters). Sender, if present, must validate for the chosen chain. Asset is inferred from the receiving wallet; legacy `token_source`/`token_id` inputs are rejected.

Creation returns 201 with the payment row, immutable `snapshot`, canonical status, `reference`, sharing token, exact `value`, wallet/asset display fields, `public_url` (null when unconfigured), and SMTP availability. Detail includes matched transaction and paid/detected/canceled times as applicable. Billing view adds `payment_uri`/PNG data-URL `qr` only while payable.

## Lists, reports, and settings

`GET /payments` and integration lists accept `status`, `date_from`, `date_to`, `page`, `page_size`. Status values are SUCCESS, EXPIRED, CANCELED, IN_PROGRESS. Dates are UTC `YYYY-MM-DD` creation dates, including both selected days. Page defaults to 1, size to 25, maximum 100. Ordering is creation descending then ID descending.

```json
{ "items": [], "total": 0, "page": 1, "page_size": 25 }
```

Dashboard returns `today`/`month` objects (`count`, decimal-string `amount`), `counts` by status, `daily_status_counts`, `recent_successes`, `upcoming_expirations`, `legacy_unknown_paid_time`, and `generated_at`. Definitions are in the [specification](product-specification.md).

Configs include `public_base_url`, `polling_minutes` (1–1440), `etherscan_enabled`, `solscan_enabled`, `chains` (`ethereum`, `bsc`, `solana` booleans), SMTP fields, and rate-limit fields. SMTP security is `starttls`, `tls`, or `none`; port range is 1–65535. Rates default to 100 requests per 15 minutes, enabled. Provider keys and SMTP password are never returned: only `etherscan_key_configured`, `solscan_key_configured`, `smtp_password_configured`. In PATCH, omit secrets to preserve them; supply null/empty string to clear. Public base URL must be an HTTP(S) origin without path, credentials, query, or fragment.

## Errors and compatibility

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "status": 400 } }`. Common cases: 400 invalid input; 401 invalid credentials; 403 missing setup token; 404 inaccessible record/token; 409 AMBIGUOUS_PAYMENT, CHAIN_UNAVAILABLE, SETUP_COMPLETE, WALLET_EXISTS, PAYMENT_NOT_IN_PROGRESS, SMTP_NOT_CONFIGURED; 429 request limit; 502 EMAIL_DELIVERY_FAILED. An SMTP success means acceptance, not confirmed inbox delivery.

This release breaks the old contract: PENDING → IN_PROGRESS, CONCLUDED → SUCCESS; amount input is now a string; token selection is inferred; lists return a pagination envelope; settings are installation-wide; wallet deletion archives. Old refresh tokens no longer work. Update integration clients alongside the application. Existing payment IDs/history remain.
