import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { authMiddleware } from '../../common/middlewares';
import * as reportsService from './reports.service';

const router = Router();

router.get('/dashboard', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const dashboard = await reportsService.getDashboard(req.user!.id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

export default router;
