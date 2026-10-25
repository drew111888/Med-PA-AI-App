import { describe, it, expect } from 'vitest';
import { evaluateGates } from './gateEngine.ts';
import { classifyDenial } from './classifier.ts';
import { detectEvidence } from './evidenceDetectors.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import { PAYER_POLICIES } from '../adapters/synthetic/fixtures.ts';
import type { Denial } from '../domain/types.ts';

const ehr = new SyntheticEhrAdapter();
const payerPolicy = new SyntheticPayerPolicyAdapter();

const lumbarPolicy = PAYER_POLICIES.find((p) => p.id === 'pol_001')!;
const kneePolicy = PAYER_POLICIES.find((p) => p.id === 'pol_003')!;

const denial = (over: Partial<Denial>): Denial => ({
  id: 'd',
  claimId: 'c',
  source: 'api',
  carrier: 'Anthem',
  carcCodes: ['50'],
  rarcCodes: [],
  denialDate: '2026-10-01',
  ...over,
});

describe('evidence detectors', () => {
  it('detects conservative management failure in patient 001 chart', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    const finding = detectEvidence('conservative_management_failed', chart);
    expect(finding.present).toBe(true);
    expect(finding.citations.length).toBeGreaterThan(0);
  });

  it('detects radicular findings in patient 001 chart', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    expect(detectEvidence('radicular_or_neuro_deficit', chart).present).toBe(true);
  });

  it('does not detect meniscal tear in sparse patient 003 chart', async () => {
    const chart = await ehr.getChartDocuments('pat_003');
    expect(detectEvidence('mri_meniscal_tear', chart).present).toBe(false);
  });

  it('returns absent for unknown evidence key', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    expect(detectEvidence('no_such_key', chart).present).toBe(false);
  });
});

describe('gate engine', () => {
  it('appeal_ready when all required evidence present (patient 001 lumbar MRI)', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    const classification = classifyDenial(denial({ carcCodes: ['50'] }), lumbarPolicy);
    const result = evaluateGates(classification, lumbarPolicy, chart);
    expect(result.decision).toBe('appeal_ready');
    expect(result.deficits).toHaveLength(0);
    expect(result.satisfied.length).toBe(2);
  });

  it('needs_more_data when required evidence missing (patient 003 knee)', async () => {
    const chart = await ehr.getChartDocuments('pat_003');
    const classification = classifyDenial(denial({ carcCodes: ['16', '17'] }), kneePolicy);
    const result = evaluateGates(classification, kneePolicy, chart);
    expect(result.decision).toBe('needs_more_data');
    expect(result.deficits.length).toBeGreaterThan(0);
    // Both knee requirements are unmet in the sparse chart.
    expect(result.deficits.map((d) => d.evidenceKey)).toContain('mri_meniscal_tear');
  });

  it('ineligible when the denial is not appealable', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    const classification = classifyDenial(denial({ carcCodes: ['18'] }), lumbarPolicy);
    const result = evaluateGates(classification, lumbarPolicy, chart);
    expect(result.decision).toBe('ineligible');
  });

  it('needs_more_data when no governing policy resolved', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    const classification = classifyDenial(denial({ carcCodes: ['50'] }), null);
    const result = evaluateGates(classification, null, chart);
    expect(result.decision).toBe('needs_more_data');
  });

  it('itemizes satisfied vs missing with citations', async () => {
    const chart = await ehr.getChartDocuments('pat_001');
    const classification = classifyDenial(denial({ carcCodes: ['50'] }), lumbarPolicy);
    const result = evaluateGates(classification, lumbarPolicy, chart);
    expect(result.checks).toHaveLength(2);
    for (const check of result.checks) {
      expect(check.satisfied).toBe(true);
      expect(check.citations.length).toBeGreaterThan(0);
    }
  });
});
