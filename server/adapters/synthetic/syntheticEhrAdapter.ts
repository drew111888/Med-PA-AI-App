/**
 * Synthetic EHR adapter — backs all first-pass development with made-up data.
 * Conforms to EHRPort; swapped for the Athena adapter by config.
 */

import type { EHRPort } from '../../ports/ehrPort.ts';
import type { Patient, Claim, ChartDocument, Denial } from '../../domain/types.ts';
import { PATIENTS, CLAIMS, CHART_DOCUMENTS, DENIALS } from './fixtures.ts';

export class SyntheticEhrAdapter implements EHRPort {
  readonly name = 'synthetic-ehr';

  constructor(
    private readonly data = {
      patients: PATIENTS,
      claims: CLAIMS,
      documents: CHART_DOCUMENTS,
      denials: DENIALS,
    },
  ) {}

  async getPatient(patientId: string): Promise<Patient | null> {
    return this.data.patients.find((p) => p.id === patientId) ?? null;
  }

  async getClaim(claimId: string): Promise<Claim | null> {
    return this.data.claims.find((c) => c.id === claimId) ?? null;
  }

  async getChartDocuments(patientId: string, _claimId?: string): Promise<ChartDocument[]> {
    return this.data.documents.filter((d) => d.patientId === patientId);
  }

  async discoverDenials(since?: string): Promise<Denial[]> {
    if (!since) return [...this.data.denials];
    const watermark = Date.parse(since);
    return this.data.denials.filter((d) => Date.parse(d.denialDate) >= watermark);
  }
}
