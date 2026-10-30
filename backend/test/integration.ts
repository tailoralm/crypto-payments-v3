import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import type { Knex } from "knex";
import crypto from "crypto";
let db: Knex;
let app: Express;
let token: string;
let owner: string;
let wallet: any;
let settings: any;
let payments: any;
let reconcile: any;
let poll: any;
const email = "owner@example.com",
  password = "a-long-test-password-123";
const auth = () => ({ Authorization: "Bearer " + token });
const pay = (value = "10.123456", extra = {}) => ({
  publish_billing: true,
  wallet_id: wallet.id,
  description: "Integration invoice",
  value,
  expiration_hours: 24,
  ...extra,
});
before(async () => {
  if (process.env.DB_NAME !== "cryptopay_test")
    throw new Error(
      "Integration tests require a disposable DB_NAME=cryptopay_test database.",
    );
  process.env.JWT_SECRET = "integration_jwt_secret_".repeat(3);
  process.env.ENCRYPTION_KEY = "integration_encryption_".repeat(3);
  process.env.SETUP_TOKEN = "integration_setup_".repeat(3);
  db = (await import("../src/db/knex")).default;
  await db.migrate.latest();
  await db.raw(
    "TRUNCATE mail_deliveries, transfers, sessions, api_tokens, payment_intentions, wallets, custom_contracts, users, api_buckets CASCADE",
  );
  settings = await import("../src/core/settings");
  await settings.saveSettings({
    chains: { ethereum: true, bsc: true, solana: true },
    etherscan_key: "fake-test-key",
    solscan_key: "fake-sol-key",
    smtp_enabled: false,
    public_base_url: "",
  });
  app = (await import("../src/app")).createApp();
  payments = await import("../src/core/payments");
  ({ reconcile, poll } = await import("../src/core/poller"));
});
after(async () => {
  if (db) await db.destroy();
});
test("single-owner bootstrap requires installation token and closes after setup", async () => {
  assert.equal(
    (await request(app).get("/auth/setup")).body.setup_required,
    true,
  );
  await request(app)
    .post("/auth/register")
    .send({ email, password })
    .expect(403);
  const r = await request(app)
    .post("/auth/register")
    .set("X-Setup-Token", process.env.SETUP_TOKEN!)
    .send({ email, password })
    .expect(201);
  token = r.body.access_token;
  owner = (await db("users").first()).id;
  await request(app)
    .post("/auth/register")
    .set("X-Setup-Token", process.env.SETUP_TOKEN!)
    .send({ email: "other@example.com", password })
    .expect(409);
  await request(app).get("/payments").expect(401);
});
test("wallet registration, duplicate protection and exact request validation", async () => {
  wallet = (
    await request(app)
      .post("/wallets")
      .set(auth())
      .send({
        chain: "ethereum",
        address: "0x1111111111111111111111111111111111111111",
        description: "Main wallet",
        is_default: true,
      })
      .expect(201)
  ).body;
  await request(app)
    .post("/wallets")
    .set(auth())
    .send({
      chain: "ethereum",
      address: wallet.address,
      description: "Duplicate",
    })
    .expect(409);
  await request(app)
    .post("/payments")
    .set(auth())
    .send(pay(10 as any))
    .expect(400);
  await request(app).post("/payments").set(auth()).send(pay("0")).expect(400);
  await request(app)
    .post("/payments")
    .set(auth())
    .send(pay("10.1234567"))
    .expect(400);
  await request(app)
    .post("/payments")
    .set(auth())
    .send(pay("1", { expiration_hours: "1';DROP TABLE users;--" }))
    .expect(400);
});
test("creation persists snapshots, rejects concurrent ambiguity and allows distinct senders", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      request(app).post("/payments").set(auth()).send(pay()),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 11);
  const p = results.find((r) => r.status === 201)!.body;
  assert.equal(p.snapshot.atomic_amount, "10123456");
  assert.equal(p.public_url, null);
  const senders = [
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ];
  for (const sender of senders)
    await request(app)
      .post("/payments")
      .set(auth())
      .send(pay("12", { expected_from_address: sender }))
      .expect(201);
  await request(app).post("/payments").set(auth()).send(pay("12")).expect(409);
});
test("public billing projects one request, generates QR and a real PDF without owner fields", async () => {
  const p = await db("payment_intentions")
    .where({ value: "10.123456" })
    .first();
  const view = (
    await request(app)
      .get("/billing/" + p.share_token)
      .expect(200)
  ).body;
  assert(view.qr.startsWith("data:image/png;base64,"));
  assert(view.payment_uri.includes("uint256=10123456"));
  assert.equal(view.user_id, undefined);
  assert.equal(view.share_token, undefined);
  assert.equal(view.smtp_enabled, undefined);
  await request(app).get("/billing/not-a-token").expect(404);
  const r = await request(app)
    .get("/billing/" + p.share_token + "/pdf")
    .expect(200);
  assert.equal(r.headers["content-type"], "application/pdf");
  assert(r.body.subarray(0, 4).toString() === "%PDF");
  await request(app)
    .post("/payments/" + p.id + "/email")
    .set(auth())
    .send({ to: "client@example.com" })
    .expect(409);
});
test("reconciliation rejects historical and wrong amounts, consumes an event once across restarts", async () => {
  const p = await db("payment_intentions")
    .where({ value: "10.123456" })
    .first();
  const from = "0x4444444444444444444444444444444444444444";
  const tx = {
    chain: "ethereum",
    tx: "0xtransfer",
    event: "2",
    from,
    to: wallet.address,
    asset: p.snapshot.asset_address,
    amount: "10123456",
    timestamp: Math.ceil(new Date(p.created_at).getTime() / 1000) + 1,
    block: 20,
    evidence: "fixture receipt",
  };
  await reconcile(wallet, [
    { ...tx, tx: "underpayment", amount: "10123455" },
    { ...tx, tx: "historical", timestamp: 1 },
  ]);
  assert.equal(
    (await db("payment_intentions").where({ id: p.id }).first()).status,
    "IN_PROGRESS",
  );
  await reconcile(wallet, [tx]);
  assert.equal(
    (await db("payment_intentions").where({ id: p.id }).first()).status,
    "SUCCESS",
  );
  await reconcile(wallet, [tx]);
  assert.equal(
    (await db("transfers").where({ chain: "ethereum", tx: tx.tx, event: "2" }))
      .length,
    1,
  );
  const again = await payments.createPayment(owner, pay("10.123457"));
  await reconcile(wallet, [tx]);
  assert.equal(
    (await db("payment_intentions").where({ id: again.id }).first()).status,
    "IN_PROGRESS",
  );
});
test("cancel and expire are final; provider outages preserve scan checkpoint but still expire", async () => {
  const p = await payments.createPayment(owner, pay("25"));
  await request(app)
    .post("/payments/" + p.id + "/cancel")
    .set(auth())
    .send({})
    .expect(200);
  await request(app)
    .post("/payments/" + p.id + "/cancel")
    .set(auth())
    .send({})
    .expect(200);
  const expired = await payments.createPayment(owner, pay("26"));
  await db("payment_intentions")
    .where({ id: expired.id })
    .update({ expires_at: new Date(Date.now() - 1000) });
  await poll(async () => {
    throw new Error("Fixture provider outage");
  });
  const w = await db("wallets").where({ id: wallet.id }).first();
  assert.match(w.scan_error, /Fixture provider outage/);
  assert.equal(w.scan_checkpoint, null);
  assert.equal(
    (await db("payment_intentions").where({ id: expired.id }).first()).status,
    "EXPIRED",
  );
  await request(app)
    .post("/payments/" + expired.id + "/cancel")
    .set(auth())
    .send({})
    .expect(409);
  const view = (await request(app).get("/billing/" + expired.share_token)).body;
  assert.equal(view.qr, null);
});
test("date/status pagination, UTC dashboard and archival retain history", async () => {
  const list = (
    await request(app)
      .get("/payments?status=SUCCESS&page_size=1")
      .set(auth())
      .expect(200)
  ).body;
  assert.equal(list.items.length, 1);
  assert(list.total >= 1);
  await request(app)
    .get("/payments?date_from=2026-02-30")
    .set(auth())
    .expect(400);
  const report = (
    await request(app).get("/reports/dashboard").set(auth()).expect(200)
  ).body;
  assert.equal(report.today.count, 1);
  assert.equal(report.today.amount, "10.123456");
  assert(report.daily_status_counts.length >= 28);
  const count = Number(
    (await db("payment_intentions").count("* as n").first())!.n,
  );
  await request(app)
    .delete("/wallets/" + wallet.id)
    .set(auth())
    .expect(200);
  assert.equal(
    Number((await db("payment_intentions").count("* as n").first())!.n),
    count,
  );
  await request(app).post("/payments").set(auth()).send(pay("300")).expect(404);
});
test("settings mask and preserve secrets; API tokens enforce persistent limits", async () => {
  const s = (await request(app).get("/configs").set(auth()).expect(200)).body;
  assert.equal(s.etherscan_key, undefined);
  assert.equal(s.etherscan_key_configured, true);
  await request(app)
    .patch("/configs")
    .set(auth())
    .send({
      polling_minutes: 7,
      rate_limit_enabled: true,
      rate_limit_max_requests: 2,
    })
    .expect(200);
  assert.equal((await settings.settings(true)).etherscan_key, "fake-test-key");
  assert.deepEqual((await settings.settings()).chains, s.chains);
  const t = (
    await request(app)
      .post("/api-tokens")
      .set(auth())
      .send({ label: "Integration" })
      .expect(201)
  ).body;
  assert(t.token.startsWith("cp_"));
  for (let i = 0; i < 2; i++)
    await request(app)
      .get("/api/v1/payments")
      .set("X-API-Key", t.token)
      .expect(200);
  await request(app)
    .get("/api/v1/payments")
    .set("X-API-Key", t.token)
    .expect(429);
  await request(app)
    .delete("/api-tokens/" + t.id)
    .set(auth())
    .expect(200);
  await request(app)
    .get("/api/v1/payments")
    .set("X-API-Key", t.token)
    .expect(401);
});
test("refresh rotates stored sessions and logout revokes access tokens", async () => {
  const agent = request.agent(app);
  const login = await agent
    .post("/auth/login")
    .send({ email, password })
    .expect(200);
  const old = login.body.access_token;
  const refresh = await agent.post("/auth/refresh").send({}).expect(200);
  await request(app)
    .get("/configs")
    .set("Authorization", "Bearer " + old)
    .expect(401);
  await agent.post("/auth/logout").send({}).expect(200);
  await request(app)
    .get("/configs")
    .set("Authorization", "Bearer " + refresh.body.access_token)
    .expect(401);
});

test("BSC payment flows through polling, exact database storage, public status and reports", async () => {
  const w = (
    await request(app)
      .post("/wallets")
      .set(auth())
      .send({
        chain: "bsc",
        address: "0x5555555555555555555555555555555555555555",
        description: "BSC wallet",
      })
      .expect(201)
  ).body;
  const p = await payments.createPayment(owner, {
    wallet_id: w.id,
    publish_billing: true,
    description: "BSC precision payment",
    value: "1.000000000000000001",
  });
  const tx = {
    chain: "bsc",
    tx: "bsc-precision-transfer",
    event: "0",
    from: "0x6666666666666666666666666666666666666666",
    to: w.address,
    asset: p.snapshot.asset_address,
    amount: "1000000000000000001",
    timestamp: Math.ceil(new Date(p.created_at).getTime() / 1000) + 1,
    block: 100,
    evidence: "fixture successful receipt",
  };
  await poll(async (chain: string) => (chain === "bsc" ? [tx] : []));
  const saved = await db("payment_intentions").where({ id: p.id }).first();
  assert.equal(saved.status, "SUCCESS");
  assert.equal(saved.value, "1.000000000000000001");
  const view = (
    await request(app)
      .get("/billing/" + p.share_token)
      .expect(200)
  ).body;
  assert.equal(view.status, "SUCCESS");
  assert.equal(view.qr, null);
  const report = (
    await request(app).get("/reports/dashboard").set(auth()).expect(200)
  ).body;
  assert.equal(report.today.amount, "11.123456000000000001");
  assert.equal(report.today.count, 2);
  await assert.rejects(
    reconcile(w, [{ ...tx, amount: "1000000000000000002" }]),
    /changed immutable transfer evidence/,
  );
});

test("SMTP relay receives the PDF attachment and failures do not mutate payment status", async () => {
  const { SMTPServer } = await import("smtp-server");
  let message = "";
  const relay = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onRcptTo(address, _session, callback) {
      if (address.address === "reject@example.com")
        callback(new Error("Recipient rejected"));
      else callback();
    },
    onData(stream, _session, callback) {
      stream.on("data", (chunk) => (message += chunk.toString()));
      stream.on("end", () => callback());
    },
  });
  await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const port = (relay.server.address() as any).port;
  try {
    await settings.saveSettings({
      smtp_enabled: true,
      smtp_host: "127.0.0.1",
      smtp_port: port,
      smtp_security: "none",
      smtp_from: "billing@example.com",
    });
    const p = await db("payment_intentions").first();
    const { emailPayment } = await import("../src/core/billing");
    const result = await emailPayment(p, "customer@example.com");
    assert.equal(result.status, "ACCEPTED");
    await assert.rejects(
      emailPayment(p, "reject@example.com"),
      /SMTP did not accept/,
    );
    assert.match(message, /application\/pdf/);
    assert.match(message, /customer@example.com/);
    assert.equal(
      (await db("payment_intentions").where({ id: p.id }).first()).status,
      p.status,
    );
  } finally {
    await new Promise<void>((resolve) => relay.close(() => resolve()));
    await settings.saveSettings({ smtp_enabled: false });
  }
});
