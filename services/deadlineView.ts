/**
 * Null-safe deadline presentation helpers.
 *
 * The server returns appealDeadline / daysRemaining / deadlineStatus as NULLABLE.
 * We never compute `null <= 14`, never render 'nulld', and never render a day
 * count for an unknown deadline. A calculated deadline is explicitly labelled as
 * derived from a synthetic rule — NOT verified payer coverage.
 *
 * These are pure functions so the nullable-deadline behaviour is unit-testable
 * without a DOM.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import type { DeadlineItem } from './apiClient.ts';

export const SYNTHETIC_RULE_LABEL = 'calculated from synthetic rule';

export interface DeadlineView {
  known: boolean;
  /** Short status chip, e.g. '12d', 'Deadline calculated', or 'Deadline unknown'. */
  urgencyLabel: string;
  /** True only when a known deadline is within the 14-day urgent window. */
  urgent: boolean;
  /** For a known deadline: the ISO date + synthetic-rule caveat. Else the blockers ask. */
  detail: string;
}

const URGENT_WINDOW_DAYS = 14;

/**
 * Describe a deadline item for display. A known filing date remains known when
 * a case endpoint omits the day count; that only disables numeric urgency.
 * Null values are never formatted as numbers or compared numerically.
 */
export const describeDeadline = (item: Pick<DeadlineItem,
  'deadlineKnown' | 'appealDeadline' | 'daysRemaining' | 'deadlineBlockers'>): DeadlineView => {
  if (!item.deadlineKnown || item.appealDeadline == null) {
    const blockers = item.deadlineBlockers.length
      ? item.deadlineBlockers.join(', ')
      : 'the missing date/rule source';
    return {
      known: false,
      urgencyLabel: 'Deadline unknown',
      urgent: false,
      detail: `deadline unknown — needs ${blockers}`,
    };
  }
  const days = item.daysRemaining;
  return {
    known: true,
    urgencyLabel: days == null ? 'Deadline calculated' : days < 0 ? 'Past due' : `${days}d`,
    urgent: days != null && days <= URGENT_WINDOW_DAYS,
    detail: `${item.appealDeadline} (${SYNTHETIC_RULE_LABEL})`,
  };
};
