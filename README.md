# CryptoPay Manager

Self-hosted, non-custodial crypto payment management for one owner. Register receiving wallets, create USDT payment requests, share a public bill or PDF, and monitor incoming transfers on Ethereum, Solana, and BNB Smart Chain.

Funds go directly to your wallet. CryptoPay never stores private keys, signs transactions, or moves funds.

<img width="2528" height="1413" alt="image" src="https://github.com/user-attachments/assets/018f6a6f-63d4-436d-b722-affee10b4c66" />


## Run locally with Docker

Requires Docker with Compose and Node.js to generate installation secrets:

```sh
node scripts/setup.mjs
docker compose up --build -d --wait
```

Open **http://localhost:8080**. Create the owner account using `SETUP_TOKEN` from the generated `.env`. Registration closes after the first owner. In Settings, configure your explorer credentials and enable the chains you want to monitor. Register a public receiving address, then create a payment request.

The generator refuses to overwrite `.env`. Keep it backed up securely, especially `ENCRYPTION_KEY`. The database and API are private to the Compose network; only the web port is published, on localhost by default.

## Included

- Exact-amount USDT requests, optional sender restriction, expiration, and cancellation.
- Persistent transfer assignment, concurrent-request ambiguity protection, archived wallets, and preserved history.
- Scheduled monitoring (15 minutes by default), manual scan, provider switches, and visible scan health.
- Token-scoped public billing, compatible-wallet payment QR, downloadable PDF, and optional SMTP delivery.
- UTC dashboard totals, daily status graph, latest successes, upcoming expiry, filters, and pagination.
- One-owner bootstrap, revocable sessions, encrypted provider/SMTP credentials, and authenticated integration API tokens.
- Angular 21 interface, Express/TypeScript API, PostgreSQL 16, and production Docker images.

## Merchant workflow

Create idempotent store charges, publish/revoke bills, receive signed durable webhooks, opt into unique payable amounts, and review payment recovery. Optional Cloudflare provisioning keeps owner administration private. See the [merchant operating guide](docs/merchant-workflow.md) for API examples, webhook verification, setup and upgrade behavior. New requests are unpublished unless explicitly requested.

## Provider boundaries

Bring your own Etherscan V2 and Solscan keys. Ethereum and BSC share the Etherscan multichain API. **Free access across all three chains is not guaranteed.** BSC's configured asset is explicitly labeled USDT / Binance-Peg BSC-USD.

Explorer integrations have deterministic tests but have not been validated with live credentials or real payments in this implementation session. EVM verification uses successful receipts and 12 confirmations. Solscan relies on indexed successful execution; multi-transfer responses without instruction identity stop safely with a monitoring error. See [provider details](docs/providers.md) before taking real payments.

Normal expiry is final: an outage, indexing delay, or disabled provider can leave a real transfer unrecognized after the request becomes EXPIRED. Owners can explicitly review verified unassigned transfers through audited recovery. Wallet QR compatibility depends on the payer's wallet.

## Documentation

| Document | Contents |
| --- | --- |
| [Current state](docs/current-state.md) | Implemented capabilities, evidence, and practical limits |
| [Product specification](docs/product-specification.md) | Payment and billing rules |
| [Self-hosting](docs/self-hosting.md) | Public/private deployment, backups, upgrades, and troubleshooting |
| [Providers](docs/providers.md) | Credentials, quotas, asset identities, and scan behavior |
| [API](docs/api-surface.md) | Routes, authentication, examples, and breaking changes |
| [Data model](docs/data-model.md) | Storage, migration safety, and transfer assignment |
| [Validation](docs/acceptance.md) | Reproducible test commands and evidence |
| [Backlog](docs/development-plan.md) | Completed work and remaining external validation |

## Development

Use Node.js 22. Backend: `npm ci`, `npm run build`, `npm test` inside `backend/`. Frontend: `npm ci`, `npm start` inside `frontend/`; the development proxy expects the backend at localhost:3000. See [self-hosting](docs/self-hosting.md) for native environment configuration and integration tests.

## License

[MIT](LICENSE), Copyright 2026 CryptoPay Manager contributors.
