# CryptoPay Manager — Backend

Node.js + Express + TypeScript API for CryptoPay Manager. Handles authentication, wallets, payment intentions, blockchain polling, and the public API.

## Stack

- Node.js + Express + TypeScript
- Knex.js (query builder + migrations)
- PostgreSQL
- JWT auth (access + refresh)
- node-cron (15-minute blockchain polling job)
- Etherscan API + Solscan API integrations

## Structure (planned)

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── wallets/
│   │   ├── payments/
│   │   ├── api-tokens/
│   │   ├── reports/
│   │   └── blockchain/
│   ├── jobs/
│   │   └── payment-poller.job.ts
│   ├── db/
│   │   ├── knexfile.ts
│   │   └── migrations/
│   ├── common/
│   │   ├── middlewares/
│   │   └── validators/
│   └── server.ts
├── docs/
│   ├── project-overview.md
│   └── agent.md
├── Dockerfile
└── package.json
```

## Getting Started

This app has not been scaffolded yet. See `docs/agent.md` for full development instructions and `docs/project-overview.md` for architecture, data model, and business rules.

## Local Development

```bash
npm install
npm run dev
```

## Docker

Runs as part of the root `docker-compose.yml`, alongside PostgreSQL.
