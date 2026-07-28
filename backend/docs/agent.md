# Agent Instructions — Backend Development

You are an AI coding agent tasked with building the **backend** of CryptoPay Manager. Read `docs/project-overview.md` first for full architecture, data model, and business rules — this file only contains execution instructions.

## Your Task

Scaffold and implement the Node.js + Express + TypeScript backend described in `project-overview.md`. Work incrementally, module by module, and do not skip the business rules described in sections 7, 8, 9, and 10 of the overview — these are the most critical and error-prone parts of the system.

## Setup Instructions

1. Initialize a Node.js + TypeScript project inside `backend/`.
2. Install: `express`, `knex`, `pg`, `jsonwebtoken`, `bcrypt`, `node-cron`, `express-rate-limit`, `dotenv`, `axios` (for Etherscan/Solscan calls), plus TypeScript dev dependencies.
3. Configure `knexfile.ts` to read DB connection from environment variables (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, and a `DB_HOST` pointing at the `db` service in docker-compose).
4. Create the folder structure exactly as described in `project-overview.md` section 3 and the backend `README.md`.

## Development Order (follow this sequence)

1. **Database migrations** (Knex) for all tables in section 5: `users`, `wallets`, `tokens`, `custom_contracts`, `payment_intentions`, `api_tokens`. Seed the `tokens` table with at least one system-default USDT entry per chain (Ethereum, Solana).
2. **Auth module**: register, login, refresh, logout. JWT access (15 min) + refresh (7 days, httpOnly cookie). bcrypt for password hashing.
3. **Common middlewares**: `auth.middleware` (JWT verification), `apiKey.middleware` (public API token verification + dynamic per-user rate limiting), `error.middleware`.
4. **Users/Configs module**: get/update configs, including encrypted storage of Etherscan/Solscan API keys and rate-limit settings.
5. **Wallets module**: CRUD, enforce single-default-wallet rule (unset previous default in a transaction), enforce delete protection when PENDING intentions exist.
6. **Custom contracts module**: CRUD, enforce delete protection when referenced by PENDING intentions.
7. **Payments module**: create/list/get payment intentions. Compute `expires_at` at creation. Resolve `token_source`/`token_id` against `tokens` or `custom_contracts`.
8. **Blockchain abstraction layer**: define the chain-provider interface (see section 6), then implement two adapters — Ethereum (via Etherscan API) and Solana (via Solscan API). Each adapter must resolve raw transaction data into a normalized shape (hash, from, to, raw amount, contract address, timestamp).
9. **Payment poller job**: implement the node-cron job (every 15 minutes) following the exact algorithm in section 7, including the truncation-based amount matching (section 8) and sender matching (section 9). This is the most important piece of business logic — implement it as a pure, well-tested function separate from the cron scheduling itself, so matching logic can be unit tested without mocking time or cron.
10. **Reports module**: implement `GET /reports/dashboard` per section 13.
11. **API tokens module**: generate (SHA-256 hash, show raw token once), list, revoke.
12. **Public API routes** (`/api/v1/*`): wire up create/list/get payment endpoints behind `apiKey.middleware`.

## Critical Business Rules to Never Violate

- Every query must be scoped to `user_id`. There must be no way for one user to read or modify another user's wallets, payments, tokens, or configs — including via the public API.
- Amount matching uses **truncation to 2 decimals**, never rounding. Write this as an isolated, testable utility function, e.g. `truncateToPrecision(value, precision)`.
- A wallet or custom contract referenced by any `PENDING` payment intention cannot be deleted — return HTTP 409 with a clear message.
- A payment intention's `concluded_tx_hash`, `concluded_from_address`, and `concluded_at` fields are set exactly once and never overwritten.
- Store all monetary values as `numeric(20,6)` in Postgres and handle them as strings/decimal types in code — never as JavaScript floating point numbers.
- Rate limiting is disabled by default; it must be dynamically configurable per user without requiring a server restart.
- If an Etherscan/Solscan API call fails during polling, do not advance that wallet's `last_fetched_at` — retry on the next cycle.

## Code Style

- Strict TypeScript (`strict: true` in tsconfig).
- One module per business domain, each with its own routes, controller/service, and Knex queries — keep HTTP concerns separate from business logic so the matching algorithm and other core logic can be unit tested directly.
- Use environment variables for all secrets and connection strings; never hardcode credentials.

## Suggested First Prompt for the Agent

> "Set up the Express + TypeScript project structure in `backend/` per `docs/project-overview.md` section 3, configure Knex with PostgreSQL, and write the first migration covering the `users`, `wallets`, `tokens`, `custom_contracts`, `payment_intentions`, and `api_tokens` tables from section 5. Seed `tokens` with USDT on Ethereum and Solana."
