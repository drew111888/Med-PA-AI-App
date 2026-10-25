/**
 * Capability derivation from the SERVER-RETURNED role only.
 *
 * Capabilities are derived from the authenticated user's role (ADMIN / PROVIDER
 * / BILLER) returned by the backend — NEVER from browser user names or the
 * legacy permissionsService view-gating. The server remains the enforcement
 * boundary; these flags only control which (display-only this increment)
 * controls a UI surface shows.
 *
 * Mirrors server/domain/types.ts ROLE_PERMISSIONS:
 *   ADMIN & PROVIDER  = run_pipeline, view_cases, approve_appeal, generate_handoff, record_submission
 *   BILLER            = run_pipeline, view_cases,                 generate_handoff, record_submission
 * i.e. coordinator (BILLER) cannot approve.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import type { Role } from './apiClient.ts';

export interface Capabilities {
  /** Only ADMIN / PROVIDER may approve. (Display-only this increment.) */
  canApprove: boolean;
  /** All three roles may run the pipeline. */
  canRun: boolean;
  /** All three roles may view/download a handoff. */
  canViewHandoff: boolean;
  /** All three roles may record a submission. */
  canRecordSubmission: boolean;
}

export const deriveCapabilities = (role: Role | null | undefined): Capabilities => {
  const isApprover = role === 'ADMIN' || role === 'PROVIDER';
  const known = role === 'ADMIN' || role === 'PROVIDER' || role === 'BILLER';
  return {
    canApprove: isApprover,
    canRun: known,
    canViewHandoff: known,
    canRecordSubmission: known,
  };
};

export const NO_CAPABILITIES: Capabilities = {
  canApprove: false,
  canRun: false,
  canViewHandoff: false,
  canRecordSubmission: false,
};
