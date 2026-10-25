/**
 * Deterministic denial classifier + deadline engine.
 *
 * Pure functions, NO AI. Given a denial (CARC/RARC + carrier + dates) and the
 * governing payer policy (from PayerPolicyPort), produce:
 *   - the denial category (from the CARC catalog),
 *   - whether it is appealable,
 *   - the appeal filing deadline (denialDate + policy.appealWindowDays),
 *   - the selected appeal route.
 *
 * This runs BEFORE any AI call and gates whether/how AI is later invoked.
 */

import type { Denial, PayerPolicy, Claim, DenialCategory } from '../domain/types.ts';
import type { PayerPolicyPort } from '../ports/payerPolicyPort.ts';
import { dominantCategory, lookupCarc } from './carcCatalog.ts';

/** Default appeal window when no payer policy is known (conservative). */
export const DEFAULT_APPEAL_WINDOW_DAYS = 60;

export interface Classification {
  category: DenialCategory;
  appealable: boolean;
  /** CARC codes that were recognized in the catalog. */
  recognizedCodes: string[];
  /** CARC codes not present in the catalog. */
  unrecognizedCodes: string[];
  /** ISO date the appeal must be filed by. */
  appealDeadline: string;
  appealWindowDays: number;
  /** Named carrier route, or null when no policy resolved. */
  appealRoute: string | null;
  /** Policy id used, if any. */
  policyId: string | null;
  /** Human-readable reason, deterministic. */
  rationale: string;
}

/** Add N calendar days to an ISO date, returning an ISO date (UTC). */
export const addDays = (isoDate: string, days: number): string => {
  const base = new Date(isoDate + (isoDate.length === 10 ? 'T00:00:00Z' : ''));
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid date passed to addDays: ${isoDate}`);
  }
  const result = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return result.toISOString().slice(0, 10);
};

/** Days remaining until the deadline from a given "now" (negative = past due). */
export const daysUntil = (deadlineIso: string, nowIso: string): number => {
  const deadline = Date.parse(deadlineIso + 'T00:00:00Z');
  const now = Date.parse(nowIso.length === 10 ? nowIso + 'T00:00:00Z' : nowIso);
  return Math.floor((deadline - now) / (24 * 60 * 60 * 1000));
};

/** Pure classification given a resolved policy (may be null). */
export const classifyDenial = (denial: Denial, policy: PayerPolicy | null): Classification => {
  const recognizedCodes = denial.carcCodes.filter((c) => lookupCarc(c));
  const unrecognizedCodes = denial.carcCodes.filter((c) => !lookupCarc(c));
  const category = dominantCategory(denial.carcCodes);

  // Appealable unless the dominant category is a hard stop, or every recognized
  // code is non-appealable.
  const appealable =
    category !== 'non_appealable' &&
    recognizedCodes.some((c) => lookupCarc(c)?.appealable);

  const appealWindowDays = policy?.appealWindowDays ?? DEFAULT_APPEAL_WINDOW_DAYS;
  const appealDeadline = addDays(denial.denialDate, appealWindowDays);
  const appealRoute = policy?.appealRoute ?? null;

  const rationale = buildRationale(category, appealable, policy, unrecognizedCodes);

  return {
    category,
    appealable,
    recognizedCodes,
    unrecognizedCodes,
    appealDeadline,
    appealWindowDays,
    appealRoute,
    policyId: policy?.id ?? null,
    rationale,
  };
};

const buildRationale = (
  category: DenialCategory,
  appealable: boolean,
  policy: PayerPolicy | null,
  unrecognized: string[],
): string => {
  const parts: string[] = [];
  parts.push(`Classified as ${category.replace(/_/g, ' ')}.`);
  parts.push(appealable ? 'Denial is appealable.' : 'Denial is not appealable.');
  parts.push(
    policy
      ? `Using carrier policy "${policy.title}" (window ${policy.appealWindowDays}d, route ${policy.appealRoute}).`
      : `No carrier policy resolved; using default ${DEFAULT_APPEAL_WINDOW_DAYS}d window and no route.`,
  );
  if (unrecognized.length) {
    parts.push(`Unrecognized CARC codes present: ${unrecognized.join(', ')}.`);
  }
  return parts.join(' ');
};

/**
 * Convenience that resolves the policy via the port then classifies. The claim
 * supplies the CPT used to look up the governing policy.
 */
export const classifyWithPolicy = async (
  denial: Denial,
  claim: Claim,
  payerPolicy: PayerPolicyPort,
): Promise<Classification> => {
  const cpt = claim.cptCodes[0];
  const policy = cpt ? await payerPolicy.getPolicy(denial.carrier, cpt) : null;
  return classifyDenial(denial, policy);
};
