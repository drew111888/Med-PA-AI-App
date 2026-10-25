import { describe, it, expect } from 'vitest';
import { runMigrations, checkDbHealth, openTestDb, openRawDb } from './index.ts';
import { encryptField, decryptField, isEncrypted } from './crypto.ts';

const rawDb = () => openRawDb();

describe('migrations', () => {
  it('applies all migrations on an empty database', () => {
    const db = rawDb();
    const applied = runMigrations(db);
    expect(applied).toContain('0001_init');
    expect(applied).toContain('0002_core_entities');
    db.close();
  });

  it('is idempotent — second run applies nothing', () => {
    const db = rawDb();
    runMigrations(db);
    const second = runMigrations(db);
    expect(second).toEqual([]);
    db.close();
  });

  it('creates the expected core tables', () => {
    const db = openTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const t of ['patients', 'claims', 'denials', 'appeal_cases', 'audit_log', 'jobs']) {
      expect(tables).toContain(t);
    }
    db.close();
  });
});

describe('db health', () => {
  it('reports healthy after migrations', () => {
    const db = openTestDb();
    expect(checkDbHealth(db)).toBe(true);
    db.close();
  });

  it('reports unhealthy before migrations', () => {
    const db = rawDb();
    expect(checkDbHealth(db)).toBe(false);
    db.close();
  });
});

describe('phi field encryption', () => {
  const key = 'test-key-123';

  it('round-trips an encrypted field', () => {
    const plain = 'John Q. Patient, MRN 998877';
    const token = encryptField(plain, key);
    expect(isEncrypted(token)).toBe(true);
    expect(token).not.toContain('John');
    expect(decryptField(token, key)).toBe(plain);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptField('same', key);
    const b = encryptField('same', key);
    expect(a).not.toEqual(b);
    expect(decryptField(a, key)).toBe('same');
    expect(decryptField(b, key)).toBe('same');
  });

  it('passes through legacy plaintext values', () => {
    expect(decryptField('not-encrypted', key)).toBe('not-encrypted');
    expect(isEncrypted('not-encrypted')).toBe(false);
  });

  it('fails to decrypt with the wrong key', () => {
    const token = encryptField('secret', key);
    expect(() => decryptField(token, 'wrong-key')).toThrow();
  });
});
