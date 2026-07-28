import db from '../../db/knex';

export async function getDashboard(userId: string) {
  const now = db.fn.now();
  const firstOfMonth = db.raw("date_trunc('month', now())");
  const thirtyDaysAgo = db.raw("now() - interval '30 days'");

  const totalReceivedMonth = await db('payment_intentions')
    .where({ user_id: userId, status: 'CONCLUDED' })
    .andWhere('concluded_at', '>=', firstOfMonth)
    .sum('value as total')
    .first();

  const pendingCount = await db('payment_intentions')
    .where({ user_id: userId, status: 'PENDING' })
    .count('id as count')
    .first();

  const expiredMonthCount = await db('payment_intentions')
    .where({ user_id: userId, status: 'EXPIRED' })
    .andWhere('created_at', '>=', firstOfMonth)
    .count('id as count')
    .first();

  const last30DaysConcluded = await db('payment_intentions')
    .where({ user_id: userId, status: 'CONCLUDED' })
    .andWhere('concluded_at', '>=', thirtyDaysAgo)
    .count('id as count')
    .first();

  const last30DaysExpired = await db('payment_intentions')
    .where({ user_id: userId, status: 'EXPIRED' })
    .andWhere('created_at', '>=', thirtyDaysAgo)
    .count('id as count')
    .first();

  const totalConcluded = Number(last30DaysConcluded?.count || 0);
  const totalExpired = Number(last30DaysExpired?.count || 0);
  const conversionRate = totalConcluded + totalExpired > 0
    ? totalConcluded / (totalConcluded + totalExpired)
    : 0;

  const recentActivity = await db('payment_intentions')
    .where({ user_id: userId })
    .whereIn('status', ['CONCLUDED', 'EXPIRED'])
    .orderBy('updated_at', 'desc')
    .limit(10)
    .select('id', 'description', 'value', 'status', 'concluded_at as occurred_at');

  const walletsOverview = await db('wallets')
    .where({ user_id: userId })
    .select(
      'id',
      'address',
      'chain',
    )
    .then(async (wallets) => {
      const result = [];
      for (const wallet of wallets) {
        const pendingRow = await db('payment_intentions')
          .where({ wallet_id: wallet.id, status: 'PENDING' })
          .count('id as count')
          .sum('value as total')
          .first();
        result.push({
          id: wallet.id,
          address: wallet.address,
          chain: wallet.chain,
          pending_count: Number(pendingRow?.count || 0),
          pending_total: pendingRow?.total || '0',
        });
      }
      return result;
    });

  return {
    total_received_month: totalReceivedMonth?.total || '0',
    pending_count: Number(pendingCount?.count || 0),
    expired_month_count: Number(expiredMonthCount?.count || 0),
    conversion_rate: conversionRate,
    recent_activity: recentActivity,
    wallets_overview: walletsOverview,
  };
}
