/**
 * Nullable-deadline rendering tests. The helper must NEVER emit 'nulld', never
 * compare null numerically, and must show an explicit unknown state that names
 * the blockers. A known deadline is labelled as calculated from a synthetic rule.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { describe, expect, it } from 'vitest';
import { describeDeadline, SYNTHETIC_RULE_LABEL } from '../../services/deadlineView.ts';

describe('describeDeadline (null-safe)', () => {
  it('renders an unknown deadline with the blockers and no day count', () => {
    const v = describeDeadline({
      deadlineKnown: false,
      appealDeadline: null,
      daysRemaining: null,
      deadlineBlockers: ['denial date'],
    });
    expect(v.known).toBe(false);
    expect(v.urgencyLabel).toBe('Deadline unknown');
    expect(v.urgent).toBe(false);
    expect(v.detail).toBe('deadline unknown — needs denial date');
    // Never a fabricated number or the string 'null'.
    expect(v.detail).not.toContain('null');
    expect(v.urgencyLabel).not.toContain('null');
  });

  it('falls back to a generic ask when no blockers are listed', () => {
    const v = describeDeadline({ deadlineKnown: false, appealDeadline: null, daysRemaining: null, deadlineBlockers: [] });
    expect(v.detail).toContain('the missing date/rule source');
  });

  it('treats deadlineKnown=true but a null filing date as unknown (defensive)', () => {
    const v = describeDeadline({ deadlineKnown: true, appealDeadline: null, daysRemaining: null, deadlineBlockers: ['x'] });
    expect(v.known).toBe(false);
    expect(v.urgencyLabel).not.toContain('null');
  });

  it('preserves a calculated case deadline when the endpoint omits the day count', () => {
    // Both the case list and detail supply the known date without daysRemaining.
    const v = describeDeadline({
      deadlineKnown: true,
      appealDeadline: '2026-11-30',
      daysRemaining: null,
      deadlineBlockers: [],
    });
    expect(v.known).toBe(true);
    expect(v.detail).toBe(`2026-11-30 (${SYNTHETIC_RULE_LABEL})`);
    expect(v.urgencyLabel).toBe('Deadline calculated');
    expect(v.urgent).toBe(false);
    expect(v.detail).not.toContain('unknown');
    expect(v.urgencyLabel).not.toContain('null');
  });

  it('renders a known future deadline with a day count and synthetic-rule label', () => {
    const v = describeDeadline({
      deadlineKnown: true,
      appealDeadline: '2025-12-31',
      daysRemaining: 40,
      deadlineBlockers: [],
    });
    expect(v.known).toBe(true);
    expect(v.urgencyLabel).toBe('40d');
    expect(v.urgent).toBe(false);
    expect(v.detail).toBe(`2025-12-31 (${SYNTHETIC_RULE_LABEL})`);
  });

  it('flags a deadline within 14 days as urgent', () => {
    const v = describeDeadline({ deadlineKnown: true, appealDeadline: '2025-01-10', daysRemaining: 7, deadlineBlockers: [] });
    expect(v.urgent).toBe(true);
    expect(v.urgencyLabel).toBe('7d');
  });

  it('renders a past-due deadline without a negative-number comparison on null', () => {
    const v = describeDeadline({ deadlineKnown: true, appealDeadline: '2024-01-01', daysRemaining: -5, deadlineBlockers: [] });
    expect(v.urgencyLabel).toBe('Past due');
    expect(v.urgent).toBe(true);
  });
});
