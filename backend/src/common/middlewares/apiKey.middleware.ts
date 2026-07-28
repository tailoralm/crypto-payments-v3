import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../../db/knex';
import { AuthenticatedRequest } from '../types';

export async function apiKeyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Missing X-API-Key header', status: 401 } });
    return;
  }

  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  const token = await db('api_tokens').where({ token_hash: hash }).first();
  if (!token) {
    res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key', status: 401 } });
    return;
  }

  const user = await db('users').where({ id: token.user_id }).first();
  if (!user) {
    res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'User not found', status: 401 } });
    return;
  }

  await db('api_tokens').where({ id: token.id }).update({ last_used_at: db.fn.now() });

  req.apiUserId = user.id;
  req.rateLimitConfig = {
    enabled: user.rate_limit_enabled,
    maxRequests: user.rate_limit_max_requests,
    windowMinutes: user.rate_limit_window_minutes,
  };

  const config = req.rateLimitConfig;
  if (config.enabled && config.maxRequests && config.windowMinutes) {
    const limiter = rateLimit({
      windowMs: config.windowMinutes * 60 * 1000,
      max: config.maxRequests,
      keyGenerator: () => `api-user-${user.id}`,
      handler: (_req, res) => {
        res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', status: 429 } });
      },
    });
    return limiter(req, res, next);
  }

  next();
}
