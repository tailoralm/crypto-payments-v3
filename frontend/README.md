# CryptoPay Manager — Frontend

Angular application for CryptoPay Manager. Provides the UI for dashboard reports, payment intentions, wallet management, and user configs.

## Stack

- Angular (latest LTS)
- Standalone components
- Consumes the backend REST API (JWT-protected)

## Structure (planned)

```
frontend/
├── src/
│   └── app/
│       ├── dashboard/
│       ├── payments/
│       ├── wallets/
│       ├── configs/
│       ├── auth/
│       └── shared/
├── docs/
│   ├── project-overview.md
│   └── agent.md
├── Dockerfile
├── nginx.conf
└── package.json
```

## Getting Started

This app has not been scaffolded yet. See `docs/agent.md` for full development instructions and `docs/project-overview.md` for architecture and business rules.

## Local Development

```bash
npm install
npm start
```

## Docker

Built and served via Nginx as part of the root `docker-compose.yml`.
