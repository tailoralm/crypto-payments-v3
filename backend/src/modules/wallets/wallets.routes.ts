import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { authMiddleware } from '../../common/middlewares';
import * as walletsService from './wallets.service';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const wallets = await walletsService.listWallets(req.user!.id);
    res.json(wallets);
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const wallet = await walletsService.createWallet(req.user!.id, req.body);
    res.status(201).json(wallet);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const wallet = await walletsService.updateWallet(req.user!.id, req.params.id, req.body);
    res.json(wallet);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await walletsService.deleteWallet(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
