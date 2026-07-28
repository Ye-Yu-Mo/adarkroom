/**
 * Express request augmented with authenticated player ID.
 * Attached by authMiddleware after successful token verification.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken } from './token';

export interface AuthenticatedRequest extends Request {
  playerId: string;
}

/**
 * Express middleware — extracts and verifies JWT from Authorization header.
 * On success, attaches playerId to req. On failure, responds with 401.
 *
 *   router.get('/protected', authMiddleware, (req, res) => {
 *     // req.playerId is guaranteed to be set
 *   });
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header) {
    res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' },
    });
    return;
  }

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header must be: Bearer <token>' },
    });
    return;
  }

  const token = parts[1];

  try {
    const payload = verifyToken(token);
    if (!payload.sub) {
      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Token has no subject' },
      });
      return;
    }
    (req as AuthenticatedRequest).playerId = payload.sub;
    next();
  } catch (err) {
    const message = err instanceof jwt.JsonWebTokenError
      ? 'Invalid or expired token'
      : 'Token verification failed';
    res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message },
    });
  }
}
