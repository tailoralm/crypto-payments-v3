# Frontend implementation guidance

These instructions apply to future authorized development. A documentation-only task must not change source, dependencies, or deployment files.

Read [project context](project-overview.md), [canonical specification](../../docs/product-specification.md), [current-state audit](../../docs/current-state.md), and [API surface](../../docs/api-surface.md). Extend the existing Angular application following the [backlog](../../docs/development-plan.md).

## Required design rules

- Target a single owner; replace legacy open registration with the agreed bootstrap flow when authorized. Keep owner routes guarded and `/bill/:token` outside that guard.
- Use typed contracts and centralized HTTP services. Never embed explorer/SMTP secrets or integration tokens in billing clients.
- New intentions use curated USDT selected by wallet chain. Carry exact values as strings; do not coerce through floating-point inputs or formatting. Clearly identify BSC's Binance-Peg asset.
- Use IN_PROGRESS/SUCCESS/EXPIRED/CANCELED consistently after coordinated migration. Cancellation is owner-only and terminal states remain final.
- Follow exact UTC dashboard/date-filter definitions. Keep nominal USDT totals separate from legacy custom assets; label chart cohort semantics.
- Provide readable full payment details and wallet payment QR on billing. Local PDF does not require public hosting. Only offer public-link actions when configured, and explain PDF snapshot status.
- Terminal billing must not solicit another payment. Do not imply QR support in every wallet; keep manual address/network/amount instructions available.
- SMTP delivery is optional and owner-triggered. Show accepted/failed sending state accurately without changing payment status or exposing recipient addresses publicly.
- Mask credentials, show chain/monitoring availability and final-expiry implications, and handle missing SMTP/provider configuration gracefully.
- Include accessible form labels, loading/empty/error states, clear conflicts, pagination, and stable ordering. Preserve existing historical record access.

Validate relevant [acceptance scenarios](../../docs/acceptance.md). Record actual checks; UI presence alone does not establish end-to-end payment correctness.
