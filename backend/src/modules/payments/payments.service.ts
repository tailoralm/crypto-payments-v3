import db from '../../db/knex';
import { AppError } from '../../common/types';

export async function createPayment(userId: string, data: {
  wallet_id: string;
  description: string;
  value: number;
  token_source: string;
  token_id: string;
  expiration_hours?: number;
  expected_from_address?: string | null;
}) {
  const wallet = await db('wallets').where({ id: data.wallet_id, user_id: userId }).first();
  if (!wallet) {
    throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  }

  if (data.token_source === 'system') {
    const token = await db('tokens').where({ id: data.token_id }).first();
    if (!token) {
      throw new AppError(404, 'NOT_FOUND', 'Token not found');
    }
  } else if (data.token_source === 'custom') {
    const contract = await db('custom_contracts').where({ id: data.token_id, user_id: userId }).first();
    if (!contract) {
      throw new AppError(404, 'NOT_FOUND', 'Custom contract not found');
    }
  } else {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid token_source. Must be "system" or "custom"');
  }

  const expirationHours = data.expiration_hours || 24;
  const [payment] = await db('payment_intentions')
    .insert({
      user_id: userId,
      wallet_id: data.wallet_id,
      description: data.description,
      value: data.value,
      token_source: data.token_source,
      token_id: data.token_id,
      expiration_hours: expirationHours,
      expires_at: db.raw(`now() + interval '${expirationHours} hours'`),
      expected_from_address: data.expected_from_address || null,
    })
    .returning('*');

  return payment;
}

export async function listPayments(userId: string, filters?: {
  status?: string;
  date_from?: string;
  date_to?: string;
}) {
  let query = db('payment_intentions')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc');

  if (filters?.status) {
    query = query.andWhere({ status: filters.status });
  }
  if (filters?.date_from) {
    query = query.andWhere('created_at', '>=', filters.date_from);
  }
  if (filters?.date_to) {
    query = query.andWhere('created_at', '<=', filters.date_to);
  }

  return query;
}

export async function getPayment(userId: string, paymentId: string) {
  const payment = await db('payment_intentions')
    .where({ id: paymentId, user_id: userId })
    .first();

  if (!payment) {
    throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  }

  const wallet = await db('wallets').where({ id: payment.wallet_id }).first();

  let tokenSymbol: string | undefined;
  let tokenDecimals: number | undefined;

  if (payment.token_source === 'system') {
    const token = await db('tokens').where({ id: payment.token_id }).first();
    if (token) {
      tokenSymbol = token.symbol;
      tokenDecimals = token.decimals;
    }
  } else {
    const contract = await db('custom_contracts').where({ id: payment.token_id }).first();
    if (contract) {
      tokenSymbol = contract.symbol;
      tokenDecimals = contract.decimals;
    }
  }

  return {
    ...payment,
    wallet_address: wallet?.address,
    wallet_chain: wallet?.chain,
    token_symbol: tokenSymbol,
    token_decimals: tokenDecimals,
  };
}
