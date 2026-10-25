/**
 * Durable audit trail. Every pipeline step and human action is recorded here.
 * Replaces the browser localStorage audit log.
 */

import type { Db } from '../db/index.ts';

export interface AuditEntry {
  id: string;
  caseId: string | null;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export class AuditRepository {
  constructor(private readonly db: Db) {}

  log(entry: Omit<AuditEntry, 'id' | 'createdAt'>): AuditEntry {
    const row: AuditEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    this.db
      .prepare(
        'INSERT INTO audit_log (id, case_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(row.id, row.caseId, row.actor, row.action, row.detail, row.createdAt);
    return row;
  }

  forCase(caseId: string): AuditEntry[] {
    return this.db
      .prepare('SELECT id, case_id as caseId, actor, action, detail, created_at as createdAt FROM audit_log WHERE case_id = ? ORDER BY created_at ASC')
      .all(caseId) as AuditEntry[];
  }

  all(): AuditEntry[] {
    return this.db
      .prepare('SELECT id, case_id as caseId, actor, action, detail, created_at as createdAt FROM audit_log ORDER BY created_at ASC')
      .all() as AuditEntry[];
  }
}
