import { describe, it, expect } from 'vitest';
import {
  intakeDenialFromPdf,
  extractCodesDeterministic,
  extractDenialDate,
} from './denialIntake.ts';
import { LocalAiProvider } from '../ai/localProvider.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import { classifyDenial } from '../pipeline/classifier.ts';
import { SyntheticPayerPolicyAdapter } from '../adapters/synthetic/syntheticPayerPolicyAdapter.ts';
import { DENIALS } from '../adapters/synthetic/fixtures.ts';
import { DenialSchema } from '../domain/types.ts';

const ai = new DeidentifyingProvider(new LocalAiProvider());

describe('deterministic code extraction', () => {
  it('extracts CARC and RARC codes from denial text', () => {
    const text = 'Denial. CARC 50 applies. Reason Code: 197. Remark code N115. M127.';
    const { carc, rarc } = extractCodesDeterministic(text);
    expect(carc).toContain('50');
    expect(carc).toContain('197');
    expect(rarc).toContain('N115');
    expect(rarc).toContain('M127');
  });

  it('extracts a denial date (US and ISO formats)', () => {
    expect(extractDenialDate('dated 2026-10-01 here')).toBe('2026-10-01');
    expect(extractDenialDate('denied on 10/1/2026')).toBe('2026-10-01');
  });
});

describe('PDF intake normalization', () => {
  it('normalizes a PDF denial into a valid Denial entity', async () => {
    const text =
      'Anthem Explanation of Benefits. Service denied on 2026-10-01. ' +
      'CARC 50 - not medically necessary. Remark code N115.';
    const denial = await intakeDenialFromPdf(ai, {
      text,
      claimId: 'clm_001',
      carrier: 'Anthem',
      denialId: 'den_pdf_1',
      externalRef: 'hash-abc',
    });
    expect(() => DenialSchema.parse(denial)).not.toThrow();
    expect(denial.source).toBe('pdf');
    expect(denial.carcCodes).toContain('50');
    expect(denial.rarcCodes).toContain('N115');
    expect(denial.denialDate).toBe('2026-10-01');
    expect(denial.carrier).toBe('Anthem');
  });

  it('produces a denial equivalent to the API-sourced one (same pipeline input)', async () => {
    // API-sourced reference (den_001: Anthem CARC 50, 2026-10-01).
    const apiDenial = DENIALS.find((d) => d.id === 'den_001')!;

    // PDF-sourced equivalent.
    const pdfText =
      'Anthem EOB. Denied 2026-10-01. CARC 50. Remark code N115. ' +
      'Not medically necessary per policy.';
    const pdfDenial = await intakeDenialFromPdf(ai, {
      text: pdfText,
      claimId: apiDenial.claimId,
      carrier: 'Anthem',
      denialId: 'den_pdf_equiv',
    });

    // Both classify identically under the same policy.
    const policy = new SyntheticPayerPolicyAdapter();
    const pol = await policy.getPolicy('Anthem', '72148');
    const apiClass = classifyDenial(apiDenial, pol);
    const pdfClass = classifyDenial(pdfDenial, pol);

    expect(pdfClass.category).toBe(apiClass.category);
    expect(pdfClass.appealDeadline).toBe(apiClass.appealDeadline);
    expect(pdfClass.appealRoute).toBe(apiClass.appealRoute);
    expect(pdfClass.appealable).toBe(apiClass.appealable);
  });
});
