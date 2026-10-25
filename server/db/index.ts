/**
 * Embedded SQLite database connection + migration runner.
 *
 * Uses Node's built-in `node:sqlite` (DatabaseSync) — embedded, synchronous, no
 * external service and no native build step — so the whole system runs on one
 * local machine. PHI-bearing columns are encrypted at the application layer
 * (see crypto.ts) before they reach this file.
 *
 * A thin `Db` wrapper normalizes the driver surface (prepare/exec/transaction)
 * so the rest of the codebase does not depend on a specific SQLite package.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.ts';
import { MIGRATIONS, runBackfill0005 } from './migrations.ts';

// Load node:sqlite via runtime require so the bundler/test transformer never
// tries to resolve the built-in specifier. `node:sqlite` is shipped with Node.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = InstanceType<typeof DatabaseSync>;

export interface Statement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
}

export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): T;
  close(): void;
}

const wrap = (raw: DatabaseSync): Db => ({
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => raw.prepare(sql) as unknown as Statement,
  transaction<T>(fn: () => T): T {
    raw.exec('BEGIN');
    try {
      const result = fn();
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  },
  close: () => raw.close(),
});

let singleton: Db | null = null;

const ensureDbDirectory = (dbPath: string): void => {
  if (dbPath === ':memory:') return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const runMigrations = (db: Db): string[] => {
  // The first migration creates schema_migrations itself.
  db.exec(MIGRATIONS[0].sql);
  const applied = new Set<string>(
    db.prepare('SELECT id FROM schema_migrations').all().map((r: any) => r.id as string),
  );
  const newlyApplied: string[] = [];
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  // The 0004 rebuild DROPs/RENAMEs `denials` while `appeal_cases` holds an
  // immediate FK to it. This is exactly the SQLite "safe table alter" case
  // (sqlite.org/lang_altertable.html §7): FK enforcement must be disabled for
  // the drop/rename, and integrity re-checked with foreign_key_check afterward.
  // Two pragmas, both of which can ONLY change outside an active transaction:
  //   - foreign_keys=OFF   so DROP TABLE denials does not trip the inbound FK
  //                        from appeal_cases, and
  //   - legacy_alter_table=ON  so the RENAME does not rewrite appeal_cases' FK
  //                        text to "denials_new" (it stays pointing at
  //                        "denials").
  // We then run PRAGMA foreign_key_check INSIDE the transaction and throw on
  // any orphan, forcing ROLLBACK, so a populated DB can never be left broken.
  // The original pragma values are restored in finally.
  db.exec('PRAGMA legacy_alter_table = ON;');
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.transaction(() => {
      for (const migration of MIGRATIONS) {
        if (applied.has(migration.id)) continue;
        if (migration.sql.trim().length > 0) db.exec(migration.sql);
        // Data-dependent backfill for the semantic migration.
        if (migration.id === '0005_backfill_semantics') runBackfill0005(db);
        insert.run(migration.id, new Date().toISOString());
        newlyApplied.push(migration.id);
      }

      // Integrity gate: if any FK is now dangling, abort the whole upgrade.
      if (newlyApplied.length > 0) {
        const violations = db.prepare('PRAGMA foreign_key_check').all();
        if (violations.length > 0) {
          throw new Error(
            `Migration aborted: foreign_key_check found ${violations.length} violation(s)`,
          );
        }
      }
    });
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF;');
    db.exec('PRAGMA foreign_keys = ON;');
  }
  return newlyApplied;
};

export interface OpenDbOptions {
  /** Force a brand-new connection instead of the shared singleton (tests). */
  fresh?: boolean;
}

export const openDb = (config: AppConfig, options: OpenDbOptions = {}): Db => {
  if (singleton && !options.fresh) return singleton;

  ensureDbDirectory(config.dbPath);
  const raw = new DatabaseSync(config.dbPath);
  const db = wrap(raw);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);

  if (!options.fresh) singleton = db;
  return db;
};

/** Open a raw in-memory Db wrapper WITHOUT running migrations (tests). */
export const openRawDb = (): Db => {
  const db = wrap(new DatabaseSync(':memory:'));
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
};

/** Open an in-memory database for tests, with migrations applied. */
export const openTestDb = (): Db => {
  const db = openRawDb();
  runMigrations(db);
  return db;
};

/** Returns true if the DB connection is open and the schema is present. */
export const checkDbHealth = (db: Db): boolean => {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get();
    return Boolean(row);
  } catch {
    return false;
  }
};

export const closeDb = (): void => {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
};
