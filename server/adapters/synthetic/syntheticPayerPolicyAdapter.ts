/**
 * Synthetic PayerPolicy adapter — serves the seeded deterministic rules dataset
 * in place of a real FHIR Da Vinci CRD/DTR endpoint. Conforms to PayerPolicyPort.
 */

import type { PayerPolicyPort } from '../../ports/payerPolicyPort.ts';
import type { PayerPolicy } from '../../domain/types.ts';
import { PAYER_POLICIES } from './fixtures.ts';

export class SyntheticPayerPolicyAdapter implements PayerPolicyPort {
  readonly name = 'synthetic-payer-policy';

  constructor(private readonly policies: PayerPolicy[] = PAYER_POLICIES) {}

  async getPolicy(carrier: string, cptCode: string): Promise<PayerPolicy | null> {
    return (
      this.policies.find(
        (p) =>
          p.carrier.toLowerCase() === carrier.toLowerCase() &&
          p.cptCodes.includes(cptCode),
      ) ?? null
    );
  }

  async listPolicies(carrier?: string): Promise<PayerPolicy[]> {
    if (!carrier) return [...this.policies];
    return this.policies.filter((p) => p.carrier.toLowerCase() === carrier.toLowerCase());
  }
}
