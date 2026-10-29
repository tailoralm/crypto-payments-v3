# Frontend project context

The canonical product design is [Self-hosted product specification](../../docs/product-specification.md). The original duplicated SaaS overview has been superseded.

The Angular application already exists. Owner pages include dashboard, payments, wallets, and configuration; legacy register/custom-contract screens have been removed. Anonymous billing sits outside the owner guard and consumes only the restricted billing projection.

Read these sources in order:

1. [Current-state assessment](../../docs/current-state.md): existing screens and gaps.
2. [Product specification](../../docs/product-specification.md): flows, reporting definitions, settings, and billing.
3. [API surface](../../docs/api-surface.md): implemented endpoint contracts.
4. [Provider guide](../../docs/providers.md): network/asset labels and cost limitations.
5. [Backlog](../../docs/development-plan.md) and [acceptance checklist](../../docs/acceptance.md).

Target one-owner workflows, USDT-only new intentions, four canonical statuses, UTC reporting, exact amount strings, local PDF support, optional SMTP, and public billing only with a reachable configured URL. Do not promise universal wallet QR compatibility. These flows are implemented and exercised in Chromium; see the validation record.
