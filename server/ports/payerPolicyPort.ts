/**
 * PayerPolicyPort — the carrier-policy boundary.
 *
 * Separate from EHRPort because payer policy is a distinct concern and (per
 * research) will eventually be served by a FHIR R4 + Da Vinci CRD/DTR adapter
 * once per-payer endpoints are available. For first pass the synthetic adapter
 * serves a seeded deterministic rules dataset.
 *
 * The deterministic classifier and gate engine read carrier appeal windows,
 * routes, and documentation requirements exclusively through this port.
 */

import type { PayerPolicy } from '../domain/types.ts';

export interface PayerPolicyPort {
  readonly name: string;

  /**
   * Resolve the governing policy for a carrier + CPT code. Returns null when no
   * policy is known (the pipeline then treats requirements as unknown).
   */
  getPolicy(carrier: string, cptCode: string): Promise<PayerPolicy | null>;

  /** List all known policies for a carrier (diagnostics / library). */
  listPolicies(carrier?: string): Promise<PayerPolicy[]>;
}
