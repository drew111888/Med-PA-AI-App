import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { AuthUser } from '../auth/userRepository.ts';
import type { DemoRole } from './types.ts';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export interface SandboxRecord {
  id: string;
  generation: string;
  createdAt: number;
  expiresAt: number;
  lastSeen: number;
  active: number;
  polls: number;
}
export interface DemoTokenRecord {
  sandboxId: string;
  generation: string;
  userId: string;
  username: string;
  name: string;
  role: DemoRole;
}

/** A separate durable index. Raw bearer tokens, internal passwords, and chart data never enter it. */
export class DemoRegistry {
  private readonly db: InstanceType<typeof DatabaseSync>;

  constructor(readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(dataDir).isSymbolicLink()) throw new Error('Demo data directory must not be a symlink.');
    this.db = new DatabaseSync(path.join(dataDir, 'registry.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS demo_sandboxes (
        id TEXT PRIMARY KEY, generation TEXT NOT NULL, created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, active INTEGER NOT NULL,
        polls INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS demo_tokens (
        token_hash TEXT PRIMARY KEY, sandbox_id TEXT NOT NULL, generation TEXT NOT NULL,
        user_id TEXT NOT NULL, username TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_retries (
        sandbox_id TEXT NOT NULL, generation TEXT NOT NULL, case_id TEXT NOT NULL,
        attempts INTEGER NOT NULL, PRIMARY KEY(sandbox_id,generation,case_id)
      );
      CREATE TABLE IF NOT EXISTS demo_rates (
        rate_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL
      );
    `);
  }

  create(id: string, generation: string, now: number, ttlMs: number): SandboxRecord {
    this.db.prepare('INSERT INTO demo_sandboxes(id,generation,created_at,expires_at,last_seen,active,polls) VALUES(?,?,?,?,?,1,0)')
      .run(id, generation, now, now + ttlMs, now);
    return this.get(id)!;
  }

  get(id: string): SandboxRecord | null {
    const r = this.db.prepare('SELECT * FROM demo_sandboxes WHERE id=?').get(id) as any;
    return r ? { id: r.id, generation: r.generation, createdAt: r.created_at, expiresAt: r.expires_at, lastSeen: r.last_seen, active: r.active, polls: r.polls } : null;
  }

  all(): SandboxRecord[] {
    return (this.db.prepare('SELECT id FROM demo_sandboxes').all() as any[]).map(r => this.get(r.id)!);
  }

  touch(id: string, now: number): void {
    this.db.prepare('UPDATE demo_sandboxes SET last_seen=? WHERE id=? AND active=1').run(now, id);
  }

  revokeTokens(id: string): void {
    this.db.prepare('DELETE FROM demo_tokens WHERE sandbox_id=?').run(id);
  }

  invalidate(id: string): void {
    this.db.prepare('UPDATE demo_sandboxes SET active=0 WHERE id=?').run(id);
    this.revokeTokens(id);
  }

  /** Forget only a dead matching generation, after its owner closed all handles. */
  forget(id: string, generation: string): void {
    const current = this.get(id);
    if (!current || current.active || current.generation !== generation) return;
    this.db.prepare('DELETE FROM demo_tokens WHERE sandbox_id=? AND generation=?').run(id, generation);
    this.db.prepare('DELETE FROM demo_retries WHERE sandbox_id=? AND generation=?').run(id, generation);
    this.db.prepare('DELETE FROM demo_sandboxes WHERE id=? AND generation=? AND active=0').run(id, generation);
    // The registry is small and single-connection. Bound physical WAL retention,
    // not just logical rows, after the expired generation is gone.
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }

  reset(id: string, generation: string, now: number): SandboxRecord {
    this.revokeTokens(id);
    this.db.prepare('DELETE FROM demo_retries WHERE sandbox_id=?').run(id);
    this.db.prepare('UPDATE demo_sandboxes SET generation=?,last_seen=?,active=1,polls=0 WHERE id=?').run(generation, now, id);
    return this.get(id)!;
  }

  token(hash: string): DemoTokenRecord | null {
    const r = this.db.prepare('SELECT * FROM demo_tokens WHERE token_hash=?').get(hash) as any;
    return r ? { sandboxId: r.sandbox_id, generation: r.generation, userId: r.user_id, username: r.username, name: r.name, role: r.role } : null;
  }

  addToken(hash: string, record: SandboxRecord, user: AuthUser): void {
    this.db.prepare('INSERT INTO demo_tokens(token_hash,sandbox_id,generation,user_id,username,name,role) VALUES(?,?,?,?,?,?,?)')
      .run(hash, record.id, record.generation, user.id, user.username, user.name, user.role);
  }

  removeToken(hash: string): void {
    this.db.prepare('DELETE FROM demo_tokens WHERE token_hash=?').run(hash);
  }

  incrementPoll(id: string): void {
    this.db.prepare('UPDATE demo_sandboxes SET polls=polls+1 WHERE id=?').run(id);
  }

  retries(id: string, generation: string, caseId: string): number {
    const r = this.db.prepare('SELECT attempts FROM demo_retries WHERE sandbox_id=? AND generation=? AND case_id=?').get(id, generation, caseId) as any;
    return r?.attempts ?? 0;
  }

  incrementRetry(id: string, generation: string, caseId: string): void {
    this.db.prepare(`INSERT INTO demo_retries(sandbox_id,generation,case_id,attempts) VALUES(?,?,?,1)
      ON CONFLICT(sandbox_id,generation,case_id) DO UPDATE SET attempts=attempts+1`).run(id, generation, caseId);
  }

  /** Persistent fixed-window counters. Return retry delay, or zero when accepted. */
  rate(key: string, cap: number, windowMs: number, now: number): number {
    const hashed = crypto.createHash('sha256').update(key).digest('hex');
    const r = this.db.prepare('SELECT attempts,resets_at FROM demo_rates WHERE rate_key=?').get(hashed) as any;
    if (r && r.resets_at > now && r.attempts >= cap) return Math.max(1, Math.ceil((r.resets_at - now) / 1000));
    if (!r || r.resets_at <= now) {
      this.db.prepare('INSERT OR REPLACE INTO demo_rates(rate_key,attempts,resets_at) VALUES(?,1,?)').run(hashed, now + windowMs);
    } else {
      this.db.prepare('UPDATE demo_rates SET attempts=attempts+1 WHERE rate_key=?').run(hashed);
    }
    return 0;
  }

  cleanRates(now: number): void {
    this.db.prepare('DELETE FROM demo_rates WHERE resets_at<=?').run(now);
  }

  close(): void { this.db.close(); }
}
