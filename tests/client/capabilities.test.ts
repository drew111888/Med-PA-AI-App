/**
 * Capability-map tests. Capabilities derive from the SERVER role only and must
 * match server/domain/types.ts ROLE_PERMISSIONS: coordinator (BILLER) cannot
 * approve; all three roles can run / view handoff / record submission.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import { describe, expect, it } from 'vitest';
import { deriveCapabilities, NO_CAPABILITIES } from '../../services/capabilities.ts';

describe('deriveCapabilities', () => {
  it('ADMIN can approve and do everything', () => {
    expect(deriveCapabilities('ADMIN')).toEqual({
      canApprove: true,
      canRun: true,
      canViewHandoff: true,
      canRecordSubmission: true,
    });
  });

  it('PROVIDER can approve and do everything', () => {
    expect(deriveCapabilities('PROVIDER')).toEqual({
      canApprove: true,
      canRun: true,
      canViewHandoff: true,
      canRecordSubmission: true,
    });
  });

  it('BILLER (coordinator) can run/view/record but CANNOT approve', () => {
    const caps = deriveCapabilities('BILLER');
    expect(caps.canApprove).toBe(false);
    expect(caps.canRun).toBe(true);
    expect(caps.canViewHandoff).toBe(true);
    expect(caps.canRecordSubmission).toBe(true);
  });

  it('null/undefined role yields no capabilities', () => {
    expect(deriveCapabilities(null)).toEqual(NO_CAPABILITIES);
    expect(deriveCapabilities(undefined)).toEqual(NO_CAPABILITIES);
  });
});
