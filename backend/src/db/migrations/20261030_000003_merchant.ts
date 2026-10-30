import { Knex } from "knex";
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("payment_intentions", (t) => {
    t.string("external_order_id", 255);
    t.jsonb("callback_urls").notNullable().defaultTo("[]");
    t.string("requested_amount", 40);
    t.string("amount_mode", 10).notNullable().defaultTo("exact");
    t.boolean("billing_published").notNullable().defaultTo(false);
    t.jsonb("review");
  });
  await db.raw(
    "UPDATE payment_intentions SET billing_published = true, requested_amount = snapshot->>'amount'",
  );
  await db.schema.createTable("idempotency_keys", (t) => {
    t.uuid("owner_id").references("users.id").onDelete("CASCADE");
    t.string("key", 255);
    t.primary(["owner_id", "key"]);
    t.string("fingerprint", 64).notNullable();
    t.uuid("payment_id").references("payment_intentions.id");
    t.jsonb("response").notNullable();
    t.integer("http_status").notNullable().defaultTo(201);
    t.timestamp("expires_at", { useTz: true }).notNullable().index();
  });
  await db.schema.createTable("payment_events", (t) => {
    t.uuid("id").primary();
    t.uuid("owner_id").references("users.id");
    t.uuid("payment_id").references("payment_intentions.id");
    t.string("type").notNullable();
    t.jsonb("payload").notNullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable("webhook_deliveries", (t) => {
    t.uuid("id").primary();
    t.uuid("event_id").references("payment_events.id");
    t.text("url").notNullable();
    t.string("status").notNullable().defaultTo("PENDING");
    t.integer("attempts").notNullable().defaultTo(0);
    t.timestamp("next_attempt_at", { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now())
      .index();
    t.timestamp("lease_until", { useTz: true });
    t.uuid("claim_token");
    t.text("error");
    t.integer("http_status");
    t.timestamp("delivered_at", { useTz: true });
    t.unique(["event_id", "url"]);
  });
  await db.schema.createTable("notifications", (t) => {
    t.uuid("id").primary();
    t.uuid("event_id").unique().references("payment_events.id");
    t.uuid("owner_id").references("users.id");
    t.uuid("payment_id").references("payment_intentions.id");
    t.text("message").notNullable();
    t.timestamp("read_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable("cloudflare_state", (t) => {
    t.integer("id").primary();
    t.uuid("installation_id").notNullable();
    t.jsonb("state").notNullable().defaultTo("{}");
  });
  await db("cloudflare_state").insert({
    id: 1,
    installation_id: db.raw("uuid_generate_v4()"),
  });
}
export async function down(): Promise<void> {
  throw new Error(
    "Restore a pre-upgrade backup to roll back merchant history.",
  );
}
