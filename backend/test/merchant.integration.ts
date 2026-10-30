import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import crypto from "node:crypto";
import nock from "nock";
import { mock } from "node:test";
import dns from "node:dns/promises";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Knex } from "knex";
let db: Knex,
  app: any,
  owner: string,
  wallet: any,
  auth: any,
  create: any,
  reconcile: any,
  deliver: any,
  recovery: any;
before(async () => {
  if (process.env.DB_NAME !== "cryptopay_test")
    throw new Error("Merchant tests require disposable cryptopay_test.");
  process.env.JWT_SECRET = "merchant-jwt-".repeat(5);
  process.env.ENCRYPTION_KEY = "merchant-key-".repeat(5);
  process.env.SETUP_TOKEN = "merchant-setup-".repeat(5);
  db = (await import("../src/db/knex")).default;
  await db.migrate.latest();
  await db.raw(
    "TRUNCATE users, wallets, payment_intentions, transfers, sessions, api_tokens, api_buckets, mail_deliveries, payment_events, webhook_deliveries, notifications, idempotency_keys CASCADE",
  );
  await (
    await import("../src/core/settings")
  ).saveSettings({
    chains: { ethereum: true, solana: true, bsc: true },
    etherscan_key: "fake",
    solscan_key: "fake",
    allowed_callback_origins: ["store.example.com"],
    public_base_url: "https://pay.example.com",
    rate_limit_enabled: false,
  });
  app = (await import("../src/app")).createApp();
  const r = await request(app)
    .post("/auth/register")
    .set("X-Setup-Token", process.env.SETUP_TOKEN)
    .send({
      email: "merchant@example.com",
      password: "long-merchant-password-123",
    })
    .expect(201);
  auth = { Authorization: "Bearer " + r.body.access_token };
  owner = (await db("users").first()).id;
  wallet = (
    await request(app)
      .post("/wallets")
      .set(auth)
      .send({
        chain: "ethereum",
        address: "0x1111111111111111111111111111111111111111",
        description: "Merchant",
      })
      .expect(201)
  ).body;
  create = (await import("../src/core/payments")).createPayment;
  reconcile = (await import("../src/core/poller")).reconcile;
  deliver = (await import("../src/core/events")).deliverOne;
  recovery = await import("../src/core/recovery");
});
after(async () => {
  if (db) await db.destroy();
});
const input = (value: string, extra = {}) => ({
  wallet_id: wallet.id,
  description: "Merchant order",
  value,
  ...extra,
});
const transfer = (p: any, extra = {}) => ({
  chain: p.snapshot.chain,
  tx: crypto.randomUUID(),
  event: "0",
  from: "0x2222222222222222222222222222222222222222",
  to: p.snapshot.address,
  asset: p.snapshot.asset_address,
  amount: p.snapshot.atomic_amount,
  timestamp: Math.ceil(+new Date(p.created_at) / 1000) + 1,
  block: 100,
  evidence: "verified fixture receipt",
  ...extra,
});

test("merchant workflow: concurrent idempotency, publication, signed callback, once-only fulfillment, alert and PDF", async () => {
  const payload = input("100", {
    external_order_id: "order-1",
    callback_urls: ["https://store.example.com/hooks"],
  });
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      request(app)
        .post("/payments")
        .set({ ...auth, "Idempotency-Key": "order-1" })
        .send(payload)
        .expect(201),
    ),
  );
  const p = responses[0].body;
  for (const r of responses) assert.deepEqual(r.body, p);
  await request(app)
    .post("/payments")
    .set({ ...auth, "Idempotency-Key": "order-1" })
    .send({ ...payload, value: "100.0000000" })
    .expect(400);
  assert.equal(p.billing_published, false);
  assert.equal(p.public_url, null);
  assert.equal(
    Number((await db("payment_intentions").count("* as n").first())!.n),
    1,
  );
  await request(app)
    .post("/payments")
    .set({ ...auth, "Idempotency-Key": "order-1" })
    .send({ ...payload, value: "101" })
    .expect(409);
  await request(app).get(`/billing/${p.share_token}`).expect(404);
  await request(app).get(`/payments/${p.id}/pdf`).set(auth).expect(200);
  const published = (
    await request(app)
      .post(`/payments/${p.id}/publish`)
      .set(auth)
      .send({})
      .expect(200)
  ).body;
  assert(published.public_url.startsWith("https://pay.example.com/bill/"));
  assert.equal(
    (await request(app).post(`/payments/${p.id}/publish`).set(auth).send({}))
      .body.share_token,
    published.share_token,
  );
  const bill = (
    await request(app).get(`/billing/${published.share_token}`).expect(200)
  ).body;
  assert.equal(bill.external_order_id, undefined);
  assert.equal(bill.callback_urls, undefined);
  assert.equal(bill.user_id, undefined);
  const secret = (
    await request(app)
      .post("/configs/webhook-secret")
      .set(auth)
      .send({})
      .expect(200)
  ).body.secret;
  const tx = transfer(p);
  await reconcile(wallet, [tx]);
  await reconcile(wallet, [tx]);
  const received = new Map<string, any>();
  let fulfillment = 0;
  const sender = async (_url: string, body: string, headers: any) => {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(headers["X-CryptoPay-Timestamp"] + "." + body)
      .digest("hex");
    assert.equal(headers["X-CryptoPay-Signature"], "v1=" + digest);
    const event = JSON.parse(body);
    assert.equal(event.payment.external_order_id, "order-1");
    assert(!body.includes("share_token"));
    // A store deduplicates events and independently guards order fulfillment.
    if (!received.has(event.event_id) && event.payment.status === "SUCCESS")
      fulfillment++;
    received.set(event.event_id, event);
    return 204;
  };
  await deliver(sender);
  await deliver(sender);
  assert.equal(fulfillment, 1);
  const success = await db("payment_events")
    .where({ payment_id: p.id, type: "payment.success" })
    .first();
  await sender("", JSON.stringify(success.payload), {
    "X-CryptoPay-Timestamp": "1",
    "X-CryptoPay-Signature":
      "v1=" +
      crypto
        .createHmac("sha256", secret)
        .update("1." + JSON.stringify(success.payload))
        .digest("hex"),
  });
  assert.equal(fulfillment, 1);
  const alerts = (
    await request(app).get("/notifications").set(auth).expect(200)
  ).body;
  assert.equal(alerts.unread, 1);
  await request(app)
    .post(`/notifications/${alerts.items[0].id}/read`)
    .set(auth)
    .send({})
    .expect(200);
  assert.equal(
    (await request(app).get("/notifications").set(auth)).body.unread,
    0,
  );
  const pdf = await request(app)
    .get(`/billing/${published.share_token}/pdf`)
    .expect(200);
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  await request(app)
    .post(`/payments/${p.id}/revoke`)
    .set(auth)
    .send({})
    .expect(200);
  await request(app).get(`/billing/${published.share_token}`).expect(404);
  const next = (
    await request(app)
      .post(`/payments/${p.id}/publish`)
      .set(auth)
      .send({})
      .expect(200)
  ).body;
  assert.notEqual(next.share_token, published.share_token);
  // Original creation response remains stable even after status/publication changes.
  assert.deepEqual(
    (
      await request(app)
        .post("/payments")
        .set({ ...auth, "Idempotency-Key": "order-1" })
        .send(payload)
    ).body,
    p,
  );
});
test("unique amounts serialize across creators, retain canceled reservations and support 18 decimals", async () => {
  const list = await Promise.all(
    Array.from({ length: 12 }, () =>
      create(owner, input("200", { amount_mode: "unique" })),
    ),
  );
  assert.equal(new Set(list.map((p) => p.value)).size, 12);
  assert.equal(list[0].requested_amount, "200");
  const first = list.find((p) => p.value === "200.000001");
  assert(first);
  await request(app)
    .post(`/payments/${first.id}/cancel`)
    .set(auth)
    .send({})
    .expect(200);
  await assert.rejects(create(owner, input("200.000001")), /reserves/);
  const next = await create(owner, input("200", { amount_mode: "unique" }));
  assert.equal(next.value, "200.000013");
  await db("payment_intentions")
    .where({ id: first.id })
    .update({ expires_at: new Date(Date.now() - 1000) });
  assert.equal(
    (await create(owner, input("200", { amount_mode: "unique" }))).value,
    "200.000001",
  );
  const w = (
    await request(app)
      .post("/wallets")
      .set(auth)
      .send({ chain: "bsc", address: wallet.address, description: "BSC" })
  ).body;
  const p = await create(owner, {
    ...input("1.000000000000000001", { amount_mode: "unique" }),
    wallet_id: w.id,
  });
  assert.equal(p.value, "1.000001000000000001");
  assert.equal(p.snapshot.atomic_amount, "1000001000000000001");
  await assert.rejects(
    create(owner, input("99999999999999.999999", { amount_mode: "unique" })),
    /supported amount/,
  );
});
test("unique amount exhaustion is explicit and never rounds exact amounts", async () => {
  const seed = await create(owner, input("500", { amount_mode: "unique" }));
  const saved = await db("payment_intentions").where({ id: seed.id }).first();
  const fixtures = [];
  for (let i = 2; i <= 999; i++) {
    const { id, ...row } = saved;
    const raw = (500000000n + BigInt(i)).toString();
    fixtures.push({
      ...row,
      reference: "EXHAUST-" + i,
      share_token: crypto.randomBytes(32).toString("hex"),
      callback_urls: "[]",
      value: "500." + String(i).padStart(6, "0"),
      snapshot: {
        ...row.snapshot,
        amount: "500." + String(i).padStart(6, "0"),
        atomic_amount: raw,
      },
    });
  }
  await db.batchInsert("payment_intentions", fixtures, 200);
  await assert.rejects(
    create(owner, input("500", { amount_mode: "unique" })),
    /No unique amount/,
  );
  const exact = await create(owner, input("500"));
  assert.equal(exact.value, "500");
  assert.equal(exact.requested_amount, "500");
});
test("outbox rollback, concurrent claiming, retry, stale lease recovery and removed origins", async () => {
  const { emitPayment } = await import("../src/core/events");
  const p = await create(
    owner,
    input("301", { callback_urls: ["https://store.example.com/hook"] }),
  );
  const count = Number((await db("payment_events").count("* as n").first())!.n);
  await assert.rejects(
    db.transaction(async (trx) => {
      await emitPayment(trx, p, "payment.created");
      throw new Error("rollback");
    }),
    /rollback/,
  );
  assert.equal(
    Number((await db("payment_events").count("* as n").first())!.n),
    count,
  );
  let calls = 0;
  await Promise.all([
    deliver(async () => {
      calls++;
      return 503;
    }),
    deliver(async () => {
      calls++;
      return 503;
    }),
  ]);
  assert.equal(calls, 1);
  let job = await db("webhook_deliveries").where({ status: "PENDING" }).first();
  assert.equal(job.attempts, 1);
  assert(job.next_attempt_at > Date.now());
  await db("webhook_deliveries")
    .where({ id: job.id })
    .update({
      status: "SENDING",
      lease_until: new Date(Date.now() - 1000),
      next_attempt_at: new Date(Date.now() - 1000),
    });
  await deliver(async () => 200);
  assert.equal(
    (await db("webhook_deliveries").where({ id: job.id }).first()).status,
    "DELIVERED",
  );
  const blocked = await create(
    owner,
    input("302", { callback_urls: ["https://store.example.com/hook"] }),
  );
  await (
    await import("../src/core/settings")
  ).saveSettings({ allowed_callback_origins: [] });
  await deliver();
  job = await db("webhook_deliveries")
    .join("payment_events", "event_id", "payment_events.id")
    .where({ "payment_events.payment_id": blocked.id })
    .select("webhook_deliveries.*")
    .first();
  assert.equal(job.status, "BLOCKED");
  await assert.rejects(
    create(
      owner,
      input("303", { callback_urls: ["https://store.example.com/hook"] }),
    ),
    /no longer allowed/,
  );
  await (
    await import("../src/core/settings")
  ).saveSettings({ allowed_callback_origins: ["store.example.com"] });
});
test("webhook HTTP failures exhaust the documented retry schedule without changing payment status", async () => {
  await db("webhook_deliveries")
    .whereIn("status", ["PENDING", "SENDING"])
    .update({ status: "FAILED", lease_until: null });
  const p = await create(
    owner,
    input("350", { callback_urls: ["https://store.example.com/hook"] }),
  );
  const event = await db("payment_events").where({ payment_id: p.id }).first();
  const delays = [60, 300, 1800, 7200, 43200, 86400];
  let stableId = "";
  for (let attempt = 0; attempt < 7; attempt++) {
    await deliver(async (_url: string, body: string) => {
      const id = JSON.parse(body).event_id;
      if (stableId) assert.equal(id, stableId);
      stableId = id;
      if (attempt === 2) throw new Error("Timeout");
      return attempt === 0 ? 301 : attempt === 1 ? 429 : 503;
    });
    const job = await db("webhook_deliveries")
      .where({ event_id: event.id })
      .first();
    assert.equal(job.attempts, attempt + 1);
    assert.equal(job.status, attempt === 6 ? "FAILED" : "PENDING");
    if (attempt < 6)
      assert(
        Math.abs(
          +new Date(job.next_attempt_at) - Date.now() - delays[attempt] * 1000,
        ) < 3000,
      );
    await db("webhook_deliveries")
      .where({ id: job.id })
      .update({ next_attempt_at: new Date(Date.now() - 1000) });
  }
  assert.equal(
    (await db("payment_intentions").where({ id: p.id }).first()).status,
    "IN_PROGRESS",
  );
});
test("recovery scans never fulfill; audited acceptance handles late and wrong amounts once", async () => {
  const p = await create(owner, input("400"));
  await request(app)
    .post(`/payments/${p.id}/cancel`)
    .set(auth)
    .send({})
    .expect(200);
  const tx = transfer(p, {
    amount: "399000000",
    timestamp: Math.floor(Date.now() / 1000) - 100,
  });
  const rows = await recovery.scanRecovery(
    owner,
    {
      wallet_id: wallet.id,
      date_from: new Date(Date.now() - 86400000).toISOString(),
      date_to: new Date().toISOString(),
    },
    async () => [tx],
  );
  const row = rows.find((r: any) => r.data.tx === tx.tx);
  assert(row);
  assert.equal(
    (await db("payment_intentions").where({ id: p.id }).first()).status,
    "CANCELED",
  );
  for (const change of [
    { chain: "bsc" },
    { asset: "0x3333333333333333333333333333333333333333" },
    { to: "0x4444444444444444444444444444444444444444" },
  ]) {
    const wrong = { ...tx, ...change, tx: crypto.randomUUID() };
    const [evidence] = await db("transfers")
      .insert({
        chain: wrong.chain,
        tx: wrong.tx,
        event: wrong.event,
        data: wrong,
      })
      .returning("*");
    await assert.rejects(
      recovery.acceptRecovery(owner, {
        payment_id: p.id,
        transfer_id: evidence.id,
        reason: "Must not accept wrong identity",
      }),
      /does not match/,
    );
    assert.equal(
      (await db("transfers").where({ id: evidence.id }).first()).payment_id,
      null,
    );
  }
  const outcomes = await Promise.allSettled([
    recovery.acceptRecovery(owner, {
      payment_id: p.id,
      transfer_id: row.id,
      reason: "Verified store order and customer evidence",
    }),
    recovery.acceptRecovery(owner, {
      payment_id: p.id,
      transfer_id: row.id,
      reason: "Duplicate review",
    }),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const saved = await db("payment_intentions").where({ id: p.id }).first();
  assert.equal(saved.status, "SUCCESS");
  assert.equal(saved.review.previous_status, "CANCELED");
  assert.equal(saved.review.evidence.amount, "399000000");
  assert.equal(saved.review.received_amount, "399");
  const report = (
    await request(app).get("/reports/dashboard").set(auth).expect(200)
  ).body;
  assert.equal(report.today.amount, "499");
  assert.equal(
    Number(
      (await db("notifications")
        .where({ payment_id: p.id })
        .count("* as n")
        .first())!.n,
    ),
    1,
  );
  await assert.rejects(
    recovery.scanRecovery(owner, {
      wallet_id: wallet.id,
      date_from: new Date(Date.now() - 31 * 86400000).toISOString(),
      date_to: new Date().toISOString(),
    }),
    /30 days/,
  );
});
test("integration keys share limits, expose backoff headers, reset atomically and cannot access administration", async () => {
  const keys = [];
  for (let i = 0; i < 2; i++)
    keys.push(
      (
        await request(app)
          .post("/api-tokens")
          .set(auth)
          .send({ label: "store" })
          .expect(201)
      ).body.token,
    );
  const body = input("600", { external_order_id: "across-keys" });
  const a = (
    await request(app)
      .post("/api/v1/payments")
      .set({ "X-API-Key": keys[0], "Idempotency-Key": "across-keys" })
      .send(body)
      .expect(201)
  ).body;
  const b = (
    await request(app)
      .post("/api/v1/payments")
      .set({ "X-API-Key": keys[1], "Idempotency-Key": "across-keys" })
      .send(body)
      .expect(201)
  ).body;
  assert.deepEqual(a, b);
  const ownerReplay = (
    await request(app)
      .post("/payments")
      .set({ ...auth, "Idempotency-Key": "across-keys" })
      .send(body)
      .expect(201)
  ).body;
  assert.deepEqual(a, ownerReplay);
  await (
    await import("../src/core/settings")
  ).saveSettings({
    rate_limit_enabled: true,
    rate_limit_max_requests: 2,
    rate_limit_window_minutes: 15,
  });
  await db("api_buckets").del();
  const responses = await Promise.all([
    request(app).get("/api/v1/payments").set("X-API-Key", keys[0]),
    request(app).get("/api/v1/payments").set("X-API-Key", keys[1]),
    request(app).get("/api/v1/payments").set("X-API-Key", keys[0]),
  ]);
  assert.equal(responses.filter((r) => r.status === 200).length, 2);
  const limited = responses.find((r) => r.status === 429)!;
  assert.equal(limited.headers["ratelimit-limit"], "2");
  assert(Number(limited.headers["retry-after"]) > 0);
  await db("api_buckets").update({ reset_at: new Date(Date.now() - 1000) });
  await request(app)
    .get("/api/v1/payments")
    .set("X-API-Key", keys[0])
    .expect(200);
  await request(app).get("/configs").set("X-API-Key", keys[0]).expect(401);
});

test("Cloudflare provisioning resumes after DNS conflict, checks readiness, masks secrets and safely removes owned resources", async () => {
  const cf = await import("../src/core/cloudflare");
  const config = await import("../src/core/settings");
  const folder = await mkdtemp(path.join(os.tmpdir(), "cryptopay-connector-"));
  const binary = path.join(folder, "cloudflared");
  await writeFile(binary, "#!/bin/sh\nexec sleep 60\n", { mode: 0o700 });
  process.env.CLOUDFLARED_PATH = binary;
  const account = "a".repeat(32),
    zone = "b".repeat(32),
    tunnel = "c".repeat(32),
    hostname = "pay.example.com";
  await db("cloudflare_state").where({ id: 1 }).update({ state: {} });
  await config.saveSettings({
    cloudflare_api_token: "private-cloudflare-key",
    cloudflare_account_id: account,
    cloudflare_zone_id: zone,
    cloudflare_hostname: hostname,
  });
  const installation = (await db("cloudflare_state").where({ id: 1 }).first())
    .installation_id;
  const api = () => nock("https://api.cloudflare.com");
  const zoneResponse = {
    success: true,
    result: { name: "example.com", account: { id: account } },
  };
  api().get(`/client/v4/zones/${zone}`).reply(200, zoneResponse);
  api()
    .get(`/client/v4/accounts/${account}/cfd_tunnel`)
    .query(true)
    .reply(200, { success: true, result: [] });
  api()
    .post(`/client/v4/accounts/${account}/cfd_tunnel`, {
      name: `cryptopay-${installation}`,
      config_src: "cloudflare",
    })
    .reply(200, { success: true, result: { id: tunnel } });
  api()
    .get(`/client/v4/accounts/${account}/cfd_tunnel/${tunnel}/token`)
    .reply(200, { success: true, result: "connector-secret" });
  api()
    .put(`/client/v4/accounts/${account}/cfd_tunnel/${tunnel}/configurations`)
    .reply(200, { success: true, result: {} });
  api()
    .get(`/client/v4/zones/${zone}/dns_records`)
    .query(true)
    .reply(200, { success: true, result: [{ type: "A", content: "8.8.8.8" }] });
  await assert.rejects(cf.action("provision"), /unrelated DNS/);
  assert.equal(
    (await db("cloudflare_state").where({ id: 1 }).first()).state.tunnel_id,
    tunnel,
  );
  const lookup = mock.method(dns, "lookup", async () => [
    { address: "8.8.8.8", family: 4 },
  ]);
  let stop: undefined | (() => Promise<void>);
  try {
    api().get(`/client/v4/zones/${zone}`).reply(200, zoneResponse);
    api()
      .get(`/client/v4/accounts/${account}/cfd_tunnel/${tunnel}/token`)
      .reply(200, { success: true, result: "connector-secret" });
    api()
      .put(
        `/client/v4/accounts/${account}/cfd_tunnel/${tunnel}/configurations`,
        (body: any) =>
          body.config.ingress[0].service === "http://frontend:8081",
      )
      .reply(200, { success: true, result: {} });
    api()
      .get(`/client/v4/zones/${zone}/dns_records`)
      .query(true)
      .reply(200, { success: true, result: [] });
    api()
      .post(
        `/client/v4/zones/${zone}/dns_records`,
        (body: any) =>
          body.comment === `CryptoPay ${installation}` && body.proxied,
      )
      .reply(200, { success: true, result: { id: "dns-owned" } });
    const challenge = (await db("cloudflare_state").where({ id: 1 }).first())
      .state.challenge;
    nock(`https://${hostname}`)
      .get("/api/public-ready")
      .reply(200, { service: "cryptopay-public", challenge });
    const ready = await cf.action("provision");
    assert.equal(ready.phase, "READY");
    assert.equal(ready.connector_token, undefined);
    assert.equal(ready.challenge, undefined);
    assert.equal(
      (await config.settings()).billing_origin,
      "https://pay.example.com",
    );
    const stored = (await db("cloudflare_state").where({ id: 1 }).first())
      .state;
    assert.notEqual(stored.connector_token, "connector-secret");
    await cf.action("disable");
    assert.equal((await cf.status()).enabled, false);
    stop = cf.startTunnelSupervisor();
    await db("cloudflare_state")
      .where({ id: 1 })
      .update({ state: { ...stored, enabled: true } });
    await cf.action("reconnect");
    assert.equal((await cf.status()).connector, "CONNECTING");
    api()
      .get(`/client/v4/zones/${zone}/dns_records/dns-owned`)
      .reply(200, {
        success: true,
        result: { comment: "unrelated", content: `${tunnel}.cfargotunnel.com` },
      });
    await assert.rejects(cf.action("remove"), /ownership changed/);
    api()
      .get(`/client/v4/zones/${zone}/dns_records/dns-owned`)
      .reply(200, {
        success: true,
        result: {
          comment: `CryptoPay ${installation}`,
          content: `${tunnel}.cfargotunnel.com`,
        },
      });
    api()
      .delete(`/client/v4/zones/${zone}/dns_records/dns-owned`)
      .reply(200, { success: true, result: {} });
    api()
      .get(`/client/v4/accounts/${account}/cfd_tunnel/${tunnel}`)
      .reply(200, {
        success: true,
        result: { name: `cryptopay-${installation}` },
      });
    api()
      .delete(`/client/v4/accounts/${account}/cfd_tunnel/${tunnel}`)
      .reply(200, { success: true, result: {} });
    assert.equal((await cf.action("remove")).phase, "DISABLED");
    assert.equal((await config.settings()).cloudflare_api_token, undefined);
    assert(nock.isDone(), nock.pendingMocks().join(","));
  } finally {
    lookup.mock.restore();
    if (stop) await stop();
    await cf.action("disable");
    nock.cleanAll();
    delete process.env.CLOUDFLARED_PATH;
    await rm(folder, { recursive: true, force: true });
  }
});

test("disabling Cloudflare cancels an in-flight provisioning step without enabling an origin", async () => {
  const cf = await import("../src/core/cloudflare");
  await db("cloudflare_state").where({ id: 1 }).update({ state: {} });
  const account = "a".repeat(32),
    zone = "b".repeat(32);
  let started!: () => void, finish!: () => void;
  const requested = new Promise<void>((resolve) => (started = resolve));
  const release = new Promise<void>((resolve) => (finish = resolve));
  const api = nock("https://api.cloudflare.com")
    .get(`/client/v4/zones/${zone}`)
    .reply(200, async () => {
      started();
      await release;
      return {
        success: true,
        result: { name: "example.com", account: { id: account } },
      };
    });
  const operation = cf.action("provision");
  const rejected = assert.rejects(operation, /disabled/);
  await requested;
  await cf.action("disable");
  finish();
  await rejected;
  const state = await cf.status();
  assert.equal(state.enabled, false);
  assert.equal(state.phase, "DISABLED");
  assert.equal(state.verified_origin, undefined);
  assert(api.isDone());
});
