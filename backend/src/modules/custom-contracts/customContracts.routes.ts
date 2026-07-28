import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { authMiddleware } from '../../common/middlewares';
import * as contractsService from './customContracts.service';

const router = Router();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const contracts = await contractsService.listContracts(req.user!.id);
    res.json(contracts);
  } catch (err) {
    next(err);
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const contract = await contractsService.createContract(req.user!.id, req.body);
    res.status(201).json(contract);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await contractsService.deleteContract(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
