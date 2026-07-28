# Development Plan — CryptoPay Manager

## Phase 1: Backend Scaffolding

- [ ] Initialize `backend/package.json` with Node.js + Express + TypeScript
- [ ] Configure `tsconfig.json` with `strict: true`
- [ ] Create folder structure:
  ```
  src/
  ├── modules/
  │   ├── auth/
  │   ├── users/
  │   ├── wallets/
  │   ├── payments/
  │   ├── api-tokens/
  │   ├── reports/
  │   ├── configs/
  │   ├── custom-contracts/
  │   └── blockchain/
  ├── jobs/
  │   └── payment-poller.job.ts
  ├── db/
  │   ├── knexfile.ts
  │   └── migrations/
  ├── common/
  │   ├── middlewares/
  │   └── validators/
  └── server.ts
  ```
- [ ] Install dependencies: `express`, `knex`, `pg`, `jsonwebtoken`, `bcrypt`, `node-cron`, `express-rate-limit`, `dotenv`, `axios`, `crypto-js`
- [ ] Install dev dependencies: `typescript`, `ts-node`, `nodemon`, `@types/*`
- [ ] Configure `knexfile.ts` reading from env vars (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`)
- [ ] Create `server.ts` entry point with Express app, CORS, JSON parsing, health check
- [ ] Add npm scripts: `dev` (ts-node + nodemon), `build`, `start`, `migrate`, `seed`
- [ ] Add Dockerfile adjustments if needed for dev workflow

## Phase 2: Database Migrations

- [ ] Migration: create `users` table
  - `id` uuid PK
  - `email` string unique
  - `password_hash` string
  - `etherscan_api_key` string (encrypted, nullable)
  - `solscan_api_key` string (encrypted, nullable)
  - `rate_limit_enabled` boolean default false
  - `rate_limit_max_requests` integer nullable
  - `rate_limit_window_minutes` integer nullable
  - `created_at` / `updated_at` timestamps
- [ ] Migration: create `tokens` table (system-defined)
  - `id` uuid PK
  - `chain` string (ethereum | solana)
  - `symbol` string
  - `contract_address` string
  - `decimals` integer
  - `is_system_default` boolean
- [ ] Migration: create `wallets` table
  - `id` uuid PK
  - `user_id` uuid FK -> users
  - `chain` string (ethereum | solana)
  - `address` string
  - `description` string
  - `is_default` boolean
  - `last_fetched_at` timestamp nullable
  - `created_at` / `updated_at` timestamps
- [ ] Migration: create `custom_contracts` table
  - `id` uuid PK
  - `user_id` uuid FK -> users
  - `chain` string
  - `contract_address` string
  - `symbol` string
  - `decimals` integer
  - `created_at` timestamp
- [ ] Migration: create `payment_intentions` table
  - `id` uuid PK
  - `user_id` uuid FK -> users
  - `wallet_id` uuid FK -> wallets
  - `description` string
  - `value` numeric(20,6)
  - `token_source` string (system | custom)
  - `token_id` uuid (polymorphic FK)
  - `expiration_hours` integer default 24
  - `expires_at` timestamp
  - `expected_from_address` string nullable
  - `status` string (PENDING | CONCLUDED | EXPIRED)
  - `concluded_tx_hash` string nullable
  - `concluded_from_address` string nullable
  - `concluded_at` timestamp nullable
  - `created_at` timestamp
- [ ] Migration: create `api_tokens` table
  - `id` uuid PK
  - `user_id` uuid FK -> users
  - `token_hash` string (SHA-256)
  - `label` string
  - `last_used_at` timestamp nullable
  - `created_at` timestamp
- [ ] Seed: insert system tokens (USDT on Ethereum + Solana) into `tokens`

## Phase 3: Common Middlewares

- [ ] Create `auth.middleware.ts` — JWT verification, attaches `req.user`
- [ ] Create `apiKey.middleware.ts` — validates `X-API-Key` header against SHA-256 hashed tokens, loads user rate-limit settings, applies dynamic `express-rate-limit` per request
- [ ] Create `error.middleware.ts` — centralized error handling, returns structured JSON errors
- [ ] Create `validation` utilities (UUID validation, chain address format validation)

## Phase 4: Auth Module

- [ ] `POST /auth/register` — email + password, hash with bcrypt, return user
- [ ] `POST /auth/login` — validate credentials, issue access JWT (15 min) + refresh token (7 days, httpOnly cookie)
- [ ] `POST /auth/refresh` — rotate refresh token, issue new access JWT
- [ ] `POST /auth/logout` — clear refresh cookie

## Phase 5: Configs Module

- [ ] `GET /configs` — return user configs (API key status masked, rate-limit settings)
- [ ] `PATCH /configs` — update Etherscan/Solscan API keys (encrypt at rest), update rate-limit settings
- [ ] Implement encryption/decryption helpers for API key storage

## Phase 6: Wallets Module

- [ ] `GET /wallets` — list all wallets for authenticated user
- [ ] `POST /wallets` — create wallet with chain validation, enforce single-default in transaction
- [ ] `PATCH /wallets/:id` — update wallet fields, enforce single-default in transaction
- [ ] `DELETE /wallets/:id` — block with 409 if any PENDING payment intentions reference this wallet

## Phase 7: Custom Contracts Module

- [ ] `GET /custom-contracts` — list all custom contracts for user
- [ ] `POST /custom-contracts` — create with chain and contract validation
- [ ] `DELETE /custom-contracts/:id` — block with 409 if any PENDING payment intentions reference this contract

## Phase 8: Payments Module

- [ ] `POST /payments` — create payment intention
  - Compute `expires_at` = now + `expiration_hours`
  - Resolve `token_source`/`token_id` against `tokens` or `custom_contracts`
  - Validate wallet belongs to user
- [ ] `GET /payments` — list/filter payment intentions (by status, date range)
- [ ] `GET /payments/:id` — get single payment with full details

## Phase 9: API Tokens Module

- [ ] `POST /api-tokens` — generate token (random string), store SHA-256 hash, return raw token once
- [ ] `GET /api-tokens` — list tokens (never return raw token, mask/hide)
- [ ] `DELETE /api-tokens/:id` — revoke token

## Phase 10: Blockchain Abstraction Layer

- [ ] Define `IChainProvider` interface:
  - `chainId: string`
  - `getTransactionsSince(walletAddress: string, since: Date): Promise<TransferEvent[]>`
  - `TransferEvent` shape: `{ txHash, from, to, rawAmount, contractAddress, timestamp }`
- [ ] Create `ChainRegistry` — map chain IDs to provider instances
- [ ] Implement `EthereumProvider` — call Etherscan API (`api.etherscan.io/api?module=account&action=tokentx`)
- [ ] Implement `SolanaProvider` — call Solscan API for token transfers
- [ ] Ensure architecture supports adding new chains by creating a new adapter only

## Phase 11: Payment Poller Job (Core Logic)

- [ ] Create `truncateToPrecision(value: number, precision: number)` utility — pure function
- [ ] Implement matching logic:
  - Amount check: truncate both expected and transferred to 2 decimals, compare
  - Sender check: if `expected_from_address` is set, match exactly; otherwise any sender qualifies
- [ ] Create pure `matchTransaction` function (testable without cron/mocks)
- [ ] Implement `PaymentPoller` service:
  1. Query all wallets with at least one PENDING payment intention
  2. For each wallet, fetch transactions via chain adapter since `last_fetched_at`
  3. Resolve token decimals from `tokens` or `custom_contracts`
  4. Convert raw on-chain amounts to human-readable using decimals
  5. Evaluate PENDING intentions FIFO by `created_at`
  6. Apply amount + sender matching rules
  7. On match: mark CONCLUDED, store tx hash, from address, timestamp
  8. Each tx hash concludes at most one intention
  9. After processing, mark EXPIRED any intentions where `expires_at < now()`
  10. Advance `last_fetched_at` only on successful fetch; retry on failure
- [ ] Wire up `node-cron` to run every 15 minutes

## Phase 12: Reports Module

- [ ] `GET /reports/dashboard` — return aggregated metrics:
  - Total received this month (sum of CONCLUDED values, current month)
  - Pending payments count
  - Expired payments count (current month)
  - Conversion rate (CONCLUDED / (CONCLUDED + EXPIRED), last 30 days)
  - Recent activity feed (last 10 concluded/expired events)
  - Wallets overview (active wallets with pending amounts)

## Phase 13: Public API

- [ ] `POST /api/v1/payments` — create payment intention via API key
- [ ] `GET /api/v1/payments` — list payment history via API key
- [ ] `GET /api/v1/payments/:id` — get payment status by ID via API key
- [ ] All public routes behind `apiKey.middleware` with per-user rate limiting

## Phase 14: Frontend Scaffolding

- [ ] Initialize Angular project in `frontend/` with standalone components
- [ ] Install PrimeNG and required dependencies
- [ ] Configure environment files (`environment.ts`, `environment.prod.ts`) with `apiBaseUrl`
- [ ] Create folder structure: `auth/`, `dashboard/`, `payments/`, `wallets/`, `configs/`, `shared/`
- [ ] Set up shared module with PrimeNG imports, common components
- [ ] Create HTTP interceptor for JWT attachment + token refresh on 401
- [ ] Create route guard for authenticated routes
- [ ] Set up Angular routing with all routes

## Phase 15: Frontend Auth

- [ ] Login page — email + password form, store access JWT in memory
- [ ] Register page — email + password + confirmation
- [ ] Auth interceptor — attach Bearer token, handle 401 → refresh → retry
- [ ] Route guard — redirect to /login if not authenticated

## Phase 16: Frontend Shared Layout

- [ ] Shell layout component with left navigation menu (PrimeNG Menu or Sidebar)
- [ ] Menu items in order: Dashboard, Payments, Wallets, Configs
- [ ] Router outlet for page content
- [ ] Responsive design (collapsible menu on mobile)

## Phase 17: Frontend Dashboard Page

- [ ] Call `GET /reports/dashboard`
- [ ] Display metrics using PrimeNG cards:
  - Total received this month
  - Pending payments count
  - Expired payments count
  - Conversion rate
- [ ] Recent activity feed (PrimeNG Timeline or list)
- [ ] Wallets overview (wallets with pending amounts)

## Phase 18: Frontend Wallets Page

- [ ] Wallet list using PrimeNG Table
- [ ] Create wallet form (PrimeNG Dialog or separate route):
  - Chain selector (Ethereum / Solana)
  - Address input
  - Description input
  - Is Default toggle
- [ ] Edit wallet (inline or dialog)
- [ ] Delete wallet — disable with tooltip when PENDING intentions exist, show 409 error gracefully
- [ ] Default wallet toggle — only one default per user

## Phase 19: Frontend Payments Page

- [ ] Payment list with PrimeNG Table
- [ ] Filters: status dropdown, date range picker
- [ ] Create new payment button
- [ ] Payment creation form:
  - Description (text input)
  - Wallet dropdown (default wallet pre-selected)
  - Token dropdown (system tokens + custom contracts, USDT default)
  - Value (number input)
  - Expiration hours (number, default 24)
  - Expected sender address (optional text input)
- [ ] Payment detail page:
  - Status badge (PENDING / CONCLUDED / EXPIRED)
  - When CONCLUDED: show tx hash, from address, timestamp
  - When EXPIRED: show expiration info

## Phase 20: Frontend Configs Page

- [ ] API Keys section:
  - Etherscan API key input (masked)
  - Solscan API key input (masked)
  - Save button
- [ ] Rate limiting section:
  - Toggle enable/disable
  - Max requests per window (number)
  - Window duration in minutes (number)
- [ ] API Tokens section:
  - List of tokens (masked, show last 4 chars)
  - Generate new token button — show raw token once in dialog
  - Revoke token button with confirmation

## Phase 21: Frontend Custom Contracts

- [ ] List of custom contracts in a PrimeNG Table
- [ ] Add contract form:
  - Chain selector
  - Contract address
  - Symbol
  - Decimals
- [ ] Delete with same 409 handling as wallets

## Phase 22: Integration & Validation

- [ ] End-to-end: register → login → create wallet → create payment → poller marks CONCLUDED
- [ ] Validate amount matching rules (truncation) with unit tests
- [ ] Validate sender matching rules
- [ ] Validate delete protection (409 on PENDING wallets/contracts)
- [ ] Validate multi-tenancy (no cross-user data access)
- [ ] Validate rate limiting on public API
- [ ] Validate token refresh flow on frontend
- [ ] Validate Docker Compose builds and runs

## Phase 23: Polish & Deployment

- [ ] Error handling refinement (consistent API error shapes)
- [ ] Loading states, empty states, error states on all pages
- [ ] Form validation messages
- [ ] README updates with setup instructions
- [ ] Verify Docker Compose production build
- [ ] Final review of env vars and secrets management
