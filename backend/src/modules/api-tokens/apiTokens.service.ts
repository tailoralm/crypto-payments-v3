import crypto from 'crypto';
import db from '../../db/knex';
import { AppError } from '../../common/types';

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createToken(userId: string, label?: string) {
  const raw = generateRawToken();
  const token_hash = hashToken(raw);

  const [token] = await db('api_tokens')
    .insert({ user_id: userId, token_hash, label: label || null })
    .returning('*');

  return { ...token, raw_token: raw };
}

export async function listTokens(userId: string) {
  const tokens = await db('api_tokens')
    .where({ user_id: userId })
    .select('id', 'label', 'last_used_at', 'created_at')
    .orderBy('created_at', 'desc');

  return tokens;
}

export async function deleteToken(userId: string, tokenId: string) {
  const token = await db('api_tokens').where({ id: tokenId, user_id: userId }).first();
  if (!token) {
    throw new AppError(404, 'NOT_FOUND', 'API token not found');
  }

  await db('api_tokens').where({ id: tokenId }).del();
  return { deleted: true };
}
