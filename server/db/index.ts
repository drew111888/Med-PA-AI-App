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
import { MIGRATIONS } from './migrations.ts';

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

  db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      db.exec(migration.sql);
      insert.run(migration.id, new Date().toISOString());
      newlyApplied.push(migration.id);
    }
  });
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
