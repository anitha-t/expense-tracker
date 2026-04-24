import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { cacheGet } from '../config/redis';
import { AppError } from './errorHandler';

// Module augmentation: extend Express Request with our typed fields.
// This avoids casting (req as any).userId everywhere — the compiler enforces it.
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userRole: 'employee' | 'manager' | 'admin';
      requestId: string;
    }
  }
}

interface JwtPayload {
  sub: string;           // user ID (standard JWT claim)
  role: 'employee' | 'manager' | 'admin';
  iat: number;
  exp: number;
}

// Tokens invalidated before expiry (logout, password change) are written here.
// Checking Redis on every request is O(1) and far cheaper than a DB lookup.
async function isTokenRevoked(jti: string): Promise<boolean> {
  const revoked = await cacheGet<boolean>(`revoked:${jti}`);
  return revoked === true;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Standard Bearer token extraction
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentication required');
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError(401, 'Token expired');
    throw new AppError(401, 'Invalid token');
  }

  // Check revocation list (logout / forced-sign-out after password change)
  const jti = (payload as JwtPayload & { jti?: string }).jti;
  if (jti && (await isTokenRevoked(jti))) {
    throw new AppError(401, 'Token has been revoked');
  }

  req.userId = payload.sub;
  req.userRole = payload.role;
  next();
}

// RBAC guard — use after authenticate()
// Usage: router.delete('/:id', authenticate, requireRole('admin'), handler)
export function requireRole(...roles: Array<'employee' | 'manager' | 'admin'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(req.userRole)) {
      throw new AppError(403, 'Insufficient permissions');
    }
    next();
  };
}
