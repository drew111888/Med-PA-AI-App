/**
 * Job runner — durable queue over the `jobs` table.
 *
 * Supports:
 *   - on-demand `process_denial` jobs,
 *   - scheduled `poll_denials` jobs that discover denials via EHRPort and
 *     enqueue a process_denial job per denial.
 *
 * Hardening:
 *   - Payloads are ENCRYPTED at rest (payload_enc); they can contain denial
 *     narrative PHI. Legacy plaintext payloads are tolerated on read.
 *   - Idempotency via unique idempotency_key; the orchestrator additionally
 *     resumes a failed/mid-flight case rather than reprocessing a completed one.
 *   - RETRY actually repairs: after processing, the job only succeeds if the
 *     case reached a non-failed state. A case left 'failed' fails the job so it
 *     retries, and surfaces after maxAttempts.
 *   - RESTART RECOVERY: recoverInterrupted() requeues jobs stuck in 'running'
 *     (a crash mid-execution) so they resume safely under idempotency.
 */

import type { Db } from '../db/index.ts';
import { encryptField, decryptField } from '../db/crypto.ts';
import type { OrchestratorDeps } from '../pipeline/orchestrator.ts';
import { processDenial } from '../pipeline/orchestrator.ts';
import type { AuditRepository } from '../repositories/auditRepository.ts';
import type { CaseRepository } from '../repositories/caseRepository.ts';

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
    private readonly encKey: string,
    options: JobRunnerOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  private get cases(): CaseRepository {
    return this.deps.cases;
  }

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
        `INSERT INTO jobs (id, type, payload, payload_enc, status, attempts, idempotency_key, created_at, updated_at)
         VALUES (?, ?, '', ?, 'queued', 0, ?, ?, ?)`,
      )
      .run(id, type, encryptField(JSON.stringify(payload), this.encKey), idempotencyKey ?? null, now, now);
    return id;
  }

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

  /**
   * Restart recovery: any job left 'running' when the process died is requeued
   * so it resumes. Safe because processing is idempotent (case-level resume).
   * Returns the number of jobs recovered.
   */
  recoverInterrupted(): number {
    const stuck = this.db.prepare("SELECT id FROM jobs WHERE status = 'running'").all() as any[];
    const now = new Date().toISOString();
    const update = this.db.prepare("UPDATE jobs SET status='queued', updated_at=? WHERE id=?");
    for (const row of stuck) update.run(now, row.id);
    if (stuck.length > 0) {
      this.audit.log({
        caseId: null,
        actor: 'system',
        action: 'job_recovery',
        detail: `requeued ${stuck.length} interrupted job(s)`,
      });
    }
    return stuck.length;
  }

  /** Process all queued jobs once (drains the queue). Returns processed count. */
  async drain(): Promise<number> {
    let processed = 0;
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
    const attempts = job.attempts + 1;
    try {
      if (job.type === 'process_denial') {
        const result = await processDenial(this.deps, job.payload.denial);
        // Retry correctness: a job is only 'done' if the case did NOT end failed.
        if (result.state === 'failed') {
          throw new Error(`case ${result.caseId} ended in failed state`);
        }
      } else if (job.type === 'poll_denials') {
        await this.handlePoll(job);
      }
      this.setStatus(job.id, 'done', attempts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempts < this.maxAttempts) {
        this.setStatus(job.id, 'queued', attempts, message); // retry/repair
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
    // last_error can carry PHI-adjacent detail; encrypt at rest when present.
    const lastErrorEnc = lastError != null ? encryptField(lastError, this.encKey) : null;
    this.db
      .prepare('UPDATE jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?')
      .run(status, attempts, lastErrorEnc, new Date().toISOString(), id);
  }

  private mapRow(row: any): JobRow {
    // Prefer encrypted payload; tolerate legacy plaintext.
    const payloadJson =
      row.payload_enc != null && row.payload_enc !== ''
        ? decryptField(row.payload_enc, this.encKey)
        : row.payload || '{}';
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(payloadJson),
      status: row.status,
      attempts: row.attempts,
      // Decrypt last_error; tolerate legacy plaintext via decryptField passthrough.
      lastError:
        row.last_error != null && row.last_error !== ''
          ? decryptField(row.last_error, this.encKey)
          : null,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
