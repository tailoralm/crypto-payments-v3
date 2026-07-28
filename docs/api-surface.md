# API Surface — CryptoPay Manager

## Base URL

- Internal (JWT): `http://localhost:3000`
- Public (API Key): `http://localhost:3000/api/v1`

## Authentication Flows

### Internal API (JWT)
- Access token: JWT, 15-minute expiry, sent as `Authorization: Bearer <token>`
- Refresh token: httpOnly cookie, 7-day expiry, sent on `/auth/login` and `/auth/refresh`
- On 401: frontend calls `/auth/refresh` to rotate tokens, then retries original request

### Public API (API Key)
- Header: `X-API-Key: <token>`
- Token is a raw string shown once at creation; backend stores SHA-256 hash
- Rate limiting applied per-user based on configs (disabled by default)

---

## Internal Endpoints (JWT-protected)

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, returns access JWT + sets refresh cookie |
| POST | `/auth/refresh` | Refresh access token using httpOnly cookie |
| POST | `/auth/logout` | Clear refresh cookie |

### Wallets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/wallets` | List all wallets for user |
| POST | `/wallets` | Create wallet |
| PATCH | `/wallets/:id` | Update wallet |
| DELETE | `/wallets/:id` | Delete (409 if PENDING intentions exist) |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/payments` | List/filter payment intentions |
| POST | `/payments` | Create payment intention |
| GET | `/payments/:id` | Get single payment + status |

### Custom Contracts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/custom-contracts` | List custom contracts |
| POST | `/custom-contracts` | Create custom contract |
| DELETE | `/custom-contracts/:id` | Delete (409 if referenced by PENDING intention) |

### Configs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/configs` | Get user configs (API keys masked, rate-limit settings) |
| PATCH | `/configs` | Update API keys, rate-limit settings |

### API Tokens

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api-tokens` | List API tokens (masked) |
| POST | `/api-tokens` | Generate new API token (raw shown once) |
| DELETE | `/api-tokens/:id` | Revoke token |

### Reports

| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/dashboard` | Dashboard metrics |

---

## Public API Endpoints (API-Key protected)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/payments` | Create payment intention |
| GET | `/api/v1/payments` | List payment history |
| GET | `/api/v1/payments/:id` | Get payment status |

---

## Request/Response Shapes

### POST /auth/register

```json
// Request
{ "email": "user@example.com", "password": "securepass123" }

// Response 201
{ "id": "uuid", "email": "user@example.com", "created_at": "2026-07-28T00:00:00Z" }
```

### POST /auth/login

```json
// Request
{ "email": "user@example.com", "password": "securepass123" }

// Response 200 (Sets httpOnly refresh cookie)
{ "access_token": "jwt...", "expires_in": 900 }
```

### POST /wallets

```json
// Request
{
  "chain": "ethereum",
  "address": "0x...",
  "description": "Main USDT wallet",
  "is_default": true
}

// Response 201
{
  "id": "uuid",
  "chain": "ethereum",
  "address": "0x...",
  "description": "Main USDT wallet",
  "is_default": true,
  "created_at": "2026-07-28T00:00:00Z"
}
```

### POST /payments

```json
// Request
{
  "wallet_id": "uuid",
  "description": "Payment for invoice #123",
  "value": 8.78,
  "token_source": "system",
  "token_id": "uuid",
  "expiration_hours": 24,
  "expected_from_address": null
}

// Response 201
{
  "id": "uuid",
  "wallet_id": "uuid",
  "description": "Payment for invoice #123",
  "value": "8.780000",
  "token_source": "system",
  "token_id": "uuid",
  "expiration_hours": 24,
  "expires_at": "2026-07-29T00:00:00Z",
  "expected_from_address": null,
  "status": "PENDING",
  "created_at": "2026-07-28T00:00:00Z"
}
```

### GET /payments/:id

```json
// Response 200
{
  "id": "uuid",
  "wallet_id": "uuid",
  "wallet_address": "0x...",
  "wallet_chain": "ethereum",
  "description": "Payment for invoice #123",
  "value": "8.780000",
  "token_symbol": "USDT",
  "token_decimals": 6,
  "status": "CONCLUDED",
  "concluded_tx_hash": "0x...",
  "concluded_from_address": "0x...",
  "concluded_at": "2026-07-28T12:00:00Z",
  "expires_at": "2026-07-29T00:00:00Z",
  "created_at": "2026-07-28T00:00:00Z"
}
```

### GET /reports/dashboard

```json
// Response 200
{
  "total_received_month": "1500.500000",
  "pending_count": 3,
  "expired_month_count": 1,
  "conversion_rate": 0.85,
  "recent_activity": [
    {
      "type": "CONCLUDED",
      "description": "Payment for invoice #123",
      "value": "8.780000",
      "wallet_address": "0x...",
      "occurred_at": "2026-07-28T12:00:00Z"
    }
  ],
  "wallets_overview": [
    {
      "id": "uuid",
      "address": "0x...",
      "chain": "ethereum",
      "pending_count": 2,
      "pending_total": "15.000000"
    }
  ]
}
```

### Error Response Shape

```json
{
  "error": {
    "code": "WALLET_HAS_PENDING_INTENTIONS",
    "message": "Cannot delete wallet because it has pending payment intentions",
    "status": 409
  }
}
```

---

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input data |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 401 | `INVALID_API_KEY` | Missing or invalid API key |
| 403 | `FORBIDDEN` | Access denied |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `WALLET_HAS_PENDING_INTENTIONS` | Wallet deletion blocked |
| 409 | `CONTRACT_HAS_PENDING_INTENTIONS` | Custom contract deletion blocked |
| 429 | `RATE_LIMIT_EXCEEDED` | API rate limit hit |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
