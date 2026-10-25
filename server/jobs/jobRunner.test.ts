import { describe, it, expect } from 'vitest';
import { openTestDb } from '../db/index.ts';
import { JobRunner } from './jobRunner.ts';
import { CaseRepository } from '../repositories/caseRepository.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import { LocalAiProvider } from '../ai/localProvider.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import type { OrchestratorDeps } from '../pipeline/orchestrator.ts';
import { DENIALS } from '../adapters/synthetic/fixtures.ts';

const KEY = 'test-enc-key';

const makeDeps = (db = openTestDb()): { deps: OrchestratorDeps; audit: AuditRepository; db: typeof db } => {
  const cases = new CaseRepository(db, KEY);
  const audit = new AuditRepository(db, KEY);
  const deps: OrchestratorDeps = {
    ehr: new SyntheticEhrAdapter(),
    payerPolicy: new SyntheticPayerPolicyAdapter(),
    ai: new DeidentifyingProvider(new LocalAiProvider()),
    cases,
    audit,
  };
  return { deps, audit, db };
};

describe('on-demand process_denial', () => {
  it('produces a packet for an appeal-ready denial', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const medNecessity = DENIALS.find((d) => d.id === 'den_001')!; // CARC 50, pat_001 ready

    const jobId = runner.enqueueProcessDenial(medNecessity, medNecessity.id);
    await runner.drain();

    expect(runner.getJob(jobId)?.status).toBe('done');
    const case_ = deps.cases.getCaseByDenial('den_001');
    expect(case_?.state).toBe('packet_ready');
    expect(case_?.packet?.evidence.length).toBeGreaterThan(0);
    db.close();
  });

  it('stops at gate for a needs-more-data denial (no packet)', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const missingInfo = DENIALS.find((d) => d.id === 'den_003')!; // knee, sparse chart

    runner.enqueueProcessDenial(missingInfo, missingInfo.id);
    await runner.drain();

    const case_ = deps.cases.getCaseByDenial('den_003');
    expect(case_?.state).toBe('needs_more_data');
    expect(case_?.gate?.decision).toBe('needs_more_data');
    expect(case_?.packet).toBeNull();
    db.close();
  });
});

describe('idempotency', () => {
  it('dedupes enqueue on denial id', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const d = DENIALS[0];
    const a = runner.enqueueProcessDenial(d, d.id);
    const b = runner.enqueueProcessDenial(d, d.id);
    expect(a).toBe(b);
    expect(runner.listJobs().length).toBe(1);
    db.close();
  });

  it('does not reprocess a denial that already has a case', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const d = DENIALS[0];
    runner.enqueueProcessDenial(d, d.id);
    await runner.drain();
    // enqueue again under a different idempotency key -> orchestrator still no-ops
    const jobId = runner.enqueue('process_denial', { denial: d }, 'different-key');
    await runner.drain();
    expect(runner.getJob(jobId)?.status).toBe('done');
    // still only one case
    expect(deps.cases.listCases().filter((c) => c.denialId === d.id).length).toBe(1);
    db.close();
  });
});

describe('scheduled poll', () => {
  it('discovers denials and enqueues a process job each, producing cases', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);

    runner.enqueue('poll_denials', { since: undefined });
    const processed = await runner.drain();

    // 1 poll job + 3 discovered denial jobs = 4 processed
    expect(processed).toBe(1 + DENIALS.length);
    const cases = deps.cases.listCases();
    expect(cases.length).toBe(DENIALS.length);
    db.close();
  });
});

describe('retry + failure surfacing', () => {
  it('retries then marks a job failed after maxAttempts', async () => {
    const { deps, audit, db } = makeDeps();
    // Force failure: EHR that always throws when fetching the claim.
    const brokenDeps: OrchestratorDeps = {
      ...deps,
      ehr: {
        name: 'broken',
        async getPatient() { return null; },
        async getClaim() { throw new Error('boom'); },
        async getChartDocuments() { return []; },
        async discoverDenials() { return []; },
      },
    };
    const runner = new JobRunner(db, brokenDeps, audit, KEY, { maxAttempts: 2 });
    const d = DENIALS[0];
    const jobId = runner.enqueue('process_denial', { denial: d }, `denial:${d.id}`);
    await runner.drain();

    const job = runner.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.attempts).toBe(2);
    expect(job?.lastError).toMatch(/boom/);
    const failures = audit.all().filter((a) => a.action === 'job_failed');
    expect(failures.length).toBeGreaterThan(0);
    db.close();
  });

  it('a retry repairs a previously failed case instead of reporting success', async () => {
    const { deps, audit, db } = makeDeps();
    // EHR that fails the first getClaim call, then succeeds (transient failure).
    const realEhr = new SyntheticEhrAdapter();
    let calls = 0;
    const flakyDeps: OrchestratorDeps = {
      ...deps,
      ehr: {
        name: 'flaky',
        getPatient: (id: string) => realEhr.getPatient(id),
        getClaim: (id: string) => {
          calls++;
          if (calls === 1) throw new Error('transient');
          return realEhr.getClaim(id);
        },
        getChartDocuments: (p: string, c?: string) => realEhr.getChartDocuments(p, c),
        discoverDenials: (s?: string) => realEhr.discoverDenials(s),
      },
    };
    const runner = new JobRunner(db, flakyDeps, audit, KEY, { maxAttempts: 3 });
    const d = DENIALS.find((x) => x.id === 'den_001')!;
    const jobId = runner.enqueueProcessDenial(d, d.id);
    await runner.drain();

    // First attempt failed; retry resumed and repaired the case to packet_ready.
    const job = runner.getJob(jobId);
    expect(job?.status).toBe('done');
    expect(job?.attempts).toBeGreaterThanOrEqual(2);
    expect(flakyDeps.cases.getCaseByDenial('den_001')?.state).toBe('packet_ready');
    db.close();
  });

  it('encrypts job payloads at rest', () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const d = DENIALS.find((x) => x.id === 'den_001')!; // has rawText PHI-ish narrative
    runner.enqueueProcessDenial(d, d.id);
    const raw = db.prepare('SELECT payload, payload_enc FROM jobs LIMIT 1').get() as any;
    expect(raw.payload_enc.startsWith('enc:v1:')).toBe(true);
    expect(raw.payload_enc).not.toContain('medically necessary');
    expect(raw.payload).toBe('');
    db.close();
  });

  it('recoverInterrupted requeues jobs stuck running and resumes them', async () => {
    const { deps, audit, db } = makeDeps();
    const runner = new JobRunner(db, deps, audit, KEY);
    const d = DENIALS.find((x) => x.id === 'den_001')!;
    const jobId = runner.enqueueProcessDenial(d, d.id);
    // Simulate a crash mid-run: force the job to 'running' and never finished.
    db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(jobId);

    const recovered = runner.recoverInterrupted();
    expect(recovered).toBe(1);
    expect(runner.getJob(jobId)?.status).toBe('queued');

    await runner.drain();
    expect(runner.getJob(jobId)?.status).toBe('done');
    expect(deps.cases.getCaseByDenial('den_001')?.state).toBe('packet_ready');
    db.close();
  });
});
