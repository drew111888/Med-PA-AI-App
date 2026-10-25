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
];
