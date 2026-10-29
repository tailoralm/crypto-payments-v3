# Backend implementation guidance

These instructions apply to future authorized development. A documentation-only task must not change source, migrations, dependencies, or deployment files.

Read [project context](project-overview.md), the [canonical specification](../../docs/product-specification.md), and [current-state audit](../../docs/current-state.md) before implementation. Follow the [prioritized backlog](../../docs/development-plan.md); do not scaffold a replacement for the existing backend.

## Required design rules

- Target one owner and installation-wide settings; preserve ownership protections and records. Never merge legacy accounts or drop custom-payment history automatically.
- New payments are curated USDT only. Select asset by chain; validate runtime inputs, positive exact amounts, and identifiers before querying. Use parameterized SQL.
- Use decimal strings/atomic integers, never JavaScript floating-point conversion or two-decimal truncation. Support asset-specific precision, including the BSC representation's 18 decimals.
- Apply exact recipient, asset, sender, and payment-time matching. Preserve case sensitivity on Solana. Reject overlapping ambiguous active requests transactionally.
- Persist transfer event identity and assignment with conditional lifecycle updates. Terminal statuses are final; reconcile before expiry when possible, but expiry proceeds during provider outages.
- Use explicit credentials, paginated bounded scans, replayable checkpoints, per-key quotas, sanitized error outcomes, and non-overlapping jobs. Failed scans must not advance successful coverage.
- Preserve history with snapshots/archival. Do not cascade wallet removal into payment loss. Distinguish chain paid time from local detection time.
- Billing-token endpoints return only public request data. Owner/integration endpoints remain authenticated. Only owners send email or cancel payments.
- Encrypt stored provider/SMTP secrets, return masked configuration state, and prohibit secret logging. A configured encryption key is required for recoverability.
- Introduce incremental migrations and coordinated API changes; use the [data model](../../docs/data-model.md) and [API contract](../../docs/api-surface.md), not the superseded SaaS overview.

Keep strict TypeScript, domain services separate from HTTP concerns, and matching testable independently of scheduling. Validate with meaningful [acceptance scenarios](../../docs/acceptance.md). Mark capabilities verified only after running and recording the relevant checks; do not reproduce unchecked completion claims.
