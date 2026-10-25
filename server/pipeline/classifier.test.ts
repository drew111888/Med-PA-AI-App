import { describe, it, expect } from 'vitest';
import {
  classifyDenial,
  classifyWithPolicy,
  addDays,
  daysUntil,
  DEFAULT_APPEAL_WINDOW_DAYS,
} from './classifier.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import type { Denial, PayerPolicy, Claim } from '../domain/types.ts';

const denial = (carc: string[], over: Partial<Denial> = {}): Denial => ({
  id: 'd',
  claimId: 'c',
  source: 'api',
  carrier: 'Anthem',
  carcCodes: carc,
  rarcCodes: [],
  denialDate: '2026-10-01',
  ...over,
});

const policy = (over: Partial<PayerPolicy> = {}): PayerPolicy => ({
  id: 'pol',
  carrier: 'Anthem',
  cptCodes: ['72148'],
  title: 'Test Policy',
  appealWindowDays: 60,
  appealRoute: 'test_route',
  requirements: [],
  ...over,
});

describe('date math', () => {
  it('addDays adds calendar days in UTC', () => {
    expect(addDays('2026-10-01', 60)).toBe('2026-11-30');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('daysUntil returns positive before, negative after', () => {
    expect(daysUntil('2026-11-30', '2026-10-01')).toBe(60);
    expect(daysUntil('2026-10-01', '2026-10-10')).toBe(-9);
    expect(daysUntil('2026-10-01', '2026-10-01')).toBe(0);
  });

  it('addDays rejects invalid input', () => {
    expect(() => addDays('not-a-date', 1)).toThrow();
  });
});

describe('classifyDenial — table driven', () => {
  const cases: Array<{
    name: string;
    carc: string[];
    expectCategory: string;
    expectAppealable: boolean;
  }> = [
    { name: 'medical necessity (50)', carc: ['50'], expectCategory: 'medical_necessity', expectAppealable: true },
    { name: 'experimental (55)', carc: ['55'], expectCategory: 'medical_necessity', expectAppealable: true },
    { name: 'auth absent (197)', carc: ['197'], expectCategory: 'authorization', expectAppealable: true },
    { name: 'auth invalid (15)', carc: ['15'], expectCategory: 'authorization', expectAppealable: true },
    { name: 'missing info (16)', carc: ['16'], expectCategory: 'missing_information', expectAppealable: true },
    { name: 'insufficient info (17)', carc: ['17'], expectCategory: 'missing_information', expectAppealable: true },
    { name: 'missing info combo (16+17)', carc: ['16', '17'], expectCategory: 'missing_information', expectAppealable: true },
    { name: 'coding (11)', carc: ['11'], expectCategory: 'coding', expectAppealable: true },
    { name: 'COB (22)', carc: ['22'], expectCategory: 'coordination_of_benefits', expectAppealable: true },
    { name: 'duplicate (18) non-appealable', carc: ['18'], expectCategory: 'non_appealable', expectAppealable: false },
    { name: 'unknown code', carc: ['9999'], expectCategory: 'unknown', expectAppealable: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = classifyDenial(denial(c.carc), policy());
      expect(result.category).toBe(c.expectCategory);
      expect(result.appealable).toBe(c.expectAppealable);
    });
  }

  it('prioritizes medical necessity over missing info when both present', () => {
    const result = classifyDenial(denial(['16', '50']), policy());
    expect(result.category).toBe('medical_necessity');
  });

  it('non-appealable dominates even alongside appealable codes', () => {
    const result = classifyDenial(denial(['18', '50']), policy());
    expect(result.category).toBe('non_appealable');
    expect(result.appealable).toBe(false);
  });

  it('computes deadline from policy window', () => {
    const result = classifyDenial(denial(['50'], { denialDate: '2026-10-01' }), policy({ appealWindowDays: 60 }));
    expect(result.appealDeadline).toBe('2026-11-30');
    expect(result.appealRoute).toBe('test_route');
    expect(result.policyId).toBe('pol');
  });

  it('falls back to default window and null route with no policy', () => {
    const result = classifyDenial(denial(['50']), null);
    expect(result.appealWindowDays).toBe(DEFAULT_APPEAL_WINDOW_DAYS);
    expect(result.appealRoute).toBeNull();
    expect(result.policyId).toBeNull();
  });

  it('separates recognized from unrecognized codes', () => {
    const result = classifyDenial(denial(['50', '9999']), policy());
    expect(result.recognizedCodes).toEqual(['50']);
    expect(result.unrecognizedCodes).toEqual(['9999']);
  });
});

describe('classifyWithPolicy — port integration', () => {
  const payerPolicy = new SyntheticPayerPolicyAdapter();
  const claim: Claim = {
    id: 'clm_001',
    patientId: 'pat_001',
    carrier: 'Anthem',
    cptCodes: ['72148'],
    dateOfService: '2026-09-10',
  };

  it('resolves the Anthem lumbar MRI policy and classifies medical necessity', async () => {
    const result = await classifyWithPolicy(denial(['50']), claim, payerPolicy);
    expect(result.category).toBe('medical_necessity');
    expect(result.appealWindowDays).toBe(60);
    expect(result.appealRoute).toBe('anthem_medical_necessity_level1');
    expect(result.appealDeadline).toBe('2026-11-30');
  });
});
