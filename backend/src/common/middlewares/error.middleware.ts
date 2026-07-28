import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, status: err.statusCode },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', status: 500 },
  });
}
