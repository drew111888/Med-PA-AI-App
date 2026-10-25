import { describe, it, expect } from 'vitest';
import { openTestDb } from '../db/index.ts';
import { hashPassword, verifyPassword, hashToken, newToken } from './password.ts';
import { UserRepository } from './userRepository.ts';
import { seedUsersIfEmpty } from './bootstrap.ts';
import { ROLE_PERMISSIONS } from '../domain/types.ts';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('s3cret');
    expect(stored).not.toContain('s3cret');
    expect(verifyPassword('s3cret', stored)).toBe(true);
    expect(verifyPassword('nope', stored)).toBe(false);
  });

  it('salts: same password hashes differently each time', () => {
    expect(hashPassword('same')).not.toEqual(hashPassword('same'));
  });

  it('tokens hash deterministically for lookup', () => {
    const t = newToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });
});

describe('UserRepository sessions', () => {
  it('logs in with correct credentials and resolves the session', () => {
    const db = openTestDb();
    const repo = new UserRepository(db);
    repo.createUser('alice', 'Alice', 'PROVIDER', 'pw');
    const session = repo.login('alice', 'pw');
    expect(session).not.toBeNull();
    const user = repo.resolveSession(session!.token);
    expect(user?.username).toBe('alice');
    expect(user?.role).toBe('PROVIDER');
    db.close();
  });

  it('returns null for bad credentials', () => {
    const db = openTestDb();
    const repo = new UserRepository(db);
    repo.createUser('bob', 'Bob', 'BILLER', 'pw');
    expect(repo.login('bob', 'wrong')).toBeNull();
    expect(repo.login('ghost', 'pw')).toBeNull();
    db.close();
  });

  it('logout invalidates the session', () => {
    const db = openTestDb();
    const repo = new UserRepository(db);
    repo.createUser('carol', 'Carol', 'ADMIN', 'pw');
    const s = repo.login('carol', 'pw')!;
    repo.logout(s.token);
    expect(repo.resolveSession(s.token)).toBeNull();
    db.close();
  });

  it('never stores plaintext passwords', () => {
    const db = openTestDb();
    const repo = new UserRepository(db);
    repo.createUser('dave', 'Dave', 'PROVIDER', 'plaintext-pw');
    const row = db.prepare('SELECT password_hash FROM users WHERE username=?').get('dave') as any;
    expect(row.password_hash).not.toContain('plaintext-pw');
    db.close();
  });
});

describe('seedUsersIfEmpty', () => {
  it('seeds synthetic users only when empty', () => {
    const db = openTestDb();
    const repo = new UserRepository(db);
    const first = seedUsersIfEmpty(repo);
    expect(first.length).toBe(3);
    const second = seedUsersIfEmpty(repo);
    expect(second.length).toBe(0);
    db.close();
  });
});

describe('role permissions', () => {
  it('coordinator (BILLER) cannot approve but can run and record submission', () => {
    expect(ROLE_PERMISSIONS.BILLER).not.toContain('approve_appeal');
    expect(ROLE_PERMISSIONS.BILLER).toContain('run_pipeline');
    expect(ROLE_PERMISSIONS.BILLER).toContain('record_submission');
  });

  it('provider can approve', () => {
    expect(ROLE_PERMISSIONS.PROVIDER).toContain('approve_appeal');
  });
});
