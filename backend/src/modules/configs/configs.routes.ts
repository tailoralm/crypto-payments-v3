import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { authMiddleware } from '../../common/middlewares';
import * as configsService from './configs.service';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const configs = await configsService.getConfigs(req.user!.id);
    if (!configs) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found', status: 404 } });
      return;
    }
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

router.patch('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const configs = await configsService.updateConfigs(req.user!.id, req.body);
    res.json(configs);
  } catch (err) {
    next(err);
  }
});

export default router;
