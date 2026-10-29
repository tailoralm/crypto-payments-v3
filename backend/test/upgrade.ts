import { test } from "node:test";
import assert from "node:assert/strict";
import knex from "knex";
import { up as original } from "../src/db/migrations/20260728_000001_initial_schema";
import { up as upgrade } from "../src/db/migrations/20261028_000002_self_hosted";
import crypto from "crypto";

test("legacy upgrade preserves settled/custom history and rejects unmapped multi-user data transactionally", async () => {
  if (process.env.DB_NAME !== "cryptopay_test") return;
  const schema = "upgrade_" + crypto.randomBytes(5).toString("hex");
  const admin = knex({
    client: "pg",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || "cryptopay",
      password: process.env.DB_PASSWORD,
      database: "cryptopay_test",
    },
  });
  await admin.raw("CREATE SCHEMA ??", [schema]);
  const db = knex({
    client: "pg",
    connection: {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || "cryptopay",
      password: process.env.DB_PASSWORD,
      database: "cryptopay_test",
    },
    searchPath: [schema, "public"],
  });
  try {
    await db.transaction(original);
    const [owner] = await db("users")
      .insert({ email: "legacy@example.com", password_hash: "preserved" })
      .returning("*");
    const [other] = await db("users")
      .insert({ email: "other@example.com", password_hash: "preserved" })
      .returning("*");
    await assert.rejects(db.transaction(upgrade), /multiple users/);
    assert.equal(await db.schema.hasTable("installation"), false);
    await db("users").where({ id: other.id }).del();
    const [wallet] = await db("wallets")
      .insert({
        user_id: owner.id,
        chain: "ethereum",
        address: "0x1111111111111111111111111111111111111111",
      })
      .returning("*");
    const [contract] = await db("custom_contracts")
      .insert({
        user_id: owner.id,
        chain: "ethereum",
        contract_address: "0x2222222222222222222222222222222222222222",
        symbol: "LEGACY",
        decimals: 6,
      })
      .returning("*");
    const [p] = await db("payment_intentions")
      .insert({
        user_id: owner.id,
        wallet_id: wallet.id,
        description: "Legacy custom request",
        value: "100.123456",
        token_source: "custom",
        token_id: contract.id,
        expires_at: new Date(Date.now() + 3600000),
        status: "PENDING",
      })
      .returning("*");
    await assert.rejects(db.transaction(upgrade), /active custom-asset/);
    await db("payment_intentions").where({ id: p.id }).update({
      status: "CONCLUDED",
      concluded_tx_hash: "legacy-hash",
      concluded_at: new Date(),
    });
    await db.transaction(upgrade);
    const saved = await db("payment_intentions").where({ id: p.id }).first();
    assert.equal(saved.status, "SUCCESS");
    assert.equal(saved.snapshot.amount, "100.123456");
    assert.equal(saved.snapshot.asset_label, "LEGACY");
    assert.equal(saved.concluded_tx_hash, "legacy-hash");
    assert.equal(saved.paid_at, null);
    assert(saved.detected_at);
    assert.equal(saved.id, p.id);
    await assert.rejects(
      db("wallets").where({ id: wallet.id }).del(),
      /foreign key/,
    );
  } finally {
    await db.destroy();
    await admin.raw("DROP SCHEMA ?? CASCADE", [schema]);
    await admin.destroy();
  }
});
