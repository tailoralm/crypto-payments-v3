import { Knex } from "knex";
import crypto from "crypto";
import { assets, atomic, Chain, defaultSettings } from "../../core/domain";

export async function up(db: Knex): Promise<void> {
  const users = await db("users");
  if (users.length > 1)
    throw new Error(
      "Upgrade stopped: multiple users require explicit ownership mapping. Back up and resolve ownership before retrying.",
    );
  const custom = await db("payment_intentions")
    .where({ token_source: "custom", status: "PENDING" })
    .first();
  if (custom)
    throw new Error(
      "Upgrade stopped: resolve active custom-asset payments before upgrading. Existing history will be preserved.",
    );
  await db.schema.createTable("installation", (t) => {
    t.integer("id").primary();
    t.jsonb("settings").notNullable();
    t.timestamp("updated_at", { useTz: true }).defaultTo(db.fn.now());
  });
  const owner = users[0];
  await db("installation").insert({
    id: 1,
    settings: {
      ...defaultSettings,
      ...(owner
        ? {
            etherscan_key: owner.etherscan_api_key,
            solscan_key: owner.solscan_api_key,
          }
        : {}),
    },
  });
  await db.schema.alterTable("wallets", (t) => {
    t.timestamp("archived_at", { useTz: true });
    t.string("normalized_address", 255);
    t.text("scan_error");
    t.timestamp("scan_attempt_at", { useTz: true });
    t.timestamp("scan_success_at", { useTz: true });
    t.timestamp("scan_checkpoint", { useTz: true });
  });
  for (const w of await db("wallets"))
    await db("wallets")
      .where({ id: w.id })
      .update({
        normalized_address:
          w.chain === "solana" ? w.address : w.address.toLowerCase(),
      });
  // Duplicates are preserved for explicit operator review; application creation is serialized.
  await db.schema.alterTable("payment_intentions", (t) => {
    t.dropForeign("wallet_id");
    t.foreign("wallet_id").references("wallets.id").onDelete("RESTRICT");
    t.string("reference", 40).unique();
    t.string("share_token", 64).unique();
    t.jsonb("snapshot");
    t.timestamp("paid_at", { useTz: true });
    t.timestamp("detected_at", { useTz: true });
    t.timestamp("canceled_at", { useTz: true });
    t.timestamp("updated_at", { useTz: true }).defaultTo(db.fn.now());
  });
  await db.raw(
    "ALTER TABLE payment_intentions ALTER COLUMN value TYPE numeric(38,18)",
  );
  for (const p of await db("payment_intentions")) {
    const w = await db("wallets").where({ id: p.wallet_id }).first();
    const token = await db(
      p.token_source === "system" ? "tokens" : "custom_contracts",
    )
      .where({ id: p.token_id })
      .first();
    if (!w || !token)
      throw new Error(
        `Upgrade stopped: unresolved historical identity for payment ${p.id}`,
      );
    const amount = String(p.value)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
    await db("payment_intentions")
      .where({ id: p.id })
      .update({
        reference:
          "CP-" +
          p.id.slice(0, 8).toUpperCase() +
          "-" +
          crypto.randomBytes(3).toString("hex").toUpperCase(),
        share_token: crypto.randomBytes(32).toString("hex"),
        status:
          p.status === "PENDING"
            ? "IN_PROGRESS"
            : p.status === "CONCLUDED"
              ? "SUCCESS"
              : p.status,
        detected_at: p.concluded_at,
        snapshot: {
          chain: w.chain,
          address: w.address,
          asset_address: token.contract_address,
          decimals: token.decimals,
          asset_label: token.symbol,
          amount,
          atomic_amount: atomic(amount, token.decimals),
        },
      });
  }
  for (const [chain, asset] of Object.entries(assets)) {
    if (
      !(await db("tokens")
        .where({ chain, contract_address: asset.address })
        .first())
    )
      await db("tokens").insert({
        chain,
        symbol: "USDT",
        contract_address: asset.address,
        decimals: asset.decimals,
        is_system_default: true,
      });
  }
  await db.raw(
    "ALTER TABLE payment_intentions ADD CONSTRAINT payment_status_check CHECK (status IN ('IN_PROGRESS','SUCCESS','EXPIRED','CANCELED'))",
  );
  await db.schema.createTable("transfers", (t) => {
    t.uuid("id").primary().defaultTo(db.raw("uuid_generate_v4()"));
    t.string("chain").notNullable();
    t.string("tx", 255).notNullable();
    t.string("event", 255).notNullable();
    t.jsonb("data").notNullable();
    t.uuid("payment_id")
      .unique()
      .references("payment_intentions.id")
      .onDelete("RESTRICT");
    t.unique(["chain", "tx", "event"]);
    t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable("sessions", (t) => {
    t.uuid("id").primary();
    t.uuid("user_id").references("users.id").onDelete("CASCADE");
    t.string("refresh_hash", 64).unique().notNullable();
    t.timestamp("expires_at", { useTz: true }).notNullable();
  });
  await db.schema.createTable("mail_deliveries", (t) => {
    t.increments("id");
    t.uuid("payment_id")
      .references("payment_intentions.id")
      .onDelete("RESTRICT");
    t.string("recipient", 255);
    t.string("status");
    t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable("api_buckets", (t) => {
    t.string("key").primary();
    t.integer("count").notNullable();
    t.timestamp("reset_at", { useTz: true }).notNullable();
  });
}
export async function down(): Promise<void> {
  throw new Error(
    "This history-preserving upgrade requires restoring the pre-upgrade backup to roll back.",
  );
}
