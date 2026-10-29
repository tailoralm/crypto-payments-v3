# Backend project context

The canonical product design is [Self-hosted product specification](../../docs/product-specification.md). The original multi-tenant SaaS overview has been superseded; do not rebuild from that legacy model.

The backend already exists: Express/TypeScript, Knex/PostgreSQL, JWT owner-facing routes, API-key integration routes, provider adapters, and a configurable non-overlapping polling worker. The original implementation has been replaced with exact matching, persistent transfer assignment, owner setup, billing and reporting; see current verification limits.

Read these sources in order:

1. [Current-state assessment](../../docs/current-state.md): evidence and defects.
2. [Product specification](../../docs/product-specification.md): intended behavior and decisions.
3. [Data model](../../docs/data-model.md) and [API surface](../../docs/api-surface.md): storage and public contracts.
4. [Provider guide](../../docs/providers.md): API access, asset identity, normalization gates.
5. [Backlog](../../docs/development-plan.md) and [acceptance checklist](../../docs/acceptance.md).

The target is one owner, curated USDT across three chains, exact atomic matching, final expiry, persistent transfer assignment, and installation-wide settings. Provider costs may apply. Billing-token access is separate from the retained authenticated integration API. The specification is implemented; live provider and external deployment validation remain operator tasks.
