# CryptoPay backend

Express/TypeScript + PostgreSQL/Knex. `src/app.ts` provides HTTP/authentication; `src/core/` contains domain validation, settings, payment services, provider adapters, polling, billing and reports. `src/server.ts` validates secrets, applies migrations and starts the server/worker.

Use Node.js 22 and configure database/installation secrets as described in [self-hosting](../docs/self-hosting.md).

```sh
npm ci
npm run build
npm test
npm run dev
```

`npm start` runs the compiled production server. Migrations run automatically; `npm run migrate` and `npm run seed` are available for development. Integration tests require a disposable database named `cryptopay_test`; they clear its application data. See [validation](../docs/acceptance.md).

Read the [specification](../docs/product-specification.md), [API](../docs/api-surface.md), [model](../docs/data-model.md), and [provider limits](../docs/providers.md) before changes. Live provider validation is separate from deterministic tests.
