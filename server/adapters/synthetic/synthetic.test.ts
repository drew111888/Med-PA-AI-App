import { describe, it, expect } from 'vitest';
import { SyntheticEhrAdapter } from './syntheticEhrAdapter.ts';
import { SyntheticPayerPolicyAdapter } from './syntheticPayerPolicyAdapter.ts';
import {
  PatientSchema,
  ClaimSchema,
  DenialSchema,
  ChartDocumentSchema,
  PayerPolicySchema,
} from '../../domain/types.ts';

describe('SyntheticEhrAdapter (EHRPort conformance)', () => {
  const ehr = new SyntheticEhrAdapter();

  it('discovers deterministic denials that validate against the schema', async () => {
    const denials = await ehr.discoverDenials();
    expect(denials.length).toBeGreaterThan(0);
    for (const d of denials) {
      expect(() => DenialSchema.parse(d)).not.toThrow();
    }
  });

  it('filters denials by watermark', async () => {
    const all = await ehr.discoverDenials();
    const recent = await ehr.discoverDenials('2026-10-06');
    expect(recent.length).toBeLessThan(all.length);
    expect(recent.every((d) => Date.parse(d.denialDate) >= Date.parse('2026-10-06'))).toBe(true);
  });

  it('returns a patient and validates it', async () => {
    const p = await ehr.getPatient('pat_001');
    expect(p).not.toBeNull();
    expect(() => PatientSchema.parse(p)).not.toThrow();
  });

  it('returns null for an unknown patient', async () => {
    expect(await ehr.getPatient('nope')).toBeNull();
  });

  it('returns a claim and validates it', async () => {
    const c = await ehr.getClaim('clm_001');
    expect(c).not.toBeNull();
    expect(() => ClaimSchema.parse(c)).not.toThrow();
  });

  it('returns chart documents scoped to the patient', async () => {
    const docs = await ehr.getChartDocuments('pat_001');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => d.patientId === 'pat_001')).toBe(true);
    for (const d of docs) expect(() => ChartDocumentSchema.parse(d)).not.toThrow();
  });
});

describe('SyntheticPayerPolicyAdapter (PayerPolicyPort conformance)', () => {
  const policy = new SyntheticPayerPolicyAdapter();

  it('resolves a policy by carrier + CPT and validates it', async () => {
    const p = await policy.getPolicy('Anthem', '72148');
    expect(p).not.toBeNull();
    expect(() => PayerPolicySchema.parse(p)).not.toThrow();
    expect(p!.appealWindowDays).toBeGreaterThan(0);
  });

  it('is case-insensitive on carrier', async () => {
    const p = await policy.getPolicy('anthem', '72148');
    expect(p).not.toBeNull();
  });

  it('returns null when no policy governs the CPT', async () => {
    expect(await policy.getPolicy('Anthem', '00000')).toBeNull();
  });

  it('lists policies for a carrier', async () => {
    const anthem = await policy.listPolicies('Anthem');
    expect(anthem.length).toBeGreaterThanOrEqual(2);
    expect(anthem.every((p) => p.carrier === 'Anthem')).toBe(true);
  });
});
