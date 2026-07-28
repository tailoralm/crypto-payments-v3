import { Router, Response, NextFunction } from 'express';
import { authMiddleware } from '../../common/middlewares';
import db from '../../db/knex';
import { AuthenticatedRequest } from '../../common/types';

const router = Router();

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tokens = await db('tokens').orderBy('symbol', 'asc');
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

export default router;
