/**
 * CARC -> denial-category mapping.
 *
 * Data-driven so adding codes/carriers is config, not code. Categories drive
 * which deterministic appeal strategy the classifier selects. Sourced from the
 * X12 Claim Adjustment Reason Code set (standardized across payers).
 *
 * This is intentionally a curated first-pass subset covering the appeal-
 * relevant codes identified in design; expand as new denial types are handled.
 */

import type { DenialCategory } from '../domain/types.ts';

export interface CarcEntry {
  code: string;
  description: string;
  category: DenialCategory;
  /** Whether a denial dominated by this code is worth appealing at all. */
  appealable: boolean;
}

export const CARC_CATALOG: Record<string, CarcEntry> = {
  '50': {
    code: '50',
    description: 'Non-covered services — not deemed a medical necessity.',
    category: 'medical_necessity',
    appealable: true,
  },
  '55': {
    code: '55',
    description: 'Procedure/treatment deemed experimental/investigational.',
    category: 'medical_necessity',
    appealable: true,
  },
  '15': {
    code: '15',
    description: 'Authorization number missing, invalid, or does not apply.',
    category: 'authorization',
    appealable: true,
  },
  '197': {
    code: '197',
    description: 'Precertification/authorization/notification absent.',
    category: 'authorization',
    appealable: true,
  },
  '16': {
    code: '16',
    description: 'Claim/service lacks information or has a submission error.',
    category: 'missing_information',
    appealable: true,
  },
  '17': {
    code: '17',
    description: 'Requested information was not provided or was insufficient.',
    category: 'missing_information',
    appealable: true,
  },
  '11': {
    code: '11',
    description: 'The diagnosis is inconsistent with the procedure.',
    category: 'coding',
    appealable: true,
  },
  '4': {
    code: '4',
    description: 'Procedure code inconsistent with the modifier used.',
    category: 'coding',
    appealable: true,
  },
  '22': {
    code: '22',
    description: 'Care may be covered by another payer per coordination of benefits.',
    category: 'coordination_of_benefits',
    appealable: true,
  },
  '18': {
    code: '18',
    description: 'Exact duplicate claim/service.',
    category: 'non_appealable',
    appealable: false,
  },
};

export const lookupCarc = (code: string): CarcEntry | null => CARC_CATALOG[code] ?? null;

/**
 * Pick the dominant category when a denial carries multiple CARC codes. Priority
 * reflects which issue most governs the appeal strategy: a non-appealable hard
 * stop first, then medical necessity, authorization, coding, missing info, COB.
 */
const CATEGORY_PRIORITY: DenialCategory[] = [
  'non_appealable',
  'medical_necessity',
  'authorization',
  'coding',
  'coordination_of_benefits',
  'missing_information',
  'unknown',
];

export const dominantCategory = (codes: string[]): DenialCategory => {
  const categories = codes
    .map((c) => lookupCarc(c)?.category)
    .filter((c): c is DenialCategory => Boolean(c));
  if (categories.length === 0) return 'unknown';
  for (const priority of CATEGORY_PRIORITY) {
    if (categories.includes(priority)) return priority;
  }
  return 'unknown';
};
