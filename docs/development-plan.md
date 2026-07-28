# Development Plan — CryptoPay Manager

## Phase 1: Backend Scaffolding

- [x] Initialize `backend/package.json` with Node.js + Express + TypeScript
- [x] Configure `tsconfig.json` with `strict: true`
- [x] Create folder structure
- [x] Install dependencies
- [x] Install dev dependencies
- [x] Configure `knexfile.ts` reading from env vars
- [x] Create `server.ts` entry point with Express app, CORS, JSON parsing, health check
- [x] Add npm scripts
- [ ] Add Dockerfile adjustments if needed for dev workflow

## Phase 2: Database Migrations

- [x] Migration: create `users` table
- [x] Migration: create `tokens` table (system-defined)
- [x] Migration: create `wallets` table
- [x] Migration: create `custom_contracts` table
- [x] Migration: create `payment_intentions` table
- [x] Migration: create `api_tokens` table
- [x] Seed: insert system tokens (USDT on Ethereum + Solana) into `tokens`

## Phase 3: Common Middlewares

- [x] Create `auth.middleware.ts` — JWT verification, attaches `req.user`
- [x] Create `apiKey.middleware.ts` — validates `X-API-Key` header against SHA-256 hashed tokens, loads user rate-limit settings, applies dynamic `express-rate-limit` per request
- [x] Create `error.middleware.ts` — centralized error handling, returns structured JSON errors
- [x] Create `validation` utilities (UUID validation, chain address format validation)
- [x] Create `encryption.ts` helper (AES encrypt/decrypt for API key storage)
- [x] Create shared `types.ts` (AuthenticatedUser, AuthenticatedRequest, AppError)

## Phase 4: Auth Module

- [x] `POST /auth/register` — email + password, hash with bcrypt, return user
- [x] `POST /auth/login` — validate credentials, issue access JWT (15 min) + refresh token (7 days, httpOnly cookie)
- [x] `POST /auth/refresh` — rotate refresh token, issue new access JWT
- [x] `POST /auth/logout` — clear refresh cookie

## Phase 5: Configs Module

- [x] `GET /configs` — return user configs (API key status masked, rate-limit settings)
- [x] `PATCH /configs` — update Etherscan/Solscan API keys, update rate-limit settings
- [x] Implement encryption/decryption helpers for API key storage

## Phase 6: Wallets Module

- [x] `GET /wallets` — list all wallets for authenticated user
- [x] `POST /wallets` — create wallet with chain validation, enforce single-default in transaction
- [x] `PATCH /wallets/:id` — update wallet fields, enforce single-default in transaction
- [x] `DELETE /wallets/:id` — block with 409 if any PENDING payment intentions reference this wallet

## Phase 7: Custom Contracts Module

- [x] `GET /custom-contracts` — list all custom contracts for user
- [x] `POST /custom-contracts` — create with chain and contract validation
- [x] `DELETE /custom-contracts/:id` — block with 409 if any PENDING payment intentions reference this contract

## Phase 8: Payments Module

- [x] `POST /payments` — create payment intention (expires_at, token resolution, wallet validation)
- [x] `GET /payments` — list/filter payment intentions (by status, date range)
- [x] `GET /payments/:id` — get single payment with full details

## Phase 9: API Tokens Module

- [x] `POST /api-tokens` — generate token (SHA-256 hash, raw token shown once)
- [x] `GET /api-tokens` — list tokens (masked)
- [x] `DELETE /api-tokens/:id` — revoke token

## Phase 10: Blockchain Abstraction Layer

- [x] Define `IChainProvider` interface
- [x] Create `ChainRegistry`
- [x] Implement `EthereumProvider` (Etherscan API)
- [x] Implement `SolanaProvider` (Solscan API)
- [x] Extensible architecture

## Phase 11: Payment Poller Job (Core Logic)

- [x] Create `truncateToPrecision` utility
- [x] Create `convertRawAmount` utility
- [x] Implement `evaluateMatch` function (pure)
- [x] Implement `PaymentPoller` service with FIFO, contract matching, tx hash dedup
- [x] Expired intentions handling
- [x] Wire up `node-cron` every 15 minutes
- [x] Error handling — `last_fetched_at` not advanced on failure

## Phase 12: Reports Module

- [x] `GET /reports/dashboard` — all metrics (total received, pending, expired, conversion rate, activity feed, wallets overview)

## Phase 13: Public API

- [x] `POST /api/v1/payments` — create via API key
- [x] `GET /api/v1/payments` — list via API key
- [x] `GET /api/v1/payments/:id` — get via API key
- [x] All routes behind `apiKey.middleware` with dynamic rate limiting

## Phase 14: Frontend Scaffolding

- [x] Initialize Angular project in `frontend/` with standalone components
- [x] Install PrimeNG and required dependencies
- [x] Configure environment files (`environment.ts`, `environment.prod.ts`) with `apiBaseUrl`
- [x] Create folder structure: `auth/`, `dashboard/`, `payments/`, `wallets/`, `configs/`, `shared/`
- [x] Set up `angular.json` with PrimeNG styles
- [x] Create HTTP interceptor for JWT attachment + token refresh on 401
- [x] Create route guard for authenticated routes
- [x] Set up Angular routing with all routes (lazy-loaded)

## Phase 15: Frontend Auth

- [x] Login page — email + password form, store access JWT in memory
- [x] Register page — email + password + confirmation
- [x] Auth interceptor — attach Bearer token, handle 401 → refresh → retry
- [x] Route guard — redirect to /login if not authenticated

## Phase 16: Frontend Shared Layout

- [x] Shell layout component with left sidebar navigation
- [x] Menu items in order: Dashboard, Payments, Wallets, Configs
- [x] Router outlet for page content
- [x] Logout button in sidebar footer

## Phase 17: Frontend Dashboard Page

- [x] Call `GET /reports/dashboard`
- [x] Display metrics in card grid (total received, pending, expired, conversion rate)
- [x] Recent activity table (last 10 concluded/expired)
- [x] Wallets overview with pending counts

## Phase 18: Frontend Wallets Page

- [x] Wallet list using table
- [x] Create wallet form (chain selector, address, description, default toggle)
- [x] Edit wallet (inline form)
- [x] Delete wallet with 409 error handling

## Phase 19: Frontend Payments Page

- [x] Payment list with status filter
- [x] Create new payment form (wallet dropdown, token dropdown, value, expiration, expected sender)
- [x] Payment detail page (status badge, concluded tx info)

## Phase 20: Frontend Configs Page

- [x] API Keys section (Etherscan, Solscan — masked inputs)
- [x] Rate limiting section (toggle, max requests, window)
- [x] API Tokens section (list, generate with one-time raw token reveal, revoke)

## Phase 21: Frontend Custom Contracts

- [x] List of custom contracts in a table
- [x] Add contract form (chain, address, symbol, decimals)
- [x] Delete with 409 error handling

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
