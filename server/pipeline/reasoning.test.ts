import { describe, it, expect } from 'vitest';
import {
  runReasoning,
  validateReasoning,
  buildReasoningPrompt,
  GatePreconditionError,
  type ReasoningInput,
} from './reasoning.ts';
import { classifyDenial } from './classifier.ts';
import { evaluateGates } from './gateEngine.ts';
import { LocalAiProvider } from '../ai/localProvider.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import { CloudAiProvider, type CloudTransport } from '../ai/cloudProvider.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { PAYER_POLICIES } from '../adapters/synthetic/fixtures.ts';
import type { Denial } from '../domain/types.ts';

const ehr = new SyntheticEhrAdapter();
const lumbarPolicy = PAYER_POLICIES.find((p) => p.id === 'pol_001')!;
const kneePolicy = PAYER_POLICIES.find((p) => p.id === 'pol_003')!;

const denial = (over: Partial<Denial> = {}): Denial => ({
  id: 'd',
  claimId: 'clm_001',
  source: 'api',
  carrier: 'Anthem',
  carcCodes: ['50'],
  rarcCodes: [],
  denialDate: '2026-10-01',
  ...over,
});

const readyInput = async (): Promise<ReasoningInput> => {
  const patient = (await ehr.getPatient('pat_001'))!;
  const chart = await ehr.getChartDocuments('pat_001');
  const classification = classifyDenial(denial(), lumbarPolicy);
  const gate = evaluateGates(classification, lumbarPolicy, chart);
  return { patient, classification, gate, policy: lumbarPolicy, chart };
};

describe('buildReasoningPrompt', () => {
  it('includes deadline, route, and evidence', async () => {
    const input = await readyInput();
    const prompt = buildReasoningPrompt(input);
    expect(prompt).toContain(input.classification.appealDeadline);
    expect(prompt).toContain('anthem_medical_necessity_level1');
    expect(prompt.toLowerCase()).toContain('physical therapy');
  });
});

describe('runReasoning preconditions', () => {
  it('throws when the gate is not appeal_ready', async () => {
    const patient = (await ehr.getPatient('pat_003'))!;
    const chart = await ehr.getChartDocuments('pat_003');
    const classification = classifyDenial(denial({ claimId: 'clm_003', carcCodes: ['16', '17'] }), kneePolicy);
    const gate = evaluateGates(classification, kneePolicy, chart);
    expect(gate.decision).toBe('needs_more_data');

    const provider = new DeidentifyingProvider(new LocalAiProvider());
    await expect(
      runReasoning(provider, { patient, classification, gate, policy: kneePolicy, chart }),
    ).rejects.toBeInstanceOf(GatePreconditionError);
  });
});

describe('runReasoning happy path (local provider)', () => {
  it('produces a draft letter that passes deterministic validation', async () => {
    const input = await readyInput();
    const provider = new DeidentifyingProvider(new LocalAiProvider());
    const output = await runReasoning(provider, input);
    expect(output.validation.valid).toBe(true);
    expect(output.validation.issues).toEqual([]);
    expect(output.draftLetter).toContain(input.classification.appealDeadline);
    // PHI re-identified in the returned letter.
    expect(output.provider).toContain('deid(local)');
  });

  it('never leaks PHI to a cloud provider during reasoning', async () => {
    const seen: string[] = [];
    const transport: CloudTransport = async (req) => {
      seen.push(req.prompt);
      // echo back a valid-looking letter referencing deadline + route
      return {
        text:
          'Appeal letter. Deadline 2026-11-30. Route anthem_medical_necessity_level1. ' +
          'Patient completed physical therapy without relief.',
        model: 'cloud-x',
      };
    };
    const provider = new DeidentifyingProvider(new CloudAiProvider(transport));
    const input = await readyInput();
    await runReasoning(provider, input);
    expect(seen[0]).not.toContain(input.patient.name);
    expect(seen[0]).not.toContain(input.patient.mrn);
  });
});

describe('validateReasoning', () => {
  it('flags malformed (empty) AI output', async () => {
    const input = await readyInput();
    const result = validateReasoning('', input);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('flags output missing the deadline', async () => {
    const input = await readyInput();
    const result = validateReasoning(
      'A letter mentioning anthem_medical_necessity_level1 and physical therapy but no date.',
      input,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/deadline/i);
  });

  it('flags output missing the appeal route', async () => {
    const input = await readyInput();
    const result = validateReasoning(
      `A letter mentioning ${input.classification.appealDeadline} and physical therapy only.`,
      input,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/route/i);
  });
});
