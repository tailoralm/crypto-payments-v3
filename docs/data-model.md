# Data Model — CryptoPay Manager

## Entity Relationship

```
users (1) ──< wallets (N)
users (1) ──< custom_contracts (N)
users (1) ──< payment_intentions (N)
users (1) ──< api_tokens (N)
wallets (1) ──< payment_intentions (N)
tokens (system, no FK relation to users)
custom_contracts (polymorphic reference via payment_intentions.token_source + token_id)
tokens (polymorphic reference via payment_intentions.token_source + token_id)
```

---

## Table: `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default uuid_generate_v4() | |
| email | varchar(255) | UNIQUE, NOT NULL | |
| password_hash | varchar(255) | NOT NULL | bcrypt hash |
| etherscan_api_key | text | nullable | AES-256 encrypted at rest |
| solscan_api_key | text | nullable | AES-256 encrypted at rest |
| rate_limit_enabled | boolean | NOT NULL, default false | |
| rate_limit_max_requests | integer | nullable | |
| rate_limit_window_minutes | integer | nullable | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

---

## Table: `tokens` (system-defined, pre-seeded)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| chain | varchar(50) | NOT NULL | `ethereum` or `solana` |
| symbol | varchar(50) | NOT NULL | e.g. `USDT` |
| contract_address | varchar(255) | NOT NULL | Official contract per chain |
| decimals | integer | NOT NULL | e.g. 6 (USDT) or 18 (ETH) |
| is_system_default | boolean | NOT NULL, default true | |

### Seed Data

| Chain | Symbol | Contract Address | Decimals |
|-------|--------|-----------------|----------|
| ethereum | USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |
| solana | USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |

---

## Table: `wallets`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| user_id | uuid | FK -> users(id), NOT NULL | |
| chain | varchar(50) | NOT NULL | `ethereum` or `solana` |
| address | varchar(255) | NOT NULL | Validated per chain format |
| description | text | nullable | |
| is_default | boolean | NOT NULL, default false | Only one true per user |
| last_fetched_at | timestamptz | nullable | Updated after successful blockchain poll |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### Indexes
- `idx_wallets_user_id` on `user_id`
- `idx_wallets_user_default` on `(user_id)` where `is_default = true` (partial unique)

### Deletion Rule
Cannot delete if any `payment_intentions` with status `PENDING` reference this wallet. Return HTTP 409.

---

## Table: `custom_contracts`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| user_id | uuid | FK -> users(id), NOT NULL | |
| chain | varchar(50) | NOT NULL | `ethereum` or `solana` |
| contract_address | varchar(255) | NOT NULL | |
| symbol | varchar(50) | NOT NULL | User-provided label |
| decimals | integer | NOT NULL | Required for correct raw amount parsing |
| created_at | timestamptz | NOT NULL, default now() | |

### Indexes
- `idx_custom_contracts_user_id` on `user_id`

### Deletion Rule
Cannot delete if any `payment_intentions` with status `PENDING` reference this contract. Return HTTP 409.

---

## Table: `payment_intentions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| user_id | uuid | FK -> users(id), NOT NULL | |
| wallet_id | uuid | FK -> wallets(id), NOT NULL | |
| description | text | NOT NULL | |
| value | numeric(20,6) | NOT NULL | Stored as decimal, never float |
| token_source | varchar(20) | NOT NULL | `system` or `custom` |
| token_id | uuid | NOT NULL | FK to `tokens` or `custom_contracts` |
| expiration_hours | integer | NOT NULL, default 24 | |
| expires_at | timestamptz | NOT NULL | Computed: created_at + expiration_hours |
| expected_from_address | varchar(255) | nullable | Optional sender filter |
| status | varchar(20) | NOT NULL, default 'PENDING' | `PENDING`, `CONCLUDED`, `EXPIRED` |
| concluded_tx_hash | varchar(255) | nullable | Set once on match, immutable |
| concluded_from_address | varchar(255) | nullable | Set once on match, immutable |
| concluded_at | timestamptz | nullable | Set once on match, immutable |
| created_at | timestamptz | NOT NULL, default now() | |

### Indexes
- `idx_payment_intentions_user_id` on `user_id`
- `idx_payment_intentions_wallet_id` on `wallet_id`
- `idx_payment_intentions_status` on `status`
- `idx_payment_intentions_user_status` on `(user_id, status)`

### Status Transitions
```
PENDING ──(match found)──> CONCLUDED
PENDING ──(expired)──────> EXPIRED
```
No other transitions allowed. Concluded fields are immutable once set.

---

## Table: `api_tokens`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK | |
| user_id | uuid | FK -> users(id), NOT NULL | |
| token_hash | varchar(255) | NOT NULL | SHA-256 hash of raw token |
| label | varchar(255) | nullable | User-provided description |
| last_used_at | timestamptz | nullable | Updated on public API usage |
| created_at | timestamptz | NOT NULL, default now() | |

### Indexes
- `idx_api_tokens_user_id` on `user_id`
- `idx_api_tokens_hash` on `token_hash` (for fast lookup)

---

## Multi-Tenancy Rules

- Every data table (`wallets`, `payment_intentions`, `api_tokens`, `custom_contracts`) includes `user_id`
- Every query filters by the authenticated user's `user_id`
- No cross-user data access is ever permitted — including via the public API
- The public API resolves user from the API token and scopes all queries to that user
