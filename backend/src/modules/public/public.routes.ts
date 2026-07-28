import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../common/types';
import { apiKeyMiddleware } from '../../common/middlewares';
import * as paymentsService from '../payments/payments.service';

const router = Router();

router.post('/payments', apiKeyMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentsService.createPayment(req.apiUserId!, req.body);
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
});

router.get('/payments', apiKeyMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
    };
    const payments = await paymentsService.listPayments(req.apiUserId!, filters);
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

router.get('/payments/:id', apiKeyMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await paymentsService.getPayment(req.apiUserId!, req.params.id);
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

export default router;
