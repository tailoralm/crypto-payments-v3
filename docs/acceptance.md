# Validation record and acceptance checks

Implementation validated locally on 2026-10-29. The previous documentation-only phase had no runtime evidence; this record supersedes that limitation. Live explorer accounts, real transfers, external SMTP deliverability, smartphone-wallet interoperability and public HTTPS are explicitly not claimed as verified.

## Merchant workflow validation — 2026-10-30

The merchant extension was exercised with disposable PostgreSQL 16, production containers and Chromium. Checks include:

- 33 backend unit/provider/PostgreSQL/API/upgrade tests and 3 Chromium scenarios passed.
- Backend TypeScript and frontend Angular production builds; production images with checksum-verified cloudflared 2026.10.7 running as UID 1000.
- Merchant PostgreSQL/API tests: concurrent idempotency across keys and owner calls, original-response replay, explicit publication/revocation, unique allocation/exhaustion with 6/18-decimal amounts, cancellation reservations, durable events/rollback, worker claims/retries/stale leases, signed callbacks, unread alerts, shared rate headers and audited recovery/replay protection.
- Mock Cloudflare provisioning, resumable DNS conflicts, encrypted connector state, readiness challenge, ownership-safe removal and in-flight disable cancellation. Real Cloudflare credentials were not used.
- Public gateway isolation from the Compose network: permitted SPA/assets/readiness, API-key requirement, denied administrative routes and tested encoding/path-normalization bypasses.
- Chromium merchant publication/revocation and fractional amount disclosure; dashboard hidden-tab pause, visible-tab refresh, alert read state, focus preservation, network failure/recovery and timer cleanup; existing owner/SMTP/PDF-related browser flow retained.
- WCAG A/AA axe checks, desktop/mobile billing screenshots and rendered PDFs. Generated all four statuses and inspected an active bill plus a two-page overflow case containing 500 unbroken description characters and a maximum-precision amount. Artifacts remain under ignored `artifacts/`.

Run `npm test` and `npm run test:integration` in `backend/`, and `npm run build` in each application. The integration script includes the merchant suite and requires the disposable database described below. Run `npm run test:e2e` in `frontend/` against the isolated Compose stack. To check the internal gateway:

```sh
docker run --rm --network YOUR_COMPOSE_PROJECT_default \
  -v "$PWD/scripts/check-public-gateway.mjs:/check.mjs:ro" \
  node:22-bookworm-slim node /check.mjs
```

Cloudflare public HTTPS, live explorer payments, external SMTP delivery and intended smartphone-wallet QR handling remain separate operator acceptance steps; automated fixtures do not establish them.

## Executed evidence

| Check | Result and coverage |
| --- | --- |
| Backend production TypeScript build | Passed |
| Frontend production Angular 21 build | Passed, including inside the production image |
| 8 unit/mocked-provider tests | Passed: 18-decimal precision, matching dimensions/time, Solana case, QR payloads, receipt log identity, ambiguous Solana data, Etherscan errors and bounded Solscan pagination |
| 12 PostgreSQL/API/upgrade tests | Passed: owner bootstrap, wallet validation/duplicates, 12 concurrent creators, exact inputs, public privacy/PDF, replay protection, final states/outages, filters/reports/archival, secret-preserving PATCH, shared API limits, session revocation, BSC polling-to-report flow, SMTP relay acceptance/rejection and legacy migration safeguards |
| Production Docker Compose | Built and started all services; PostgreSQL/backend/frontend healthchecks passed |
| Chromium workflow | Passed: setup/login, settings, wallet registration, payment creation, actual PDF download, anonymous public bill, cancellation, status filter, refresh-cookie reload, desktop/mobile layouts |
| Accessibility/style assertions | Passed: axe WCAG 2 A/AA checks on public bill and overview, applied stylesheet assertion, no page-level horizontal overflow at 390px on overview/settings |
| Screenshots | Desktop and mobile overview captured and visually inspected; stored locally under ignored `artifacts/` |
| Isolated PostgreSQL dump/restore | Passed: migration history, SUCCESS state, 18-decimal BSC amount and encrypted credential recovery using the original key |
| Dependency audit | Backend and frontend reported zero known vulnerabilities at check time |

Tests use deterministic explorer fixtures and a real local PostgreSQL/SMTP relay. No test sends money or contacts a real customer. These checks establish local behavior for the tested scenarios, not universal correctness across provider schema changes, browsers or wallet apps.

## Reproduce backend checks

Use Node.js 22, a local PostgreSQL 16 server and a disposable database named **cryptopay_test**. Integration tests erase application data in that database and refuse any other name.

```sh
cd backend
npm ci
npm run build
npm test
DB_NAME=cryptopay_test DB_HOST=localhost DB_PORT=5432 DB_USER=cryptopay DB_PASSWORD=your-test-password npm run test:integration
npm audit
```

The test runner applies migrations. Upgrade tests isolate legacy schemas, verify refusal before unsafe conversions, preserve settled custom records and confirm referenced wallets cannot be deleted. Do not run integration tests against a real installation or place real customer data in the test database.

## Reproduce browser checks

Use an isolated Compose project and fresh environment file. Set DISABLE_POLLER=true for browser fixtures so fake test credentials never issue live scans; set WEB_PORT=18080 and supply a unique SETUP_TOKEN. Start with `docker compose --env-file /path/to/test.env -p cryptopay-check up --build -d --wait`.

```sh
cd frontend
npm ci
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:18080 E2E_SETUP_TOKEN=your-test-setup-token npm run test:e2e
```

The test creates/uses the dedicated `browser@example.com` fixture owner, registers synthetic receiving addresses and requests, downloads PDFs and cancels its requests. Never point it at an installation with real payment data. A server with an existing different owner will not support this fixture flow. The [CI workflow](../.github/workflows/validate.yml) provisions isolated databases/containers and retains browser artifacts; hosted CI execution was not observed during this local session.

## Operational acceptance still required

- [ ] Valid credentials and plan entitlement for all enabled chains, including supporting receipt/transaction-detail endpoints.
- [ ] Controlled low-value on-chain transfer on each enabled chain; verify exact amount, recipient, contract/mint, on-chain time and detection result.
- [ ] Actual smartphone QR scan with intended wallets; verify token/network/amount before confirming payment.
- [ ] Operator's external SMTP sender/relay and inbox/PDF delivery; local relay acceptance does not prove internet delivery.
- [ ] Public HTTPS origin, secure refresh cookie, anonymous bill/PDF access from a separate network, and intended proxy topology.
- [x] Local fixture backup/restore rehearsal with the original encryption key; repeat with the operator's own backup process before production.
- [ ] Independent security review and actual hosted CI execution before claiming those assurances.

Solscan multi-transfer payloads lacking instruction identity deliberately stop with a monitoring error. No independent Solana finality guarantee is claimed. Expiry is final even if a transfer is discovered later; all operators must accept that documented policy before using real funds.
