/**
 * Authentication routes: login, logout, current user.
 * Login returns an opaque bearer token the client sends on every request.
 */

import { Router } from 'express';
import type { UserRepository } from './userRepository.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';
import { requireAuth } from './middleware.ts';

export const createAuthRouter = (users: UserRepository, audit: AuditRepository): Router => {
  const router = Router();

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }
    const session = users.login(String(username), String(password));
    if (!session) return res.status(401).json({ error: 'invalid credentials' });
    audit.log({ caseId: null, actor: session.user.id, action: 'login', detail: session.user.username });
    res.json({ token: session.token, user: session.user, expiresAt: session.expiresAt });
  });

  router.post('/auth/logout', requireAuth(users), (req, res) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (token) users.logout(token);
    audit.log({ caseId: null, actor: req.authUser!.id, action: 'logout', detail: null });
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth(users), (req, res) => {
    res.json({ user: req.authUser });
  });

  return router;
};
