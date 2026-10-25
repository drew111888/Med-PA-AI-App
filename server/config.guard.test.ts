/**
 * Synthetic-only guard tests (FEAT-003).
 *
 * A non-synthetic/production signal (NODE_ENV=production or
 * MEDAUTH_PROFILE=production) with no operator-supplied
 * MEDAUTH_DB_ENCRYPTION_KEY must refuse to boot (loadConfig) and refuse to seed
 * demo users (seedUsersIfEmpty). Explicit local synthetic dev / test paths stay
 * permissive. Env is saved/restored per test so nothing leaks between tests.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, resetConfigCache } from './config.ts';
import { openTestDb } from './db/index.ts';
import { UserRepository } from './auth/userRepository.ts';
import { seedUsersIfEmpty } from './auth/bootstrap.ts';

const KEYS = ['NODE_ENV', 'MEDAUTH_PROFILE', 'MEDAUTH_DB_ENCRYPTION_KEY'] as const;

/** Snapshot the guard-relevant env, apply overrides, return a restorer. */
const withEnv = (overrides: Partial<Record<(typeof KEYS)[number], string | undefined>>): (() => void) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  };
};

describe('synthetic-only boot guard (loadConfig)', () => {
  afterEach(() => resetConfigCache());

  it('refuses to boot under a production signal with no encryption key', () => {
    const restore = withEnv({ NODE_ENV: 'production', MEDAUTH_DB_ENCRYPTION_KEY: undefined });
    try {
      resetConfigCache();
      expect(() => loadConfig({})).toThrow(/Refusing to boot/);
    } finally {
      restore();
      resetConfigCache();
    }
  });

  it('refuses under MEDAUTH_PROFILE=production with no encryption key', () => {
    const restore = withEnv({ MEDAUTH_PROFILE: 'production', MEDAUTH_DB_ENCRYPTION_KEY: undefined });
    try {
      resetConfigCache();
      expect(() => loadConfig({})).toThrow(/Refusing to boot/);
    } finally {
      restore();
      resetConfigCache();
    }
  });

  it('boots under a production signal when an operator key is supplied', () => {
    const restore = withEnv({ NODE_ENV: 'production', MEDAUTH_DB_ENCRYPTION_KEY: 'operator-key' });
    try {
      resetConfigCache();
      const cfg = loadConfig({});
      expect(cfg.dbEncryptionKey).toBe('operator-key');
    } finally {
      restore();
      resetConfigCache();
    }
  });

  it('is permissive for explicit synthetic/test boot (no production signal)', () => {
    const restore = withEnv({ NODE_ENV: undefined, MEDAUTH_PROFILE: undefined, MEDAUTH_DB_ENCRYPTION_KEY: undefined });
    try {
      resetConfigCache();
      expect(() => loadConfig({ isTest: true })).not.toThrow();
    } finally {
      restore();
      resetConfigCache();
    }
  });
});

describe('synthetic-only seed guard (seedUsersIfEmpty)', () => {
  it('refuses to seed demo users under a production signal with no encryption key', () => {
    const restore = withEnv({ NODE_ENV: 'production', MEDAUTH_DB_ENCRYPTION_KEY: undefined });
    const db = openTestDb();
    try {
      const repo = new UserRepository(db);
      expect(() => seedUsersIfEmpty(repo)).toThrow(/Refusing to seed/);
      expect(repo.countUsers()).toBe(0);
    } finally {
      db.close();
      restore();
    }
  });

  it('seeds demo users under explicit synthetic/test (no production signal)', () => {
    const restore = withEnv({ NODE_ENV: undefined, MEDAUTH_PROFILE: undefined, MEDAUTH_DB_ENCRYPTION_KEY: undefined });
    const db = openTestDb();
    try {
      const repo = new UserRepository(db);
      const seeded = seedUsersIfEmpty(repo);
      expect(seeded.length).toBe(3);
    } finally {
      db.close();
      restore();
    }
  });
});
