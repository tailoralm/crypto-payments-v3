import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../db/knex';
import { AppError, AuthenticatedUser } from '../../common/types';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

function generateAccessToken(user: AuthenticatedUser): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(user: AuthenticatedUser): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export async function register(email: string, password: string) {
  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email already registered');
  }

  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await db('users')
    .insert({ email, password_hash })
    .returning(['id', 'email', 'created_at']);

  return user;
}

export async function login(email: string, password: string) {
  const user = await db('users').where({ email }).first();
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
  }

  const authUser: AuthenticatedUser = { id: user.id, email: user.email };
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  return { accessToken, refreshToken, expiresIn: 900 };
}

export async function refresh(refreshToken: string) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as AuthenticatedUser;
    const user = await db('users').where({ id: decoded.id }).first();
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not found');
    }

    const authUser: AuthenticatedUser = { id: user.id, email: user.email };
    const accessToken = generateAccessToken(authUser);
    const newRefreshToken = generateRefreshToken(authUser);

    return { accessToken, refreshToken: newRefreshToken, expiresIn: 900 };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token');
  }
}
