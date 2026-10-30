# Merchant integrations and public billing

This guide describes the workflow delivered for GitHub #1. New requests are **unpublished** by default; legacy published tokens survive the additive migration. Normal explorer matching remains exact and expiry remains final until an owner explicitly accepts verified recovery evidence.

## Create charges and poll stored status

Keep API keys on the store backend. Through the supplied web proxy, integration routes begin at `/api/api/v1/payments`; direct API-server routes begin at `/api/v1/payments`. Owner routes use the existing bearer session; integration routes require `X-API-Key`.

```http
POST /api/api/v1/payments
X-API-Key: cp_...
Idempotency-Key: store-order-123
Content-Type: application/json

{
  "wallet_id": "receiving-wallet-uuid",
  "description": "Order 123",
  "value": "25",
  "external_order_id": "order-123",
  "callback_urls": ["https://store.example.com/payments/callback"],
  "amount_mode": "unique",
  "publish_billing": true,
  "expiration_hours": 24
}
```

Creation returns 201 with the payment ID, external order reference, requested amount, actual payable `value`/`snapshot.amount`, publication state and `public_url` (null without publication and a configured origin). Optional `expected_from_address` restricts the normal match to that sender. Up to five distinct callback URLs are accepted. Configure their exact HTTPS origins in Settings first; subdomains require explicit entries. Port 443 is required. Paths and queries are allowed on endpoints, but credentials/fragments are rejected.

`Idempotency-Key` is optional and accepts 1–255 printable non-space ASCII characters. Keys are shared across the installation owner's API keys and owner creation surface. The normalized request and original response are stored transactionally for 30 days. Identical concurrent retries replay the original 201 response, even after payment status/publication changes. Different inputs return 409. Retry an ambiguous timeout with the same key and payload; use GET detail for current state. After retention expires, a reused key can create a new charge. Do not reuse order keys.

`amount_mode=exact` remains the default. Unique mode allocates the smallest unused positive increment of 0.000001–0.000999 USDT. Always show buyers the actual payable amount and the increment; never round it or substitute the requested amount. Network precision is retained, including 18-decimal BSC amounts. Reservations account for destination, asset, sender restrictions and overlapping deadlines, including canceled requests. Exhaustion returns 409; choose another wallet or wait for deadlines. Successful requests also retain their reservation until the original deadline.

GET list/detail read stored status without initiating explorer calls. The default shared budget is 100 requests per 15 minutes, covering all integration calls across keys. Responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds), and `RateLimit-Policy`; 429 includes `Retry-After`. Explorer scans run separately at the configured interval, initially 15 minutes. More frequent status polling does not accelerate detection.

Store polling example (run on the backend; share scheduling across outstanding orders):

```js
let delay = 30_000;
while (true) {
  try {
    const response = await fetch(`${origin}/api/api/v1/payments/${paymentId}`, {
      headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 429) {
      delay = Math.max(1, Number(response.headers.get('Retry-After')) || 60) * 1000;
    } else {
      if (!response.ok) throw new Error('Polling failed');
      const payment = await response.json();
      if (payment.status === 'SUCCESS') {
        await fulfillOrderOnce(orderId, payment.id); // Atomic unique fulfillment guard in store DB.
        break;
      }
      if (['EXPIRED', 'CANCELED'].includes(payment.status)) break;
      const remaining = Number(response.headers.get('RateLimit-Remaining'));
      const reset = Number(response.headers.get('RateLimit-Reset'));
      delay = Math.max(30_000, Math.ceil(reset / Math.max(1, remaining)) * 1000);
    }
  } catch {
    delay = Math.min(Math.max(delay * 2, 30_000), 300_000);
  }
  await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 1000));
}
```

Persist the payment-ID/order mapping. `fulfillOrderOnce` must atomically record fulfillment with a unique order constraint or durable fulfillment queue; use the same guard for polling and webhooks. Expired/canceled orders may later receive reviewed recovery; keep webhook handling active and apply the store's recovery policy. Browser redirects, PDFs and unsigned client reports never authorize fulfillment.

## Signed webhooks and delivery history

Generate the signing secret in Settings and copy it immediately to the store. It is encrypted at rest and cannot be revealed later. Rotation replaces it; queued retries use the current secret, so update verifiers before retrying deliveries after rotation.

Events are `payment.created`, `payment.success`, `payment.expired`, and `payment.canceled`. A version-1 JSON body contains `version`, `event_id`, `type`, `created_at`, and `payment`: `id`, `external_order_id`, `status`, `requested_amount`, `payable_amount`, `chain`, `asset`, creation/deadline/paid/detection timestamps, `transaction`, `review`, and verified `evidence`. Amounts are strings. Sharing tokens and installation credentials are excluded.

Headers: `X-CryptoPay-Event-Id`, `X-CryptoPay-Timestamp` (Unix seconds), and `X-CryptoPay-Signature: v1=<hex HMAC-SHA256>`. The signed bytes are the timestamp, a period, and the **raw request body**. Verify before parsing:

```js
import crypto from 'node:crypto';
function verify(rawBody, headers, secret) {
  const timestamp = headers['x-cryptopay-timestamp'];
  const supplied = headers['x-cryptopay-signature'];
  if (!/^\d+$/.test(timestamp || '') ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^v1=[a-f0-9]{64}$/.test(supplied || '')) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(timestamp + '.').update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(supplied.slice(3), 'hex'));
}
// In Express, mount express.raw({ type: 'application/json' }) BEFORE JSON middleware.
```

Return 2xx only after durably recording the event/fulfillment work. Deduplicate by event ID and fulfill each order once. Delivery is at least once and can arrive out of order; reconcile the latest stored payment state through the authenticated detail endpoint before changing an order based on stale lifecycle events. A reviewed SUCCESS identifies the review and prior status.

Each attempt has a 10-second timeout. Non-2xx, redirects, timeouts and connectivity failures retry after 1m, 5m, 30m, 2h, 12h and 24h, then become FAILED. Crashed claims are recoverable after a one-minute lease; duplicate sends remain possible. Every attempt rechecks current origins and DNS, rejects any non-public destination address, pins the connection to validated addresses, and follows no redirects. Removing an origin blocks queued delivery until the owner corrects Settings and explicitly retries.

Overview shows delivery history and pending/failed/blocked counts separately from monitoring failures and payment successes. Owner history uses `page`/`page_size` (default 25, maximum 100), with `total` and global status counts. Owner API: `GET /webhooks`, `POST /webhooks/:id/retry`; retry is available for pending/failed/blocked deliveries. No webhook failure rolls back recognized payment evidence.

SUCCESS events also create persistent unread owner alerts. `GET /notifications` returns unread count and recent items; `POST /notifications/:id/read` persists read state. Overview refreshes every 30 seconds while visible and on return. This provides in-app alerts, not browser push or automatic email notifications.

## Publication and PDF behavior

Owner and integration surfaces support `POST /payments/:id/publish` and `/revoke` (prepend `/api/v1` for integration). Repeated publish preserves the active token; revoke makes anonymous bill and PDF access return 404; republish rotates the token. Publishing a settled request displays its actual status without payment actions. Owner PDF access works without publication. Email includes a live link only when published with an effective origin.

The billing page and common PDF renderer display exact payable amount, requested amount/increment for unique mode, network/asset, destination, required sender, deadline and transaction evidence. QR/wallet actions exist only while payable. PDFs remain timestamped static snapshots, not payment proof.

## Cloudflare setup and operation

Cloudflare is optional and initially disabled. Manual `public_base_url` hosting remains supported. Use an owner-controlled Cloudflare-managed domain and an unused hostname. Scope an API token to the chosen account/zone with **Account Cloudflare Tunnel Edit**, **Zone DNS Edit**, and **Zone Read** for zone/account validation. See [official setup](https://developers.cloudflare.com/tunnel/get-started/).

Save the API token, account ID, zone ID and lowercase hostname in Settings, then Provision. Setup persists resource IDs and resumes after partial failures. It creates a remotely managed tunnel and a proxied CNAME; unrelated DNS is never overwritten. After DNS and the connector are ready, Check verifies this installation's public readiness challenge before activating the origin. Provisioning errors leave actionable status in Settings. Credential replacement is supported by saving the new token and provisioning again. Changing account/zone/hostname after creation requires removing the existing resources first.

The production backend bundles checksum-verified cloudflared 2026.10.7 for amd64/arm64. A non-root child process runs it using environment-provided connector credentials, restores connectivity after restart, and stops on disable/shutdown. There is no Docker socket. Allow required outbound Cloudflare connectivity, including port 7844. Native development needs `CLOUDFLARED_PATH`; optionally set `PUBLIC_GATEWAY_URL` to the dedicated gateway.

Only the separate internal Nginx port 8081 is tunneled. It serves billing HTML/assets, anonymous bill/PDF routes, a minimal readiness challenge and API-key-protected integration routes. Owner auth, Settings, wallets, reports, token management and recovery remain unavailable there. Compose publishes only the ordinary owner web port on localhost by default. Keep that port private when using the tunnel.

Disable stops connectivity but retains resource IDs; Reconnect restarts the connector. Remove explicitly deletes only owned DNS/tunnel resources and refuses changed ownership. Repeated cleanup resumes after missing/deleted resources. Manual hosting becomes effective again when Cloudflare is disabled. Transient outages preserve the verified hostname and never change payment state; inspect connector health and retry public readiness after recovery.

## Audited recovery

Payment recovery is owner-only. Choose a wallet and a past range of at most 30 days. Existing explorer success evidence and pagination limits apply. The scan stores verified unassigned transfers and presents recent candidate requests with timing, amount and sender discrepancies; it never accepts them automatically.

`POST /recovery/scan` takes `wallet_id`, `date_from`, and `date_to` as ISO timestamps. `GET /recovery/:wallet` returns up to 500 recent unassigned transfers and up to 500 recent matching candidate requests. `POST /recovery/accept` takes `payment_id`, `transfer_id`, and a required `reason` (up to 1000 characters). The API can explicitly select an older payment even when it is outside the recent candidate list.

Acceptance locks both records, checks owner/network/destination/asset, prevents evidence reuse and rejects already-successful requests. It records prior status, requested/payable/received amounts, reviewer, reason, review time and transfer evidence before emitting the ordinary durable SUCCESS event and owner alert. Underpayment, overpayment, late timing and sender mismatch require the owner's explicit judgment. Dashboard received totals use the verified received amount for reviewed transfers, including underpayments and overpayments. This does not send or refund funds.

## Upgrade, backup and acceptance

The merchant migration adds tables/columns and backfills legacy publication/requested amounts without changing existing share tokens, payment snapshots or transfer assignments. Back up PostgreSQL and the original `ENCRYPTION_KEY`, along with installation secrets. Losing that key prevents decryption of explorer, SMTP, Cloudflare and webhook credentials. Rollback requires the pre-upgrade backup.

Automated evidence uses disposable PostgreSQL, mocked explorer/Cloudflare responses, and isolated containers. Before production acceptance, separately record public HTTPS from another network, real Cloudflare provisioning/restart/cleanup, external SMTP/PDF delivery, intended wallet QR behavior and a controlled low-value transfer on each enabled chain. Never describe mocks as live chain or Cloudflare validation.
