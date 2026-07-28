import { Router, Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';

const router = Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password are required', status: 400 } });
      return;
    }
    const user = await authService.register(email, password);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password are required', status: 400 } });
      return;
    }
    const result = await authService.login(email, password);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth',
    });
    res.json({ access_token: result.accessToken, expires_in: result.expiresIn });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token', status: 401 } });
      return;
    }
    const result = await authService.refresh(refreshToken);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth',
    });
    res.json({ access_token: result.accessToken, expires_in: result.expiresIn });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken', { path: '/auth' });
  res.json({ message: 'Logged out' });
});

export default router;
