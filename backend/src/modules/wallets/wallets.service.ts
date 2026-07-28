import db from '../../db/knex';
import { AppError } from '../../common/types';
import { isValidChain, isValidChainAddress } from '../../common/validators';

export async function listWallets(userId: string) {
  return db('wallets').where({ user_id: userId }).orderBy('created_at', 'desc');
}

export async function createWallet(userId: string, data: {
  chain: string;
  address: string;
  description?: string;
  is_default?: boolean;
}) {
  if (!isValidChain(data.chain)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid chain. Must be "ethereum" or "solana"');
  }
  if (!isValidChainAddress(data.chain, data.address)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${data.chain} address format`);
  }

  const wallet = {
    user_id: userId,
    chain: data.chain,
    address: data.address,
    description: data.description || null,
    is_default: data.is_default || false,
  };

  const [created] = await db.transaction(async (trx) => {
    if (wallet.is_default) {
      await trx('wallets').where({ user_id: userId }).update({ is_default: false });
    }
    return trx('wallets').insert(wallet).returning('*');
  });

  return created;
}

export async function updateWallet(userId: string, walletId: string, data: {
  description?: string;
  is_default?: boolean;
}) {
  const wallet = await db('wallets').where({ id: walletId, user_id: userId }).first();
  if (!wallet) {
    throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  }

  const [updated] = await db.transaction(async (trx) => {
    if (data.is_default) {
      await trx('wallets').where({ user_id: userId }).update({ is_default: false });
    }
    const updateData: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.description !== undefined) updateData.description = data.description;
    if (data.is_default !== undefined) updateData.is_default = data.is_default;
    return trx('wallets').where({ id: walletId }).update(updateData).returning('*');
  });

  return updated;
}

export async function deleteWallet(userId: string, walletId: string) {
  const wallet = await db('wallets').where({ id: walletId, user_id: userId }).first();
  if (!wallet) {
    throw new AppError(404, 'NOT_FOUND', 'Wallet not found');
  }

  const pending = await db('payment_intentions')
    .where({ wallet_id: walletId, status: 'PENDING' })
    .first();

  if (pending) {
    throw new AppError(409, 'WALLET_HAS_PENDING_INTENTIONS', 'Cannot delete wallet because it has pending payment intentions');
  }

  await db('wallets').where({ id: walletId }).del();
  return { deleted: true };
}
