import db from '../../db/knex';
import { encrypt, decrypt } from '../../common/encryption';

export async function getConfigs(userId: string) {
  const user = await db('users').where({ id: userId }).first();
  if (!user) return null;

  return {
    etherscan_api_key: user.etherscan_api_key ? '••••••••' + user.etherscan_api_key.slice(-4) : null,
    solscan_api_key: user.solscan_api_key ? '••••••••' + user.solscan_api_key.slice(-4) : null,
    rate_limit_enabled: user.rate_limit_enabled,
    rate_limit_max_requests: user.rate_limit_max_requests,
    rate_limit_window_minutes: user.rate_limit_window_minutes,
  };
}

export async function updateConfigs(userId: string, data: {
  etherscan_api_key?: string | null;
  solscan_api_key?: string | null;
  rate_limit_enabled?: boolean;
  rate_limit_max_requests?: number | null;
  rate_limit_window_minutes?: number | null;
}) {
  const updateData: Record<string, unknown> = {};

  if (data.etherscan_api_key !== undefined) {
    updateData.etherscan_api_key = data.etherscan_api_key ? encrypt(data.etherscan_api_key) : null;
  }
  if (data.solscan_api_key !== undefined) {
    updateData.solscan_api_key = data.solscan_api_key ? encrypt(data.solscan_api_key) : null;
  }
  if (data.rate_limit_enabled !== undefined) {
    updateData.rate_limit_enabled = data.rate_limit_enabled;
  }
  if (data.rate_limit_max_requests !== undefined) {
    updateData.rate_limit_max_requests = data.rate_limit_max_requests;
  }
  if (data.rate_limit_window_minutes !== undefined) {
    updateData.rate_limit_window_minutes = data.rate_limit_window_minutes;
  }

  updateData.updated_at = db.fn.now();

  await db('users').where({ id: userId }).update(updateData);
  return getConfigs(userId);
}
