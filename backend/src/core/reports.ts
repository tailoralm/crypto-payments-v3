import db from "../db/knex";
import { assets } from "./domain";
export async function dashboard(owner: string): Promise<any> {
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const curated = (q: any) =>
    q
      .where({ token_source: "system" })
      .whereRaw(
        "((snapshot->>'chain' = 'ethereum' AND lower(snapshot->>'asset_address') = ?) OR (snapshot->>'chain' = 'bsc' AND lower(snapshot->>'asset_address') = ?) OR (snapshot->>'chain' = 'solana' AND snapshot->>'asset_address' = ?))",
        [
          assets.ethereum.address.toLowerCase(),
          assets.bsc.address.toLowerCase(),
          assets.solana.address,
        ],
      );
  const successful = () =>
    curated(
      db("payment_intentions").where({ user_id: owner, status: "SUCCESS" }),
    );
  const totals = async (since: Date) => {
    const row = await successful()
      .where("paid_at", ">=", since)
      .count("* as count")
      .sum("value as amount")
      .first();
    return {
      count: Number(row.count),
      amount: String(row.amount || "0")
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, ""),
    };
  };
  const groups = await db("payment_intentions")
    .where({ user_id: owner })
    .where("created_at", ">=", month)
    .select(
      db.raw("to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as day"),
      "status",
    )
    .count("* as count")
    .groupByRaw("to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), status");
  const days = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), i + 1),
    )
      .toISOString()
      .slice(0, 10);
    const entry: any = {
      day: date,
      SUCCESS: 0,
      IN_PROGRESS: 0,
      CANCELED: 0,
      EXPIRED: 0,
    };
    for (const g of groups.filter((g) => g.day === date))
      entry[g.status] = Number(g.count);
    return entry;
  });
  const recent = await successful()
    .orderBy([
      { column: "paid_at", order: "desc", nulls: "last" },
      { column: "id", order: "desc" },
    ])
    .limit(10);
  const upcoming = await db("payment_intentions")
    .where({ user_id: owner, status: "IN_PROGRESS" })
    .orderBy([
      { column: "expires_at", order: "asc" },
      { column: "id", order: "asc" },
    ])
    .limit(10);
  const counts = await db("payment_intentions")
    .where({ user_id: owner })
    .select("status")
    .count("* as count")
    .groupBy("status");
  const unknown = await successful()
    .whereNull("paid_at")
    .count("* as count")
    .first();
  return {
    today: await totals(day),
    month: await totals(month),
    daily_status_counts: series,
    recent_successes: recent.map((p: any) => ({
      ...p,
      value: p.snapshot.amount,
    })),
    upcoming_expirations: upcoming.map((p) => ({
      ...p,
      value: p.snapshot.amount,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.count)])),
    legacy_unknown_paid_time: Number(unknown.count),
    generated_at: now.toISOString(),
  };
}
