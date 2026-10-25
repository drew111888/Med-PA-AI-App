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

describe('c11 pre-hardening upgrade (populated DB)', () => {
  /**
   * Build a synthetic DB that mirrors the PARENT commit's pre-hardening state:
   * schema produced by migrations 0001+0002 only (denials.denial_date NOT NULL,
   * appeal_cases without the 0003 hardening columns), populated with real rows
   * including appeal_cases that FK into denials, legacy classification JSON
   * WITHOUT a deadlineStatus key, and a legacy 'submitted' row. Everything is
   * constructed in-memory with raw SQL — no committed binary fixture.
   */
  const buildC11Db = () => {
    const db = openRawDb();
    // Pre-hardening schema (0001 + 0002 only).
    db.exec(`
      CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE patients (
        id TEXT PRIMARY KEY, mrn_enc TEXT NOT NULL, name_enc TEXT NOT NULL,
        dob_enc TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE claims (
        id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, carrier TEXT NOT NULL,
        cpt_codes TEXT NOT NULL, date_of_service TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
      );
      CREATE TABLE denials (
        id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, source TEXT NOT NULL,
        carrier TEXT NOT NULL, carc_codes TEXT NOT NULL, rarc_codes TEXT NOT NULL,
        denial_date TEXT NOT NULL,              -- pre-hardening: NOT NULL
        raw_text_enc TEXT, external_ref TEXT, created_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );
      CREATE UNIQUE INDEX idx_denials_external_ref ON denials(external_ref) WHERE external_ref IS NOT NULL;
      CREATE TABLE appeal_cases (
        id TEXT PRIMARY KEY, denial_id TEXT NOT NULL, state TEXT NOT NULL,
        classification TEXT, gate_decision TEXT, packet TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (denial_id) REFERENCES denials(id)
      );
      CREATE UNIQUE INDEX idx_appeal_cases_denial ON appeal_cases(denial_id);
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, case_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
        detail TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, idempotency_key TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
    `);
    // Mark 0001/0002 as already applied so runMigrations applies 0003+ only.
    const markApplied = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
    markApplied.run('0001_init', '2024-01-01T00:00:00.000Z');
    markApplied.run('0002_core_entities', '2024-01-01T00:00:00.000Z');

    const now = '2024-02-01T00:00:00.000Z';
    db.prepare(
      'INSERT INTO patients (id, mrn_enc, name_enc, dob_enc, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('pat_1', 'enc-mrn', 'enc-name', null, now);
    db.prepare(
      'INSERT INTO claims (id, patient_id, carrier, cpt_codes, date_of_service, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('clm_1', 'pat_1', 'Anthem', '["99213"]', '2024-01-10', now);

    const insertDenial = db.prepare(
      `INSERT INTO denials (id, claim_id, source, carrier, carc_codes, rarc_codes, denial_date, raw_text_enc, external_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertDenial.run('den_1', 'clm_1', 'api', 'Anthem', '["50"]', '[]', '2024-01-15', null, 'ext-1', now);
    insertDenial.run('den_2', 'clm_1', 'api', 'Anthem', '["197"]', '[]', '2024-01-20', null, 'ext-2', now);

    const insertCase = db.prepare(
      `INSERT INTO appeal_cases (id, denial_id, state, classification, gate_decision, packet, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Legacy classification JSON missing deadlineStatus, WITH an appealDeadline.
    insertCase.run(
      'case_1',
      'den_1',
      'classified',
      JSON.stringify({ category: 'medical_necessity', appealable: true, appealDeadline: '2024-03-15' }),
      null,
      null,
      now,
      now,
    );
    // Legacy classification JSON missing deadlineStatus, WITHOUT an appealDeadline.
    insertCase.run(
      'case_2',
      'den_2',
      'submitted', // legacy 'submitted' with no receipt evidence
      JSON.stringify({ category: 'authorization', appealable: true, appealDeadline: null }),
      null,
      null,
      now,
      now,
    );
    return db;
  };

  it('upgrades a populated c11 DB losing no rows and passing foreign_key_check', () => {
    const db = buildC11Db();
    const denialsBefore = (db.prepare('SELECT COUNT(*) c FROM denials').get() as any).c;
    const casesBefore = (db.prepare('SELECT COUNT(*) c FROM appeal_cases').get() as any).c;

    const applied = runMigrations(db);
    expect(applied).toContain('0003_hardening');
    expect(applied).toContain('0004_nullable_denial_date');
    expect(applied).toContain('0005_backfill_semantics');

    // No data lost.
    expect((db.prepare('SELECT COUNT(*) c FROM denials').get() as any).c).toBe(denialsBefore);
    expect((db.prepare('SELECT COUNT(*) c FROM appeal_cases').get() as any).c).toBe(casesBefore);

    // Referential integrity intact.
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // denial_date is now nullable on the rebuilt table.
    const denialDateCol = (db.prepare("PRAGMA table_info('denials')").all() as any[]).find(
      (c) => c.name === 'denial_date',
    );
    expect(denialDateCol.notnull).toBe(0);

    // 0005 backfilled deadlineStatus without fabricating anything.
    const c1 = JSON.parse(
      (db.prepare('SELECT classification FROM appeal_cases WHERE id = ?').get('case_1') as any).classification,
    );
    expect(c1.deadlineStatus).toBe('calculated');
    const c2 = JSON.parse(
      (db.prepare('SELECT classification FROM appeal_cases WHERE id = ?').get('case_2') as any).classification,
    );
    expect(c2.deadlineStatus).toBe('unknown_missing_date');

    // Legacy 'submitted' row with no receipt was demoted, not left claiming submission.
    const c2State = (db.prepare('SELECT state FROM appeal_cases WHERE id = ?').get('case_2') as any).state;
    expect(c2State).toBe('handoff_generated');

    db.close();
  });

  it('is idempotent on the upgraded c11 DB', () => {
    const db = buildC11Db();
    runMigrations(db);
    expect(runMigrations(db)).toEqual([]);
    // deadlineStatus not double-processed / FK still intact.
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
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
