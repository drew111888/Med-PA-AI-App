/**
 * Authentication + authorization middleware.
 *
 * - requireAuth: resolves the Bearer token to a user and attaches it to the
 *   request. Rejects with 401 when absent/invalid.
 * - requirePermission: enforces role-based permission. Rejects with 403.
 *
 * The attached user is the ONLY source of the audit actor. Routes read
 * req.authUser, never a client-supplied name.
 */

import type { Request, Response, NextFunction } from 'express';
import type { UserRepository, AuthUser } from './userRepository.ts';
import { ROLE_PERMISSIONS, type Permission } from '../domain/types.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

const bearer = (req: Request): string | null => {
  const h = req.header('authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
};

export const requireAuth =
  (users: UserRepository) => (req: Request, res: Response, next: NextFunction) => {
    const token = bearer(req);
    if (!token) return res.status(401).json({ error: 'authentication required' });
    const user = users.resolveSession(token);
    if (!user) return res.status(401).json({ error: 'invalid or expired session' });
    req.authUser = user;
    next();
  };

export const requirePermission =
  (permission: Permission) => (req: Request, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'authentication required' });
    const granted = ROLE_PERMISSIONS[user.role] ?? [];
    if (!granted.includes(permission)) {
      return res.status(403).json({ error: `role ${user.role} lacks permission: ${permission}` });
    }
    next();
  };
