# Historical audit: before implementation

Superseded by [current state](../current-state.md). Paths below describe the old source layout, some of which has since been removed.

# Current-state assessment

Assessed 2026-10-28 by static inspection of tracked source, manifests, migrations, routing, and deployment configuration. This document describes the code, not the intended release.

## Evidence levels

- **Present but unverified:** implementation exists; runtime behavior has not been demonstrated.
- **Partially implemented:** some required behavior exists, but gaps or visible defects remain.
- **Missing:** no implementation was found in the inspected source.
- **Verified:** the named check was actually executed and passed. No application feature receives this label in this audit.

The old development checklist marked most implementation phases complete without end-to-end validation. Those marks have been replaced by the backlog (historical path: `development-plan.md`).

## Requirement coverage

| Requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Self-hosted single owner | Partially implemented | Containers and login exist; `/auth/register`, user-scoped records, and per-user settings retain the original multi-user model. No one-owner bootstrap exists. |
| Wallet description, blockchain, public address | Partially implemented | Wallet service (historical path: `../backend/src/modules/wallets/wallets.service.ts`) and Angular wallet screen exist for Ethereum/Solana. BSC and duplicate-address safeguards are absent. |
| Create payment intention | Partially implemented | Payment service (historical path: `../backend/src/modules/payments/payments.service.ts`) creates records with a 24-hour default; amount validation, chain/token consistency, and ambiguity prevention are missing. |
| Backend cron verification | Partially implemented | Poller (historical path: `../backend/src/jobs/payment-poller.job.ts`) runs every 15 minutes; matching and ingestion defects below prevent a correctness claim. |
| Ethereum monitoring | Partially implemented | Adapter (historical path: `../backend/src/modules/blockchain/EthereumProvider.ts`) uses an old API URL, no chain ID, and no pagination. |
| Solana monitoring | Partially implemented | Adapter (historical path: `../backend/src/modules/blockchain/SolanaProvider.ts`) requests account tokens rather than transfer history, with a mismatched response assumption and authentication format. |
| BSC monitoring | Missing | No BSC provider, registry entry, validator option, or seed. |
| Four requested statuses and cancellation | Partially implemented | Validators/UI/poller use `PENDING`, `CONCLUDED`, `EXPIRED`; no cancellation route or `CANCELED` state. |
| Public billing page | Missing | All payment UI routes are behind the auth guard. The module named `public` is an API-key-protected integration API, not anonymous billing. |
| Billing PDF and payment QR | Missing | No PDF or QR implementation/dependencies found. |
| SMTP and send-by-email action | Missing | No SMTP configuration, delivery service, or email action. |
| Dashboard today/month metrics | Partially implemented | Report service (historical path: `../backend/src/modules/reports/reports.service.ts`) provides a monthly sum and other legacy metrics; today totals are absent and the activity query is invalid against the schema. |
| Status graph | Missing | No dashboard time series or chart rendering. |
| Last 10 successful payments | Partially implemented | Activity is limited to 10 but combines concluded and expired records; ordering references a nonexistent column. |
| Next 10 expiring and countdown | Missing | No upcoming-expiry query or UI. |
| All intentions, date/status filters | Partially implemented | API supports creation-date/status predicates; UI exposes only status, with legacy names. Lists are unpaginated. |
| Public-page and email links | Missing | Neither billing flow exists. |
| Provider tokens and enable switches | Partially implemented | Encrypted Etherscan/Solscan keys are stored on users; no provider/chain switches or capability checks. |
| Configurable cron interval | Missing | Schedule is hardcoded; no settings field. |
| Integration API and API tokens | Present but unverified | `/api/v1/payments` and hashed API tokens exist; retained in target scope. |
| Custom contracts | Partially implemented | Backend and screen exist, but payment form submits only system tokens; new custom assets are deferred in target scope. |
| Open-source release materials | Partially implemented | README states MIT, but no LICENSE file exists. No automated test scripts were found. |

## Payment correctness findings

1. **Amounts:** `common/utils/math.ts` converts raw integer strings to JavaScript numbers; `matching.ts` truncates to two decimals. Distinct amounts can match, including an underpayment when an intention has more than two decimal digits.
2. **Time window:** the poller does not compare transfer time with intention creation or expiry. Initial fetch starts at the Unix epoch; old or post-expiry transfers can conclude a request.
3. **Deduplication/concurrency:** used hashes exist only in memory for one wallet pass. No persistent transfer identity, conditional status update, or job lock prevents reuse across runs or concurrent jobs. Hash-only identity also loses separate transfers inside one transaction.
4. **API failures:** Etherscan non-success responses and Solscan exceptions become empty transaction arrays. The poller can then advance `last_fetched_at`, losing retry coverage. Missing credentials can also result in stale process-global credentials being reused.
5. **Pagination/cursor:** adapters do not exhaust pages. The cursor advances to local current time rather than a proven indexed boundary, allowing indexing lag and request latency to skip transfers.
6. **Recipient/address rules:** Solana adapter does not filter incoming transfers; matching lowercases all addresses and mints, although Solana identifiers are case-sensitive.
7. **Expiry coupling:** expiry runs only inside a successful wallet/provider path. Missing providers and thrown errors skip expiration. Conversely, swallowed errors look successful and can expire intentions without a reliable scan.
8. **Input consistency:** payment creation does not ensure token and wallet belong to the same chain. TypeScript types do not validate request bodies; expiration is interpolated into a raw SQL interval. Validation must precede database calls.
9. **History:** wallet FK uses `ON DELETE CASCADE`; the service blocks deletion only for pending intentions. Deleting a wallet can erase concluded/expired history. Deleting a custom contract can leave unresolved token references.

## Reports, authentication, and deployment findings

- Reports order payments by `updated_at`, absent from the initial payment table. Expired-month counts use creation date, not expiry date. Sums can combine unrelated custom assets under the old model.
- Frontend stores access tokens in `sessionStorage`, despite old documentation claiming memory-only storage. Refresh tokens are signed JWTs; issuing replacements does not revoke previously issued tokens. Logout clears the cookie without server-side revocation.
- API rate-limit middleware constructs a new limiter/store on every request; a shared request budget is not established. This is not verified rate-limit enforcement.
- Both package lockfiles exist. No missing-lockfile defect is asserted. Frontend/back-end builds, dependency compatibility, and Docker startup remain untested.
- Frontend production API base is `/api`, but Nginx has no API proxy. The documented `API_BASE_URL` environment variable is not wired to the Angular build.
- Backend container runs the development server with source bind mounts. Compose migrates but does not seed tokens. The seed uses `ON CONFLICT (chain, symbol)` without a corresponding unique constraint in the initial migration.
- Production Knex assumes SSL with certificate verification disabled; compatibility with the Compose database and compiled migration layout is unverified.
- Secrets have development fallbacks; database is published to the host. No one-owner setup, recovery guide, release CI, or production health verification exists.
- No Moralis integration was found in the inspected application source. This is mainly provider correction/extension, not removal of an existing Moralis adapter.

## Audit limits

No dependencies were installed, application builds/tests executed, database started, migrations applied, external credentials used, real payment made, or email sent. Provider documentation was checked separately in the provider guide (historical path: `providers.md`). Static defects are evidence of required work, not a complete security review.
