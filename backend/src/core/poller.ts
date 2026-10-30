import db from "../db/knex";
import { available, settings } from "./settings";
import { eligible, normalized, Transfer } from "./domain";
import { fetchTransfers } from "./providers";
import { transition } from "./events";
export type Fetcher = typeof fetchTransfers;
export async function reconcile(
  wallet: any,
  transfers: Transfer[],
): Promise<void> {
  await db.transaction(async (trx) => {
    const pending = await trx("payment_intentions")
      .where({ wallet_id: wallet.id, status: "IN_PROGRESS" })
      .orderBy("created_at")
      .forUpdate();
    for (const tx of transfers.sort(
      (a, b) => a.timestamp - b.timestamp || a.event.localeCompare(b.event),
    )) {
      const prior = await trx("payment_intentions")
        .where({ status: "SUCCESS", concluded_tx_hash: tx.tx })
        .whereRaw("snapshot->>'chain' = ?", [tx.chain])
        .first();
      if (
        prior &&
        !(await trx("transfers").where({ payment_id: prior.id }).first())
      )
        continue;
      const sameTransaction = await trx("transfers").where({
        chain: tx.chain,
        tx: tx.tx,
      });
      if (
        sameTransaction.some(
          (e) => (e.event === "single") !== (tx.event === "single"),
        )
      )
        throw new Error(
          "Explorer transfer identity changed; refusing possible replay.",
        );
      await trx("transfers")
        .insert({ chain: tx.chain, tx: tx.tx, event: tx.event, data: tx })
        .onConflict(["chain", "tx", "event"])
        .ignore();
      const event = await trx("transfers")
        .where({ chain: tx.chain, tx: tx.tx, event: tx.event })
        .forUpdate()
        .first();
      const stored = event.data as Transfer;
      if (
        stored.amount !== tx.amount ||
        stored.timestamp !== tx.timestamp ||
        stored.block !== tx.block ||
        normalized(tx.chain, stored.from) !== normalized(tx.chain, tx.from) ||
        normalized(tx.chain, stored.to) !== normalized(tx.chain, tx.to) ||
        normalized(tx.chain, stored.asset) !== normalized(tx.chain, tx.asset)
      ) {
        throw new Error(
          "Explorer changed immutable transfer evidence; automatic attribution stopped safely.",
        );
      }
      if (event.payment_id) continue;
      const p = pending.find((p) => eligible(p, tx));
      if (!p) continue;
      await trx("transfers")
        .where({ id: event.id })
        .update({ payment_id: p.id });
      await transition(
        trx,
        p,
        "SUCCESS",
        {
          paid_at: new Date(tx.timestamp * 1000),
          detected_at: trx.fn.now(),
          concluded_at: trx.fn.now(),
          concluded_tx_hash: tx.tx,
          concluded_from_address: tx.from,
          updated_at: trx.fn.now(),
        },
        tx,
      );
      p.status = "SUCCESS";
    }
  });
}
let running = false;
export async function poll(
  fetcher: Fetcher = fetchTransfers,
): Promise<boolean> {
  if (running) return false;
  running = true;
  let lock: any;
  let acquired = false;
  try {
    lock = await db.client.acquireConnection();
    acquired = (
      await lock.query("SELECT pg_try_advisory_lock(763391) AS locked")
    ).rows[0].locked;
    if (!acquired) return false;
    const s = await settings(true);
    const wallets = await db("wallets").whereIn(
      "id",
      db("payment_intentions")
        .select("wallet_id")
        .where({ status: "IN_PROGRESS" }),
    );
    for (const w of wallets) {
      await db("wallets")
        .where({ id: w.id })
        .update({ scan_attempt_at: db.fn.now() });
      try {
        if (!available(s, w.chain))
          throw new Error(
            "Monitoring disabled or explorer key missing. Expiry remains active.",
          );
        // Replay the complete active window. This intentionally covers arbitrarily delayed indexing,
        // rather than treating local wall time as proof that an explorer indexed every transfer.
        const first = await db("payment_intentions")
          .where({ wallet_id: w.id, status: "IN_PROGRESS" })
          .min("created_at as earliest")
          .first();
        const since = new Date(
          new Date(first!.earliest as string).getTime() - 1000,
        );
        const until = new Date();
        const key = w.chain === "solana" ? s.solscan_key : s.etherscan_key;
        if (!key)
          throw new Error(
            "Explorer key could not be decrypted. Restore the original ENCRYPTION_KEY or save the key again.",
          );
        const txs = await fetcher(w.chain, w.address, since, until, key);
        await reconcile(w, txs);
        await db("wallets").where({ id: w.id }).update({
          scan_success_at: db.fn.now(),
          scan_error: null,
          scan_checkpoint: until,
          last_fetched_at: until,
        });
      } catch (e: any) {
        await db("wallets")
          .where({ id: w.id })
          .update({ scan_error: e.message?.slice(0, 500) || "Scan failed." });
      }
      await db.transaction(async (trx) => {
        const expired = await trx("payment_intentions")
          .where({ wallet_id: w.id, status: "IN_PROGRESS" })
          .where("expires_at", "<=", trx.fn.now())
          .orderBy("created_at")
          .forUpdate();
        for (const p of expired) await transition(trx, p, "EXPIRED");
      });
    }
    await db("sessions").where("expires_at", "<", db.fn.now()).del();
    await db("idempotency_keys").where("expires_at", "<=", db.fn.now()).del();
    await db("api_buckets")
      .where("reset_at", "<", db.raw("now() - interval '1 day'"))
      .del();
    return true;
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(763391)");
    if (lock) await db.client.releaseConnection(lock);
    running = false;
  }
}
export function startPoller(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout;
  const tick = async () => {
    try {
      await poll();
    } catch {
      console.error(
        "Payment monitoring cycle failed. Check database connectivity.",
      );
    }
    if (!stopped) {
      let minutes = 15;
      try {
        minutes = (await settings()).polling_minutes;
      } catch {}
      timer = setTimeout(tick, minutes * 60000);
    }
  };
  void tick();
  // Check interval changes each minute, without overlapping runs.
  let lastMinutes = 15;
  const watch = setInterval(async () => {
    try {
      const minutes = (await settings()).polling_minutes;
      if (minutes !== lastMinutes) {
        lastMinutes = minutes;
        clearTimeout(timer);
        if (!running && !stopped) timer = setTimeout(tick, minutes * 60000);
      }
    } catch {}
  }, 60000);
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(watch);
  };
}
