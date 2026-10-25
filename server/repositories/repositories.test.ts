import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openTestDb, openDb } from '../db/index.ts';
import { loadConfig } from '../config.ts';
import { CaseRepository } from './caseRepository.ts';
import { AuditRepository } from './auditRepository.ts';
import { buildPacket } from '../pipeline/packetBuilder.ts';
import { classifyDenial } from '../pipeline/classifier.ts';
import { evaluateGates } from '../pipeline/gateEngine.ts';
import { runReasoning } from '../pipeline/reasoning.ts';
import { LocalAiProvider } from '../ai/localProvider.ts';
import { DeidentifyingProvider } from '../ai/deidentifyingProvider.ts';
import { SyntheticEhrAdapter } from '../adapters/synthetic/syntheticEhrAdapter.ts';
import { PAYER_POLICIES } from '../adapters/synthetic/fixtures.ts';
import type { Denial } from '../domain/types.ts';

const KEY = 'test-enc-key';
const ehr = new SyntheticEhrAdapter();
const lumbarPolicy = PAYER_POLICIES.find((p) => p.id === 'pol_001')!;

const denial = (): Denial => ({
  id: 'den_test',
  claimId: 'clm_001',
  source: 'api',
  carrier: 'Anthem',
  carcCodes: ['50'],
  rarcCodes: ['N115'],
  denialDate: '2026-10-01',
  rawText: 'Not medically necessary per policy.',
  externalRef: 'EXT-TEST-1',
});

describe('CaseRepository', () => {
  it('round-trips an encrypted patient', () => {
    const db = openTestDb();
    const repo = new CaseRepository(db, KEY);
    repo.upsertPatient({ id: 'pat_x', mrn: 'MRN-X', name: 'Test Patient', dob: '1990-01-01' });

    // Raw row should be encrypted (no plaintext name).
    const raw = db.prepare('SELECT name_enc FROM patients WHERE id=?').get('pat_x') as any;
    expect(raw.name_enc).not.toContain('Test Patient');
    expect(raw.name_enc.startsWith('enc:v1:')).toBe(true);

    const p = repo.getPatient('pat_x');
    expect(p?.name).toBe('Test Patient');
    expect(p?.mrn).toBe('MRN-X');
    db.close();
  });

  it('enforces denial idempotency on externalRef', () => {
    const db = openTestDb();
    const repo = new CaseRepository(db, KEY);
    repo.upsertPatient({ id: 'pat_001', mrn: 'm', name: 'n' });
    repo.upsertClaim({ id: 'clm_001', patientId: 'pat_001', carrier: 'Anthem', cptCodes: ['72148'], dateOfService: '2026-09-10' });

    expect(repo.insertDenial(denial())).toBe(true);
    expect(repo.insertDenial(denial())).toBe(false); // duplicate externalRef
    db.close();
  });

  it('persists and reloads a full case (survives reopen within connection)', () => {
    const db = openTestDb();
    const repo = new CaseRepository(db, KEY);
    repo.upsertPatient({ id: 'pat_001', mrn: 'm', name: 'Jordan A. Rivera' });
    repo.upsertClaim({ id: 'clm_001', patientId: 'pat_001', carrier: 'Anthem', cptCodes: ['72148'], dateOfService: '2026-09-10' });
    repo.insertDenial(denial());
    repo.createCase('case_1', 'den_test', 'intake');

    const classification = classifyDenial(denial(), lumbarPolicy);
    repo.updateCase('case_1', { state: 'classified', classification });

    const reloaded = repo.getCase('case_1');
    expect(reloaded?.state).toBe('classified');
    expect(reloaded?.classification?.category).toBe('medical_necessity');

    // packet encrypted as a unit
    const raw = db.prepare('SELECT packet FROM appeal_cases WHERE id=?').get('case_1') as any;
    expect(raw.packet).toBeNull();
    db.close();
  });
});

describe('persistence across restart (file-backed)', () => {
  it('reloads an encrypted patient from a reopened database file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medauth-test-'));
    const dbPath = path.join(dir, 'restart.db');
    try {
      // first "process"
      const config1 = loadConfig({ dbPath, isTest: false });
      const db1 = openDb(config1, { fresh: true });
      const repo1 = new CaseRepository(db1, KEY);
      repo1.upsertPatient({ id: 'pat_r', mrn: 'MRN-R', name: 'Restart Patient' });
      db1.close();

      // second "process" — fresh connection to the same file
      const config2 = loadConfig({ dbPath, isTest: false });
      const db2 = openDb(config2, { fresh: true });
      const repo2 = new CaseRepository(db2, KEY);
      const p = repo2.getPatient('pat_r');
      expect(p?.name).toBe('Restart Patient');
      db2.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('AuditRepository', () => {
  it('records entries per case in order', () => {
    const db = openTestDb();
    const audit = new AuditRepository(db);
    audit.log({ caseId: 'case_1', actor: 'system', action: 'classified', detail: 'ok' });
    audit.log({ caseId: 'case_1', actor: 'system', action: 'gated', detail: 'appeal_ready' });
    const entries = audit.forCase('case_1');
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('classified');
    expect(entries[1].action).toBe('gated');
    db.close();
  });
});

describe('packet builder + persistence', () => {
  it('assembles a complete packet and stores it encrypted', async () => {
    const db = openTestDb();
    const repo = new CaseRepository(db, KEY);
    const patient = (await ehr.getPatient('pat_001'))!;
    const chart = await ehr.getChartDocuments('pat_001');

    repo.upsertPatient(patient);
    repo.upsertClaim({ id: 'clm_001', patientId: 'pat_001', carrier: 'Anthem', cptCodes: ['72148'], dateOfService: '2026-09-10' });
    repo.insertDenial(denial());
    repo.createCase('case_1', 'den_test', 'intake');

    const classification = classifyDenial(denial(), lumbarPolicy);
    const gate = evaluateGates(classification, lumbarPolicy, chart);
    const provider = new DeidentifyingProvider(new LocalAiProvider());
    const reasoning = await runReasoning(provider, {
      patient,
      classification,
      gate,
      policy: lumbarPolicy,
      chart,
    });

    const packet = buildPacket({ caseId: 'case_1', denial: denial(), patient, classification, gate, reasoning });
    repo.updateCase('case_1', { state: 'packet_ready', classification, gate, packet });

    // raw packet column is encrypted — no packet field is readable in plaintext
    const raw = db.prepare('SELECT packet FROM appeal_cases WHERE id=?').get('case_1') as any;
    expect(raw.packet.startsWith('enc:v1:')).toBe(true);
    expect(raw.packet).not.toContain('2026-11-30');
    expect(raw.packet).not.toContain('anthem_medical_necessity_level1');

    const reloaded = repo.getCase('case_1');
    expect(reloaded?.packet?.evidence.length).toBeGreaterThan(0);
    expect(reloaded?.packet?.appealDeadline).toBe('2026-11-30');
    expect(reloaded?.packet?.aiValidationPassed).toBe(true);
    // decrypted packet contains the draft grounded in deterministic facts
    expect(reloaded?.packet?.draftLetter).toContain('2026-11-30');
    expect(reloaded?.packet?.draftLetter).toContain('anthem_medical_necessity_level1');
    db.close();
  });
});
