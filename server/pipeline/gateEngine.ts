/**
 * Deterministic required-field / eligibility gate engine.
 *
 * Given a classification, the governing policy, and the fetched chart, decide:
 *   - appeal_ready  : all required requirements satisfied by chart evidence
 *   - needs_more_data: some required requirements unmet (deficits listed)
 *   - ineligible    : classifier said non-appealable, or no policy to appeal under
 *
 * Emits an itemized checklist of satisfied vs missing requirements with the
 * supporting citations. NO AI. Reuses the classifier's output (Task 3).
 */

import type { ChartDocument, PayerPolicy } from '../domain/types.ts';
import type { Classification } from './classifier.ts';
import { detectEvidence, type EvidenceHit } from './evidenceDetectors.ts';

export type GateDecision = 'appeal_ready' | 'needs_more_data' | 'ineligible';

export interface RequirementCheck {
  requirementId: string;
  description: string;
  evidenceKey: string;
  required: boolean;
  satisfied: boolean;
  citations: EvidenceHit[];
}

export interface GateResult {
  decision: GateDecision;
  checks: RequirementCheck[];
  /** Required requirements that are not satisfied. */
  deficits: RequirementCheck[];
  /** Requirements satisfied by chart evidence. */
  satisfied: RequirementCheck[];
  rationale: string;
}

export const evaluateGates = (
  classification: Classification,
  policy: PayerPolicy | null,
  chart: ChartDocument[],
): GateResult => {
  // Hard stop: classifier already determined this cannot be appealed.
  if (!classification.appealable) {
    return {
      decision: 'ineligible',
      checks: [],
      deficits: [],
      satisfied: [],
      rationale: `Ineligible: denial classified as ${classification.category} and not appealable.`,
    };
  }

  // No governing policy => we cannot assert requirements are met. Treat as
  // needs-more-data (a human/AI may still proceed, but deterministically we
  // cannot certify readiness).
  if (!policy || policy.requirements.length === 0) {
    return {
      decision: 'needs_more_data',
      checks: [],
      deficits: [],
      satisfied: [],
      rationale: policy
        ? 'No documentation requirements defined on the governing policy.'
        : 'No governing carrier policy resolved; cannot certify documentation requirements.',
    };
  }

  const checks: RequirementCheck[] = policy.requirements.map((req) => {
    const finding = detectEvidence(req.evidenceKey, chart);
    return {
      requirementId: req.id,
      description: req.description,
      evidenceKey: req.evidenceKey,
      required: req.required,
      satisfied: finding.present,
      citations: finding.citations,
    };
  });

  const deficits = checks.filter((c) => c.required && !c.satisfied);
  const satisfied = checks.filter((c) => c.satisfied);
  const decision: GateDecision = deficits.length === 0 ? 'appeal_ready' : 'needs_more_data';

  const rationale =
    decision === 'appeal_ready'
      ? `All ${checks.filter((c) => c.required).length} required requirements satisfied by chart evidence.`
      : `${deficits.length} required requirement(s) unmet: ${deficits
          .map((d) => d.description)
          .join('; ')}.`;

  return { decision, checks, deficits, satisfied, rationale };
};
