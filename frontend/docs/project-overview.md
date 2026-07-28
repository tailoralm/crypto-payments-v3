# CryptoPay Manager — Project Overview

Full architecture, data model, and business rules for the CryptoPay Manager SaaS. This document is shared context for both frontend and backend development.

## 1. Product Summary

CryptoPay Manager is an open-source, self-hostable crypto payment management SaaS. It is multi-user (multi-tenant): each user has isolated data. Users register wallets, create payment intentions, and the system automatically detects matching on-chain transfers using Etherscan and Solscan APIs.

Supported chains at launch: Ethereum and Solana. Architecture must remain clean and extensible so new chains can be added later without touching core business logic.

Supported tokens at launch: system pre-seeded tokens (starting with USDT) plus user-defined custom contracts. Multi-token support is implemented from day one — no token is hardcoded.

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular (latest LTS), standalone components |
| Backend | Node.js + Express + TypeScript |
| Query Builder | Knex.js (migrations + raw SQL control) |
| Database | PostgreSQL |
| Auth | JWT (access token 15 min, refresh token 7 days, httpOnly cookie) |
| Job Scheduler | node-cron, 15-minute polling interval |
| Blockchain APIs | Etherscan API (Ethereum), Solscan API (Solana) |
| Containerization | Docker + Docker Compose |
| Monorepo tooling | npm workspaces (frontend, backend, shared-types) |

## 3. Repository Structure

```
crypto-payments-v3/
├── frontend/           # Angular app
├── backend/            # Express + TypeScript API
├── docker-compose.yml
├── .env.example
└── README.md
```

## 4. Multi-Tenancy Rules

- Every table (`wallets`, `payment_intentions`, `api_tokens`, `custom_contracts`) includes a `user_id` foreign key.
- Every query, in every module, including the public API, must filter by the authenticated user's `user_id`. No cross-user data access is ever permitted.
- Etherscan/Solscan API keys are stored per user (encrypted at rest) so blockchain polling uses each user's own quota.
- Passwords are hashed with bcrypt; never stored or logged in plaintext.

## 5. Data Model

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | string | unique |
| password_hash | string | bcrypt |
| etherscan_api_key | string (encrypted) | nullable |
| solscan_api_key | string (encrypted) | nullable |
| rate_limit_enabled | boolean | default false |
| rate_limit_max_requests | integer | nullable |
| rate_limit_window_minutes | integer | nullable |
| created_at / updated_at | timestamp | |

### wallets
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| chain | string | 'ethereum' \| 'solana' (extensible) |
| address | string | validated per chain format |
| description | string | |
| is_default | boolean | only one true per user, enforced in a transaction |
| created_at | timestamp | |

Deletion rule: a wallet cannot be deleted if it has any `payment_intentions` with status `PENDING`. API must return 409 Conflict.

### tokens (system-defined, pre-seeded)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| chain | string | ethereum / solana |
| symbol | string | e.g. USDT |
| contract_address | string | official contract per chain |
| decimals | integer | e.g. 6 or 18 |
| is_system_default | boolean | true for pre-seeded entries |

### custom_contracts (user-defined)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK, owner |
| chain | string | ethereum / solana |
| contract_address | string | validated per chain |
| symbol | string | user-provided label |
| decimals | integer | required at creation, needed to correctly parse raw on-chain amounts |
| created_at | timestamp | |

Deletion rule: same protection as wallets — cannot delete if referenced by a `PENDING` payment intention.

### payment_intentions
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| wallet_id | uuid | FK |
| description | string | |
| value | numeric(20,6) | never float |
| token_source | string | 'system' \| 'custom' |
| token_id | uuid | FK into tokens or custom_contracts, resolved via token_source |
| expiration_hours | integer | default 24 |
| expires_at | timestamp | computed at creation: created_at + expiration_hours |
| expected_from_address | string | nullable |
| status | string | 'PENDING' \| 'CONCLUDED' \| 'EXPIRED' |
| concluded_tx_hash | string | nullable, immutable once set |
| concluded_from_address | string | nullable, immutable once set |
| concluded_at | timestamp | nullable, immutable once set |
| created_at | timestamp | |

### api_tokens
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| token_hash | string | SHA-256, raw token shown once at creation |
| label | string | |
| created_at | timestamp | |
| last_used_at | timestamp | nullable |

## 6. Chain Abstraction Layer

Every blockchain integration implements a common interface (conceptually):

- `chainId`: identifier string ('ethereum', 'solana', ...)
- `getTransactionsSince(walletAddress, since)`: returns a list of incoming transactions since a timestamp, including hash, from address, to address, raw amount, contract address, and timestamp.

Adding a new chain requires only a new adapter implementing this interface and registering it in a chain registry. No business logic changes are needed elsewhere.

## 7. Payment Matching & Polling Logic

The polling job runs every 15 minutes via node-cron and executes the following steps:

1. Query only wallets with at least one `PENDING` payment intention (to conserve API rate limits).
2. For each wallet, fetch transactions since the wallet's `last_fetched_at` using the chain-appropriate provider (Etherscan or Solscan).
3. Resolve the token: match the transaction's contract address against `tokens` and the user's `custom_contracts` to determine symbol and decimals.
4. Convert the raw on-chain integer amount into a human-readable decimal using the resolved `decimals`.
5. Evaluate `PENDING` intentions for that wallet oldest-first (FIFO by `created_at`).
6. Apply the amount matching rule (see section 8) and the sender matching rule (see section 9).
7. On match: mark the intention `CONCLUDED`, store `concluded_tx_hash`, `concluded_from_address`, `concluded_at`. Each transaction hash can conclude at most one intention.
8. After processing transactions, check all `PENDING` intentions for that wallet: if `expires_at < now()`, mark as `EXPIRED`, regardless of transaction activity.
9. Update `last_fetched_at` for the wallet only after a successful fetch. If the API call fails, log the error and retry next cycle without advancing the timestamp, so no transactions are silently skipped.

### 8. Amount Matching Rule (Truncation-Based)

Matching is based on the expected value **truncated to 2 decimal places**, not rounded. Only the first two decimal digits matter; everything beyond is ignored.

| Expected | Transferred | Truncated (2 decimals) | Result |
|---|---|---|---|
| 8.78 | 8.786 | 8.78 | Match |
| 8.78 | 8.789 | 8.78 | Match |
| 8.78 | 8.79 | 8.79 | No match |
| 8.78 | 8.781 | 8.78 | Match |

Truncation (not rounding) is required: rounding 8.786 could produce 8.79 and incorrectly reject a valid match. The truncation precision (2 decimals) should be a configurable constant.

### 9. Sender (From-Address) Matching Rule

Evaluated in this order, after the amount check:

1. Amount check first — truncated transferred value must equal the intention's truncated expected value. If not, ignore the transfer regardless of sender.
2. Sender check second — if `expected_from_address` is set on the intention, the transfer's sender must match it exactly; otherwise skip this transfer even if the amount matched.
3. If `expected_from_address` is null, any sender qualifies — the first incoming transfer satisfying the amount rule concludes the intention.

## 10. Rate Limiting (Public API)

- Implemented with `express-rate-limit`, applied to `/api/v1/*` routes only, keyed by the user's API token (not IP).
- Default state: **disabled** for every user.
- User-configurable in Configs: toggle + requests-per-window + window duration (minutes), stored on the `users` table.
- The `apiKey.middleware` loads the user's settings after validating the token and dynamically applies a rate limiter per request using those values.
- When disabled, no throttling is applied.
- When exceeded: HTTP 429 with a JSON error body indicating retry timing.

## 11. Authentication

- `POST /auth/login`: validates credentials, issues access JWT (15 min) + refresh token (7 days, httpOnly cookie).
- `POST /auth/refresh`: rotates refresh token, issues new access token.
- `POST /auth/logout`.
- Internal routes protected by `auth.middleware` (JWT verification, attaches `req.user`).
- Public API routes protected by a separate `apiKey.middleware` (validates `X-API-Key` header against hashed tokens) — public API never accepts JWTs.

## 12. API Surface

### Internal (JWT, used by Angular frontend)

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/login | Login |
| POST | /auth/refresh | Refresh access token |
| POST | /auth/logout | Logout |
| GET | /wallets | List wallets |
| POST | /wallets | Create wallet |
| PATCH | /wallets/:id | Update wallet |
| DELETE | /wallets/:id | Delete (blocked if PENDING intentions exist) |
| GET | /payments | List/filter payment intentions |
| POST | /payments | Create payment intention |
| GET | /payments/:id | Get single payment + status |
| GET | /reports/dashboard | Aggregated dashboard metrics |
| GET | /configs | Get user configs |
| PATCH | /configs | Update configs (API keys, rate limiting) |
| GET | /custom-contracts | List custom contracts |
| POST | /custom-contracts | Create custom contract |
| DELETE | /custom-contracts/:id | Delete (blocked if referenced by PENDING intention) |
| GET | /api-tokens | List API tokens |
| POST | /api-tokens | Generate new API token |
| DELETE | /api-tokens/:id | Revoke token |

### Public API (API-Key header `X-API-Key`)

| Method | Path | Purpose |
|---|---|---|
| POST | /api/v1/payments | Create payment intention |
| GET | /api/v1/payments | List payment history |
| GET | /api/v1/payments/:id | Get payment status by ID |

## 13. Dashboard Reports

The Dashboard page (initially a placeholder concept, now defined) is served by `GET /reports/dashboard`, returning:

| Metric | Description |
|---|---|
| Total received (this month) | Sum of `value` for CONCLUDED intentions, current month |
| Pending payments count | Count of PENDING intentions |
| Expired payments (this month) | Count of EXPIRED intentions, current month |
| Conversion rate | CONCLUDED / (CONCLUDED + EXPIRED), last 30 days |
| Recent activity feed | Last 5–10 concluded/expired events |
| Wallets overview | Active wallets with pending amounts per wallet |

## 14. Frontend Pages & Navigation

Left menu order: Dashboard, Payments, Wallets, Configs.

| Route | Purpose |
|---|---|
| /login | JWT login |
| /dashboard | Reports (section 13) |
| /payments | History, filters, create button |
| /payments/new | Creation form |
| /payments/:id | Detail + live status |
| /wallets | CRUD, default-wallet toggle |
| /configs | General settings, Etherscan/Solscan keys, rate limiting, API tokens |

### Payment Intention Form

| Field | Type | Default | Required |
|---|---|---|---|
| Description | text | — | yes |
| Wallet | dropdown (all wallets) | default wallet | yes |
| Token | dropdown (system tokens + custom contracts) | USDT | yes |
| Value | number | — | yes |
| Expiration (hours) | number | 24 | yes |
| Expected sender address | text | — | no |

### Wallet Form

| Field | Type | Notes |
|---|---|---|
| Chain | select | Ethereum / Solana |
| Address | text | validated per chain |
| Description | text | free text |
| Is Default | toggle | only one default per user |

## 15. Self-Hosting & Deployment

- Docker Compose with three services: `db` (Postgres), `backend` (Express), `frontend` (Angular served via Nginx).
- Secrets (JWT secrets, DB password, encryption key) supplied via `.env`, never committed.
- Knex migrations run automatically on backend startup to keep self-hosted instances current.

## 16. Open Items / Future Considerations

- Additional chains beyond Ethereum/Solana (architecture already supports this via the chain abstraction layer).
- Possible tolerance adjustments to the truncation-based matching rule if real-world gas-fee edge cases require it.
- Video/audit trail features are not in scope for v1.
