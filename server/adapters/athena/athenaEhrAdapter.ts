/**
 * Athena EHR adapter — conforms to EHRPort, targets the athenahealth REST API.
 *
 * No Athena-specific shape leaks past this file: it translates Athena responses
 * into the domain entities the pipeline uses. The HTTP transport and token
 * provider are injected so the adapter is unit-testable without live calls and
 * so credentials stay in the local secret boundary (never in code).
 *
 * This is opt-in via config (MEDAUTH_EHR_ADAPTER=athena). The synthetic adapter
 * remains the default. A live sandbox integration test is gated behind an env
 * flag; by default only the translation logic is exercised with a fake transport.
 *
 * Author / Prepared by: Anthony LaVear
 * Title: Lead BSA, SDIT Architecture
 */

import type { EHRPort } from '../../ports/ehrPort.ts';
import type { Patient, Claim, ChartDocument, Denial } from '../../domain/types.ts';

/** Minimal HTTP surface the adapter needs; real impl wraps fetch. */
export interface HttpTransport {
  get(path: string, query?: Record<string, string>): Promise<any>;
}

export interface AthenaConfig {
  baseUrl: string; // e.g. https://api.preview.platform.athenahealth.com
  practiceId: string;
  /** Returns a valid bearer token (handles OAuth client-credentials refresh). */
  getToken: () => Promise<string>;
}

/** Default fetch-based transport. Credentials come from getToken, not code. */
export class FetchTransport implements HttpTransport {
  constructor(private readonly baseUrl: string, private readonly getToken: () => Promise<string>) {}
  async get(path: string, query: Record<string, string> = {}): Promise<any> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const token = await this.getToken();
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Athena API ${res.status} for ${path}`);
    return res.json();
  }
}

export class AthenaEhrAdapter implements EHRPort {
  readonly name = 'athena-ehr';

  constructor(
    private readonly http: HttpTransport,
    private readonly practiceId: string,
  ) {}

  async getPatient(patientId: string): Promise<Patient | null> {
    const data = await this.http.get(`/v1/${this.practiceId}/patients/${patientId}`);
    const rec = Array.isArray(data) ? data[0] : data;
    if (!rec) return null;
    return this.toPatient(rec);
  }

  async getClaim(claimId: string): Promise<Claim | null> {
    const data = await this.http.get(`/v1/${this.practiceId}/claims/${claimId}`);
    const rec = Array.isArray(data?.claims) ? data.claims[0] : data;
    if (!rec) return null;
    return this.toClaim(rec);
  }

  async getChartDocuments(patientId: string, _claimId?: string): Promise<ChartDocument[]> {
    const data = await this.http.get(`/v1/${this.practiceId}/patients/${patientId}/documents`);
    const docs: any[] = data?.documents ?? data ?? [];
    return docs.map((d) => this.toChartDocument(patientId, d));
  }

  async discoverDenials(since?: string): Promise<Denial[]> {
    const query: Record<string, string> = {};
    if (since) query.showsince = since;
    // Athena surfaces denials via claim/remittance endpoints; shape normalized here.
    const data = await this.http.get(`/v1/${this.practiceId}/claims`, {
      ...query,
      status: 'DENIED',
    });
    const claims: any[] = data?.claims ?? data ?? [];
    return claims
      .filter((c) => Array.isArray(c.denialreasons) && c.denialreasons.length > 0)
      .map((c) => this.toDenial(c));
  }

  // --- Translation (Athena -> domain). The only place Athena shapes exist. ---

  private toPatient(rec: any): Patient {
    return {
      id: String(rec.patientid ?? rec.patientId ?? rec.id),
      mrn: String(rec.mrn ?? rec.enterpriseid ?? ''),
      name: [rec.firstname, rec.lastname].filter(Boolean).join(' ') || rec.name || 'Unknown',
      dob: normalizeDate(rec.dob),
    };
  }

  private toClaim(rec: any): Claim {
    return {
      id: String(rec.claimid ?? rec.id),
      patientId: String(rec.patientid ?? rec.patientId),
      carrier: rec.insurancecarrier ?? rec.payername ?? 'Unknown',
      cptCodes: (rec.procedurecodes ?? rec.cptcodes ?? []).map(String),
      dateOfService: normalizeDate(rec.servicedate ?? rec.dateofservice) ?? '',
    };
  }

  private toChartDocument(patientId: string, rec: any): ChartDocument {
    return {
      id: String(rec.documentid ?? rec.id),
      patientId,
      type: mapDocType(rec.documenttype ?? rec.type),
      title: rec.documentdescription ?? rec.subject ?? 'Document',
      authoredBy: rec.providername ?? undefined,
      authoredAt: normalizeDate(rec.createddate ?? rec.documentdate) ?? new Date().toISOString(),
      text: rec.documentdata ?? rec.text ?? rec.clinicalnote ?? '',
    };
  }

  private toDenial(rec: any): Denial {
    const reasons: any[] = rec.denialreasons ?? [];
    return {
      id: `den_athena_${rec.claimid ?? rec.id}`,
      claimId: String(rec.claimid ?? rec.id),
      source: 'api',
      carrier: rec.insurancecarrier ?? rec.payername ?? 'Unknown',
      carcCodes: reasons.map((r) => String(r.carc ?? r.reasoncode)).filter(Boolean),
      rarcCodes: reasons.map((r) => String(r.rarc ?? r.remarkcode)).filter(Boolean),
      denialDate: normalizeDate(rec.denialdate ?? rec.lastmodified) ?? new Date().toISOString().slice(0, 10),
      externalRef: String(rec.remittanceid ?? rec.claimid ?? rec.id),
    };
  }
}

const DOC_TYPE_MAP: Record<string, ChartDocument['type']> = {
  ENCOUNTER: 'progress_note',
  PROGRESSNOTE: 'progress_note',
  IMAGING: 'imaging_report',
  LABRESULT: 'lab_result',
  PROCEDURE: 'procedure_note',
  PRESCRIPTION: 'medication_record',
  REFERRAL: 'referral',
};

const mapDocType = (raw?: string): ChartDocument['type'] => {
  if (!raw) return 'other';
  return DOC_TYPE_MAP[raw.toUpperCase().replace(/[^A-Z]/g, '')] ?? 'other';
};

/** Normalize Athena's mm/dd/yyyy (and ISO) to ISO date; passthrough otherwise. */
const normalizeDate = (value?: string): string | undefined => {
  if (!value) return undefined;
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return value;
};
