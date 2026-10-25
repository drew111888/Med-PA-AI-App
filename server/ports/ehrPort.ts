/**
 * EHRPort — the EHR-agnostic boundary.
 *
 * The pipeline depends only on this interface. Athena is one adapter; a
 * synthetic adapter backs all first-pass development. No EHR-specific shape may
 * leak past an implementation of this port.
 */

import type { Patient, ChartDocument, Claim, Denial } from '../domain/types.ts';

export interface EHRPort {
  /** Stable name of the adapter, surfaced in health/diagnostics. */
  readonly name: string;

  /** Fetch a patient by internal id. */
  getPatient(patientId: string): Promise<Patient | null>;

  /** Fetch the claim a denial refers to. */
  getClaim(claimId: string): Promise<Claim | null>;

  /** Pull the patient's chart documents, optionally filtered by claim context. */
  getChartDocuments(patientId: string, claimId?: string): Promise<ChartDocument[]>;

  /**
   * Discover denials the practice has not yet processed. Used by the scheduled
   * poller. `since` is an ISO datetime watermark.
   */
  discoverDenials(since?: string): Promise<Denial[]>;
}
