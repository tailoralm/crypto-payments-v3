# Self-hosted product specification

Canonical product specification, agreed 2026-10-28 and implemented in the self-hosted release. See the [current assessment](current-state.md) for verification evidence and provider-specific limits. This document takes precedence over legacy frontend/backend architecture descriptions.

## Product and ownership

One owner runs an installation to generate and monitor payment intentions for existing receiving wallets. No SaaS subscriptions, public account signup, shared teams, custody, key generation, or transaction signing are included. Preserve login and the authenticated integration API. A fresh installation needs a one-time owner bootstrap; once established, registration is closed. Existing multi-user installations require a separate explicit migration design; never automatically merge their data.

Keep the Angular/Express/Knex/PostgreSQL architecture. Installation-wide settings replace per-user operational settings in the target design. Existing ownership keys may remain for access control and migration safety.

## Wallets and assets

Register description, blockchain, and public receiving address. Support Ethereum mainnet, Solana mainnet, and BNB Smart Chain mainnet. Validate identifiers per chain; EVM comparisons are case-insensitive, Solana comparisons case-sensitive. For Solana, register the receiving wallet public key rather than an associated token-account address; the payment request derives the token account from the mint. Prevent duplicate registrations of the same chain/address within the installation.

New intentions use the curated USDT asset for the selected chain; no arbitrary symbol-based matching. BSC uses the explicitly labeled Binance-Peg asset identified in the [provider guide](providers.md). Custom tokens and native-coin payments are deferred. Preserve older custom-asset records and their original identity.

Allow description/default updates. Do not change the receiving identity of a referenced wallet. Archive referenced wallets instead of deleting payment history; archived wallets cannot receive new intentions. Existing intentions remain monitorable until terminal.

## Payment creation and lifecycle

Required: wallet, description, positive decimal-string amount, expiry duration. Optional: expected sender public address. Generate a stable payment reference and a separate unguessable billing token. Default expiry is 24 hours; accept positive whole hours. Amount precision cannot exceed the selected asset's decimals. Resolve token automatically from the wallet chain.

| Current state | Trigger | Next state |
| --- | --- | --- |
| `IN_PROGRESS` | Eligible transfer found before final expiry processing | `SUCCESS` |
| `IN_PROGRESS` | Deadline reached with no accepted transfer | `EXPIRED` |
| `IN_PROGRESS` | Owner cancels | `CANCELED` |

`SUCCESS`, `EXPIRED`, and `CANCELED` are terminal. Cancellation is an authenticated owner action; canceling never reverses an on-chain transfer. Repeated cancellation of an already canceled intention is harmless; other terminal-state cancellation attempts conflict.

### Matching and ambiguity

- Match a single successful incoming transfer to the exact chain, destination, curated contract/mint, and full atomic amount. Optional expected sender must also match. Do not truncate, round, add partial transfers, or accept overpayments automatically.
- Eligible transfer time is `created_at <= transfer_time < expires_at`. Discovery after the deadline is permitted only while the record is still `IN_PROGRESS`, during reconciliation before expiry is committed. Once `EXPIRED`, even a later-discovered on-time transfer does not change status.
- Reject a new active intention if its chain, receiving address, asset, amount, and overlapping time window could match the same transfer as another active intention. An absent sender overlaps any sender; two distinct specified senders do not overlap. Use receiving identity rather than wallet row ID. Return a clear conflict asking the owner to change the amount, wallet, or sender.
- Persist chain-specific transfer identity (transaction plus event/instruction identity), with one transfer assigned to at most one intention. Commit assignment and conditional status transition atomically.
- This is reconciliation by observable transfer attributes, not proof of which person paid. An identical transfer after a previous request ended may satisfy a newer active request. Do not claim payer authentication.

### Polling and final expiry

Run a non-overlapping polling job every 15 minutes by default; settings accept a positive whole-minute interval. Poll active wallets once per cycle and reconcile eligible transfers before expiring due intentions. Expiry continues if a provider is disabled, unavailable, or out of quota; terminal expiry is the owner's chosen policy and can leave an actual payment unrecognized.

Use paginated bounded scans, durable checkpoints, overlapping replay, persistent deduplication, and throttling per credential. Advance checkpoints only after successfully processing a complete range. Distinguish an empty successful response from failure. Record last attempt, last successful scan, and sanitized failure information. No job may overlap itself or claim the same transfer concurrently.

Only use provider records that establish successful transfer execution. EVM adapters require successful receipts and 12 confirmations; Solana uses indexed transfer data plus successful transaction detail. Solscan multi-transfer responses without instruction identity fail safely. Live finality/confirmation evidence and provider indexing limitations must be validated per adapter before real use; do not advertise irreversible settlement guarantees. See [provider gates](providers.md).

## Billing and delivery

An owner can view/download a payment request for every intention. A separate billing page needs no login and is available at `/bill/:token` when the installation is publicly reachable. Possession of this high-entropy token grants access to that request only; never expose account settings, other requests, recipient email, or owner credentials. Public creation, editing, cancellation, and email sending are forbidden.

Billing contains payment reference, description, exact amount, asset label and contract/mint, chain/network, full receiving address, creation/deadline timestamps in UTC, current status, payment QR, and payment instructions. Display sender restriction when present. Show matched transaction information on success. Make clear that the payer needs the chain's native coin for fees and must send the exact asset/amount on the specified network.

Use a wallet payment payload, not a URL to the billing page, for the primary QR. EVM payload: `ethereum:<token-contract>@<chain-id>/transfer?address=<recipient>&uint256=<atomic-amount>` using [ERC-681](https://eips.ethereum.org/EIPS/eip-681). Solana payload follows the [Solana Pay transfer specification](https://docs.solanapay.com/spec): `solana:<recipient>?amount=<decimal-amount>&spl-token=<mint>`. Percent-encode optional text. Do not require memos or reference accounts for matching. Validate wallet interoperability before claiming compatibility; always provide readable/copyable address, network, and amount.

PDF includes the same payment details and QR, generated timestamp, and status as of generation; it is a static snapshot, not a live receipt. Terminal pages/PDFs visibly state their status and suppress the active pay prompt/QR to avoid soliciting further payment. References remain visible.

With no public base URL, PDF and payment QR still work; no shareable HTTP link is promised. If configured, public base URL is an explicit operator setting, not derived from an untrusted request host.

SMTP is optional. Owner enters a recipient email and explicitly sends the PDF; include a public link only when configured. No automatic reminders or bulk sending in v1. Show delivery acceptance/failure accurately; SMTP acceptance does not prove inbox delivery. Delivery failures do not change payment status. Mask secrets and keep recipient addresses private.

## Dashboard and history

Use UTC for persisted timestamps, calendar boundaries, labels, and date filters. No fiat conversion.

| Item | Definition |
| --- | --- |
| Payments today | Count and USDT amount of successes with on-chain paid time in the current UTC day |
| Month payments | Count and USDT amount of successes with on-chain paid time in the current UTC month |
| Status graph | Current UTC month; one daily bucket by intention creation date, with counts by current `SUCCESS`, `IN_PROGRESS`, `CANCELED`, `EXPIRED` status; zero-fill empty days |
| Last 10 payments | Successful intentions ordered by paid time descending, then ID |
| Next 10 to expire | `IN_PROGRESS` intentions ordered by expiry ascending, then ID; remaining time never displayed below zero |

Graph is a current-status view of a creation cohort, not a historical state-transition chart. Aggregate curated USDT amounts across the three chains as nominal token units; retain chain/asset identity on details. Do not mix legacy custom assets into USDT totals; label them separately.

History includes all intentions, newest first, date range on creation time, all four status filters, pagination, detail/public-page actions, PDF download, and SMTP action when configured. Date inputs include both selected days using an inclusive start/exclusive next-day UTC end. Public-link actions require public base URL; authenticated detail/PDF remain available locally.

## Settings and retained integration

Settings cover optional SMTP host/port/security/auth/from address, encrypted secrets, explicit public base URL, explorer credentials, independent chain enable switches, provider enable switches, and polling interval. No changes expose secrets in API responses. Etherscan and BSC can share an Etherscan V2 credential while retaining separate chain switches.

A chain can create new intentions only when enabled with required provider configuration. Disabling monitoring preserves existing intentions and history, shows a monitoring warning, and does not pause expiry. Saving valid interval changes reschedules future runs without overlapping an active run.

Keep owner-created API tokens with raw tokens shown once and hashed at rest. Integration endpoints remain authenticated even when billing is public. Retain rate-limit settings with database-backed shared enforcement (default 100 requests per 15 minutes, enabled). New integration-created payments obey the same creation, amount, ambiguity, and asset rules as the UI.
