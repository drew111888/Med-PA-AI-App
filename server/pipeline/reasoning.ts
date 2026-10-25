/**
 * AI clinical-reasoning step — runs ONLY on gated, appeal-ready cases.
 *
 * Builds a de-identified prompt from the classification, gate result (satisfied
 * requirements + citations), and chart, asks the AI provider (through the de-id
 * choke point) for narrative medical-necessity reasoning + a draft appeal
 * letter, then validates the output against deterministic rules. Output that
 * fails validation is rejected/flagged — the AI cannot override the gates.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import type { AiProviderPort } from '../ports/aiProviderPort.ts';
import type { DeidCompletionRequest } from '../ai/deidentifyingProvider.ts';
import type { Patient, ChartDocument, PayerPolicy } from '../domain/types.ts';
import type { Classification } from './classifier.ts';
import type { GateResult } from './gateEngine.ts';

export interface ReasoningInput {
  patient: Patient;
  classification: Classification;
  gate: GateResult;
  policy: PayerPolicy | null;
  chart: ChartDocument[];
}

export interface ReasoningOutput {
  draftLetter: string;
  provider: string;
  model: string;
  validation: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export class GatePreconditionError extends Error {}

const SYSTEM_INSTRUCTION =
  'You are a senior medical billing advocate and physician advisor. Draft an ' +
  'evidence-based insurance appeal. Cite only the supplied clinical evidence. ' +
  'Do not invent facts. Reference the denial reason and the required criteria.';

export const buildReasoningPrompt = (input: ReasoningInput): string => {
  const { classification, gate, policy } = input;
  const evidenceLines = gate.satisfied
    .map((s) => `- ${s.description}: ${s.citations.map((c) => c.snippet).join(' | ')}`)
    .join('\n');

  return [
    `Appeal category: ${classification.category}`,
    `Carrier appeal route: ${classification.appealRoute ?? 'unspecified'}`,
    `Appeal must be filed by: ${classification.appealDeadline}`,
    policy ? `Governing policy: ${policy.title}` : 'Governing policy: unknown',
    '',
    'Satisfied documentation requirements with supporting evidence:',
    evidenceLines || '- (none recorded)',
    '',
    'Draft a formal appeal letter that cites each piece of evidence above and',
    'argues the service meets the carrier criteria. Reference the appeal route',
    'and the filing deadline explicitly.',
  ].join('\n');
};

/** Collect PHI hints from the case for the de-id choke point. */
const phiHints = (input: ReasoningInput) => ({
  names: [input.patient.name].filter(Boolean),
  mrns: [input.patient.mrn].filter(Boolean),
});

/**
 * Deterministic validation of AI output. The AI cannot relax the gates:
 *   - the letter must be non-trivial,
 *   - it must reference the appeal deadline (deterministic value),
 *   - it must reference the appeal route when one exists,
 *   - at least one satisfied-requirement citation snippet keyword must appear.
 */
export const validateReasoning = (
  letter: string,
  input: ReasoningInput,
): ValidationResult => {
  const issues: string[] = [];
  const text = letter.toLowerCase();

  if (letter.trim().length < 40) {
    issues.push('Draft letter is empty or too short.');
  }
  if (!text.includes(input.classification.appealDeadline.toLowerCase())) {
    issues.push('Draft does not reference the appeal filing deadline.');
  }
  if (
    input.classification.appealRoute &&
    !text.includes(input.classification.appealRoute.toLowerCase())
  ) {
    issues.push('Draft does not reference the carrier appeal route.');
  }
  // At least one evidence citation should be reflected.
  const citationPresent = input.gate.satisfied.some((s) =>
    s.citations.some((c) => {
      const firstWord = c.snippet.replace(/^[…\s]+/, '').split(/\s+/)[0]?.toLowerCase();
      return firstWord && firstWord.length > 3 && text.includes(firstWord);
    }),
  );
  if (input.gate.satisfied.length > 0 && !citationPresent) {
    issues.push('Draft does not reflect any supplied clinical evidence.');
  }

  return { valid: issues.length === 0, issues };
};

export const runReasoning = async (
  provider: AiProviderPort,
  input: ReasoningInput,
): Promise<ReasoningOutput> => {
  if (input.gate.decision !== 'appeal_ready') {
    throw new GatePreconditionError(
      `AI reasoning requires an appeal_ready gate decision; got "${input.gate.decision}".`,
    );
  }

  const request: DeidCompletionRequest = {
    system: SYSTEM_INSTRUCTION,
    prompt: buildReasoningPrompt(input),
    tier: 'drafting',
    phiHints: phiHints(input),
  };

  const result = await provider.complete(request);
  const validation = validateReasoning(result.text, input);

  return {
    draftLetter: result.text,
    provider: result.provider,
    model: result.model,
    validation,
  };
};
