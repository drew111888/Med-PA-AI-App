/**
 * Durable audit trail. Every pipeline step and human action is recorded here.
 * Replaces the browser localStorage audit log.
 *
 * The `detail` field may contain citation snippets or other PHI-adjacent text,
 * so it is encrypted at rest (detail_enc). The legacy plaintext `detail` column
 * is retained for backward compatibility but new writes go to detail_enc only.
 * Actor is always a user id (or 'system'), never a client-supplied name.
 */

import type { Db } from '../db/index.ts';
import { encryptField, decryptField } from '../db/crypto.ts';

export interface AuditEntry {
  id: string;
  caseId: string | null;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export class AuditRepository {
  constructor(
    private readonly db: Db,
    private readonly encKey: string,
  ) {}

  log(entry: Omit<AuditEntry, 'id' | 'createdAt'>): AuditEntry {
    const row: AuditEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    this.db
      .prepare(
        'INSERT INTO audit_log (id, case_id, actor, action, detail, detail_enc, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
      )
      .run(
        row.id,
        row.caseId,
        row.actor,
        row.action,
        row.detail != null ? encryptField(row.detail, this.encKey) : null,
        row.createdAt,
      );
    return row;
  }

  private decode(row: any): AuditEntry {
    // Prefer encrypted detail; fall back to legacy plaintext column.
    const detail =
      row.detail_enc != null ? decryptField(row.detail_enc, this.encKey) : (row.detail ?? null);
    return {
      id: row.id,
      caseId: row.case_id,
      actor: row.actor,
      action: row.action,
      detail,
      createdAt: row.created_at,
    };
  }

  forCase(caseId: string): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_log WHERE case_id = ? ORDER BY created_at ASC')
      .all(caseId) as any[];
    return rows.map((r) => this.decode(r));
  }

  all(): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at ASC')
      .all() as any[];
    return rows.map((r) => this.decode(r));
  }
}
