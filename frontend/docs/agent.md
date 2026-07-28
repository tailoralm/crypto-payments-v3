# Agent Instructions — Frontend Development

You are an AI coding agent tasked with building the **frontend** of CryptoPay Manager. Read `docs/project-overview.md` first for full architecture, API surface, and page/form specifications — this file only contains execution instructions.

## Your Task

Scaffold and implement the Angular application described in `project-overview.md`, consuming the backend REST API. Build page by page, matching the exact forms, fields, and navigation described in sections 12 and 14 of the overview.

## Setup Instructions

1. Initialize an Angular project (latest LTS) inside `frontend/`, using standalone components.
2. Set up an environment configuration (`environment.ts` / `environment.prod.ts`) with `apiBaseUrl` pointing to the backend service.
3. Create the folder structure described in the frontend `README.md`: `dashboard/`, `payments/`, `wallets/`, `configs/`, `auth/`, `shared/`.
4. Set up an HTTP interceptor that attaches the JWT access token to all outgoing requests and handles token refresh on 401 responses.

## Development Order (follow this sequence)

1. **Auth module**: login page, JWT storage (in-memory + httpOnly refresh cookie handled by backend), route guards for authenticated routes, auto-refresh interceptor.
2. **Shared layout**: left navigation menu with exactly these items in this order — Dashboard, Payments, Wallets, Configs (section 14).
3. **Dashboard page**: consume `GET /reports/dashboard` and render the metrics from section 13 (total received this month, pending count, expired count, conversion rate, recent activity feed, wallets overview).
4. **Wallets page**: CRUD table, form matching section 14's Wallet Form (chain select, address, description, default toggle). Disable/hide the delete action (with an explanatory tooltip) when a wallet has PENDING payment intentions — the backend enforces this, but the UI should communicate it clearly rather than just showing a raw error.
5. **Payments page**: list/history view with filters (status, date range), and a "Create new payment intention" action leading to the creation form.
6. **Payment creation form**: implement exactly the fields in section 14's Payment Intention Form — description, wallet dropdown (default wallet pre-selected), token dropdown (system tokens + user's custom contracts), value, expiration hours (default 24), optional expected sender address.
7. **Payment detail page**: show status (PENDING/CONCLUDED/EXPIRED), and when CONCLUDED, show `concluded_tx_hash`, `concluded_from_address`, `concluded_at`.
8. **Configs page**: general settings, Etherscan/Solscan API key inputs (masked), rate-limit toggle + numeric fields (requests-per-window, window minutes), and API token management (generate, list, revoke — show the raw token only once immediately after generation).
9. **Custom contracts management**: expose a section (likely within Configs or a dedicated sub-page) to list/add/delete custom contracts, following the same delete-protection UX pattern as wallets.

## UI/UX Rules to Follow

- The Dashboard page has real reports now (section 13) — it is no longer a placeholder.
- Wallet and custom-contract deletion must gracefully surface the backend's 409 conflict as a clear, non-technical message to the user.
- The payment creation form must pre-select the user's default wallet if one exists.
- API tokens and Etherscan/Solscan keys are sensitive — mask them in the UI (e.g. show only last 4 characters) except at the moment of creation.
- All monetary values must be displayed with fixed decimal precision (matching the token's `decimals`), never as raw floating-point output.

## Code Style

- Standalone Angular components, one feature module per domain (dashboard, payments, wallets, configs, auth).
- Centralize all HTTP calls in dedicated services (e.g. `PaymentsService`, `WalletsService`) — components should not call `HttpClient` directly.
- Use typed interfaces/DTOs matching the backend's data model (section 5 of the overview) for all API responses.

## Suggested First Prompt for the Agent

> "Set up the Angular project in `frontend/` with standalone components, configure the environment files, and build the login page plus an auth interceptor and route guard, based on `docs/project-overview.md` sections 11 and 14."
