import db from "../db/knex";
import { z } from "zod";
import { fail, normalized, uuid, assets, decimal, Transfer } from "./domain";
import { settings, available } from "./settings";
import { fetchTransfers } from "./providers";
import { transition } from "./events";

export async function scanRecovery(
  owner: string,
  body: unknown,
  fetcher = fetchTransfers,
): Promise<any> {
  const input = z
    .object({
      wallet_id: uuid,
      date_from: z.iso.datetime(),
      date_to: z.iso.datetime(),
    })
    .strict()
    .parse(body);
  const since = new Date(input.date_from),
    until = new Date(input.date_to);
  if (until <= since || +until - +since > 30 * 86400000 || +until > Date.now())
    fail(400, "INVALID_RANGE", "Choose a past range of at most 30 days.");
  const wallet = await db("wallets")
    .where({ id: input.wallet_id, user_id: owner })
    .first();
  if (!wallet) fail(404, "NOT_FOUND", "Wallet not found.");
  const s = await settings(true);
  if (!available(s, wallet.chain))
    fail(
      409,
      "CHAIN_UNAVAILABLE",
      "Enable the explorer before recovery scanning.",
    );
  const transfers = await fetcher(
    wallet.chain,
    wallet.address,
    since,
    until,
    wallet.chain === "solana" ? s.solscan_key : s.etherscan_key,
  );
  await db.transaction(async (trx) => {
    for (const tx of transfers) {
      if (
        tx.chain !== wallet.chain ||
        normalized(tx.chain, tx.to) !==
          normalized(wallet.chain, wallet.address) ||
        normalized(tx.chain, tx.asset) !==
          normalized(wallet.chain, assets[tx.chain].address) ||
        tx.timestamp * 1000 < +since ||
        tx.timestamp * 1000 > +until
      )
        continue;
      const legacy = await trx("payment_intentions")
        .where({ status: "SUCCESS", concluded_tx_hash: tx.tx })
        .whereRaw("snapshot->>'chain' = ?", [tx.chain])
        .first();
      if (
        legacy &&
        !(await trx("transfers").where({ payment_id: legacy.id }).first())
      )
        continue;
      const existing = await trx("transfers").where({
        chain: tx.chain,
        tx: tx.tx,
      });
      if (
        existing.some((e) => (e.event === "single") !== (tx.event === "single"))
      )
        fail(
          409,
          "EVIDENCE_CONFLICT",
          "Transfer identity changed; recovery stopped.",
        );
      await trx("transfers")
        .insert({ chain: tx.chain, tx: tx.tx, event: tx.event, data: tx })
        .onConflict(["chain", "tx", "event"])
        .ignore();
      const stored = await trx("transfers")
        .where({ chain: tx.chain, tx: tx.tx, event: tx.event })
        .first();
      if (!sameEvidence(stored.data, tx))
        fail(
          409,
          "EVIDENCE_CONFLICT",
          "Transfer evidence changed; recovery stopped.",
        );
    }
  });
  return recoveryCandidates(owner, wallet.id);
}
function sameEvidence(a: Transfer, b: Transfer): boolean {
  return (
    a.chain === b.chain &&
    a.tx === b.tx &&
    a.event === b.event &&
    a.amount === b.amount &&
    a.timestamp === b.timestamp &&
    a.block === b.block &&
    normalized(a.chain, a.to) === normalized(b.chain, b.to) &&
    normalized(a.chain, a.from) === normalized(b.chain, b.from) &&
    normalized(a.chain, a.asset) === normalized(b.chain, b.asset)
  );
}
export async function recoveryCandidates(
  owner: string,
  walletId: string,
): Promise<any> {
  uuid.parse(walletId);
  const wallet = await db("wallets")
    .where({ id: walletId, user_id: owner })
    .first();
  if (!wallet) fail(404, "NOT_FOUND", "Wallet not found.");
  const rows = await db("transfers")
    .where({ chain: wallet.chain })
    .whereNull("payment_id")
    .orderBy("created_at", "desc")
    .limit(500);
  const payments = await db("payment_intentions")
    .where({ user_id: owner, wallet_id: walletId })
    .whereNot({ status: "SUCCESS" })
    .orderBy("created_at", "desc")
    .limit(500);
  return rows
    .filter(
      (r) =>
        normalized(wallet.chain, r.data.to) ===
        normalized(wallet.chain, wallet.address),
    )
    .map((r) => ({
      ...r,
      candidates: payments
        .filter(
          (p) =>
            normalized(wallet.chain, p.snapshot.asset_address) ===
            normalized(wallet.chain, r.data.asset),
        )
        .map((p) => ({
          id: p.id,
          reference: p.reference,
          status: p.status,
          payable_amount: p.snapshot.amount,
          late: r.data.timestamp * 1000 >= +new Date(p.expires_at),
          before_creation: r.data.timestamp * 1000 < +new Date(p.created_at),
          amount_difference: (
            BigInt(r.data.amount) - BigInt(p.snapshot.atomic_amount)
          ).toString(),
          sender_mismatch:
            !!p.expected_from_address &&
            normalized(wallet.chain, p.expected_from_address) !==
              normalized(wallet.chain, r.data.from),
        })),
    }));
}
export async function acceptRecovery(
  owner: string,
  body: unknown,
): Promise<any> {
  const input = z
    .object({
      payment_id: uuid,
      transfer_id: uuid,
      reason: z.string().trim().min(1).max(1000),
    })
    .strict()
    .parse(body);
  return db.transaction(async (trx) => {
    const p = await trx("payment_intentions")
      .where({ id: input.payment_id, user_id: owner })
      .forUpdate()
      .first();
    if (!p) fail(404, "NOT_FOUND", "Payment not found.");
    const transfer = await trx("transfers")
      .where({ id: input.transfer_id })
      .forUpdate()
      .first();
    if (!transfer || transfer.payment_id || p.status === "SUCCESS")
      fail(
        409,
        "ASSIGNMENT_CONFLICT",
        "Payment or transfer is already assigned or unavailable.",
      );
    const tx = transfer.data as Transfer,
      s = p.snapshot;
    if (
      tx.chain !== s.chain ||
      normalized(s.chain, s.address) !== normalized(tx.chain, tx.to) ||
      normalized(s.chain, s.asset_address) !== normalized(tx.chain, tx.asset)
    )
      fail(
        409,
        "INVALID_EVIDENCE",
        "Transfer network, destination or asset does not match.",
      );
    const review = {
      received_amount: decimal(tx.amount, s.decimals),
      previous_status: p.status,
      reason: input.reason,
      reviewer: owner,
      reviewed_at: new Date().toISOString(),
      requested_amount: p.requested_amount,
      payable_amount: s.amount,
      transfer_id: transfer.id,
      evidence: tx,
    };
    await trx("transfers")
      .where({ id: transfer.id })
      .update({ payment_id: p.id });
    return transition(
      trx,
      p,
      "SUCCESS",
      {
        review,
        paid_at: new Date(tx.timestamp * 1000),
        detected_at: trx.fn.now(),
        concluded_at: trx.fn.now(),
        concluded_tx_hash: tx.tx,
        concluded_from_address: tx.from,
      },
      tx,
    );
  });
}
