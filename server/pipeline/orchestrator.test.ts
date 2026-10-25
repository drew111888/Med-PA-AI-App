import { describe, it, expect } from 'vitest';
import { processDenial, isPacketComplete, type OrchestratorDeps } from './orchestrator.ts';
import { openTestDb } from '../db/index.ts';
import { CaseRepository } from '../repositories/caseRepository.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import { LocalAiProvider } from '../ai/localProvider.ts';
import type { AiProviderPort } from '../ports/aiProviderPort.ts';
import type { EHRPort } from '../ports/ehrPort.ts';
import type { Denial } from '../domain/types.ts';
import { DENIALS } from '../adapters/synthetic/fixtures.ts';

const KEY = 'k';

const makeDeps = (ai: AiProviderPort, db = openTestDb()): { deps: OrchestratorDeps; db: typeof db } => ({
  deps: {
    ehr: new SyntheticEhrAdapter(),
    payerPolicy: new SyntheticPayerPolicyAdapter(),
    ai,
    cases: new CaseRepository(db, KEY),
    audit: new AuditRepository(db, KEY),
  },
  db,
});

// A provider whose output deliberately fails deterministic validation (missing
// deadline + route) so the fail-closed path is exercised.
class BadProvider implements AiProviderPort {
  readonly name = 'bad';
  readonly isCloud = false;
  async complete() {
    return { text: 'This letter omits the deadline and route entirely.', provider: 'bad', model: 'bad' };
  }
}

describe('fail closed on AI validation (item 2)', () => {
  it('routes a validation-failed packet to needs_review, NOT packet_ready', async () => {
    const { deps, db } = makeDeps(new DeidentifyingProvider(new BadProvider()));
    const denial = DENIALS.find((d) => d.id === 'den_001')!; // appeal_ready gate
    const result = await processDenial(deps, denial);
    expect(result.state).toBe('needs_review');
    expect(result.packetReady).toBe(false);

    const c = deps.cases.getCaseByDenial('den_001');
    expect(c?.state).toBe('needs_review');
    expect(c?.packet?.aiValidationPassed).toBe(false);
    db.close();
  });
});

describe('retry resumes a failed case without a PRIMARY KEY violation (FEAT-002 Defect B)', () => {
  it('re-inserts a denial WITHOUT externalRef on retry and reaches a non-failed state', async () => {
    const db = openTestDb();
    const realEhr = new SyntheticEhrAdapter();
    // A denial WITHOUT externalRef (so insertDenial cannot early-return on the
    // external_ref dedupe and would hit the id PRIMARY KEY on the second insert).
    const denial: Denial = {
      id: 'den_noref',
      claimId: 'clm_001',
      source: 'api',
      carrier: 'Anthem',
      carcCodes: ['50'],
      rarcCodes: ['N115'],
      denialDate: '2026-10-01',
      rawText: 'Not medically necessary per policy.',
    };

    // getChartDocuments throws exactly once — AFTER the case + denial are created
    // (classify runs before chart gather), so the first run fails mid-flight.
    let chartCalls = 0;
    const flakyEhr: EHRPort = {
      name: 'flaky',
      getPatient: (id: string) => realEhr.getPatient(id),
      getClaim: (id: string) => realEhr.getClaim(id),
      getChartDocuments: (p: string, cId?: string) => {
        chartCalls++;
        if (chartCalls === 1) throw new Error('transient chart fetch failure');
        return realEhr.getChartDocuments(p, cId);
      },
      discoverDenials: (s?: string) => realEhr.discoverDenials(s),
    };

    const cases = new CaseRepository(db, KEY);
    const audit = new AuditRepository(db, KEY);
    const deps: OrchestratorDeps = {
      ehr: flakyEhr,
      payerPolicy: new SyntheticPayerPolicyAdapter(),
      ai: new DeidentifyingProvider(new LocalAiProvider()),
      cases,
      audit,
    };

    // First run fails after the case + denial exist.
    await expect(processDenial(deps, denial)).rejects.toThrow(/transient chart fetch/);
    expect(cases.getCaseByDenial('den_noref')?.state).toBe('failed');
    expect((db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_noref') as any).c).toBe(1);

    // Retry: insertDenial re-runs on the SAME id and must NOT throw a PK violation.
    const result = await processDenial(deps, denial);
    expect(result.state).not.toBe('failed');
    expect(cases.getCaseByDenial('den_noref')?.state).toBe('packet_ready');
    // Still exactly one denial row and one appeal_case row (no duplicates).
    expect((db.prepare('SELECT COUNT(*) c FROM denials WHERE id=?').get('den_noref') as any).c).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM appeal_cases WHERE denial_id=?').get('den_noref') as any).c).toBe(1);
    db.close();
  });
});

describe('isPacketComplete', () => {
  const base = {
    evidence: [{}],
    draftLetter: 'x'.repeat(50),
    appealDeadline: '2026-11-30',
    classification: { deadlineStatus: 'calculated' },
  };
  it('ok when evidence, draft, and a calculated deadline are present', () => {
    expect(isPacketComplete(base).ok).toBe(true);
  });
  it('flags empty draft', () => {
    expect(isPacketComplete({ ...base, draftLetter: '' }).issues).toContain('empty_draft');
  });
  it('flags no evidence', () => {
    expect(isPacketComplete({ ...base, evidence: [] }).issues).toContain('no_evidence');
  });
  it('flags unknown deadline', () => {
    expect(
      isPacketComplete({ ...base, appealDeadline: null, classification: { deadlineStatus: 'unknown_missing_date' } }).issues,
    ).toContain('deadline_unknown');
  });
});
