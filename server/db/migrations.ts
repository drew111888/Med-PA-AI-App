/**
 * Ordered, idempotent database migrations.
 *
 * Each migration has a unique id and SQL. Applied in order; already-applied
 * migrations are skipped via the schema_migrations table. Keep migrations
 * append-only — never edit a shipped migration, add a new one.
 */

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '0001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `,
  },
  {
    id: '0002_core_entities',
    sql: `
      -- Patients. Identifying fields are stored encrypted (enc:v1:...).
      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        mrn_enc TEXT NOT NULL,
        name_enc TEXT NOT NULL,
        dob_enc TEXT,
        created_at TEXT NOT NULL
      );

      -- Claims tie a patient to billed services.
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        carrier TEXT NOT NULL,
        cpt_codes TEXT NOT NULL,          -- JSON array
        date_of_service TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
      );

      -- Denials normalized from API or PDF. CARC/RARC codes are the key.
      CREATE TABLE IF NOT EXISTS denials (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        source TEXT NOT NULL,             -- 'api' | 'pdf'
        carrier TEXT NOT NULL,
        carc_codes TEXT NOT NULL,         -- JSON array
        rarc_codes TEXT NOT NULL,         -- JSON array
        denial_date TEXT NOT NULL,
        raw_text_enc TEXT,                -- original denial narrative (PHI)
        external_ref TEXT,                -- idempotency key from source system
        created_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_denials_external_ref
        ON denials(external_ref) WHERE external_ref IS NOT NULL;

      -- Appeal cases track a denial through the pipeline to an appeal packet.
      CREATE TABLE IF NOT EXISTS appeal_cases (
        id TEXT PRIMARY KEY,
        denial_id TEXT NOT NULL,
        state TEXT NOT NULL,              -- lifecycle state
        classification TEXT,              -- JSON classifier output
        gate_decision TEXT,              -- JSON gate output
        packet TEXT,                     -- JSON appeal packet (letter PHI handled in app layer)
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (denial_id) REFERENCES denials(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_appeal_cases_denial
        ON appeal_cases(denial_id);

      -- Durable audit trail of every pipeline step and human action.
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        case_id TEXT,
        actor TEXT NOT NULL,             -- 'system' or a user id
        action TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );

      -- Background jobs for the pipeline (on-demand + scheduled).
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,              -- 'process_denial' | 'poll_denials'
        payload TEXT NOT NULL,           -- JSON
        status TEXT NOT NULL,            -- 'queued' | 'running' | 'done' | 'failed'
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        idempotency_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency
        ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
    `,
  },
  {
    id: '0003_hardening',
    sql: `
      -- Users for server-side authentication/authorization. Password is a
      -- salted scrypt hash; never plaintext. Role drives permissions.
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,              -- 'ADMIN' | 'PROVIDER' | 'BILLER'
        password_hash TEXT NOT NULL,     -- scrypt: salt:hash (hex)
        created_at TEXT NOT NULL
      );

      -- Opaque bearer sessions. The audit actor is derived from here, never
      -- from a client-supplied name.
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,     -- sha256 of the bearer token
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Packet versioning: a case's current packet version and content hash.
      -- Editing evidence/draft bumps the version and invalidates prior approval.
      ALTER TABLE appeal_cases ADD COLUMN packet_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE appeal_cases ADD COLUMN packet_hash TEXT;

      -- Approval bound to a specific packet version. A stale approval (version
      -- mismatch) is rejected downstream.
      ALTER TABLE appeal_cases ADD COLUMN approved_version INTEGER;
      ALTER TABLE appeal_cases ADD COLUMN approved_by TEXT;
      ALTER TABLE appeal_cases ADD COLUMN approved_at TEXT;

      -- Handoff artifact (encrypted) and the version it was generated from.
      ALTER TABLE appeal_cases ADD COLUMN handoff_enc TEXT;
      ALTER TABLE appeal_cases ADD COLUMN handoff_version INTEGER;
      ALTER TABLE appeal_cases ADD COLUMN handoff_generated_at TEXT;

      -- Submission receipt (human-recorded). Only this marks a case 'submitted'.
      ALTER TABLE appeal_cases ADD COLUMN submission_receipt_enc TEXT;
      ALTER TABLE appeal_cases ADD COLUMN submitted_by TEXT;
      ALTER TABLE appeal_cases ADD COLUMN submitted_at TEXT;

      -- Encrypt job payloads at rest (they can contain denial narrative PHI).
      -- New encrypted column; legacy plaintext 'payload' tolerated on read.
      ALTER TABLE jobs ADD COLUMN payload_enc TEXT;

      -- Encrypt audit detail at rest (may contain citation snippets / PHI).
      ALTER TABLE audit_log ADD COLUMN detail_enc TEXT;
    `,
  },
  {
    id: '0004_nullable_denial_date',
    sql: `
      -- denial_date must be NULLABLE: we never fabricate a date, so a denial
      -- whose source omitted it is stored with NULL. SQLite cannot drop a
      -- NOT NULL constraint in place, so we rebuild the table using the
      -- documented SQLite "safe table alter" sequence
      -- (ref sqlite.org/lang_altertable.html §12 and lang_droptable.html):
      -- create the replacement, copy rows, DROP the old table, RENAME the new
      -- one into place, then recreate indexes.
      --
      -- WHY THIS IS SAFE ON A POPULATED DB WITH foreign_keys=ON:
      -- appeal_cases.denial_id holds an immediate FK to denials. Dropping and
      -- renaming denials would normally (a) trip an immediate FK check on DROP
      -- and (b) rewrite appeal_cases' FK text to point at "denials_new" during
      -- RENAME. runMigrations() mitigates both by wrapping this migration in a
      -- transaction with PRAGMA legacy_alter_table=ON (so RENAME does NOT
      -- rewrite child FK references, leaving them pointing at "denials"), and
      -- by running PRAGMA foreign_key_check after all pending migrations and
      -- rolling back if any orphan is found. Because denials_new is populated
      -- from denials with identical ids BEFORE the drop/rename, every
      -- appeal_cases.denial_id still resolves and foreign_key_check passes on
      -- both empty and populated databases.
      CREATE TABLE denials_new (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        source TEXT NOT NULL,
        carrier TEXT NOT NULL,
        carc_codes TEXT NOT NULL,
        rarc_codes TEXT NOT NULL,
        denial_date TEXT,                 -- now nullable
        raw_text_enc TEXT,
        external_ref TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );
      INSERT INTO denials_new SELECT id, claim_id, source, carrier, carc_codes,
        rarc_codes, denial_date, raw_text_enc, external_ref, created_at FROM denials;
      DROP TABLE denials;
      ALTER TABLE denials_new RENAME TO denials;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_denials_external_ref
        ON denials(external_ref) WHERE external_ref IS NOT NULL;
    `,
  },
  {
    id: '0005_backfill_semantics',
    // Data-dependent backfill is implemented in TS (runBackfill0005, invoked by
    // runMigrations inside the gated transaction) because it has to read and
    // rewrite per-row classification JSON. The SQL here is intentionally empty:
    // the migration's effect is the TS backfill, and recording its id in
    // schema_migrations keeps it idempotent (a second run skips it entirely).
    sql: '',
  },
];

/**
 * Semantic backfill for migration 0005. Idempotent and safe to run inside the
 * migration transaction. Two concerns:
 *
 *  1. Legacy appeal_cases rows whose classification JSON predates the
 *     deadlineStatus field: derive it WITHOUT fabricating anything — a deadline
 *     is only "calculated" when the row already carries an appealDeadline;
 *     otherwise it is "unknown_missing_date" (the date is the input we never
 *     invent). We only add the key when it is absent, so re-running is a no-op.
 *
 *  2. Legacy rows marked 'submitted' with NO submission receipt evidence
 *     (submission_receipt_enc IS NULL): generating a handoff is not submission,
 *     and we must not fabricate a receipt. Demote them to 'handoff_generated',
 *     a defined state that keeps deadline urgency open until a human records a
 *     real receipt. Rows that DO carry a receipt are left untouched.
 *
 * Uses the raw statement surface available on Db (prepare/all/run). The
 * submission_receipt_enc column exists because 0003 ran earlier in the same
 * pending-migration batch (or was already applied).
 */
export const runBackfill0005 = (db: {
  prepare(sql: string): { all(...p: unknown[]): any[]; run(...p: unknown[]): unknown };
}): void => {
  // 1. Backfill deadlineStatus into legacy classification JSON.
  const rows = db
    .prepare('SELECT id, classification FROM appeal_cases WHERE classification IS NOT NULL')
    .all() as Array<{ id: string; classification: string }>;
  const updateClassification = db.prepare(
    'UPDATE appeal_cases SET classification = ? WHERE id = ?',
  );
  for (const row of rows) {
    let parsed: any;
    try {
      parsed = JSON.parse(row.classification);
    } catch {
      continue; // leave unparseable legacy JSON alone
    }
    if (parsed && typeof parsed === 'object' && parsed.deadlineStatus === undefined) {
      parsed.deadlineStatus = parsed.appealDeadline ? 'calculated' : 'unknown_missing_date';
      updateClassification.run(JSON.stringify(parsed), row.id);
    }
  }

  // 2. Demote legacy 'submitted' rows that have no recorded receipt. Generating
  //    a handoff is not submission; we never fabricate a receipt.
  db.prepare(
    `UPDATE appeal_cases
       SET state = 'handoff_generated'
     WHERE state = 'submitted' AND submission_receipt_enc IS NULL`,
  ).run();
};
