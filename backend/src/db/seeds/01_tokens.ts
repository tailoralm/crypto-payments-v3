import { Knex } from "knex";
import { assets } from "../../core/domain";
export async function seed(db: Knex): Promise<void> {
  await db.transaction(async (trx) => {
    await trx("installation").where({ id: 1 }).forUpdate().first();
    for (const [chain, a] of Object.entries(assets))
      if (
        !(await trx("tokens")
          .where({ chain, contract_address: a.address })
          .first())
      )
        await trx("tokens").insert({
          chain,
          symbol: "USDT",
          contract_address: a.address,
          decimals: a.decimals,
          is_system_default: true,
        });
  });
}
