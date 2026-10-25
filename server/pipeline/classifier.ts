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

/**
 * Deadline status — a deadline is only "calculated" when BOTH a denial date and
 * a carrier appeal window (from a resolved policy) are known. We NEVER fabricate
 * a deadline from "today" or a default window; missing inputs yield "unknown"
 * and name exactly what is missing so a human can supply it.
 */
export type DeadlineStatus =
  | 'calculated' // denialDate + policy window both known
  | 'unknown_missing_date' // no usable denial date
  | 'unknown_missing_policy'; // no carrier policy/window resolved

export interface Classification {
  category: DenialCategory;
  appealable: boolean;
  /** CARC codes that were recognized in the catalog. */
  recognizedCodes: string[];
  /** CARC codes not present in the catalog. */
  unrecognizedCodes: string[];
  /** ISO date the appeal must be filed by, or null when it cannot be calculated. */
  appealDeadline: string | null;
  /** Why the deadline is (not) known. */
  deadlineStatus: DeadlineStatus;
  /** The appeal window in days when a policy resolved it, else null. */
  appealWindowDays: number | null;
  /** The denial date used (echoed for transparency), or null when missing. */
  denialDate: string | null;
  /** What must be supplied before a deadline can be claimed (empty if calculated). */
  deadlineBlockers: string[];
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

/**
 * Days remaining until the deadline from a given "now". Null-safe: an unknown
 * deadline yields null (callers must render "unknown", never a number).
 * Negative = past due.
 */
export const daysUntil = (deadlineIso: string | null, nowIso: string): number | null => {
  if (!deadlineIso) return null;
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

  const appealRoute = policy?.appealRoute ?? null;
  const appealWindowDays = policy?.appealWindowDays ?? null;
  const denialDate = denial.denialDate ?? null;

  // A deadline is ONLY calculated when both inputs exist. Never fabricate.
  const deadlineBlockers: string[] = [];
  let appealDeadline: string | null = null;
  let deadlineStatus: DeadlineStatus;

  if (!denialDate) deadlineBlockers.push('denial date');
  if (appealWindowDays === null) {
    deadlineBlockers.push(`carrier appeal-window rule for ${denial.carrier}`);
  }

  if (denialDate && appealWindowDays !== null) {
    appealDeadline = addDays(denialDate, appealWindowDays);
    deadlineStatus = 'calculated';
  } else if (!denialDate) {
    deadlineStatus = 'unknown_missing_date';
  } else {
    deadlineStatus = 'unknown_missing_policy';
  }

  const rationale = buildRationale(category, appealable, policy, unrecognizedCodes, deadlineStatus);

  return {
    category,
    appealable,
    recognizedCodes,
    unrecognizedCodes,
    appealDeadline,
    deadlineStatus,
    appealWindowDays,
    denialDate,
    deadlineBlockers,
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
  deadlineStatus: DeadlineStatus,
): string => {
  const parts: string[] = [];
  parts.push(`Classified as ${category.replace(/_/g, ' ')}.`);
  parts.push(appealable ? 'Denial is appealable.' : 'Denial is not appealable.');
  parts.push(
    policy
      ? `Using carrier policy "${policy.title}" (window ${policy.appealWindowDays}d, route ${policy.appealRoute}).`
      : 'No carrier policy resolved; appeal window and route are unknown.',
  );
  if (deadlineStatus === 'unknown_missing_date') {
    parts.push('Appeal deadline UNKNOWN: denial date is missing.');
  } else if (deadlineStatus === 'unknown_missing_policy') {
    parts.push('Appeal deadline UNKNOWN: no carrier appeal-window rule resolved.');
  }
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
