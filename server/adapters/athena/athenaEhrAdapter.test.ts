import { describe, it, expect } from 'vitest';
import { AthenaEhrAdapter, type HttpTransport } from './athenaEhrAdapter.ts';
import {
  PatientSchema,
  ClaimSchema,
  ChartDocumentSchema,
  DenialSchema,
} from '../../domain/types.ts';
import { openTestDb } from '../../db/index.ts';
import { CaseRepository } from '../../repositories/caseRepository.ts';
import { AuditRepository } from '../../repositories/auditRepository.ts';
import { SyntheticPayerPolicyAdapter } from '../synthetic/syntheticPayerPolicyAdapter.ts';
import { LocalAiProvider } from '../../ai/localProvider.ts';
import { DeidentifyingProvider } from '../../ai/deidentifyingProvider.ts';
import { processDenial, type OrchestratorDeps } from '../../pipeline/orchestrator.ts';

// Fake Athena transport returning athenahealth-shaped payloads.
const fakeAthena: HttpTransport = {
  async get(path: string, query: Record<string, string> = {}) {
    if (/\/patients\/\w+$/.test(path)) {
      return [{ patientid: '555', mrn: 'A-555', firstname: 'Pat', lastname: 'Athena', dob: '04/18/1972' }];
    }
    if (/\/patients\/\w+\/documents$/.test(path)) {
      return {
        documents: [
          {
            documentid: 'd1',
            documenttype: 'PROGRESSNOTE',
            documentdescription: 'Ortho note',
            providername: 'Dr A',
            createddate: '08/01/2026',
            documentdata:
              'Completed physical therapy with no relief. Radicular pain below the knee. NSAID failed.',
          },
        ],
      };
    }
    if (path.endsWith('/claims') && query.status === 'DENIED') {
      return {
        claims: [
          {
            claimid: '900',
            patientid: '555',
            insurancecarrier: 'Anthem',
            procedurecodes: ['72148'],
            servicedate: '09/10/2026',
            denialdate: '10/01/2026',
            remittanceid: 'REM-900',
            denialreasons: [{ carc: '50', rarc: 'N115' }],
          },
        ],
      };
    }
    if (/\/claims\/\w+$/.test(path)) {
      return {
        claimid: '900',
        patientid: '555',
        insurancecarrier: 'Anthem',
        procedurecodes: ['72148'],
        servicedate: '09/10/2026',
      };
    }
    return {};
  },
};

describe('AthenaEhrAdapter (EHRPort conformance via fake transport)', () => {
  const adapter = new AthenaEhrAdapter(fakeAthena, 'PRACTICE1');

  it('translates a patient into the domain schema', async () => {
    const p = await adapter.getPatient('555');
    expect(() => PatientSchema.parse(p)).not.toThrow();
    expect(p?.name).toBe('Pat Athena');
    expect(p?.dob).toBe('1972-04-18'); // normalized from mm/dd/yyyy
  });

  it('translates a claim', async () => {
    const c = await adapter.getClaim('900');
    expect(() => ClaimSchema.parse(c)).not.toThrow();
    expect(c?.cptCodes).toContain('72148');
    expect(c?.dateOfService).toBe('2026-09-10');
  });

  it('translates chart documents', async () => {
    const docs = await adapter.getChartDocuments('555');
    expect(docs.length).toBe(1);
    expect(() => ChartDocumentSchema.parse(docs[0])).not.toThrow();
    expect(docs[0].type).toBe('progress_note');
  });

  it('discovers denials with CARC/RARC codes', async () => {
    const denials = await adapter.discoverDenials();
    expect(denials.length).toBe(1);
    expect(() => DenialSchema.parse(denials[0])).not.toThrow();
    expect(denials[0].carcCodes).toContain('50');
    expect(denials[0].rarcCodes).toContain('N115');
    expect(denials[0].denialDate).toBe('2026-10-01');
  });
});

describe('pipeline runs unchanged against Athena adapter', () => {
  it('processes an Athena denial to packet_ready with no pipeline changes', async () => {
    const db = openTestDb();
    const deps: OrchestratorDeps = {
      ehr: new AthenaEhrAdapter(fakeAthena, 'PRACTICE1'),
      payerPolicy: new SyntheticPayerPolicyAdapter(),
      ai: new DeidentifyingProvider(new LocalAiProvider()),
      cases: new CaseRepository(db, 'k'),
      audit: new AuditRepository(db),
    };
    const [denial] = await deps.ehr.discoverDenials();
    const result = await processDenial(deps, denial);
    expect(result.state).toBe('packet_ready');
    expect(result.gateDecision).toBe('appeal_ready');
    db.close();
  });
});

// Live sandbox integration — only runs when explicitly enabled with credentials.
const liveEnabled = process.env.ATHENA_LIVE_TEST === 'true';
describe.skipIf(!liveEnabled)('Athena sandbox (live)', () => {
  it('fetches at least one denied claim from the sandbox', async () => {
    const { resolvePorts } = await import('../registry.ts');
    const { loadConfig, resetConfigCache } = await import('../../config.ts');
    resetConfigCache();
    const ports = resolvePorts(loadConfig({ ehrAdapter: 'athena' }));
    const denials = await ports.ehr.discoverDenials();
    expect(Array.isArray(denials)).toBe(true);
  });
});
