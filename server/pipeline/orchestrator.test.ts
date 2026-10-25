import { describe, it, expect } from 'vitest';
import { processDenial, isPacketComplete, type OrchestratorDeps } from './orchestrator.ts';
import { openTestDb } from '../db/index.ts';
import { CaseRepository } from '../repositories/caseRepository.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import type { AiProviderPort } from '../ports/aiProviderPort.ts';
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
