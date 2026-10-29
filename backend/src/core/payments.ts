import crypto from "crypto";
import { Knex } from "knex";
import db from "../db/knex";
import {
  assets,
  atomic,
  decimal,
  fail,
  normalized,
  paymentInput,
  Snapshot,
  validAddress,
  statuses,
  uuid,
} from "./domain";
import { available, settings } from "./settings";
import { z } from "zod";
export const ownerWhere = (owner: string) => ({ user_id: owner });
export async function createPayment(
  owner: string,
  body: unknown,
): Promise<any> {
  const input = paymentInput.parse(body);
  return db.transaction(async (trx) => {
    // Serializes creation with other creators and settings writers, including API clients.
    await trx("installation").where({ id: 1 }).forUpdate().first();
    const w = await trx("wallets")
      .where({ id: input.wallet_id, user_id: owner })
      .whereNull("archived_at")
      .first();
    if (!w) fail(404, "NOT_FOUND", "Choose an active receiving wallet.");
    const s = await settings(false, trx);
    if (!available(s, w.chain))
      fail(
        409,
        "CHAIN_UNAVAILABLE",
        "Enable this blockchain and configure its explorer key in Settings first.",
      );
    const asset = assets[w.chain as keyof typeof assets];
    if (
      input.expected_from_address &&
      !validAddress(w.chain, input.expected_from_address)
    )
      fail(
        400,
        "VALIDATION_ERROR",
        "Expected sender is not a valid address for this network.",
      );
    const raw = atomic(input.value, asset.decimals);
    const snapshot: Snapshot = {
      chain: w.chain,
      address: w.address,
      asset_address: asset.address,
      decimals: asset.decimals,
      asset_label: asset.label,
      amount: decimal(raw, asset.decimals),
      atomic_amount: raw,
    };
    const now = new Date();
    const end = new Date(now.getTime() + input.expiration_hours * 3600000);
    const active = await trx("payment_intentions")
      .where({ user_id: owner, status: "IN_PROGRESS" })
      .where("expires_at", ">", now);
    for (const p of active) {
      const old = p.snapshot as Snapshot;
      if (
        old.chain === w.chain &&
        normalized(w.chain, old.address) === normalized(w.chain, w.address) &&
        normalized(w.chain, old.asset_address) ===
          normalized(w.chain, asset.address) &&
        old.atomic_amount === raw &&
        (!p.expected_from_address ||
          !input.expected_from_address ||
          normalized(w.chain, p.expected_from_address) ===
            normalized(w.chain, input.expected_from_address))
      )
        fail(
          409,
          "AMBIGUOUS_PAYMENT",
          "An active request could match the same transfer. Change the amount, wallet, or expected sender.",
        );
    }
    const token = await trx("tokens")
      .where({ chain: w.chain, contract_address: asset.address })
      .first();
    const [p] = await trx("payment_intentions")
      .insert({
        user_id: owner,
        wallet_id: w.id,
        description: input.description,
        value: snapshot.amount,
        token_source: "system",
        token_id: token.id,
        expiration_hours: input.expiration_hours,
        expected_from_address: input.expected_from_address || null,
        created_at: now,
        expires_at: end,
        status: "IN_PROGRESS",
        snapshot,
        reference: "CP-" + crypto.randomBytes(6).toString("hex").toUpperCase(),
        share_token: crypto.randomBytes(32).toString("hex"),
      })
      .returning("*");
    return decorate(p, s);
  });
}
export function decorate(p: any, s: any): any {
  return {
    ...p,
    value: p.snapshot.amount,
    wallet_address: p.snapshot.address,
    wallet_chain: p.snapshot.chain,
    token_symbol: p.snapshot.asset_label,
    public_url: s.public_base_url
      ? `${s.public_base_url}/bill/${p.share_token}`
      : null,
    smtp_enabled: !!s.smtp_enabled,
  };
}
export async function getPayment(owner: string, id: string): Promise<any> {
  uuid.parse(id);
  const p = await db("payment_intentions")
    .where({ id, user_id: owner })
    .first();
  if (!p) fail(404, "NOT_FOUND", "Payment request not found.");
  return decorate(p, await settings());
}
export function dateBound(value: string, end: boolean): Date {
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(value);
  const date = new Date(day + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    fail(400, "VALIDATION_ERROR", "Invalid UTC calendar date.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
export async function listPayments(owner: string, q: any): Promise<any> {
  const f = z
    .object({
      status: z.enum(statuses).optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(q);
  let query = db("payment_intentions").where({ user_id: owner });
  if (f.status) query = query.where({ status: f.status });
  if (f.date_from)
    query = query.where("created_at", ">=", dateBound(f.date_from, false));
  if (f.date_to)
    query = query.where("created_at", "<", dateBound(f.date_to, true));
  const count = await query.clone().count("* as total").first();
  const rows = await query
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .limit(f.page_size)
    .offset((f.page - 1) * f.page_size);
  const s = await settings();
  return {
    items: rows.map((p) => decorate(p, s)),
    total: Number(count?.total || 0),
    page: f.page,
    page_size: f.page_size,
  };
}
export async function cancel(owner: string, id: string): Promise<any> {
  uuid.parse(id);
  await db.transaction(async (trx) => {
    const p = await trx("payment_intentions")
      .where({ id, user_id: owner })
      .forUpdate()
      .first();
    if (!p) fail(404, "NOT_FOUND", "Payment request not found.");
    if (p.status === "CANCELED") return;
    if (p.status !== "IN_PROGRESS")
      fail(
        409,
        "PAYMENT_NOT_IN_PROGRESS",
        "Only in-progress requests can be canceled.",
      );
    await trx("payment_intentions").where({ id }).update({
      status: "CANCELED",
      canceled_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  });
  return getPayment(owner, id);
}
export async function publicPayment(token: string): Promise<any> {
  if (!/^[a-f0-9]{64}$/.test(token))
    fail(404, "NOT_FOUND", "Billing request not found.");
  const p = await db("payment_intentions")
    .where({ share_token: token })
    .first();
  if (!p) fail(404, "NOT_FOUND", "Billing request not found.");
  return {
    reference: p.reference,
    description: p.description,
    snapshot: p.snapshot,
    value: p.snapshot.amount,
    status: p.status,
    created_at: p.created_at,
    expires_at: p.expires_at,
    paid_at: p.paid_at,
    detected_at: p.detected_at,
    expected_from_address: p.expected_from_address,
    concluded_tx_hash: p.concluded_tx_hash,
  };
}
