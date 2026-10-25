/**
 * User + session persistence and authentication.
 *
 * The authenticated session is the sole source of the audit actor — callers
 * never pass an actor name. Sessions are opaque bearer tokens stored hashed.
 */

import type { Db } from '../db/index.ts';
import type { Role } from '../domain/types.ts';
import { hashPassword, verifyPassword, hashToken, newToken } from './password.ts';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export interface Session {
  token: string; // raw token returned once at login
  user: AuthUser;
  expiresAt: string;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export class UserRepository {
  constructor(private readonly db: Db) {}

  createUser(username: string, name: string, role: Role, password: string): AuthUser {
    const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        'INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, username.toLowerCase(), name, role, hashPassword(password), new Date().toISOString());
    return { id, username: username.toLowerCase(), name, role };
  }

  getByUsername(username: string): (AuthUser & { passwordHash: string }) | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username.toLowerCase()) as any;
    if (!row) return null;
    return { id: row.id, username: row.username, name: row.name, role: row.role, passwordHash: row.password_hash };
  }

  countUsers(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as any;
    return Number(row.n);
  }

  /** Authenticate and open a session. Returns null on bad credentials. */
  login(username: string, password: string): Session | null {
    const user = this.getByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;

    const token = newToken();
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), user.id, new Date(now).toISOString(), expiresAt);

    return { token, user: { id: user.id, username: user.username, name: user.name, role: user.role }, expiresAt };
  }

  /** Resolve a bearer token to the authenticated user, or null if invalid/expired. */
  resolveSession(token: string): AuthUser | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.username, u.name, u.role, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(hashToken(token)) as any;
    if (!row) return null;
    if (Date.parse(row.expires_at) < Date.now()) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      return null;
    }
    return { id: row.id, username: row.username, name: row.name, role: row.role };
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
}
