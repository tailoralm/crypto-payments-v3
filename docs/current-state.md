# Current implementation

Updated 2026-10-29 after implementation. The [historical audit](archive/2026-10-28-before-implementation.md) records the previous incomplete state. The application has been built and exercised with PostgreSQL, production containers, Chromium, mocked explorers, and a local SMTP relay. Live explorer credentials, real-chain payments, external email delivery, and public HTTPS hosting were not available for validation.

## Capability and evidence

| Capability | Current state | Evidence |
| --- | --- | --- |
| Single owner | Implemented | Bootstrap token, transactional one-owner guard, closed signup, rotating/revocable sessions; API/browser tests |
| Wallets | Implemented | Three chain identifiers, validation, serialized duplicate protection, default wallet, editing description, archival, scan health; API/browser tests |
| Payment creation | Implemented | Decimal strings, curated assets, optional sender, overlap conflicts, snapshots; concurrent API tests |
| Payment monitoring | Implemented with provider limits | Serialized scheduled/manual scans, exact matching, receipt evidence, persistent event assignment; mocked provider and PostgreSQL tests; live access unverified |
| Four statuses | Implemented | IN_PROGRESS, SUCCESS, EXPIRED, CANCELED; terminal-state and outage/expiry tests |
| Anonymous bill | Implemented | Independent random token, restricted projection, no owner actions; anonymous browser/API tests |
| PDF and QR | Implemented | Real PDF generation/download and QR payload assertions; browser checks; actual smartphone-wallet scans unverified |
| SMTP | Implemented | Optional encrypted configuration and explicit PDF sending; local relay acceptance/rejection tests; external deliverability unverified |
| Dashboard | Implemented | UTC success metrics, current-month status cohort, last 10 successes, next 10 expirations; API/browser tests |
| History | Implemented | All-status/date filters, stable pagination, details, public/PDF/email actions; API/browser tests |
| Settings | Implemented | Provider/chain toggles, secret masking, public URL, SMTP, interval, API limits; API/browser tests |
| Integration API | Implemented | API-key create/list/detail; hashed tokens and database-backed shared rate limits; API tests |
| Deployment | Verified locally | Production images built, all Compose services healthy, same-origin API proxy and CSP-compatible styling; Chromium flow at localhost |
| Upgrades | Safeguarded | Existing history/snapshots preserved, unknown legacy paid times not invented, multiple owners/active custom payments rejected; migration tests |
| Open-source materials | Present | MIT license, setup guide, CI workflow, test suites; hosted CI execution not observed in this session |

## Architecture

Backend HTTP/authentication lives in [app.ts](../backend/src/app.ts). Domain validation, settings, payments, ingestion, reporting, and billing live in `backend/src/core/`. PostgreSQL stores configuration, payment snapshots, transfers, sessions, delivery outcomes, and rate-limit buckets. The original schema is retained and an incremental self-hosted migration adds the new model.

Angular uses standalone lazy-loaded pages, centralized HTTP/session handling, memory-only access tokens, same-origin refresh cookies, and responsive CSS. PrimeNG and the unused multi-user/custom-creation UI were removed. The scheduler is a non-overlapping interval worker with a PostgreSQL advisory lock; interval changes are detected within a minute. There is no root npm workspace.

## Material limits

- All configured chains require valid provider credentials and plan entitlement. Adapters refuse errors/malformed data rather than interpreting them as empty successful scans.
- Active windows are replayed completely, bounded to 100 pages per wallet per scan. This favors correctness under indexing lag over quota efficiency. Checkpoints describe completed scan attempts, not proof that an explorer has indexed every transfer.
- Solscan transaction success is verified through transaction detail. Missing instruction identity on multi-transfer responses prevents automatic attribution; that wallet scan reports an error. No independent Solana finality guarantee is made.
- Twelve EVM confirmations reduce reorganization risk but are not an irreversible-settlement guarantee. Receipt and supporting API availability depend on provider access.
- Final expiry continues during errors/disablement; once expired, payment status never reopens automatically. There is no manual “mark paid” override or refund mechanism.
- New requests are curated USDT only. Legacy custom history remains readable and excluded from USDT metrics. Upgrades requiring ownership mapping or active custom-asset resolution intentionally stop.
- Legacy successes without chain paid-time evidence remain visible but are excluded from day/month totals and explicitly counted as unknown-time history.
- Public bill links are bearer capabilities. Local-only operation provides PDF/QR, not internet access to live status. PDFs are snapshots and external SMTP acceptance is not inbox delivery.
- Dependency audits reported no vulnerabilities at validation time; this is not a full independent security audit.

See [validation evidence](acceptance.md) for commands and [remaining work](development-plan.md) for external release checks.
