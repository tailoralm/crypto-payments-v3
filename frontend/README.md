# CryptoPay frontend

Angular 21 standalone, lazy-loaded owner workspace and anonymous billing. Styling uses local CSS with no remote font dependency. HTTP/session behavior is centralized in `shared/api.service.ts`; access tokens remain in memory, with same-origin httpOnly refresh cookies.

Use Node.js 22:

```sh
npm ci
npm start
npm run build
```

Development `/api` requests proxy to localhost:3000. Production Nginx serves built assets and proxies `/api/` to the private backend. Critical-CSS inlining is disabled to avoid an inline stylesheet-loading handler blocked by the content-security policy. `.npmrc` works around npm 10 optional Angular test-peer resolution.

`npm run test:e2e` runs Chromium against E2E_BASE_URL (default localhost:18080); see [validation](../docs/acceptance.md) for the isolated stack/setup token. Tests cover owner setup/login, settings, wallet registration, creation, PDF, anonymous bill, cancellation, session refresh, responsive layouts and accessibility.

See [specification](../docs/product-specification.md), [API](../docs/api-surface.md), and [current status](../docs/current-state.md). Smartphone QR compatibility and external hosting require operator validation.
