import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  apiUserId?: string;
  rateLimitConfig?: {
    enabled: boolean;
    maxRequests: number | null;
    windowMinutes: number | null;
  };
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
