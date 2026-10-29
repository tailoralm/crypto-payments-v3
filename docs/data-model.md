# Data model and upgrade behavior

PostgreSQL 16 with Knex migrations. The [initial schema](../backend/src/db/migrations/20260728_000001_initial_schema.ts) remains intact; the [self-hosted migration](../backend/src/db/migrations/20261028_000002_self_hosted.ts) evolves it transactionally. Startup applies pending migrations before accepting requests.

## Records

| Table | Purpose |
| --- | --- |
| `users` | Owner identity/password hash; legacy per-user config columns retained for preservation |
| `installation` | One row (ID 1), JSONB settings, encrypted provider/SMTP secrets and update timestamp |
| `wallets` | Owner, chain/address, normalized address, description/default, archival, scan attempt/success/checkpoint/error |
| `tokens` | Curated catalog; idempotent seed finds by chain/contract rather than relying on a missing conflict constraint |
| `custom_contracts` | Preserved legacy metadata; new custom creation is disabled |
| `payment_intentions` | Owner/wallet, reference, random sharing token, requested amount, immutable JSONB identity snapshot, lifecycle and matched evidence |
| `transfers` | Unique `(chain, tx, event)` evidence; unique nullable payment assignment |
| `sessions` | Owner FK, opaque refresh-token hash, session UUID and expiration; rotation/logout deletes the old session |
| `api_tokens` | SHA-256 integration-token hashes, labels, last use; raw secrets never persisted |
| `api_buckets` | Shared atomic counter/reset time for integration rate limits |
| `mail_deliveries` | Payment, private recipient, ACCEPTED/FAILED outcome and attempt timestamp |

## Exact values and attribution

Payment `value` uses `numeric(38,18)`; API values are plain decimal strings. The snapshot records chain, receiving address, contract/mint, label, decimals, display amount, and atomic amount string. Conversion uses BigInt, never floating point. Description, sender and expiry remain immutable payment columns because no update API permits changes.

Transfers store normalized evidence including chain timestamp, raw amount and provider execution evidence. Assignment and conditional status changes are transactional with row locking. EVM events use receipt log indices. Solana events use instruction indices when supplied; a single incoming transfer can use the transaction's single-event identity, while ambiguous multi-transfer responses are rejected. Conflicting identity representations and previously concluded legacy hashes are protected from reuse.

New requests are serialized through the installation row to reject overlapping matching criteria. Wallet registration uses the same guard to reject duplicate normalized chain/address identities. Historical duplicate wallets are preserved, not silently merged. Wallet description/default updates do not change receiving identity.

Wallet/payment foreign keys restrict deletion of referenced history. Archive flags prevent new requests while keeping existing ones monitorable. Transfers and mail records also restrict destructive payment deletion; no payment-deletion API exists.

## Lifecycle and timestamps

Status is database constrained to IN_PROGRESS, SUCCESS, EXPIRED, CANCELED. Matching uses on-chain time in `[created_at, expires_at)`; terminal states never reopen. `paid_at` is chain time, `detected_at` is local reconciliation time, `canceled_at` marks cancellation, and `updated_at` marks lifecycle change. Legacy `concluded_*` columns remain for compatibility/evidence.

Scan checkpoints mark completed bounded queries. The worker replays the complete active intention window to accommodate indexing lag and persists only successful scan coverage. It uses a PostgreSQL advisory lock plus a process guard; event assignment is also transactionally guarded.

## Upgrade safety

Before mutation, upgrades refuse more than one existing user or active custom-asset requests. Those cases need an explicit operator resolution/ownership mapping. Historical custom records remain readable and outside USDT totals.

Backfill snapshots from existing wallet/token identities. Missing identity or invalid values abort migration rather than inventing data. Map PENDING → IN_PROGRESS and CONCLUDED → SUCCESS, retaining IDs, amounts and transaction evidence. Preserve legacy conclusion time as detection time; leave unknown chain paid time null and disclose it in reports. Existing provider ciphertext is copied to installation settings with the same encryption key.

The migration is transactional and its down function refuses destructive reversal. Restore the pre-upgrade database plus original secrets/configuration to roll back. [Upgrade tests](../backend/test/upgrade.ts) exercise history preservation and rejection safeguards. Back up before upgrading; never rewrite the initial migration to simulate an upgrade.
