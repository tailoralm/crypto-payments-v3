# Delivery status and remaining validation

See [merchant integrations and operations](merchant-workflow.md) for publication, callbacks, Cloudflare, alerts and audited recovery (added 2026-10-30).

Updated 2026-10-30. The original [audit](archive/2026-10-28-before-implementation.md) has been addressed by the self-hosted implementation; this is no longer a scaffold completion checklist.

## Delivered

- Merchant order references/idempotency, opt-in unique amounts, explicit publication/revocation, signed durable callbacks, polling headers, persistent alerts, reviewed recovery and optional API-provisioned Cloudflare with an isolated public gateway.

- Exact atomic matching, sender/network/asset/time checks, concurrency conflicts, persistent transfer consumption and final lifecycle states.
- Etherscan V2 Ethereum/BSC and Solscan transfer adapters with explicit credentials, pagination, bounded replay, execution evidence, error outcomes and shared throttling.
- One-owner bootstrap, revocable sessions, installation settings, encrypted secrets, archived wallets, snapshots, upgrade guards and database-backed API limits.
- Anonymous billing, payment QR, PDF generation/download, optional explicit SMTP delivery and private delivery outcomes.
- Responsive Angular 21 workspace, UTC dashboard/cohort chart, latest/upcoming lists, history filters/pagination, wallet scan health, settings and API-token management.
- Production Docker images, same-origin proxy, private database/API network, secret generator, healthchecks, MIT license, CI workflow and automated test suites.

## Verified locally

See [acceptance evidence](acceptance.md): backend and frontend builds, PostgreSQL/API tests, migration preservation/rejection, mocked provider behavior, local SMTP acceptance/rejection, production Compose startup, and Chromium workflows with accessibility/viewport checks. Dependency audits reported zero known vulnerabilities at check time.

## Before receiving real funds

1. Supply valid provider credentials in Settings and validate the exact chain/plan endpoints, including receipt/transaction detail access. Perform one controlled low-value transfer per enabled chain and record detection time/evidence. Free access is not guaranteed.
2. Scan payment QRs in the specific smartphone wallets you intend to support; wallet protocol support varies. Validate receiving network, token and amount on the wallet confirmation screen.
3. Verify the operator's real SMTP relay/sender, PDF attachment, rejection behavior and inbox deliverability. Local relay tests do not prove external delivery.
4. For public hosting, configure HTTPS, COOKIE_SECURE, a reachable binding/reverse proxy and explicit public base URL. Check anonymous status/PDF from another network.
5. The local fixture backup/restore rehearsal passed; repeat using the operator's original encryption key, configuration and backup process. Hosted CI execution and independent security review remain outside this session's evidence.

## Explicit boundaries

Solscan multi-transfer data without instruction identity stops safely rather than guessing; extending support requires validated transaction instruction parsing. Solana independent finality verification, alternative RPC providers, evidence-free manual settlement overrides, refunds, native coins, new custom tokens, teams/multiple owners, formal tax invoices and automated reminders are outside this release.

Legacy multi-user conversion and unresolved active custom-asset migration remain separate, explicit operator workflows. The upgrade intentionally refuses those states. No requested payment history is deleted or merged automatically.
