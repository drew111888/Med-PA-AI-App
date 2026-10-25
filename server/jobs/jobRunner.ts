/**
 * Job runner — durable queue over the `jobs` table.
 *
 * Supports:
 *   - on-demand `process_denial` jobs (staff point at a denial),
 *   - scheduled `poll_denials` jobs that discover new denials via EHRPort and
 *     enqueue a process_denial job per new denial.
 *
 * Idempotency: process_denial jobs carry an idempotency key (the denial id) and
 * the unique index on jobs.idempotency_key prevents duplicate enqueues; the
 * orchestrator additionally refuses to reprocess a denial that already has a
 * case. Failed jobs are retried up to maxAttempts, then surfaced as 'failed'.
 */

import type { Db } from '../db/index.ts';
import type { OrchestratorDeps } from '../pipeline/orchestrator.ts';
import { processDenial } from '../pipeline/orchestrator.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';

export type JobType = 'process_denial' | 'poll_denials';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface JobRow {
  id: string;
  type: JobType;
  payload: any;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunnerOptions {
  maxAttempts?: number;
}

export class JobRunner {
  private readonly maxAttempts: number;

  constructor(
    private readonly db: Db,
    private readonly deps: OrchestratorDeps,
    private readonly audit: AuditRepository,
    options: JobRunnerOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  /** Enqueue a job. Returns the job id, or an existing id if idempotent-deduped. */
  enqueue(type: JobType, payload: unknown, idempotencyKey?: string): string {
    if (idempotencyKey) {
      const existing = this.db
        .prepare('SELECT id FROM jobs WHERE idempotency_key = ?')
        .get(idempotencyKey) as any;
      if (existing) return existing.id;
    }
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO jobs (id, type, payload, status, attempts, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)`,
      )
      .run(id, type, JSON.stringify(payload), idempotencyKey ?? null, now, now);
    return id;
  }

  /** Enqueue an on-demand denial processing job (idempotent on denial id). */
  enqueueProcessDenial(denial: unknown, denialId: string): string {
    return this.enqueue('process_denial', { denial }, `denial:${denialId}`);
  }

  getJob(id: string): JobRow | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  listJobs(status?: JobStatus): JobRow[] {
    const rows = status
      ? (this.db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC').all(status) as any[])
      : (this.db.prepare('SELECT * FROM jobs ORDER BY created_at ASC').all() as any[]);
    return rows.map((r) => this.mapRow(r));
  }

  /** Process all queued jobs once (drains the queue). Returns processed count. */
  async drain(): Promise<number> {
    let processed = 0;
    // Re-query each loop because poll jobs enqueue new process jobs.
    // Guard against infinite loops with a hard cap.
    for (let guard = 0; guard < 10_000; guard++) {
      const next = this.db
        .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
        .get() as any;
      if (!next) break;
      await this.runOne(this.mapRow(next));
      processed++;
    }
    return processed;
  }

  private async runOne(job: JobRow): Promise<void> {
    this.setStatus(job.id, 'running', job.attempts + 1);
    try {
      if (job.type === 'process_denial') {
        await processDenial(this.deps, job.payload.denial);
      } else if (job.type === 'poll_denials') {
        await this.handlePoll(job);
      }
      this.setStatus(job.id, 'done', job.attempts + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      if (attempts < this.maxAttempts) {
        this.setStatus(job.id, 'queued', attempts, message); // retry
      } else {
        this.setStatus(job.id, 'failed', attempts, message);
        this.audit.log({
          caseId: null,
          actor: 'system',
          action: 'job_failed',
          detail: `${job.type}: ${message}`,
        });
      }
    }
  }

  private async handlePoll(job: JobRow): Promise<void> {
    const since: string | undefined = job.payload?.since;
    const denials = await this.deps.ehr.discoverDenials(since);
    for (const denial of denials) {
      this.enqueueProcessDenial(denial, denial.id);
    }
    this.audit.log({
      caseId: null,
      actor: 'system',
      action: 'poll',
      detail: `discovered ${denials.length} denials`,
    });
  }

  private setStatus(id: string, status: JobStatus, attempts: number, lastError?: string): void {
    this.db
      .prepare('UPDATE jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?')
      .run(status, attempts, lastError ?? null, new Date().toISOString(), id);
  }

  private mapRow(row: any): JobRow {
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
