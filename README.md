# CryptoPay Manager

An open-source, self-hostable crypto payment management SaaS. Monitor wallets across Ethereum and Solana, create payment intentions, and automatically validate incoming transfers via Etherscan and Solscan.

## Overview

CryptoPay Manager lets you (or your users, in multi-tenant mode) register crypto wallets, generate payment requests ("payment intentions"), and automatically detect when a matching on-chain transfer arrives — no manual reconciliation needed.

## Architecture

This is a monorepo with two independently deployable applications:

- `frontend/` — Angular application (UI, dashboard, payments, wallets, configs)
- `backend/` — Node.js + Express + TypeScript API (auth, business logic, blockchain polling job)

Both are containerized and orchestrated via the root `docker-compose.yml`, alongside a PostgreSQL database.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular |
| Backend | Node.js, Express, TypeScript |
| Query Builder | Knex.js |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens) |
| Blockchain APIs | Etherscan API, Solscan API |
| Scheduler | node-cron (15-minute polling job) |
| Containerization | Docker + Docker Compose |

## Getting Started

```bash
git clone https://github.com/tailoralm/crypto-payments-v3.git
cd crypto-payments-v3
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:4200
- Backend API: http://localhost:3000

## Project Status

This project is in the documentation and planning phase. See `frontend/docs/` and `backend/docs/` for full architecture, data model, and business rules. See `docs/agent.md` in each app folder for AI-agent development instructions.

## License

Open Source (MIT).
