import crypto from "node:crypto";
import { Knex } from "knex";
import db from "../db/knex";
import { settings } from "./settings";
import { sendPublic } from "./outbound";

export async function emitPayment(
  trx: Knex.Transaction,
  p: any,
  type: string,
  evidence?: unknown,
): Promise<void> {
  const id = crypto.randomUUID();
  const payload = {
    version: 1,
    event_id: id,
    type,
    created_at: new Date().toISOString(),
    payment: {
      id: p.id,
      external_order_id: p.external_order_id,
      status: p.status,
      requested_amount: p.requested_amount || p.snapshot.amount,
      payable_amount: p.snapshot.amount,
      chain: p.snapshot.chain,
      asset: p.snapshot.asset_address,
      created_at: p.created_at,
      expires_at: p.expires_at,
      paid_at: p.paid_at,
      detected_at: p.detected_at,
      transaction: p.concluded_tx_hash || null,
      review: p.review || null,
      evidence: evidence || null,
    },
  };
  await trx("payment_events").insert({
    id,
    owner_id: p.user_id,
    payment_id: p.id,
    type,
    payload,
  });
  if (p.callback_urls?.length)
    await trx("webhook_deliveries").insert(
      p.callback_urls.map((url: string) => ({
        id: crypto.randomUUID(),
        event_id: id,
        url,
      })),
    );
  if (type === "payment.success")
    await trx("notifications").insert({
      id: crypto.randomUUID(),
      event_id: id,
      owner_id: p.user_id,
      payment_id: p.id,
      message: `Payment ${p.reference} received${p.review ? " after owner review" : ""}.`,
    });
}
export async function transition(
  trx: Knex.Transaction,
  p: any,
  status: string,
  patch: any = {},
  evidence?: unknown,
): Promise<any> {
  const [next] = await trx("payment_intentions")
    .where({ id: p.id })
    .update({ ...patch, status, updated_at: trx.fn.now() })
    .returning("*");
  await emitPayment(trx, next, `payment.${status.toLowerCase()}`, evidence);
  return next;
}
export const retryDelays = [60, 300, 1800, 7200, 43200, 86400];
export function signature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}
export async function deliverOne(sender = sendPublic): Promise<boolean> {
  const job = await db.transaction(async (trx) => {
    const row = await trx("webhook_deliveries")
      .whereIn("status", ["PENDING", "SENDING"])
      .where("next_attempt_at", "<=", trx.fn.now())
      .where((q) =>
        q.whereNull("lease_until").orWhere("lease_until", "<=", trx.fn.now()),
      )
      .orderBy("next_attempt_at")
      .forUpdate()
      .skipLocked()
      .first();
    if (!row) return null;
    const token = crypto.randomUUID();
    await trx("webhook_deliveries")
      .where({ id: row.id })
      .update({
        status: "SENDING",
        claim_token: token,
        lease_until: new Date(Date.now() + 60000),
        attempts: row.attempts + 1,
      });
    return { ...row, claim_token: token, attempts: row.attempts + 1 };
  });
  if (!job) return false;
  let patch: any;
  try {
    const s = await settings(true);
    if (!s.webhook_secret)
      throw new Error("Configure a webhook signing secret in Settings.");
    const event = await db("payment_events")
      .where({ id: job.event_id })
      .first();
    const body = JSON.stringify(event.payload),
      timestamp = String(Math.floor(Date.now() / 1000));
    const status = await sender(
      job.url,
      body,
      {
        "X-CryptoPay-Timestamp": timestamp,
        "X-CryptoPay-Signature": `v1=${signature(s.webhook_secret, timestamp, body)}`,
        "X-CryptoPay-Event-Id": event.id,
      },
      s.allowed_callback_origins,
    );
    if (status < 200 || status >= 300)
      throw Object.assign(new Error("Callback did not acknowledge delivery."), {
        httpStatus: status,
      });
    patch = {
      status: "DELIVERED",
      delivered_at: new Date(),
      error: null,
      http_status: status,
    };
  } catch (e: any) {
    const blocked =
      e.code === "CALLBACK_BLOCKED" || e.code === "INVALID_CALLBACK";
    patch = {
      status: blocked
        ? "BLOCKED"
        : job.attempts > retryDelays.length
          ? "FAILED"
          : "PENDING",
      next_attempt_at: new Date(
        Date.now() + (retryDelays[job.attempts - 1] || 86400) * 1000,
      ),
      error: blocked
        ? "Callback origin is blocked. Update Settings and retry."
        : "Delivery failed. Check signing secret, public DNS, receiver availability and HTTP status.",
      http_status: e.httpStatus || null,
    };
  }
  await db("webhook_deliveries")
    .where({ id: job.id, claim_token: job.claim_token })
    .update({ ...patch, lease_until: null, claim_token: null });
  return true;
}
export function startDeliveryWorker(): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout;
  let active: Promise<void> = Promise.resolve();
  const tick = () => {
    active = (async () => {
      try {
        for (let i = 0; i < 20 && !stopped; i++)
          if (!(await deliverOne())) break;
      } catch {
        console.error("Webhook worker unavailable.");
      }
      if (!stopped) timer = setTimeout(tick, 1000);
    })();
  };
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
