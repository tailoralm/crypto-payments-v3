import db from '../../db/knex';
import { AppError } from '../../common/types';
import { isValidChain, isValidChainAddress } from '../../common/validators';

export async function listContracts(userId: string) {
  return db('custom_contracts').where({ user_id: userId }).orderBy('created_at', 'desc');
}

export async function createContract(userId: string, data: {
  chain: string;
  contract_address: string;
  symbol: string;
  decimals: number;
}) {
  if (!isValidChain(data.chain)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid chain. Must be "ethereum" or "solana"');
  }
  if (!isValidChainAddress(data.chain, data.contract_address)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${data.chain} address format`);
  }
  if (!data.symbol || !data.decimals || data.decimals < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Symbol and valid decimals are required');
  }

  const [contract] = await db('custom_contracts')
    .insert({ user_id: userId, ...data })
    .returning('*');

  return contract;
}

export async function deleteContract(userId: string, contractId: string) {
  const contract = await db('custom_contracts').where({ id: contractId, user_id: userId }).first();
  if (!contract) {
    throw new AppError(404, 'NOT_FOUND', 'Custom contract not found');
  }

  const pending = await db('payment_intentions')
    .where({ token_id: contractId, token_source: 'custom', status: 'PENDING' })
    .first();

  if (pending) {
    throw new AppError(409, 'CONTRACT_HAS_PENDING_INTENTIONS', 'Cannot delete contract because it has pending payment intentions');
  }

  await db('custom_contracts').where({ id: contractId }).del();
  return { deleted: true };
}
