import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { authMiddleware } from '../../common/middlewares';
import * as apiTokensService from './apiTokens.service';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tokens = await apiTokensService.listTokens(req.user!.id);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = await apiTokensService.createToken(req.user!.id, req.body.label);
    res.status(201).json(token);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await apiTokensService.deleteToken(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
